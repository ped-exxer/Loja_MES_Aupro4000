// Entradas inválidas nas rotas do MES: sempre 4xx, nunca 500. Sem banco: o "MES" aqui é de mentira e só registra o
// que as rotas lhe pedem (a validação tem de barrar o pedido ruim antes de chegar a ele).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify, { type FastifyInstance } from 'fastify';
import { ALARME, tabelaAlarmes } from '@aupro/contrato-clp';
import type { PedidoOrdem } from '@aupro/dominio';
import { registrarRotasAdministracao } from './administracao.ts';
import { validarConfiguracao, type Configuracao } from './configuracao.ts';
import { alarmeAtivoDe, eventosDeAlarme } from './despacho.ts';
import { MOTIVOS_PARADA, MOTIVO_DO_ALARME } from './esquema.ts';
import { registrarRotasIntegracao } from './integracao.ts';
import type { Mes, ResultadoEmissao } from './nucleo.ts';
import { registrarRotasMes } from './rotas.ts';

const CONFIGURACAO: Configuracao = {
  driver: 'simulado', ip: '192.168.0.1', rack: 0, slot: 1, numeroDb: 1, numeroDbProcesso: null, escalaSimulador: 20,
  margemPrazoMin: 5, inicioAula: 0,
};

/** Sobe as rotas do MES em volta de um MES de mentira; `chamadas` guarda o que chegou a ele. */
async function app(t: { after(fn: () => unknown): void }, emissao?: (p: PedidoOrdem[]) => ResultadoEmissao) {
  const chamadas: { metodo: string; argumentos: unknown[] }[] = [];
  const registrar = <T>(metodo: string, resposta: T) => (...argumentos: unknown[]) => {
    chamadas.push({ metodo, argumentos });
    return Promise.resolve(resposta);
  };
  const mes = {
    ctx: { banco: null },
    despachante: { estado: () => ({ alarme: ALARME.pressaoAltaTq01 }) },
    emitirOrdens: (p: PedidoOrdem[]) => {
      chamadas.push({ metodo: 'emitirOrdens', argumentos: [p] });
      return Promise.resolve(emissao ? emissao(p) : { ok: true, numeros: p.map((_, i) => 100 + i), criadas: p.length });
    },
    cancelarOrdem: registrar('cancelarOrdem', 'inexistente'),
    fixar: registrar('fixar', true),
    registrarAbortada: registrar('registrarAbortada', false),
    abrirParada: registrar('abrirParada', { ok: false, codigo: 'motivo_invalido' }),
    encerrarParada: registrar('encerrarParada', false),
    estimarPrazos: registrar('estimarPrazos', []),
    andamento: registrar('andamento', []),
    mudancas: registrar('mudancas', { mudancas: [], ultimo: null }),
    dossie: registrar('dossie', null),
    paradas: registrar('paradas', []),
  } as unknown as Mes;
  const servidor: FastifyInstance = Fastify();
  registrarRotasMes(servidor, mes);
  registrarRotasIntegracao(servidor, mes);
  registrarRotasAdministracao(servidor, {
    banco: null as never,
    gateway: { falhaSimulada: registrar('falhaSimulada', undefined) } as never,
    tempoReal: { publicar: () => undefined },
    configuracao: { ler: async () => CONFIGURACAO, invalidar: () => undefined },
    reiniciar: registrar('reiniciar', undefined),
    aplicarNoGateway: registrar('aplicarNoGateway', undefined),
  });
  t.after(() => servidor.close());
  const pedir = async (metodo: 'GET' | 'POST' | 'PUT', url: string, corpo?: unknown, cru?: string) => {
    const r = await servidor.inject({
      method: metodo, url,
      ...(cru !== undefined ? { payload: cru, headers: { 'content-type': 'application/json' } } : corpo !== undefined ? { payload: corpo as object } : {}),
    });
    return { status: r.statusCode, corpo: r.body ? (JSON.parse(r.body) as Record<string, unknown>) : {} };
  };
  return { pedir, chamadas };
}

const ordem = { origem: 'loja:item:1', receita: { volume: 10, temperatura: 45, vazao: 4, pressao: 2 }, tolerancias: { temperatura: 2, volume: 0.5 } };

