import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decidirEmissao } from './integracao.ts';

test('primeira emissão de uma origem cria a OP', () => {
  assert.equal(decidirEmissao(null), 'criar');
  assert.equal(decidirEmissao(null, 7), 'criar');
});

test('repetir a emissão devolve a OP que já existe, em qualquer estado', () => {
  assert.equal(decidirEmissao({ numero: 7, final: false }), 'devolver');
  assert.equal(decidirEmissao({ numero: 7, final: true }), 'devolver'); // já terminou: não se produz de novo sem pedir
});

test('produzir de novo só cria quando a OP anterior está num estado final', () => {
  assert.equal(decidirEmissao({ numero: 7, final: true }, 7), 'criar');
  assert.equal(decidirEmissao({ numero: 7, final: false }, 7), 'ativa');
});

test('repetir o "produzir de novo" devolve a OP nova (a substituição já foi feita)', () => {
  assert.equal(decidirEmissao({ numero: 9, final: false }, 7), 'devolver');
  assert.equal(decidirEmissao({ numero: 9, final: true }, 7), 'devolver');
});
