import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aoLerEco,
  apertoAoConectar,
  disponibilizar,
  escritaConfirmada,
  escritaFalhou,
  pedidoDisponivel,
  type EstadoAperto,
} from './aperto.ts';
import { NENHUM_PEDIDO } from './layout.ts';

/** Disponibiliza e confirma a gravação, como o gateway faz. */
function gravar(estado: EstadoAperto, numeroOp: number) {
  const r = disponibilizar(estado, numeroOp);
  return { estado: escritaConfirmada(r.estado, r.seqPedido), seq: r.seqPedido };
}

const inicio = apertoAoConectar(10, NENHUM_PEDIDO, 10);

test('ao conectar: nada pendente quando SeqPedido = EcoSeq', () => {
  assert.deepEqual(inicio, { ultimoSeq: 10, semEco: [] });
  assert.equal(pedidoDisponivel(inicio), NENHUM_PEDIDO);
});

test('ao conectar: SeqPedido ≠ EcoSeq é um pedido ainda esperando o CLP', () => {
  const e = apertoAoConectar(11, 7, 10);
  assert.equal(pedidoDisponivel(e), 7);
  assert.deepEqual(aoLerEco(e, 11, 0).eventos, [{ tipo: 'recebida', numeroOp: 7 }]);
});

test('caminho normal: disponibiliza, o CLP ecoa, a OP foi recebida', () => {
  const a = gravar(inicio, 1);
  assert.equal(a.seq, 11);
  assert.equal(pedidoDisponivel(a.estado), 1);

  const semEco = aoLerEco(a.estado, 10, 0); // CLP ainda produzindo a anterior
  assert.deepEqual(semEco.eventos, []);
  assert.equal(pedidoDisponivel(semEco.estado), 1);

  const comEco = aoLerEco(semEco.estado, 11, 0);
  assert.deepEqual(comEco.eventos, [{ tipo: 'recebida', numeroOp: 1 }]);
  assert.equal(pedidoDisponivel(comEco.estado), NENHUM_PEDIDO);
});

test('recusa do CLP vem com o motivo', () => {
  const a = gravar(inicio, 1);
  assert.deepEqual(aoLerEco(a.estado, a.seq, 3).eventos, [{ tipo: 'recusada', numeroOp: 1, resultado: 3 }]);
});

test('troca antes do eco: gravada a nova, a antiga volta à fila na leitura seguinte', () => {
  const a = gravar(inicio, 1);
  const b = gravar(a.estado, 2);
  const r = aoLerEco(b.estado, 10, 0);
  assert.deepEqual(r.eventos, [{ tipo: 'retirada', numeroOp: 1 }]);
  assert.equal(pedidoDisponivel(r.estado), 2);
  assert.deepEqual(aoLerEco(r.estado, b.seq, 0).eventos, [{ tipo: 'recebida', numeroOp: 2 }]);
});

test('troca que perdeu a corrida: o CLP já tinha pegado a antiga, a nova continua disponível', () => {
  const a = gravar(inicio, 1);
  const b = gravar(a.estado, 2);
  const r = aoLerEco(b.estado, a.seq, 0);
  assert.deepEqual(r.eventos, [{ tipo: 'recebida', numeroOp: 1 }]);
  assert.equal(pedidoDisponivel(r.estado), 2);
});

test('troca ainda não confirmada: a antiga continua pendente', () => {
  const a = gravar(inicio, 1);
  const b = disponibilizar(a.estado, 2); // gravação de 2 ainda não confirmada
  const r = aoLerEco(b.estado, 10, 0);
  assert.deepEqual(r.eventos, []);
  assert.equal(r.estado.semEco.length, 2);
});

test('retirar sem substituto: grava NENHUM_PEDIDO', () => {
  const a = gravar(inicio, 1);
  const vazio = gravar(a.estado, NENHUM_PEDIDO);
  const r = aoLerEco(vazio.estado, 10, 0);
  assert.deepEqual(r.eventos, [{ tipo: 'retirada', numeroOp: 1 }]);
  assert.equal(pedidoDisponivel(r.estado), NENHUM_PEDIDO);
  // se o CLP ecoar o "nenhum pedido", não há evento
  assert.deepEqual(aoLerEco(r.estado, vazio.seq, 0).eventos, []);
});

test('gravação que falhou: a OP volta à fila', () => {
  const r = disponibilizar(inicio, 1);
  const f = escritaFalhou(r.estado, r.seqPedido);
  assert.deepEqual(f.eventos, [{ tipo: 'retirada', numeroOp: 1 }]);
  assert.equal(pedidoDisponivel(f.estado), NENHUM_PEDIDO);
});

test('eco desconhecido não muda nada', () => {
  const a = gravar(inicio, 1);
  assert.deepEqual(aoLerEco(a.estado, 999, 0), { estado: a.estado, eventos: [] });
});

test('SeqPedido volta a 0 depois de 65535', () => {
  const r = disponibilizar(apertoAoConectar(65535, NENHUM_PEDIDO, 65535), 1);
  assert.equal(r.seqPedido, 0);
});
