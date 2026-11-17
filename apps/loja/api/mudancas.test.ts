import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cursorValido, itemDaOrigem } from './mudancas.ts';

test('itemDaOrigem reconhece só as OPs emitidas pela Loja', () => {
  assert.equal(itemDaOrigem('loja:item:42'), 42);
  assert.equal(itemDaOrigem('manual'), null);
  assert.equal(itemDaOrigem(null), null);
  assert.equal(itemDaOrigem('loja:item:'), null);
  assert.equal(itemDaOrigem('loja:item:abc'), null);
});

test('cursorValido recomeça do zero se a base do MES foi recriada', () => {
  assert.equal(cursorValido(10, 25), 10);
  assert.equal(cursorValido(10, 10), 10);
  assert.equal(cursorValido(10, null), 10); // MES reiniciado: a numeração continua, o cursor vale
  assert.equal(cursorValido(10, 3), 0); // base nova: ids recomeçaram
});
