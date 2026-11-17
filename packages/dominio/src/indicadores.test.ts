import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularOee, duracaoUniao, indicadoresEntrega } from './indicadores.ts';
import { estimarCicloMs, estimarEtapas } from './ciclo.ts';
import { avaliarQualidade } from './qualidade.ts';

const MIN = 60_000;

test('duracaoUniao corta na janela e não conta sobreposição duas vezes', () => {
  const janela = { inicio: 0, fim: 100 };
  assert.equal(duracaoUniao([{ inicio: 10, fim: 30 }, { inicio: 20, fim: 40 }, { inicio: 90, fim: 200 }], janela), 40);
  assert.equal(duracaoUniao([], janela), 0);
  assert.equal(duracaoUniao([{ inicio: -50, fim: -10 }], janela), 0);
});

test('OEE: disponibilidade × desempenho × qualidade', () => {
  const janela = { inicio: 0, fim: 100 * MIN };
  const paradas = [{ inicio: 0, fim: 20 * MIN }]; // 80 min operando
  const bateladas = [
    { cicloIdealMs: 20 * MIN, aprovada: true },
    { cicloIdealMs: 20 * MIN, aprovada: true },
    { cicloIdealMs: 20 * MIN, aprovada: false },
    { cicloIdealMs: 20 * MIN, aprovada: true },
  ];
  const r = calcularOee(janela, paradas, bateladas);
  assert.equal(r.disponibilidade, 0.8);
  assert.equal(r.desempenho, 1);
  assert.equal(r.qualidade, 0.75);
  assert.ok(Math.abs(r.oee! - 0.6) < 1e-9);
  assert.equal(r.produzidas, 4);
});

test('OEE: sem dados, os índices ficam nulos; desempenho limitado a 100 %', () => {
  const vazio = calcularOee({ inicio: 0, fim: 0 }, [], []);
  assert.equal(vazio.oee, null);
  const rapido = calcularOee({ inicio: 0, fim: MIN }, [], [{ cicloIdealMs: 10 * MIN, aprovada: null }]);
  assert.equal(rapido.desempenho, 1);
  assert.equal(rapido.qualidade, null);
});

test('indicadores de entrega: lead time e % no prazo', () => {
  const r = indicadoresEntrega([
    { criadaEm: 0, concluidaEm: 10, prazo: 20 },
    { criadaEm: 0, concluidaEm: 30, prazo: 20 },
  ]);
  assert.equal(r.leadTimeMedioMs, 20);
  assert.equal(r.noPrazo, 0.5);
  assert.deepEqual(indicadoresEntrega([]), { leadTimeMedioMs: null, noPrazo: null });
});

test('estimativa de ciclo: água mais quente aquece mais rápido', () => {
  const morna = { volume: 10, temperatura: 45, vazao: 4, pressao: 2 };
  const t = estimarEtapas(morna, 25);
  assert.equal(t.aquecerMs, 280_000);
  assert.equal(t.transferirMs, 150_000);
  assert.ok(estimarCicloMs(morna, 40) < estimarCicloMs(morna, 25));
  assert.equal(estimarEtapas(morna, 60).aquecerMs, 0);
});

test('qualidade: dentro e fora da tolerância', () => {
  const receita = { volume: 10, temperatura: 45, vazao: 4, pressao: 2 };
  const tol = { temperatura: 2, volume: 0.5 };
  assert.equal(avaliarQualidade(receita, tol, { volume: 10.5, temperatura: 47 }).dentro, true);
  const fora = avaliarQualidade(receita, tol, { volume: 9.4, temperatura: 45 });
  assert.equal(fora.dentro, false);
  assert.equal(fora.volumeOk, false);
  assert.equal(fora.temperaturaOk, true);
});
