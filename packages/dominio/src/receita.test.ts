import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FAIXAS, validarReceita, validarTolerancias, type Receita } from './receita.ts';

const morna: Receita = { volume: 10, temperatura: 45, vazao: 4, pressao: 2 };

test('receita dentro das faixas passa', () => {
  assert.deepEqual(validarReceita(morna), []);
});

test('os limites das faixas são aceitos', () => {
  const minimos: Receita = { volume: 2, temperatura: 40, vazao: 1, pressao: 1.5 };
  const maximos: Receita = { volume: 20, temperatura: 65, vazao: 6, pressao: 3 };
  assert.deepEqual(validarReceita(minimos), []);
  assert.deepEqual(validarReceita(maximos), []);
});

test('fora da faixa devolve o campo e a faixa', () => {
  const erros = validarReceita({ ...morna, temperatura: 70, volume: 1.9 });
  assert.deepEqual(erros, [
    { campo: 'volume', codigo: 'fora_da_faixa', faixa: FAIXAS.volume },
    { campo: 'temperatura', codigo: 'fora_da_faixa', faixa: FAIXAS.temperatura },
  ]);
});

test('valor que não é número finito é inválido', () => {
  const erros = validarReceita({ ...morna, vazao: Number.NaN, pressao: Infinity });
  assert.deepEqual(erros, [
    { campo: 'vazao', codigo: 'invalido' },
    { campo: 'pressao', codigo: 'invalido' },
  ]);
});

test('tolerâncias precisam ser positivas', () => {
  assert.deepEqual(validarTolerancias({ temperatura: 2, volume: 0.5 }), []);
  assert.deepEqual(validarTolerancias({ temperatura: 0, volume: -1 }), [
    { campo: 'tolerancia.temperatura', codigo: 'tolerancia_invalida' },
    { campo: 'tolerancia.volume', codigo: 'tolerancia_invalida' },
  ]);
});
