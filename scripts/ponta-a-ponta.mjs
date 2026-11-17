// Teste de ponta a ponta contra a pilha no ar, com o driver SIMULADO (não use com a bancada física).
//   node scripts/ponta-a-ponta.mjs [url-da-loja] [url-do-mes]      (padrão http://localhost:8080 e :8081)
// Reinicia a aula (pela Loja, que reinicia o MES), acelera o simulador e confere: pedido na Loja → OPs no MES →
// sequenciamento → produção → inspeção automática → fatura (pelo feed de mudanças) → certificado; cancelamento;
// queda de comunicação; OP abortada; indicadores e CSV; e, se o docker estiver à mão, a Loja recusando o pedido com
// o MES parado (para o contêiner mes e sobe de novo; termina com tudo no ar). Sem docker: --sem-docker.

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [LOJA = 'http://localhost:8080', MES = 'http://localhost:8081'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const SEM_DOCKER = process.argv.includes('--sem-docker');
const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let falhas = 0;

/** Chamada a um dos sistemas: loja('GET', '/api/...') ou mes('GET', '/api/...'). */
const loja = (metodo, caminho, corpo) => pedir(LOJA, metodo, caminho, corpo);
const mes = (metodo, caminho, corpo) => pedir(MES, metodo, caminho, corpo);

async function pedir(BASE, metodo, caminho, corpo) {
  const r = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    headers: corpo === undefined ? {} : { 'content-type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await r.text();
  let dados;
  try { dados = JSON.parse(texto); } catch { dados = texto; }
  if (!r.ok) throw new Error(`${metodo} ${caminho}: ${r.status} ${texto}`);
  return dados;
}

function confere(condicao, descricao) {
  console.log(`${condicao ? '  ok ' : 'FALHA'} ${descricao}`);
  if (!condicao) falhas++;
}

async function ate(descricao, fn, limiteMs = 120_000) {
  const inicio = Date.now();
  while (Date.now() - inicio < limiteMs) {
    const v = await fn();
    if (v) return v;
    await espera(500);
  }
  throw new Error(`tempo esgotado: ${descricao}`);
}

const estadoOp = async (n) => (await mes('GET', `/api/mes/ordens/${n}`)).ordem.situacao.estado;

// ------------------------------------------------------------------
const saudeLoja = await loja('GET', '/api/saude');
const saudeMes = await mes('GET', '/api/saude');
if (saudeLoja.sistema !== 'loja' || saudeMes.sistema !== 'mes') {
  console.error(`Endereços trocados? ${LOJA} respondeu "${saudeLoja.sistema}" e ${MES} respondeu "${saudeMes.sistema}".`);
  process.exit(2);
}
const cfgOriginal = await mes('GET', '/api/admin/configuracao');
if (cfgOriginal.driver !== 'simulado') {
  console.error('O MES não está no driver simulado: este teste só roda com o simulado.');
  process.exit(2);
}
let pararMes = false;
try {
  console.log('Preparando: reinicia a aula, simulador 200× mais rápido');
  await mes('PUT', '/api/admin/configuracao', { ...cfgOriginal, escalaSimulador: 200 });
  await mes('POST', '/api/admin/simulador/falha', { falha: 'nenhuma' });
  await loja('POST', '/api/admin/reiniciar'); // a Loja apaga os dados dela e reinicia o MES
  confere((await mes('GET', '/api/mes/fila')).length === 0 && (await loja('GET', '/api/erp/pedidos')).pedidos.length === 0,
    'reiniciar a aula na Loja limpa a Loja e o MES');
  const sistema = await loja('GET', '/api/sistema');
  confere(sistema.sistema === 'loja' && sistema.outro.sistema === 'mes', 'a Loja sabe onde fica o MES (link do topo)');
  await ate('fila vazia e bancada livre', async () => {
    const b = await mes('GET', '/api/mes/bancada');
    return b.conectado && b.clpVivo && b.opExecucao === null;
  });

  // 1. vitrine
  console.log('1. Pedido na vitrine');
  const catalogo = await loja('GET', '/api/loja/catalogo');
  const porNome = (n) => catalogo.produtos.find((p) => p.nome.startsWith(n));
  confere(catalogo.produtos.length >= 4, 'catálogo com os produtos iniciais');
  confere(catalogo.mesNoAr && catalogo.produtos.every((p) => p.prazoEstimado > Date.now()), 'cada produto tem prazo estimado (perguntado ao MES)');

  const recusa = await fetch(`${LOJA}/api/loja/pedidos`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    // vazão 99 fora da faixa: se o cliente pudesse escolher a vazão, ela também apareceria nos erros
    body: JSON.stringify({ cliente: { nome: 'Ana' }, itens: [{ produtoId: porNome('Sob medida').id, receita: { volume: 10, temperatura: 90, vazao: 99 } }] }),
  });
  const errosRecusa = recusa.status === 422 ? (await recusa.json()).erros.map((e) => e.campo) : [];
  confere(recusa.status === 422 && errosRecusa.includes('itens.0.temperatura'), 'sob medida fora da faixa é recusado');
  confere(!errosRecusa.some((c) => c.endsWith('vazao')), 'vazão enviada pelo cliente no sob medida é ignorada');

  // A OP manual fria entra primeiro e já vai para o CLP; depois chegam quente, morna e sob medida 50 °C.
  const manual = await mes('POST', '/api/mes/ordens', { volume: 5, temperatura: 40, vazao: 6, pressao: 2 });
  await ate('OP manual recebida pelo CLP', async () => (await estadoOp(manual.numero)) === 'em_producao', 20_000);
  const { pedidoId } = await loja('POST', '/api/loja/pedidos', {
    cliente: { nome: 'Ana Souza' },
    itens: [
      { produtoId: porNome('Quente').id, quantidade: 1 },
      { produtoId: porNome('Morna').id, quantidade: 1 },
      { produtoId: porNome('Sob medida').id, receita: { volume: 6, temperatura: 50 } },
    ],
  });
  let pedido = await loja('GET', `/api/loja/pedidos/${pedidoId}`);
  confere(pedido.itens.length === 3 && pedido.itens.every((i) => i.numeroOp), 'cada unidade virou uma OP');
  confere(pedido.cliente.nome === 'Ana Souza' && pedido.cliente.email === null, 'pedido feito só com o nome do cliente');
  const opSobMedida = await mes('GET', `/api/mes/ordens/${pedido.itens.find((i) => i.nomeProduto === 'Sob medida').numeroOp}`);
  confere(opSobMedida.ordem.receita.vazao === porNome('Sob medida').receita.vazao, 'OP sob medida com a vazão do produto');
  confere(opSobMedida.ordem.origem.startsWith('loja:item:'), `a OP guarda a origem na Loja (${opSobMedida.ordem.origem})`);
  const feed = await mes('GET', '/api/ordens/mudancas?desde=0');
  confere(pedido.itens.every((i) => feed.mudancas.some((m) => m.numero === i.numeroOp && m.estado === 'na_fila')),
    'o feed de mudanças do MES mostra as OPs novas');

  // 2. sequenciamento: temperatura crescente a partir da atual (40 °C)
  console.log('2. Sequenciamento');
  const fila = await mes('GET', '/api/mes/fila');
  const temps = fila.map((f) => f.ordem.receita.temperatura);
  confere(JSON.stringify(temps) === JSON.stringify([40, 45, 50, 65]), `fila por temperatura crescente (${temps.join(', ')})`);

  // 3. produção até o fim
  console.log('3. Produção no simulado');
  const ops = [manual.numero, ...pedido.itens.map((i) => i.numeroOp)];
  // a inspeção é automática: a OP passa de produzida a aprovada ou reprovada sozinha (o simulador às vezes
  // erra de propósito, então o teste não conta com todas aprovadas)
  const inspecionada = (e) => e === 'aprovada' || e === 'reprovada';
  await ate('todas produzidas e inspecionadas', async () => {
    const estados = await Promise.all(ops.map(estadoOp));
    return estados.every(inspecionada);
  }, 180_000);
  const dossies = await Promise.all(ops.map((n) => mes('GET', `/api/mes/ordens/${n}`)));
  const recebidas = dossies.map((d) => ({ t: d.ordem.recebidaEm, temp: d.ordem.receita.temperatura })).sort((a, b) => a.t - b.t);
  confere(JSON.stringify(recebidas.map((r) => r.temp)) === JSON.stringify([40, 45, 50, 65]), 'o CLP recebeu na ordem da fila');
  confere(dossies.every((d) => d.batelada && d.leituras.length > 0), 'batelada e série temporal registradas');
  confere(dossies.every((d) => d.eventos.some((e) => e.tipo === 'clp_recebeu')), 'eventos de rastreabilidade');

  // 4. qualidade (automática) e faturamento
  console.log('4. Qualidade e faturamento');
  confere(dossies.every((d) => d.inspecao && (d.inspecao.resultado === 'aprovada') === d.avaliacao.dentro),
    'inspeção automática pela tolerância');
  pedido = await loja('GET', `/api/loja/pedidos/${pedidoId}`);
  const aprovadasPedido = pedido.itens.filter((i) => i.producao.estado === 'aprovada').length;
  // a fatura sai quando a Loja lê a aprovação no feed do MES (a cada segundo)
  const faturas = await ate('faturas dos itens aprovados', async () => {
    const f = await loja('GET', '/api/erp/faturas');
    return f.length === aprovadasPedido ? f : null;
  }, 10_000).catch(() => loja('GET', '/api/erp/faturas'));
  confere(faturas.length === aprovadasPedido, `uma fatura por item aprovado do pedido (${faturas.length} de ${aprovadasPedido})`);
  confere(pedido.itens.every((i) => inspecionada(i.producao.estado)), 'a vitrine vê os itens inspecionados');
  const cert = await loja('GET', `/api/loja/certificado/${pedido.itens[0].numeroOp}`);
  confere(cert.cliente?.nome === 'Ana Souza' && inspecionada(cert.inspecao?.resultado), 'certificado com cliente e inspeção');
  const manualInsp = await fetch(`${MES}/api/mes/ordens/${manual.numero}/inspecao`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ resultado: 'aprovada' }),
  });
  confere(manualInsp.status === 404, 'não existe mais inspeção manual');

  // 5. cancelamento
  console.log('5. Cancelamento');
  const ocupa = await mes('POST', '/api/mes/ordens', { volume: 20, temperatura: 65, vazao: 1, pressao: 2 });
  await ate('OP longa em produção', async () => (await estadoOp(ocupa.numero)) === 'em_producao', 20_000);
  const a = await mes('POST', '/api/mes/ordens', { volume: 5, temperatura: 45, vazao: 4, pressao: 2 });
  const b = await mes('POST', '/api/mes/ordens', { volume: 5, temperatura: 55, vazao: 4, pressao: 2 });
  await ate('a primeira fica disponível ao CLP', async () => (await estadoOp(a.numero)) === 'enviada', 10_000);
  confere((await mes('POST', `/api/mes/ordens/${b.numero}/cancelar`)).resultado === 'cancelada', 'cancela na fila na hora');
  confere((await mes('POST', `/api/mes/ordens/${a.numero}/cancelar`)).resultado === 'pendente', 'enviada: cancelamento pendente');
  await ate('enviada retirada e cancelada', async () => (await estadoOp(a.numero)) === 'cancelada', 10_000);
  confere((await mes('GET', '/api/mes/bancada')).disponivel === null, 'nada disponível ao CLP depois de cancelar');
  // cancelamento pedido na Loja (vai ao MES pelo contrato)
  const { pedidoId: pedidoCancelar } = await loja('POST', '/api/loja/pedidos', { cliente: { nome: 'Bia' }, itens: [{ produtoId: porNome('Morna').id }] });
  const itemCancelar = (await loja('GET', `/api/loja/pedidos/${pedidoCancelar}`)).itens[0];
  const rCancelar = await loja('POST', `/api/erp/itens/${itemCancelar.id}/cancelar`);
  await ate('item cancelado pela Loja', async () => (await estadoOp(itemCancelar.numeroOp)) === 'cancelada', 10_000);
  confere(['cancelada', 'pendente'].includes(rCancelar.resultado), `a Loja cancela o item no MES (${rCancelar.resultado})`);

  // 6. queda de comunicação (CLP "congela")
  console.log('6. Queda de comunicação');
  await mes('POST', '/api/admin/simulador/falha', { falha: 'congelar' });
  await ate('OP com comunicação perdida', async () => (await estadoOp(ocupa.numero)) === 'comunicacao_perdida', 15_000);
  await mes('POST', '/api/admin/simulador/falha', { falha: 'nenhuma' });
  await ate('OP volta a em produção', async () => (await estadoOp(ocupa.numero)) === 'em_producao', 15_000);
  confere(true, 'queda não concluiu a OP e ela voltou ao estado anterior');

  // 7. abortada no CLP
  console.log('7. OP abortada no CLP');
  await mes('POST', '/api/admin/simulador/falha', { falha: 'abortar' });
  await ate('OP abortada', async () => (await estadoOp(ocupa.numero)) === 'abortada', 15_000);
  confere(true, 'OP abortada pelo CLP registrada');

  // 8. indicadores e relatório
  console.log('8. Indicadores');
  const parada = await mes('POST', '/api/mes/paradas', { motivo: 'troca_turno' });
  await espera(1000);
  await mes('POST', `/api/mes/paradas/${parada.id}/encerrar`);
  const ind = await mes('GET', '/api/mes/indicadores');
  // nos indicadores a abortada conta como reprovada (perda de qualidade); o simulador pode reprovar outras
  confere(ind.produzidas === 5 && ind.aprovadas + ind.reprovadas === 5 && ind.reprovadas >= 1 && ind.abortadas === 1,
    `contagens (${ind.produzidas} produzidas, ${ind.aprovadas} aprovadas + ${ind.reprovadas} reprovadas, ${ind.abortadas} abortada)`);
  confere(ind.oee !== null && ind.oee > 0 && ind.oee <= 1, `OEE calculado (${(ind.oee * 100).toFixed(1)} %)`);
  confere(ind.tempoParadoMs >= 900, 'parada apontada conta no OEE');
  const csv = await (await fetch(`${MES}/api/mes/relatorio.csv`)).text();
  confere(csv.includes('OEE;') && csv.includes('Resfriar (s)') && csv.split('\r\n').length > 12, 'relatório CSV exportável (com o tempo de resfriar)');

  // 9. MES fora do ar: a Loja recusa o pedido com erro claro e não grava nada
  if (SEM_DOCKER) {
    console.log('9. MES fora do ar: pulado (--sem-docker)');
  } else {
    console.log('9. MES fora do ar (para o contêiner mes e sobe de novo)');
    const antes = (await loja('GET', '/api/erp/pedidos')).pedidos.length;
    pararMes = true;
    execFileSync('docker', ['compose', 'stop', 'mes'], { cwd: RAIZ, stdio: 'ignore' });
    const r = await fetch(`${LOJA}/api/loja/pedidos`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cliente: { nome: 'Caio' }, itens: [{ produtoId: porNome('Morna').id }] }),
    });
    const corpo = await r.json().catch(() => ({}));
    confere(r.status === 503 && corpo.erro === 'mes_fora_do_ar', `pedido recusado com o MES fora do ar (${r.status} ${corpo.erro})`);
    const lista = await loja('GET', '/api/erp/pedidos');
    confere(lista.pedidos.length === antes && lista.mesNoAr === false, 'nenhum pedido pela metade; a Loja avisa que o MES não responde');
    confere((await loja('GET', '/api/saude')).mes === 'erro', 'a saúde da Loja mostra o MES fora');
  }
} finally {
  if (pararMes) {
    execFileSync('docker', ['compose', 'start', 'mes'], { cwd: RAIZ, stdio: 'ignore' });
    await ate('MES de volta', async () => (await loja('GET', '/api/saude').catch(() => ({}))).mes === 'ok', 120_000)
      .then(() => confere(true, 'MES de volta no ar'), () => confere(false, 'MES de volta no ar'));
  }
  await mes('POST', '/api/admin/simulador/falha', { falha: 'nenhuma' }).catch(() => undefined);
  await mes('PUT', '/api/admin/configuracao', cfgOriginal).catch(() => undefined);
}

console.log(falhas === 0 ? '\nTudo certo.' : `\n${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);
