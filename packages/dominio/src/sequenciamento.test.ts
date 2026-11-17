import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sequenciarFila, type ItemFila } from './sequenciamento.ts';

const MIN = 60_000;
const H = 60 * MIN;
const agora = 1_000 * H;

type Item = ItemFila & { id: string };
const item = (id: string, temperatura: number, volume: number, extra: Partial<ItemFila> = {}): Item => ({
  id,
  temperatura,
  volume,
  prazo: agora + 8 * H,
  chegada: agora,
  duracaoMs: 15 * MIN,
  ...extra,
});
const ids = (fila: Item[]) => fila.map((i) => i.id);

test('temperatura crescente, desempate por volume e chegada', () => {
  const fila = [
    item('quente', 65, 15),
    item('morna-grande', 45, 15),
    item('media', 55, 8),
    item('morna-pequena', 45, 10),
    item('morna-pequena-depois', 45, 10, { chegada: agora + 1 }),
  ];
  assert.deepEqual(ids(sequenciarFila(fila, { agora })), [
    'morna-pequena', 'morna-pequena-depois', 'morna-grande', 'media', 'quente',
  ]);
});

test('aproveita a temperatura atual: as mais frias vão para o fim', () => {
  const fila = [item('45', 45, 10), item('65', 65, 10), item('55', 55, 10), item('50', 50, 10)];
  assert.deepEqual(ids(sequenciarFila(fila, { agora, temperaturaAtual: 52 })), ['55', '65', '45', '50']);
  // mesma temperatura da atual conta como "acima"
  assert.deepEqual(ids(sequenciarFila(fila, { agora, temperaturaAtual: 55 })), ['55', '65', '45', '50']);
});

test('prazo folgado não mexe na ordem por temperatura, mesmo perto', () => {
  // as duas cabem no prazo na ordem por temperatura: o prazo próximo da quente não a passa na frente
  const fila = [item('quente', 65, 10, { prazo: agora + 40 * MIN }), item('fria', 40, 10, { prazo: agora + 40 * MIN })];
  assert.deepEqual(ids(sequenciarFila(fila, { agora })), ['fria', 'quente']);
});

test('passa na frente quem perderia o prazo na ordem por temperatura', () => {
  const fila = [
    item('fria', 40, 5),
    item('media', 50, 5),
    item('quente-apertada', 65, 15, { prazo: agora + 25 * MIN }), // seria a 3ª: terminaria em 45 min
  ];
  assert.deepEqual(ids(sequenciarFila(fila, { agora })), ['quente-apertada', 'fria', 'media']);
});

test('várias em risco: a mais apertada primeiro', () => {
  const fila = [
    item('fria', 40, 5),
    item('b', 60, 5, { prazo: agora + 30 * MIN }),
    item('a', 65, 5, { prazo: agora + 20 * MIN }),
    item('atrasada', 50, 5, { prazo: agora - H }),
  ];
  assert.deepEqual(ids(sequenciarFila(fila, { agora })), ['atrasada', 'a', 'b', 'fria']);
});

test('a margem de prazo é configurável', () => {
  const fila = [item('fria', 40, 5), item('quente', 65, 5, { prazo: agora + 40 * MIN })]; // terminaria em 30 min
  assert.deepEqual(ids(sequenciarFila(fila, { agora })), ['fria', 'quente']);
  assert.deepEqual(ids(sequenciarFila(fila, { agora, margemPrazoMs: 15 * MIN })), ['quente', 'fria']);
});

test('o tempo das fixadas conta para o risco das outras', () => {
  const fila = [item('pcp', 40, 5, { fixada: 1, duracaoMs: 30 * MIN }), item('fria', 41, 5), item('quente', 65, 5, { prazo: agora + 50 * MIN })];
  // sem a fixada, a quente terminaria em 30 min (ok); com os 30 min da fixada, em 60 min (perde)
  assert.deepEqual(ids(sequenciarFila(fila, { agora })), ['pcp', 'quente', 'fria']);
});

test('o que o PCP fixou vem antes de tudo, na ordem dada', () => {
  const fila = [
    item('urgente', 40, 5, { prazo: agora }),
    item('pcp-2', 65, 15, { fixada: 2 }),
    item('pcp-1', 60, 15, { fixada: 1 }),
    item('livre', 45, 10),
  ];
  assert.deepEqual(ids(sequenciarFila(fila, { agora })), ['pcp-1', 'pcp-2', 'urgente', 'livre']);
});

test('não altera a fila original e aceita fila vazia', () => {
  const fila = [item('b', 60, 5), item('a', 40, 5)];
  sequenciarFila(fila, { agora });
  assert.deepEqual(ids(fila), ['b', 'a']);
  assert.deepEqual(sequenciarFila([], { agora }), []);
});
