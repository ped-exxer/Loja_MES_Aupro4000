import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ESTADOS_COM_CLP,
  ESTADOS_FINAIS,
  criarOp,
  ehFinal,
  eventosPossiveis,
  transicionar,
  type EstadoOp,
  type EventoOp,
  type SituacaoOp,
} from './ordem-producao.ts';

const receitaBoa = { volume: 10, temperatura: 45, vazao: 4, pressao: 2 };

const TODOS_EVENTOS: EventoOp[] = [
  'enviar', 'retirar', 'cancelar', 'clp_recebeu', 'clp_recusou', 'clp_concluiu', 'clp_abortou',
  'aprovar', 'reprovar', 'perder_comunicacao', 'restabelecer_comunicacao',
];

/** Aplica eventos em sequência; falha o teste se algum for recusado. */
function aplicar(inicio: SituacaoOp, eventos: EventoOp[]): SituacaoOp {
  let situacao = inicio;
  for (const evento of eventos) {
    const r = transicionar(situacao, evento);
    assert.ok(r.ok, `evento "${evento}" recusado em "${situacao.estado}"`);
    situacao = r.situacao;
  }
  return situacao;
}

const naFila: SituacaoOp = { estado: 'na_fila' };

test('criarOp: nasce na fila só com receita válida', () => {
  assert.deepEqual(criarOp(receitaBoa), { ok: true, situacao: naFila });
  const r = criarOp({ ...receitaBoa, temperatura: 80 });
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.codigo, 'receita_invalida');
});

test('caminho feliz: fila → enviada → em produção → produzida → aprovada', () => {
  const fim = aplicar(naFila, ['enviar', 'clp_recebeu', 'clp_concluiu', 'aprovar']);
  assert.deepEqual(fim, { estado: 'aprovada' });
  assert.ok(ehFinal(fim.estado));
});

test('reprovada também é final', () => {
  assert.equal(aplicar(naFila, ['enviar', 'clp_recebeu', 'clp_concluiu', 'reprovar']).estado, 'reprovada');
});

test('o CLP pode recusar a OP (dupla checagem) ou abortá-la', () => {
  assert.equal(aplicar(naFila, ['enviar', 'clp_recusou']).estado, 'recusada');
  assert.equal(aplicar(naFila, ['enviar', 'clp_recebeu', 'clp_abortou']).estado, 'abortada');
});

test('OP enviada pode ser retirada e volta à fila; aí pode ser cancelada', () => {
  assert.equal(aplicar(naFila, ['enviar', 'retirar', 'cancelar']).estado, 'cancelada');
});

test('cancelar só na fila: o que o CLP tem não se cancela', () => {
  for (const estado of ['enviada', 'em_producao', 'produzida'] as const) {
    assert.equal(transicionar({ estado }, 'cancelar').ok, false, `cancelar aceito em "${estado}"`);
  }
});

test('depois de recebida, a OP não volta à fila', () => {
  assert.equal(transicionar({ estado: 'em_producao' }, 'retirar').ok, false);
});

test('aprovar só depois de produzida', () => {
  for (const estado of ['na_fila', 'enviada', 'em_producao'] as const) {
    assert.equal(transicionar({ estado }, 'aprovar').ok, false, `aprovar aceito em "${estado}"`);
  }
});

test('queda de comunicação guarda o estado e nunca conclui a OP', () => {
  const caiu = aplicar(naFila, ['enviar', 'clp_recebeu', 'perder_comunicacao']);
  assert.deepEqual(caiu, { estado: 'comunicacao_perdida', antesDaQueda: 'em_producao' });
  for (const evento of TODOS_EVENTOS.filter((e) => e !== 'restabelecer_comunicacao')) {
    assert.equal(transicionar(caiu, evento).ok, false, `"${evento}" aceito com comunicação perdida`);
  }
});

test('ao voltar a comunicação, a OP retorna ao estado anterior', () => {
  for (const estado of ESTADOS_COM_CLP) {
    assert.equal(aplicar({ estado }, ['perder_comunicacao', 'restabelecer_comunicacao']).estado, estado);
  }
});

test('sem o CLP envolvido, não existe queda de comunicação', () => {
  for (const estado of ['na_fila', 'produzida'] as const) {
    assert.equal(transicionar({ estado }, 'perder_comunicacao').ok, false, `queda aceita em "${estado}"`);
  }
  assert.equal(transicionar({ estado: 'em_producao' }, 'restabelecer_comunicacao').ok, false);
});

test('estados finais não aceitam nenhum evento', () => {
  for (const estado of ESTADOS_FINAIS) {
    assert.deepEqual(eventosPossiveis({ estado }), []);
    for (const evento of TODOS_EVENTOS) assert.equal(transicionar({ estado }, evento).ok, false);
  }
});

test('eventosPossiveis bate com transicionar', () => {
  const estados: EstadoOp[] = ['na_fila', 'enviada', 'em_producao', 'produzida'];
  for (const estado of estados) {
    const situacao = { estado } as SituacaoOp;
    for (const evento of TODOS_EVENTOS) {
      assert.equal(
        transicionar(situacao, evento).ok,
        eventosPossiveis(situacao).includes(evento),
        `"${evento}" em "${estado}"`,
      );
    }
  }
});
