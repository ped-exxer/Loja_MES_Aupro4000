// Entradas inválidas nas rotas da Loja: sempre 4xx, nunca 500, e sem ocupar a Loja com um pedido absurdo.
// Sem banco e sem MES: os dois aqui são de mentira (o banco só conhece o catálogo; o MES conta as chamadas).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import type { Banco } from '@aupro/servidor';
import { ErroMes, type ClienteMes } from './cliente-mes.ts';
import { criarErp, registrarErros } from './erp.ts';

const PRODUTOS = [
  { id: 1, nome: 'Morna 10 L', descricao: null, preco: 10, volume: 10, temperatura: 45, vazao: 4, pressao: 2, tol_temperatura: 2, tol_volume: 0.5, sob_medida: 0, ativo: 1 },
  { id: 4, nome: 'Sob medida', descricao: null, preco: 20, volume: 10, temperatura: 50, vazao: 4, pressao: 2, tol_temperatura: 2, tol_volume: 0.5, sob_medida: 1, ativo: 1 },
];

async function loja(t: { after(fn: () => unknown): void }, mesNoAr = true) {
  const visto = { consultas: [] as string[], mes: [] as string[] };
  const banco = {
    query: async (sql: string, valores: unknown[] = []) => {
      visto.consultas.push(sql);
      if (/FROM erp_produto WHERE id = \?/.test(sql)) return [PRODUTOS.filter((p) => p.id === valores[0])];
      if (/^UPDATE erp_produto/.test(sql)) return [{ affectedRows: 0 }];
      throw new Error(`o teste não esperava esta consulta: ${sql}`);
    },
    getConnection: async () => {
      throw new Error('o teste não esperava uma transação');
    },
  } as unknown as Banco;
  const chamada = (nome: string) => async () => {
    visto.mes.push(nome);
    throw new ErroMes(mesNoAr ? 'nao_esperado' : 'mes_fora_do_ar', mesNoAr ? 500 : 503, nome);
  };
  const mes = {
    emitirOrdens: chamada('emitirOrdens'), cancelarOrdem: chamada('cancelarOrdem'), estimarPrazos: chamada('estimarPrazos'),
    andamento: chamada('andamento'), dossie: chamada('dossie'), reiniciar: chamada('reiniciar'),
  } as unknown as ClienteMes;
  const app = Fastify();
  registrarErros(app);
  criarErp(app, banco, mes, { publicar: () => undefined }, new Set());
  t.after(() => app.close());
  const pedir = async (metodo: 'GET' | 'POST' | 'PUT', url: string, corpo?: unknown, cru?: string) => {
    const r = await app.inject({
      method: metodo, url,
      ...(cru !== undefined ? { payload: cru, headers: { 'content-type': 'application/json' } } : corpo !== undefined ? { payload: corpo as object } : {}),
    });
    return { status: r.statusCode, corpo: r.body ? (JSON.parse(r.body) as { erro?: string; erros?: { campo: string; codigo: string }[] }) : {} };
  };
  return { pedir, visto };
}

const campos = (r: { corpo: { erros?: { campo: string; codigo: string }[] } }) => (r.corpo.erros ?? []).map((e) => `${e.campo}:${e.codigo}`);

test('checkout com corpo vazio ou tipos errados: 422 com os campos, sem falar com o MES', async (t) => {
  const { pedir, visto } = await loja(t);
  for (const corpo of [undefined, {}, [], { cliente: null, itens: null }, { cliente: 'Ana', itens: 'x' }, { cliente: { nome: 5 }, itens: {} }]) {
    const r = await pedir('POST', '/api/loja/pedidos', corpo);
    assert.equal(r.status, 422, JSON.stringify(corpo));
    assert.deepEqual(campos(r), ['cliente.nome:obrigatorio', 'itens:vazio']);
  }
  assert.equal((await pedir('POST', '/api/loja/pedidos', undefined, 'null')).status, 422);
  const cortado = await pedir('POST', '/api/loja/pedidos', undefined, '{"cliente": ');
  assert.equal(cortado.status, 400);
  assert.equal(cortado.corpo.erro, 'pedido_invalido');

  // itens malformados: cada um com o seu erro
  const r = await pedir('POST', '/api/loja/pedidos', {
    cliente: { nome: 'Ana' },
    itens: [null, 'x', { produtoId: 'abc' }, { produtoId: 999 }, { produtoId: 1, quantidade: 'duas' }, { produtoId: 1, quantidade: -1 },
      { produtoId: 4 }, { produtoId: 4, receita: 'quente' }, { produtoId: 4, receita: { volume: '10', temperatura: 90 } }],
  });
  assert.equal(r.status, 422);
  assert.deepEqual(campos(r), [
    'itens.0.produtoId:inexistente', 'itens.1.produtoId:inexistente', 'itens.2.produtoId:inexistente', 'itens.3.produtoId:inexistente',
    'itens.4.quantidade:invalido', 'itens.5.quantidade:invalido',
    'itens.6.volume:invalido', 'itens.6.temperatura:invalido', 'itens.7.volume:invalido', 'itens.7.temperatura:invalido',
    'itens.8.volume:invalido', 'itens.8.temperatura:fora_da_faixa',
  ]);
  assert.deepEqual(visto.mes, []);
});

