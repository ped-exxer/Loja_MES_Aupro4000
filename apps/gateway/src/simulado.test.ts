import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AREA_ESCRITA,
  AREA_LEITURA,
  AREA_ASSINATURA,
  ETAPA,
  RESULTADO_OP,
  codificarEscrita,
  conferirAssinatura,
  decodificarLeitura,
  type ValoresEscrita,
} from '@loja/contrato-clp';
import { ClpSimulado, RECUSA_FORA_DA_FAIXA } from './simulado.ts';

const leitura = (clp: ClpSimulado) =>
  decodificarLeitura(clp.db.subarray(AREA_LEITURA.inicio, AREA_LEITURA.inicio + AREA_LEITURA.tamanho));

function gravar(clp: ClpSimulado, valores: Partial<ValoresEscrita>) {
  const base: ValoresEscrita = {
    VidaMes: 0, SeqPedido: 0, NumeroOp: 0, SpVolume: 0, SpTemperatura: 0, SpVazao: 0, SpPressao: 0,
  };
  clp.db.set(codificarEscrita({ ...base, ...valores }), AREA_ESCRITA.inicio);
}

/** Roda o simulador em ciclos de 100 ms, mudando VidaMes como o MES faz. */
function rodar(clp: ClpSimulado, ms: number, vidaMes: { v: number }, escrita: Partial<ValoresEscrita>) {
  for (let t = 0; t < ms; t += 100) {
    vidaMes.v = (vidaMes.v + 1) & 0xffff;
    gravar(clp, { ...escrita, VidaMes: vidaMes.v });
    clp.passo(100);
  }
}

const pedido = { SeqPedido: 1, NumeroOp: 7, SpVolume: 10, SpTemperatura: 45, SpVazao: 4, SpPressao: 2 };

test('o DB tem a assinatura e a vida do CLP anda', () => {
  const clp = new ClpSimulado({ aleatorio: () => 0.5 });
  assert.ok(conferirAssinatura(clp.db.subarray(AREA_ASSINATURA.inicio)));
  clp.passo(100);
  clp.passo(100);
  assert.equal(leitura(clp).VidaClp, 2);
});

test('pega o pedido, ecoa no mesmo ciclo e produz até publicar a OP concluída', () => {
  const clp = new ClpSimulado({ escala: 100, aleatorio: () => 0.5 });
  const vida = { v: 0 };
  rodar(clp, 100, vida, pedido);
  let l = leitura(clp);
  assert.equal(l.EcoSeq, 1);
  assert.equal(l.Resultado, 0);
  assert.equal(l.OpExecucao, 7);

  rodar(clp, 60_000, vida, pedido);
  l = leitura(clp);
  assert.equal(l.OpConcluida, 7);
  assert.equal(l.ResultadoOp, RESULTADO_OP.concluida);
  assert.equal(l.OpExecucao, 0);
  assert.ok(Math.abs(l.TemperaturaProduto - 45) <= 1);
  assert.ok(Math.abs(l.VolumeProduzido - 10) <= 0.2);
  assert.ok(l.TempoAquecer > 0 && l.TempoTransferir > 0 && l.TempoDevolver > 0);
});

test('o mesmo pedido não é pego duas vezes; o próximo só depois de terminar', () => {
  const clp = new ClpSimulado({ escala: 100, aleatorio: () => 0.5 });
  const vida = { v: 0 };
  rodar(clp, 100, vida, pedido);
  const segundo = { ...pedido, SeqPedido: 2, NumeroOp: 8 };
  rodar(clp, 1000, vida, segundo);
  assert.equal(leitura(clp).EcoSeq, 1, 'pegou o segundo antes de terminar o primeiro');
  rodar(clp, 7000, vida, segundo); // o ciclo leva ~7,4 s com escala 100
  const l = leitura(clp);
  assert.equal(l.OpConcluida, 7);
  assert.equal(l.EcoSeq, 2);
  assert.equal(l.OpExecucao, 8);
});

test('recusa receita fora da faixa (dupla checagem)', () => {
  const clp = new ClpSimulado({ aleatorio: () => 0.5 });
  rodar(clp, 100, { v: 0 }, { ...pedido, SpTemperatura: 90 });
  const l = leitura(clp);
  assert.equal(l.EcoSeq, 1);
  assert.equal(l.Resultado, RECUSA_FORA_DA_FAIXA);
  assert.equal(l.OpExecucao, 0);
});

test('NumeroOp = 0 não é pedido', () => {
  const clp = new ClpSimulado({ aleatorio: () => 0.5 });
  rodar(clp, 500, { v: 0 }, { ...pedido, NumeroOp: 0 });
  assert.equal(leitura(clp).EcoSeq, 0);
});

test('sem vida do MES, não pega pedido novo', () => {
  const clp = new ClpSimulado({ aleatorio: () => 0.5 });
  gravar(clp, { VidaMes: 5 });
  for (let i = 0; i < 60; i++) clp.passo(100); // 6 s sem VidaMes mudar
  gravar(clp, { ...pedido, VidaMes: 5 });
  clp.passo(100);
  assert.equal(leitura(clp).EcoSeq, 0);
});

test('falha "congelar" para a vida do CLP; "abortar" publica a OP abortada', () => {
  const clp = new ClpSimulado({ escala: 100, aleatorio: () => 0.5 });
  const vida = { v: 0 };
  rodar(clp, 100, vida, pedido);
  clp.falha = 'congelar';
  const antes = leitura(clp).VidaClp;
  rodar(clp, 1000, vida, pedido);
  assert.equal(leitura(clp).VidaClp, antes);

  clp.falha = 'abortar';
  rodar(clp, 100, vida, pedido);
  const l = leitura(clp);
  assert.equal(l.OpConcluida, 7);
  assert.equal(l.ResultadoOp, RESULTADO_OP.abortada);
  assert.equal(l.Etapa, ETAPA.nenhuma);
});

test('a água quente devolvida aquece o reservatório', () => {
  const clp = new ClpSimulado({ escala: 100, aleatorio: () => 0.5 });
  rodar(clp, 15_000, { v: 0 }, { ...pedido, SpTemperatura: 65, SpVolume: 15 }); // ciclo ~13,8 s
  assert.equal(leitura(clp).OpConcluida, 7);
  assert.ok(clp.temperaturaReservatorio > 30, `reservatório a ${clp.temperaturaReservatorio}`);
});

test('reservatório quente demais: o produto sai mais quente que o pedido', () => {
  const clp = new ClpSimulado({ escala: 100, aleatorio: () => 0.5 });
  clp.temperaturaReservatorio = 60;
  const vida = { v: 0 };
  rodar(clp, 60_000, vida, pedido);
  assert.ok(leitura(clp).TemperaturaProduto >= 59);
});
