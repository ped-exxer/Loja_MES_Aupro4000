// Teste de ponta a ponta contra a pilha no ar, com o driver SIMULADO (não use com a bancada física).
//   node scripts/ponta-a-ponta.mjs [http://localhost:8080]
// Reinicia o cenário da aula, acelera o simulador e confere: pedido → OPs → sequenciamento → produção →
// inspeção → fatura → certificado → indicadores; cancelamento; queda de comunicação; OP abortada.

const BASE = process.argv[2] ?? 'http://localhost:8080';
const AUTOR = { 'x-autor': encodeURIComponent('Teste automático'), 'x-papel': 'professor' };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let falhas = 0;

async function api(metodo, caminho, corpo) {
  const r = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    headers: { ...AUTOR, ...(corpo === undefined ? {} : { 'content-type': 'application/json' }) },
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

const estadoOp = async (n) => (await api('GET', `/api/mes/ordens/${n}`)).ordem.situacao.estado;

// ------------------------------------------------------------------
const cfgOriginal = await api('GET', '/api/admin/configuracao');
if (cfgOriginal.driver !== 'simulado') {
  console.error('A Loja não está no driver simulado: este teste só roda com o simulado.');
  process.exit(2);
}
try {
  console.log('Preparando: reinicia a aula, simulador 200× mais rápido, inspeção manual');
  await api('PUT', '/api/admin/configuracao', { ...cfgOriginal, escalaSimulador: 200, inspecaoAutomatica: false });
  await api('POST', '/api/admin/simulador/falha', { falha: 'nenhuma' });
  await api('POST', '/api/admin/reiniciar');
  await ate('fila vazia e bancada livre', async () => {
    const b = await api('GET', '/api/mes/bancada');
    return b.conectado && b.clpVivo && b.opExecucao === null;
  });

  // 1. vitrine
  console.log('1. Pedido na vitrine');
  const catalogo = await api('GET', '/api/loja/catalogo');
  const porNome = (n) => catalogo.produtos.find((p) => p.nome.startsWith(n));
  confere(catalogo.produtos.length >= 4, 'catálogo com os produtos iniciais');
  confere(catalogo.produtos.every((p) => p.prazoEstimado > Date.now()), 'cada produto tem prazo estimado');

  const recusa = await fetch(`${BASE}/api/loja/pedidos`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ cliente: { nome: 'Ana', email: 'ana@escola.edu.br' }, itens: [{ produtoId: porNome('Sob medida').id, receita: { volume: 10, temperatura: 90 } }] }),
  });
  confere(recusa.status === 422, 'sob medida fora da faixa é recusado');

  // A OP manual fria entra primeiro e já vai para o CLP; depois chegam quente, morna e sob medida 50 °C.
  const manual = await api('POST', '/api/mes/ordens', { volume: 5, temperatura: 40, vazao: 6, pressao: 2 });
  await ate('OP manual recebida pelo CLP', async () => (await estadoOp(manual.numero)) === 'em_producao', 20_000);
  const { pedidoId } = await api('POST', '/api/loja/pedidos', {
    cliente: { nome: 'Ana Souza', email: 'ana@escola.edu.br', turma: '3º A' },
    itens: [
      { produtoId: porNome('Quente').id, quantidade: 1 },
      { produtoId: porNome('Morna').id, quantidade: 1 },
      { produtoId: porNome('Sob medida').id, receita: { volume: 6, temperatura: 50, vazao: 5 } },
    ],
  });
  let pedido = await api('GET', `/api/loja/pedidos/${pedidoId}`);
  confere(pedido.itens.length === 3 && pedido.itens.every((i) => i.numeroOp), 'cada unidade virou uma OP');

  // 2. sequenciamento: temperatura crescente a partir da atual (40 °C)
  console.log('2. Sequenciamento');
  const fila = await api('GET', '/api/mes/fila');
  const temps = fila.map((f) => f.ordem.receita.temperatura);
  confere(JSON.stringify(temps) === JSON.stringify([40, 45, 50, 65]), `fila por temperatura crescente (${temps.join(', ')})`);

  // 3. produção até o fim
  console.log('3. Produção no simulado');
  const ops = [manual.numero, ...pedido.itens.map((i) => i.numeroOp)];
  await ate('todas produzidas', async () => {
    const estados = await Promise.all(ops.map(estadoOp));
    return estados.every((e) => e === 'produzida');
  }, 180_000);
  const dossies = await Promise.all(ops.map((n) => api('GET', `/api/mes/ordens/${n}`)));
  const recebidas = dossies.map((d) => ({ t: d.ordem.recebidaEm, temp: d.ordem.receita.temperatura })).sort((a, b) => a.t - b.t);
  confere(JSON.stringify(recebidas.map((r) => r.temp)) === JSON.stringify([40, 45, 50, 65]), 'o CLP recebeu na ordem da fila');
  confere(dossies.every((d) => d.batelada && d.leituras.length > 0), 'batelada e série temporal registradas');
  confere(dossies.every((d) => d.eventos.some((e) => e.tipo === 'clp_recebeu')), 'eventos de rastreabilidade');

  // 4. qualidade e faturamento
  console.log('4. Qualidade e faturamento');
  for (const d of dossies) await api('POST', `/api/mes/ordens/${d.ordem.numero}/inspecao`, { resultado: 'aprovada', observacao: 'ok' });
  await espera(300);
  const faturas = await api('GET', '/api/erp/faturas');
  confere(faturas.length === 3, `uma fatura por item aprovado do pedido (${faturas.length})`);
  pedido = await api('GET', `/api/loja/pedidos/${pedidoId}`);
  confere(pedido.itens.every((i) => i.producao.estado === 'aprovada'), 'a vitrine vê os itens aprovados');
  const cert = await api('GET', `/api/loja/certificado/${pedido.itens[0].numeroOp}`);
  confere(cert.cliente?.nome === 'Ana Souza' && cert.inspecao?.autor?.includes('Teste'), 'certificado com cliente e inspetor');

  // 5. cancelamento
  console.log('5. Cancelamento');
  const ocupa = await api('POST', '/api/mes/ordens', { volume: 20, temperatura: 65, vazao: 1, pressao: 2 });
  await ate('OP longa em produção', async () => (await estadoOp(ocupa.numero)) === 'em_producao', 20_000);
  const a = await api('POST', '/api/mes/ordens', { volume: 5, temperatura: 45, vazao: 4, pressao: 2 });
  const b = await api('POST', '/api/mes/ordens', { volume: 5, temperatura: 55, vazao: 4, pressao: 2 });
  await ate('a primeira fica disponível ao CLP', async () => (await estadoOp(a.numero)) === 'enviada', 10_000);
  confere((await api('POST', `/api/mes/ordens/${b.numero}/cancelar`)).resultado === 'cancelada', 'cancela na fila na hora');
  confere((await api('POST', `/api/mes/ordens/${a.numero}/cancelar`)).resultado === 'pendente', 'enviada: cancelamento pendente');
  await ate('enviada retirada e cancelada', async () => (await estadoOp(a.numero)) === 'cancelada', 10_000);
  confere((await api('GET', '/api/mes/bancada')).disponivel === null, 'nada disponível ao CLP depois de cancelar');

  // 6. queda de comunicação (CLP "congela")
  console.log('6. Queda de comunicação');
  await api('POST', '/api/admin/simulador/falha', { falha: 'congelar' });
  await ate('OP com comunicação perdida', async () => (await estadoOp(ocupa.numero)) === 'comunicacao_perdida', 15_000);
  await api('POST', '/api/admin/simulador/falha', { falha: 'nenhuma' });
  await ate('OP volta a em produção', async () => (await estadoOp(ocupa.numero)) === 'em_producao', 15_000);
  confere(true, 'queda não concluiu a OP e ela voltou ao estado anterior');

  // 7. abortada no CLP
  console.log('7. OP abortada no CLP');
  await api('POST', '/api/admin/simulador/falha', { falha: 'abortar' });
  await ate('OP abortada', async () => (await estadoOp(ocupa.numero)) === 'abortada', 15_000);
  confere(true, 'OP abortada pelo CLP registrada');

  // 8. indicadores e relatório
  console.log('8. Indicadores');
  const parada = await api('POST', '/api/mes/paradas', { motivo: 'troca_turno' });
  await espera(1000);
  await api('POST', `/api/mes/paradas/${parada.id}/encerrar`);
  const ind = await api('GET', '/api/mes/indicadores');
  confere(ind.produzidas === 5 && ind.aprovadas === 4 && ind.abortadas === 1, `contagens (${ind.produzidas} produzidas, ${ind.aprovadas} aprovadas, ${ind.abortadas} abortada)`);
  confere(ind.oee !== null && ind.oee > 0 && ind.oee <= 1, `OEE calculado (${(ind.oee * 100).toFixed(1)} %)`);
  confere(ind.tempoParadoMs >= 900, 'parada apontada conta no OEE');
  const csv = await (await fetch(`${BASE}/api/mes/relatorio.csv`)).text();
  confere(csv.includes('OEE;') && csv.split('\r\n').length > 12, 'relatório CSV exportável');
} finally {
  await api('POST', '/api/admin/simulador/falha', { falha: 'nenhuma' }).catch(() => undefined);
  await api('PUT', '/api/admin/configuracao', cfgOriginal).catch(() => undefined);
}

console.log(falhas === 0 ? '\nTudo certo.' : `\n${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);