test('checkout absurdo (mil itens, quantidade de um bilhão) é recusado na hora, sem consultar item por item', async (t) => {
  const { pedir, visto } = await loja(t);
  const muitos = await pedir('POST', '/api/loja/pedidos', { cliente: { nome: 'Ana' }, itens: Array.from({ length: 1000 }, () => ({ produtoId: 1 })) });
  assert.equal(muitos.status, 422);
  assert.deepEqual(campos(muitos), ['itens:muitas_unidades']);
  assert.equal(visto.consultas.length, 0);

  const inicio = Date.now();
  const bilhao = await pedir('POST', '/api/loja/pedidos', { cliente: { nome: 'Ana' }, itens: [{ produtoId: 1, quantidade: 1_000_000_000 }] });
  assert.equal(bilhao.status, 422);
  assert.deepEqual(campos(bilhao), ['itens:muitas_unidades']);
  assert.ok(Date.now() - inicio < 1000, 'ficou montando um bilhão de unidades');

  const onze = await pedir('POST', '/api/loja/pedidos', { cliente: { nome: 'Ana' }, itens: [{ produtoId: 1, quantidade: 6 }, { produtoId: 1, quantidade: 5 }] });
  assert.deepEqual(campos(onze), ['itens:muitas_unidades']);
  assert.deepEqual(visto.mes, []);
});

test('pedido bom com o MES fora do ar: 503 mes_fora_do_ar, sem gravar nada', async (t) => {
  const { pedir, visto } = await loja(t, false);
  const r = await pedir('POST', '/api/loja/pedidos', { cliente: { nome: 'Ana' }, itens: [{ produtoId: 1, quantidade: 2 }] });
  assert.equal(r.status, 503);
  assert.equal(r.corpo.erro, 'mes_fora_do_ar');
  assert.deepEqual(visto.mes, ['estimarPrazos']); // parou antes de abrir a transação
  assert.ok(visto.consultas.every((sql) => /^SELECT/.test(sql)));
});

test('catálogo: produto com corpo vazio ou valores absurdos é 422; rotas com id ruim são 404', async (t) => {
  const { pedir, visto } = await loja(t);
  for (const corpo of [undefined, {}, [], { nome: 5, preco: 'dez' }]) {
    const r = await pedir('POST', '/api/erp/produtos', corpo);
    assert.equal(r.status, 422, JSON.stringify(corpo));
    assert.equal(r.corpo.erro, 'produto_invalido');
    assert.ok(campos(r).includes('nome:obrigatorio') && campos(r).includes('preco:invalido') && campos(r).includes('volume:invalido'));
  }
  const bom = { nome: 'Teste', preco: 10, volume: 10, temperatura: 45, vazao: 4, pressao: 2, tolTemperatura: 2, tolVolume: 0.5 };
  assert.deepEqual(campos(await pedir('POST', '/api/erp/produtos', { ...bom, preco: 1e12 })), ['preco:invalido']);
  assert.deepEqual(campos(await pedir('POST', '/api/erp/produtos', { ...bom, preco: -1 })), ['preco:invalido']);
  assert.deepEqual(campos(await pedir('PUT', '/api/erp/produtos/1', { ...bom, tolVolume: 0 })), ['tolerancia.volume:tolerancia_invalida']);
  assert.equal((await pedir('PUT', '/api/erp/produtos/abc', bom)).status, 404);
  assert.equal((await pedir('PUT', '/api/erp/produtos/77', bom)).status, 404); // não existe
  assert.equal((await pedir('GET', '/api/loja/pedidos/abc')).status, 404);
  assert.equal((await pedir('GET', '/api/loja/certificado/abc')).status, 404);
  assert.equal((await pedir('POST', '/api/erp/itens/abc/cancelar')).status, 404);
  assert.equal((await pedir('POST', '/api/erp/itens/0/refazer')).status, 404);
  assert.deepEqual(visto.mes, []);
});
