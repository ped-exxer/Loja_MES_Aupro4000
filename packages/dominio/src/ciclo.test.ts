import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PARAMETROS_CICLO, dividirEmRodadas, estimarCicloMs, estimarEtapas } from './ciclo.ts';

const P = PARAMETROS_CICLO;

test('rodadas: o TQ-01 (10 L) cheio até o que falta', () => {
  assert.deepEqual(dividirEmRodadas(2), [2]);
  assert.deepEqual(dividirEmRodadas(10), [10]);
  assert.deepEqual(dividirEmRodadas(15), [10, 5]);
  assert.deepEqual(dividirEmRodadas(20), [10, 10]);
  assert.deepEqual(dividirEmRodadas(0), []);
});

test('até 10 L: uma rodada só', () => {
  const r = { volume: 8, temperatura: 55, vazao: 2, pressao: 2 };
  const t = estimarEtapas(r, 25);
  assert.equal(t.rodadas, 1);
  assert.equal(t.pressurizarMs, P.pressurizarS * 1000);
  assert.equal(t.aquecerMs, 30 * P.aquecerSPorGrauLitro * 8 * 1000);
  assert.equal(t.resfriarMs, 0);
  assert.equal(t.transferirMs, 4 * 60_000);
  assert.equal(t.devolverMs, P.devolverS * 1000);
  assert.equal(estimarCicloMs(r, 25), t.pressurizarMs + t.aquecerMs + t.transferirMs + t.devolverMs);
});

test('15 L: duas rodadas (10 + 5), pressuriza e devolve uma vez; a 2ª parte da água do reservatório', () => {
  const r = { volume: 15, temperatura: 65, vazao: 4, pressao: 2 };
  const t = estimarEtapas(r, 45, 25);
  assert.equal(t.rodadas, 2);
  // 1ª: 10 L de 45 a 65 °C; 2ª: 5 L do reservatório, de 25 a 65 °C
  assert.ok(Math.abs(t.aquecerMs - (20 * 10 + 40 * 5) * P.aquecerSPorGrauLitro * 1000) < 1e-6);
  assert.equal(t.transferirMs, (15 / 4) * 60_000);
  assert.equal(t.pressurizarMs, P.pressurizarS * 1000);
  assert.equal(t.devolverMs, P.devolverS * 1000);
  // sem informar o reservatório, ele é tomado igual à partida
  assert.equal(estimarEtapas(r, 25).aquecerMs, estimarEtapas(r, 25, 25).aquecerMs);
});

test('água de partida acima do pedido: resfria pelo trocador, sem aquecer', () => {
  const r = { volume: 10, temperatura: 45, vazao: 4, pressao: 2 };
  const t = estimarEtapas(r, 55);
  assert.equal(t.aquecerMs, 0);
  assert.equal(t.resfriarMs, 10 * P.resfriarSPorGrauLitro * 10 * 1000);
  assert.ok(estimarCicloMs(r, 55) > estimarCicloMs(r, 45));
});

test('rodadas mistas: 1ª resfria, 2ª aquece a partir do reservatório', () => {
  const r = { volume: 20, temperatura: 50, vazao: 4, pressao: 2 };
  const t = estimarEtapas(r, 60, 30);
  assert.equal(t.resfriarMs, 10 * P.resfriarSPorGrauLitro * 10 * 1000);
  assert.ok(Math.abs(t.aquecerMs - 20 * P.aquecerSPorGrauLitro * 10 * 1000) < 1e-6);
});

test('água já na temperatura: zero de aquecer e de resfriar', () => {
  const r = { volume: 15, temperatura: 45, vazao: 3, pressao: 2 };
  const t = estimarEtapas(r, 45, 45);
  assert.equal(t.aquecerMs, 0);
  assert.equal(t.resfriarMs, 0);
  assert.equal(estimarCicloMs(r, 45), t.pressurizarMs + t.transferirMs + t.devolverMs);
});
