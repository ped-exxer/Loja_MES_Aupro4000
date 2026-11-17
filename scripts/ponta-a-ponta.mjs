// Teste de ponta a ponta contra a pilha no ar, com o driver SIMULADO (não use com a bancada física).
//   node scripts/ponta-a-ponta.mjs [url-da-loja] [url-do-mes]      (padrão http://localhost:8080 e :8081)
// Reinicia a aula (pela Loja, que reinicia o MES), acelera o simulador e confere: pedido na Loja → OPs no MES →
// sequenciamento → produção → inspeção automática → fatura (pelo feed de mudanças) → certificado; cancelamento;
// emissão idempotente e OP órfã; queda de comunicação; alarme; OP abortada e "produzir de novo"; indicadores e CSV;
// entradas inválidas e paginação; e, se o docker estiver à mão, a Loja recusando o pedido com o MES parado (para o
// contêiner mes e sobe de novo; termina com tudo no ar). Sem docker: --sem-docker.
//
// O contêiner `mes` parado é o do projeto compose desta pasta. Para uma pilha subida com outro nome de projeto
// (`docker compose -p <nome> up`), informe o mesmo nome em COMPOSE_PROJECT_NAME. O script confere, pela porta
// publicada, que o `mes` desse projeto é mesmo o da URL testada; se não for, não para nada e acusa a falha.

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

/** Só o status HTTP de um pedido (para conferir as recusas); `cru` manda o texto como está, com content-type JSON. */
async function status(base, metodo, caminho, corpo, cru) {
  const r = await fetch(`${base}${caminho}`, {
    method: metodo,
    headers: corpo === undefined && cru === undefined ? {} : { 'content-type': 'application/json' },
    body: cru ?? (corpo === undefined ? undefined : JSON.stringify(corpo)),
  });
  await r.arrayBuffer();
  return r.status;
}