test('POST /api/ordens: corpo vazio, tipos errados e listas absurdas dão 400, sem chegar ao MES', async (t) => {
  const { pedir, chamadas } = await app(t);
  const ruins: unknown[] = [undefined, {}, { ordens: null }, { ordens: 'x' }, { ordens: [] }, { ordens: {} }, [ordem], 5,
    { ordens: Array.from({ length: 51 }, () => ordem) }];
  for (const corpo of ruins) {
    const r = await pedir('POST', '/api/ordens', corpo);
    assert.equal(r.status, 400, JSON.stringify(corpo)?.slice(0, 60));
    assert.equal(r.corpo.erro, 'pedido_invalido');
  }
  assert.equal((await pedir('POST', '/api/ordens', undefined, '{"ordens": [')).status, 400); // JSON cortado
  assert.equal((await pedir('POST', '/api/ordens', undefined, 'null')).status, 400);
  assert.equal(chamadas.length, 0);
});

test('POST /api/ordens: ordem malformada chega ao MES como receita inválida (que responde 422), nunca quebra a rota', async (t) => {
  let recebido: PedidoOrdem[] = [];
  const { pedir } = await app(t, (p) => {
    recebido = p;
    return { ok: false, codigo: 'receita_invalida', erros: [{ indice: 0, campo: 'volume', codigo: 'invalido' }] };
  });
  for (const o of [null, 5, 'x', [], {}, { receita: null, tolerancias: 'a' }, { receita: { volume: '10' } }]) {
    const r = await pedir('POST', '/api/ordens', { ordens: [o] });
    assert.equal(r.status, 422, JSON.stringify(o));
    assert.deepEqual(r.corpo.erros, [{ campo: 'ordens.0.volume', codigo: 'invalido' }]);
    assert.ok(Number.isNaN(recebido[0].receita.volume) && Number.isNaN(recebido[0].tolerancias.temperatura));
    assert.equal(recebido[0].origem, null);
  }
});

test('POST /api/ordens: prazo absurdo é 422; substitui só vale inteiro positivo', async (t) => {
  const { pedir, chamadas } = await app(t);
  for (const prazo of [-1, 0, 1e20]) {
    const r = await pedir('POST', '/api/ordens', { ordens: [ordem, { ...ordem, prazo }] });
    assert.equal(r.status, 422, String(prazo));
    assert.deepEqual(r.corpo.erros, [{ campo: 'ordens.1.prazo', codigo: 'invalido' }]);
  }
  assert.equal(chamadas.length, 0);

  const r = await pedir('POST', '/api/ordens', { ordens: [{ ...ordem, prazo: Date.now() + 60_000, substitui: 'abc' }, { ...ordem, substitui: 7 }] });
  assert.equal(r.status, 201);
  const [pedidos] = chamadas[0].argumentos as [PedidoOrdem[]];
  assert.equal(pedidos[0].substitui, undefined);
  assert.equal(pedidos[1].substitui, 7);
});

test('POST /api/ordens: 201 quando cria, 200 quando todas já existiam, 409 quando a OP a substituir está ativa', async (t) => {
  assert.equal((await (await app(t)).pedir('POST', '/api/ordens', { ordens: [ordem] })).status, 201);

  const repetida = await (await app(t, () => ({ ok: true, numeros: [41], criadas: 0 }))).pedir('POST', '/api/ordens', { ordens: [ordem] });
  assert.equal(repetida.status, 200);
  assert.deepEqual(repetida.corpo, { numeros: [41] });

  const ativa = await (await app(t, () => ({ ok: false, codigo: 'ordem_ativa', indice: 0, numero: 41 })))
    .pedir('POST', '/api/ordens', { ordens: [{ ...ordem, substitui: 41 }] });
  assert.equal(ativa.status, 409);
  assert.equal(ativa.corpo.erro, 'ordem_ativa');
  assert.equal(ativa.corpo.numero, 41);
});

