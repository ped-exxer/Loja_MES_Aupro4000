import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inteiroPositivo, numero, objeto, pagina, texto } from './http.ts';

test('objeto: o que não é objeto vira {} (corpo vazio, null, lista, texto)', () => {
  assert.deepEqual(objeto(undefined), {});
  assert.deepEqual(objeto(null), {});
  assert.deepEqual(objeto([1, 2]), {});
  assert.deepEqual(objeto('texto'), {});
  assert.deepEqual(objeto(5), {});
  assert.deepEqual(objeto({ a: 1 }), { a: 1 });
});

test('pagina: limite entre 1 e o máximo, e o cursor "antes"', () => {
  assert.deepEqual(pagina(undefined, 100, 500), { limite: 100, antes: null });
  assert.deepEqual(pagina({ limite: '20', antes: '77' }, 100, 500), { limite: 20, antes: 77 });
  assert.deepEqual(pagina({ limite: '99999' }, 100, 500), { limite: 500, antes: null });
  assert.deepEqual(pagina({ limite: '0', antes: '-3' }, 100, 500), { limite: 100, antes: null });
  assert.deepEqual(pagina({ limite: 'abc', antes: '1.5' }, 100, 500), { limite: 100, antes: null });
  assert.deepEqual(pagina({ limite: ['1', '2'] }, 100, 500), { limite: 100, antes: null }); // ?limite=1&limite=2
});

test('numero, inteiroPositivo e texto não aceitam o tipo errado', () => {
  assert.equal(numero('5'), null);
  assert.equal(numero(Number.NaN), null);
  assert.equal(numero(Infinity), null);
  assert.equal(numero(5.5), 5.5);
  assert.equal(inteiroPositivo('12'), 12);
  assert.equal(inteiroPositivo(''), null);
  assert.equal(inteiroPositivo('1e3'), 1000);
  assert.equal(inteiroPositivo(-1), null);
  assert.equal(inteiroPositivo(null), null);
  assert.equal(inteiroPositivo({}), null);
  assert.equal(texto('  a  '), 'a');
  assert.equal(texto('   '), null);
  assert.equal(texto(5), null);
  assert.equal(texto('abcdef', 3), 'abc');
});