const docker = (...args) => execFileSync('docker', ['compose', ...args], { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

/** O `mes` do projeto compose em uso publica a porta da URL testada? (não parar o contêiner de outra pilha) */
function mesDoComposeEhODaUrl() {
  try {
    const publicada = docker('port', 'mes', '8081').trim().split('\n')[0].split(':').pop();
    const u = new URL(MES);
    return publicada === (u.port || (u.protocol === 'https:' ? '443' : '80'));
  } catch {
    return false;
  }
}

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

  // 5a. emissão idempotente pela origem (contrato): repetir a chamada devolve a mesma OP, não cria outra
  console.log('5a. Emissão idempotente e OP órfã');
  const ordemTeste = { origem: 'teste:idempotencia', receita: { volume: 5, temperatura: 45, vazao: 4, pressao: 2 }, tolerancias: { temperatura: 2, volume: 0.5 } };
  const emissao1 = await mes('POST', '/api/ordens', { ordens: [ordemTeste] });
  const emissao2 = await mes('POST', '/api/ordens', { ordens: [ordemTeste] });
  confere(emissao1.numeros.length === 1 && emissao2.numeros[0] === emissao1.numeros[0], `repetir a emissão devolve a mesma OP (${emissao1.numeros[0]})`);
  confere((await mes('GET', '/api/mes/fila')).filter((f) => f.ordem.origem === ordemTeste.origem).length === 1, 'a fila tem uma OP só dessa origem');
  confere((await status(MES, 'POST', '/api/ordens', { ordens: [{ ...ordemTeste, substitui: emissao1.numeros[0] }] })) === 409,
    'substituir uma OP que ainda não terminou é recusado (409)');
  await mes('POST', `/api/ordens/${emissao1.numeros[0]}/cancelar`);
  await ate('OP de teste cancelada', async () => (await estadoOp(emissao1.numeros[0])) === 'cancelada', 10_000);
  const emissao3 = await mes('POST', '/api/ordens', { ordens: [{ ...ordemTeste, substitui: emissao1.numeros[0] }] });
  const emissao4 = await mes('POST', '/api/ordens', { ordens: [{ ...ordemTeste, substitui: emissao1.numeros[0] }] });
  confere(emissao3.numeros[0] > emissao1.numeros[0] && emissao4.numeros[0] === emissao3.numeros[0],
    'no lugar de uma OP terminada cria uma nova, e repetir devolve a mesma');
  await mes('POST', `/api/ordens/${emissao3.numeros[0]}/cancelar`);
  await ate('segunda OP de teste cancelada', async () => (await estadoOp(emissao3.numeros[0])) === 'cancelada', 10_000);
  // OP com origem da Loja mas sem item na Loja (a resposta da emissão se perdeu e o pedido foi desfeito):
  // a Loja a vê no feed e a cancela
  const orfa = await mes('POST', '/api/ordens', { ordens: [{ ...ordemTeste, origem: 'loja:item:987654321' }] });
  await ate('OP órfã cancelada pela Loja', async () => (await estadoOp(orfa.numeros[0])) === 'cancelada', 15_000)
    .then(() => confere(true, 'OP sem pedido na Loja é cancelada pela Loja (feed)'), () => confere(false, 'OP sem pedido na Loja é cancelada pela Loja (feed)'));
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

  // 6a. alarme: um intertravamento atua no CLP (PSH-103 = código 2 da tabela do contrato)
  console.log('6a. Alarme no CLP');
  await mes('POST', '/api/admin/simulador/falha', { falha: 'alarme', alarme: 2 });
  await ate('alarme na bancada', async () => {
    const b = await mes('GET', '/api/mes/bancada');
    return b.alarme === 2 && b.estadoClp === 3;
  }, 10_000);
  confere((await mes('GET', '/api/mes/paradas')).sugerido === 'psh103', 'a tela de paradas sugere o motivo do alarme (psh103)');
  confere((await estadoOp(ocupa.numero)) === 'em_producao', 'alarme não muda o estado da OP');
  await mes('POST', '/api/admin/simulador/falha', { falha: 'nenhuma' });
  await ate('alarme encerrado', async () => (await mes('GET', '/api/mes/bancada')).alarme === 0, 10_000);
  const registros = await mes('GET', '/api/mes/eventos?limite=30');
  confere(registros.some((e) => e.tipo === 'alarme' && e.detalhe === 'Alarme 2' && e.numeroOp === ocupa.numero)
    && registros.some((e) => e.tipo === 'alarme_fim' && e.detalhe === 'Alarme 2'), 'início e fim do alarme registrados com o código, na OP em produção');
  confere((await status(MES, 'POST', '/api/admin/simulador/falha', { falha: 'alarme', alarme: 999 })) === 400, 'alarme fora da tabela é recusado (400)');

  // 7. abortada no CLP
  console.log('7. OP abortada no CLP');
  await mes('POST', '/api/admin/simulador/falha', { falha: 'abortar' });
  await ate('OP abortada', async () => (await estadoOp(ocupa.numero)) === 'abortada', 15_000);
  confere(true, 'OP abortada pelo CLP registrada');

  // 7a. "produzir de novo": só quando a OP anterior terminou; repetir não cria outra OP
  console.log('7a. Produzir de novo');
  const { pedidoId: pedidoRefazer } = await loja('POST', '/api/loja/pedidos', { cliente: { nome: 'Davi' }, itens: [{ produtoId: porNome('Envase lento').id }] });
  const itemRefazer = (await loja('GET', `/api/loja/pedidos/${pedidoRefazer}`)).itens[0];
  await ate('item em produção', async () => (await estadoOp(itemRefazer.numeroOp)) === 'em_producao', 20_000);
  confere((await status(LOJA, 'POST', `/api/erp/itens/${itemRefazer.id}/refazer`, {})) === 409, 'não refaz um item com a OP em andamento (409)');
  await mes('POST', '/api/admin/simulador/falha', { falha: 'abortar' });
  await ate('OP do item abortada', async () => (await estadoOp(itemRefazer.numeroOp)) === 'abortada', 15_000);
  const refeito = await loja('POST', `/api/erp/itens/${itemRefazer.id}/refazer`, {});
  confere(refeito.numeroOp > itemRefazer.numeroOp, `item abortado ganha uma OP nova (${itemRefazer.numeroOp} → ${refeito.numeroOp})`);
  // a mesma emissão de novo, direto no contrato (como a Loja faria se a resposta tivesse se perdido)
  const repetido = await mes('POST', '/api/ordens', { ordens: [{
    origem: `loja:item:${itemRefazer.id}`, receita: itemRefazer.receita, tolerancias: itemRefazer.tolerancias, substitui: itemRefazer.numeroOp,
  }] });
  confere(repetido.numeros[0] === refeito.numeroOp, 'repetir o "produzir de novo" devolve a mesma OP nova');
  const opsDoItem = (await mes('GET', '/api/mes/ordens?limite=50')).filter((o) => o.origem === `loja:item:${itemRefazer.id}`);
  confere(opsDoItem.length === 2 && opsDoItem.filter((o) => !['abortada'].includes(o.situacao.estado)).length === 1,
    'o item tem duas OPs: a abortada e uma só ativa');
  await ate('OP nova inspecionada', async () => inspecionada(await estadoOp(refeito.numeroOp)), 60_000);
  confere((await loja('GET', `/api/loja/pedidos/${pedidoRefazer}`)).itens[0].numeroOp === refeito.numeroOp, 'o item aponta para a OP nova');

  // 8. indicadores e relatório
  console.log('8. Indicadores');
  const parada = await mes('POST', '/api/mes/paradas', { motivo: 'troca_turno' });
  await espera(1000);
  await mes('POST', `/api/mes/paradas/${parada.id}/encerrar`);
  const ind = await mes('GET', '/api/mes/indicadores');
  // nos indicadores a abortada conta como reprovada (perda de qualidade); o simulador pode reprovar outras
  confere(ind.produzidas === 7 && ind.aprovadas + ind.reprovadas === 7 && ind.reprovadas >= 2 && ind.abortadas === 2,
    `contagens (${ind.produzidas} produzidas, ${ind.aprovadas} aprovadas + ${ind.reprovadas} reprovadas, ${ind.abortadas} abortadas)`);
  // os totais da tela Qualidade vêm do servidor e contam só as inspecionadas (a abortada não é inspecionada)
  const totais = await mes('GET', '/api/mes/qualidade');
  const inspecionadas = await mes('GET', '/api/mes/ordens?estado=aprovada,reprovada&limite=300');
  confere(totais.aprovadas === inspecionadas.filter((o) => o.situacao.estado === 'aprovada').length
    && totais.reprovadas === inspecionadas.filter((o) => o.situacao.estado === 'reprovada').length && totais.aprovadas === ind.aprovadas,
    `totais da Qualidade (${totais.aprovadas} aprovadas, ${totais.reprovadas} reprovadas)`);
  const semTolerancia = await fetch(`${MES}/api/mes/ordens`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ volume: 5, temperatura: 45, vazao: 4, pressao: 2, tolTemperatura: null, tolVolume: 0.5 }),
  });
  confere(semTolerancia.status === 422 && (await semTolerancia.json()).erros.some((e) => e.campo === 'tolerancia.temperatura'),
    'OP manual com a tolerância em branco é recusada (não vira a padrão em silêncio)');
  confere(ind.oee !== null && ind.oee > 0 && ind.oee <= 1, `OEE calculado (${(ind.oee * 100).toFixed(1)} %)`);
  confere(ind.tempoParadoMs >= 900, 'parada apontada conta no OEE');
  const csv = await (await fetch(`${MES}/api/mes/relatorio.csv`)).text();
  confere(csv.includes('OEE;') && csv.includes('Resfriar (s)') && csv.split('\r\n').length > 12, 'relatório CSV exportável (com o tempo de resfriar)');

  // 8a. entradas inválidas (corpo vazio, tipos errados): sempre 4xx, nunca 500; e as listas paginam
  console.log('8a. Entradas inválidas e paginação');
  const ruins = [
    [MES, 'POST', '/api/ordens'], [MES, 'POST', '/api/ordens', { ordens: [null, 5] }], [MES, 'POST', '/api/ordens', undefined, '{"ordens": ['],
    [MES, 'POST', '/api/ordens', undefined, 'null'], [MES, 'POST', '/api/ordens', { ordens: [{ ...ordemTeste, prazo: 1e20 }] }],
    [MES, 'POST', '/api/ordens/prazos'], [MES, 'GET', '/api/ordens/mudancas?desde=abc'], [MES, 'GET', '/api/ordens/abc'],
    [MES, 'POST', '/api/mes/ordens'], [MES, 'POST', '/api/mes/ordens', []], [MES, 'POST', `/api/mes/ordens/${manual.numero}/fixar`],
    [MES, 'POST', '/api/mes/paradas'], [MES, 'POST', '/api/mes/paradas/abc/encerrar'], [MES, 'PUT', '/api/admin/configuracao'],
    [MES, 'PUT', '/api/admin/configuracao', { driver: 's7', ip: '999.0.0.1' }], [MES, 'POST', '/api/admin/simulador/falha'],
    [LOJA, 'POST', '/api/loja/pedidos'], [LOJA, 'POST', '/api/loja/pedidos', undefined, 'null'], [LOJA, 'POST', '/api/loja/pedidos', undefined, '{"cliente": '],
    [LOJA, 'POST', '/api/loja/pedidos', { cliente: { nome: 'Eva' }, itens: [null, { produtoId: 'x' }] }],
    [LOJA, 'POST', '/api/loja/pedidos', { cliente: { nome: 'Eva' }, itens: [{ produtoId: porNome('Morna').id, quantidade: 1e9 }] }],
    [LOJA, 'POST', '/api/erp/produtos'], [LOJA, 'PUT', '/api/erp/produtos/abc', {}], [LOJA, 'POST', '/api/erp/itens/abc/refazer'],
    [LOJA, 'GET', '/api/loja/pedidos/abc'], [LOJA, 'GET', '/api/loja/certificado/0'],
  ];
  const respostas = await Promise.all(ruins.map(async ([base, metodo, caminho, corpo, cru]) => ({ caminho: `${metodo} ${caminho}`, s: await status(base, metodo, caminho, corpo, cru) })));
  const foraDe4xx = respostas.filter((r) => r.s < 400 || r.s > 499);
  confere(foraDe4xx.length === 0, `${ruins.length} pedidos inválidos, todos recusados com 4xx${foraDe4xx.map((r) => ` [${r.caminho}: ${r.s}]`).join('')}`);
  const pagina1 = await mes('GET', '/api/mes/eventos?limite=5');
  const pagina2 = await mes('GET', `/api/mes/eventos?limite=5&antes=${pagina1.at(-1).id}`);
  confere(pagina1.length === 5 && pagina2.length === 5 && pagina2.every((e) => e.id < pagina1.at(-1).id), 'os registros do MES paginam (limite e antes)');
  const duasOps = await mes('GET', '/api/mes/ordens?limite=2');
  const maisDuas = await mes('GET', `/api/mes/ordens?limite=2&antes=${duasOps.at(-1).numero}`);
  confere(duasOps.length === 2 && duasOps[0].numero > duasOps[1].numero && maisDuas[0].numero < duasOps[1].numero, 'as ordens do MES paginam');
  const umPedido = await loja('GET', '/api/erp/pedidos?limite=1');
  const outroPedido = await loja('GET', `/api/erp/pedidos?limite=1&antes=${umPedido.pedidos[0].id}`);
  confere(umPedido.pedidos.length === 1 && outroPedido.pedidos.length === 1 && outroPedido.pedidos[0].id < umPedido.pedidos[0].id, 'os pedidos da Loja paginam');

  // 9. MES fora do ar: a Loja recusa o pedido com erro claro e não grava nada
  if (SEM_DOCKER) {
    console.log('9. MES fora do ar: pulado (--sem-docker)');
  } else if (!mesDoComposeEhODaUrl()) {
    console.log('9. MES fora do ar');
    confere(false, `o contêiner mes do projeto compose em uso não é o MES em ${MES}: nada foi parado (informe o projeto em COMPOSE_PROJECT_NAME, ou use --sem-docker)`);
  } else {
    console.log('9. MES fora do ar (para o contêiner mes e sobe de novo)');
    const antes = (await loja('GET', '/api/erp/pedidos')).pedidos.length;
    // uma tela aberta (SSE) não pode segurar o encerramento do MES
    const tela = new AbortController();
    await fetch(`${MES}/api/eventos`, { signal: tela.signal });
    pararMes = true;
    const inicioParada = Date.now();
    docker('stop', 'mes');
    const parada = Date.now() - inicioParada;
    tela.abort();
    confere(parada < 8000, `o MES encerra limpo, sem esperar o Docker matar (${(parada / 1000).toFixed(1)} s)`);
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
    docker('start', 'mes');
    await ate('MES de volta', async () => (await loja('GET', '/api/saude').catch(() => ({}))).mes === 'ok', 120_000)
      .then(() => confere(true, 'MES de volta no ar'), () => confere(false, 'MES de volta no ar'));
  }
  await mes('POST', '/api/admin/simulador/falha', { falha: 'nenhuma' }).catch(() => undefined);
  await mes('PUT', '/api/admin/configuracao', cfgOriginal).catch(() => undefined);
}

console.log(falhas === 0 ? '\nTudo certo.' : `\n${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);