test('rotas do contrato com parâmetros ruins: 400 ou 404, e a lista de andamento ignora o que não é número', async (t) => {
  const { pedir, chamadas } = await app(t);
  for (const desde of ['abc', '-1', '1.5']) assert.equal((await pedir('GET', `/api/ordens/mudancas?desde=${desde}`)).status, 400);
  assert.equal((await pedir('GET', '/api/ordens/mudancas?desde=1&desde=2')).status, 400); // parâmetro repetido
  assert.equal((await pedir('GET', '/api/ordens/mudancas')).status, 200);
  assert.equal((await pedir('GET', '/api/ordens/mudancas?desde=')).status, 200);
  assert.equal((await pedir('GET', '/api/ordens/abc')).status, 404);
  assert.equal((await pedir('GET', '/api/ordens/0')).status, 404);
  assert.equal((await pedir('POST', '/api/ordens/abc/cancelar')).status, 404);
  assert.equal((await pedir('POST', '/api/ordens/999/cancelar')).status, 409); // o MES diz "inexistente"
  for (const corpo of [undefined, {}, { receitas: 'x' }, { receitas: Array.from({ length: 51 }, () => ({})) }]) {
    assert.equal((await pedir('POST', '/api/ordens/prazos', corpo)).status, 400);
  }
  assert.equal((await pedir('POST', '/api/ordens/prazos', { receitas: [null, 5, {}] })).status, 200);

  chamadas.length = 0;
  assert.equal((await pedir('GET', '/api/ordens/andamento?numeros=1&numeros=9')).status, 200); // parâmetro repetido: ignora
  assert.equal((await pedir('GET', '/api/ordens/andamento?numeros=1,x,,3,-2,2.5')).status, 200);
  assert.equal((await pedir('GET', '/api/ordens/andamento')).status, 200);
  assert.deepEqual(chamadas.map((c) => c.argumentos[0]), [[], [1, 3], []]);
});

test('rotas da tela do MES com corpo vazio ou errado: 4xx', async (t) => {
  const { pedir, chamadas } = await app(t, () => ({ ok: false, codigo: 'receita_invalida', erros: [{ indice: 0, campo: 'volume', codigo: 'invalido' }] }));
  assert.equal((await pedir('POST', '/api/mes/ordens', 'texto solto')).status, 415); // nem é JSON
  for (const corpo of [undefined, {}, [], { volume: '10' }]) {
    const r = await pedir('POST', '/api/mes/ordens', corpo);
    assert.equal(r.status, 422, JSON.stringify(corpo));
    assert.deepEqual(r.corpo.erros, [{ campo: 'volume', codigo: 'invalido' }]);
  }
  assert.equal((await pedir('POST', '/api/mes/ordens', undefined, 'null')).status, 422);
  for (const corpo of [undefined, {}, { posicao: 'a' }, { posicao: 0 }, { posicao: 1.5 }]) {
    assert.equal((await pedir('POST', '/api/mes/ordens/5/fixar', corpo)).status, 400, JSON.stringify(corpo));
  }
  assert.equal((await pedir('POST', '/api/mes/ordens/abc/fixar', { posicao: 1 })).status, 400);
  assert.equal((await pedir('POST', '/api/mes/ordens/5/fixar', { posicao: null })).status, 200); // soltar
  assert.equal((await pedir('POST', '/api/mes/ordens/abc/cancelar')).status, 404);
  assert.equal((await pedir('POST', '/api/mes/ordens/abc/registrar-abortada')).status, 409);
  assert.equal((await pedir('POST', '/api/mes/paradas')).status, 409); // sem motivo
  assert.equal((await pedir('POST', '/api/mes/paradas', { motivo: { a: 1 } })).status, 409);
  assert.equal((await pedir('POST', '/api/mes/paradas/abc/encerrar')).status, 409);
  assert.equal((await pedir('GET', '/api/mes/ordens/abc')).status, 404);
  assert.ok(!chamadas.some((c) => c.metodo === 'fixar' && c.argumentos[1] !== null), 'posição inválida não chega ao MES');
});

test('GET /api/mes/paradas sugere o motivo do intertravamento ativo', async (t) => {
  const { pedir } = await app(t);
  const r = await pedir('GET', '/api/mes/paradas');
  assert.equal(r.status, 200);
  assert.equal(r.corpo.sugerido, 'psh103');
  assert.deepEqual(r.corpo.motivos, [...MOTIVOS_PARADA]);
});

test('rotas de administração com corpo vazio ou errado: 422, sem aplicar nada', async (t) => {
  const { pedir, chamadas } = await app(t);
  for (const corpo of [undefined, {}, [], { driver: 'x' }, { ...CONFIGURACAO, ip: '999.1.1.1' }, { ...CONFIGURACAO, numeroDb: '1' }]) {
    const r = await pedir('PUT', '/api/admin/configuracao', corpo);
    assert.equal(r.status, 422, JSON.stringify(corpo));
    assert.equal(r.corpo.erro, 'configuracao_invalida');
  }
  assert.equal((await pedir('POST', '/api/admin/procurar-db', { ip: 'bancada' })).status, 422);
  assert.equal((await pedir('POST', '/api/admin/procurar-db', { rack: 99 })).status, 422);
  assert.equal(chamadas.length, 0);
  // falha do simulador: o corpo vai ao gateway, que é quem valida (aqui o gateway de mentira aceita tudo)
  assert.equal((await pedir('POST', '/api/admin/simulador/falha')).status, 200);
  assert.deepEqual(chamadas[0], { metodo: 'falhaSimulada', argumentos: ['undefined', undefined] });
  await pedir('POST', '/api/admin/simulador/falha', { falha: 'alarme', alarme: ALARME.emergencia });
  assert.deepEqual(chamadas[1].argumentos, ['alarme', ALARME.emergencia]);
  await pedir('POST', '/api/admin/simulador/falha', { falha: 'alarme', alarme: '1' });
  assert.deepEqual(chamadas[2].argumentos, ['alarme', undefined]);
});

test('validarConfiguracao aceita a boa e devolve só os campos da configuração', () => {
  const v = validarConfiguracao({ ...CONFIGURACAO, extra: 1 } as never);
  assert.ok(v.ok);
  assert.deepEqual(v.valor, {
    driver: 'simulado', ip: '192.168.0.1', rack: 0, slot: 1, numeroDb: 1, numeroDbProcesso: null, escalaSimulador: 20, margemPrazoMin: 5,
  });
  const ruim = validarConfiguracao({ ...CONFIGURACAO, ip: '10.0.0.256', slot: 40, numeroDbProcesso: 0, escalaSimulador: 0 });
  assert.ok(!ruim.ok);
  assert.deepEqual(ruim.erros.map((e) => e.campo).sort(), ['escalaSimulador', 'ip', 'numeroDbProcesso', 'slot']);
});

test('cada alarme do CLP tem um motivo de parada, e todos estão na lista da tela', () => {
  for (const a of tabelaAlarmes()) {
    if (a.codigo === ALARME.nenhum) continue;
    const motivo = MOTIVO_DO_ALARME[a.codigo];
    assert.ok(motivo, `alarme ${a.nome} sem motivo de parada`);
    assert.ok((MOTIVOS_PARADA as readonly string[]).includes(motivo));
  }
  assert.equal(MOTIVO_DO_ALARME[ALARME.nenhum], undefined);
  assert.equal(new Set(MOTIVOS_PARADA).size, MOTIVOS_PARADA.length);
});

test('eventosDeAlarme: registra o fim do alarme que saiu e o começo do que entrou, com o código', () => {
  assert.deepEqual(eventosDeAlarme(0, 0), []);
  assert.deepEqual(eventosDeAlarme(2, 2), []);
  assert.deepEqual(eventosDeAlarme(0, 2), [{ tipo: 'alarme', detalhe: 'Alarme 2' }]);
  assert.deepEqual(eventosDeAlarme(2, 0), [{ tipo: 'alarme_fim', detalhe: 'Alarme 2' }]);
  assert.deepEqual(eventosDeAlarme(2, 1), [{ tipo: 'alarme_fim', detalhe: 'Alarme 2' }, { tipo: 'alarme', detalhe: 'Alarme 1' }]);
  assert.deepEqual(eventosDeAlarme(0, 999), [{ tipo: 'alarme', detalhe: 'Alarme 999' }]); // código fora da tabela também fica registrado
});

test('alarmeAtivoDe: o MES que sobe com um alarme já registrado não o registra de novo', () => {
  assert.equal(alarmeAtivoDe(null), 0);
  assert.equal(alarmeAtivoDe({ tipo: 'alarme_fim', detalhe: 'Alarme 2' }), 0);
  assert.equal(alarmeAtivoDe({ tipo: 'alarme', detalhe: 'Alarme 2' }), 2);
  assert.equal(alarmeAtivoDe({ tipo: 'alarme', detalhe: null }), 0);
  // o alarme continua ativo depois de o MES reiniciar: nada a registrar; se passou enquanto o MES estava fora, só o fim
  assert.deepEqual(eventosDeAlarme(alarmeAtivoDe({ tipo: 'alarme', detalhe: 'Alarme 2' }), 2), []);
  assert.deepEqual(eventosDeAlarme(alarmeAtivoDe({ tipo: 'alarme', detalhe: 'Alarme 2' }), 0), [{ tipo: 'alarme_fim', detalhe: 'Alarme 2' }]);
});
