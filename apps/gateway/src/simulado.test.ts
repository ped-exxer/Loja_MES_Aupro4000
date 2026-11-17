import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALARME,
  AREA_ESCRITA,
  AREA_LEITURA,
  AREA_ASSINATURA,
  ESTADO_CLP,
  ETAPA,
  RECUSA,
  RESULTADO_OP,
  codificarEscrita,
  conferirAssinatura,
  decodificarLeitura,
  type ValoresEscrita,
} from '@aupro/contrato-clp';
import { estimarEtapas } from '@aupro/dominio';
import { ClpSimulado, alarmeSimulavel } from './simulado.ts';

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

test('recusa receita fora da faixa (dupla checagem), com o motivo em Resultado', () => {
  const clp = new ClpSimulado({ aleatorio: () => 0.5 });
  const vida = { v: 0 };
  rodar(clp, 100, vida, { ...pedido, SpTemperatura: 90 });
  let l = leitura(clp);
  assert.equal(l.EcoSeq, 1);
  assert.equal(l.Resultado, RECUSA.temperaturaForaDaFaixa);
  assert.equal(l.OpExecucao, 0);

  const casos: [Partial<ValoresEscrita>, number][] = [
    [{ SpVolume: 30 }, RECUSA.volumeForaDaFaixa],
    [{ SpVazao: 0.5 }, RECUSA.vazaoForaDaFaixa],
    [{ SpPressao: 5 }, RECUSA.pressaoForaDaFaixa],
    [{ SpVolume: 1, SpPressao: 5 }, RECUSA.foraDaFaixa], // mais de um campo: o genérico
  ];
  for (const [i, [fora, codigo]] of casos.entries()) {
    rodar(clp, 100, vida, { ...pedido, ...fora, SeqPedido: 2 + i });
    l = leitura(clp);
    assert.equal(l.EcoSeq, 2 + i);
    assert.equal(l.Resultado, codigo, JSON.stringify(fora));
  }
  // um pedido bom depois de recusas é aceito: Resultado volta a 0
  rodar(clp, 100, vida, { ...pedido, SeqPedido: 10 });
  assert.equal(leitura(clp).Resultado, RECUSA.aceito);
  assert.equal(leitura(clp).OpExecucao, 7);
});

test('falha "alarme": publica o intertravamento, fica em falha, para a batelada e não pega pedido novo', () => {
  const clp = new ClpSimulado({ escala: 100, aleatorio: () => 0.5 });
  const vida = { v: 0 };
  rodar(clp, 2000, vida, pedido); // já aquecendo
  const antes = leitura(clp);
  assert.equal(antes.Estado, ESTADO_CLP.emProducao);
  assert.equal(antes.Alarme, ALARME.nenhum);

  clp.falha = 'alarme'; // padrão: PSH-103
  const temperatura = clp.processo.temperatura;
  rodar(clp, 3000, vida, pedido);
  let l = leitura(clp);
  assert.equal(l.Alarme, ALARME.pressaoAltaTq01);
  assert.equal(l.Estado, ESTADO_CLP.emFalha);
  assert.equal(l.OpExecucao, 7, 'a batelada continua com o CLP');
  assert.equal(l.Etapa, antes.Etapa);
  assert.equal(clp.processo.temperatura, temperatura, 'o processo ficou parado');
  assert.ok(l.VidaClp !== antes.VidaClp, 'a vida do CLP continua andando');

  clp.falha = 'nenhuma';
  rodar(clp, 10_000, vida, pedido);
  l = leitura(clp);
  assert.equal(l.Alarme, ALARME.nenhum);
  assert.equal(l.OpConcluida, 7, 'a batelada terminou depois que o alarme passou');
  assert.equal(l.Estado, ESTADO_CLP.ocioso);

  // em falha e livre: o pedido novo espera (sem eco); é pego quando o alarme passa
  clp.falha = 'alarme';
  clp.alarme = ALARME.emergencia;
  const novo = { ...pedido, SeqPedido: 2, NumeroOp: 8 };
  rodar(clp, 500, vida, novo);
  assert.equal(leitura(clp).EcoSeq, 1);
  assert.equal(leitura(clp).Alarme, ALARME.emergencia);
  clp.falha = 'nenhuma';
  rodar(clp, 100, vida, novo);
  assert.equal(leitura(clp).EcoSeq, 2);
  assert.equal(leitura(clp).OpExecucao, 8);
});

test('só os alarmes da tabela servem para a falha "alarme"', () => {
  assert.ok(alarmeSimulavel(ALARME.falhaInversorB1));
  assert.ok(!alarmeSimulavel(ALARME.nenhum));
  assert.ok(!alarmeSimulavel(999));
  assert.ok(!alarmeSimulavel('2'));
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

/** Roda como `rodar`, guardando a sequência de etapas (sem repetições) e o maior TemperaturaTq02 visto. */
function rodarObservando(clp: ClpSimulado, ms: number, vidaMes: { v: number }, escrita: Partial<ValoresEscrita>) {
  const etapas: number[] = [];
  for (let t = 0; t < ms; t += 100) {
    rodar(clp, 100, vidaMes, escrita);
    const e = leitura(clp).Etapa;
    if (etapas.at(-1) !== e) etapas.push(e);
  }
  return etapas;
}

test('pedido de 15 L: duas rodadas do TQ-01 (aquecer → transferir duas vezes), pressuriza e devolve uma vez', () => {
  const clp = new ClpSimulado({ escala: 100, aleatorio: () => 0.5 });
  const receita = { volume: 15, temperatura: 45, vazao: 4, pressao: 2 };
  const vida = { v: 0 };
  const etapas = rodarObservando(clp, 20_000, vida, {
    ...pedido, SpVolume: receita.volume, SpTemperatura: receita.temperatura,
  });
  const E = ETAPA;
  assert.deepEqual(etapas, [E.pressurizar, E.aquecer, E.transferir, E.aquecer, E.transferir, E.aguardar, E.devolver, E.nenhuma]);
  const l = leitura(clp);
  assert.equal(l.OpConcluida, 7);
  assert.ok(Math.abs(l.VolumeProduzido - 15) <= 0.2);
  assert.ok(Math.abs(l.TemperaturaProduto - 45) <= 1, `produto a ${l.TemperaturaProduto}`);
  assert.equal(l.TempoResfriar, 0);
  // o tempo de aquecer segue a estimativa por rodadas (10 L e depois 5 L, ambas do reservatório a 25 °C)
  const estimado = estimarEtapas(receita, 25, 25).aquecerMs / 100;
  assert.ok(Math.abs(l.TempoAquecer - estimado) / estimado < 0.05, `aqueceu ${l.TempoAquecer} ms, estimado ${estimado}`);
});

test('reservatório mais quente que o pedido: resfria pelo trocador e o produto sai na temperatura pedida', () => {
  const clp = new ClpSimulado({ escala: 100, aleatorio: () => 0.5 });
  clp.temperaturaReservatorio = 60;
  const etapas = rodarObservando(clp, 30_000, { v: 0 }, pedido); // 10 L a 45 °C
  assert.ok(etapas.includes(ETAPA.resfriar), `etapas: ${etapas}`);
  assert.ok(!etapas.includes(ETAPA.aquecer), `etapas: ${etapas}`);
  const l = leitura(clp);
  assert.equal(l.OpConcluida, 7);
  assert.ok(Math.abs(l.TemperaturaProduto - 45) <= 1, `produto a ${l.TemperaturaProduto}`);
  assert.ok(l.TempoResfriar > 0);
  assert.equal(l.TempoAquecer, 0);
});

test('água já na temperatura: transfere direto, sem aquecer nem resfriar', () => {
  const clp = new ClpSimulado({ escala: 100, aleatorio: () => 0.5 });
  const vida = { v: 0 };
  rodar(clp, 100, vida, pedido); // pega o pedido (10 L a 45 °C) e começa a pressurizar
  assert.equal(leitura(clp).Etapa, ETAPA.pressurizar);
  clp.processo.temperatura = 45; // a água do TQ-01 já está a 45 °C
  const etapas = rodarObservando(clp, 10_000, vida, pedido);
  assert.deepEqual(etapas.slice(0, 2), [ETAPA.pressurizar, ETAPA.transferir]);
  const l = leitura(clp);
  assert.equal(l.OpConcluida, 7);
  assert.equal(l.TempoAquecer, 0);
  assert.equal(l.TempoResfriar, 0);
});

test('TemperaturaTq02 acompanha o envase e TemperaturaReservatorio sobe depois de devolver água quente', () => {
  const clp = new ClpSimulado({ escala: 100, aleatorio: () => 0.5 });
  const vida = { v: 0 };
  const quente = { ...pedido, SpTemperatura: 65, SpVolume: 15 };
  assert.equal(leitura(clp).TemperaturaReservatorio, 25);
  assert.equal(leitura(clp).TemperaturaTq02, 25);

  let maiorTq02 = 0;
  for (let t = 0; t < 15_000; t += 100) { // ciclo ~13,8 s
    rodar(clp, 100, vida, quente);
    maiorTq02 = Math.max(maiorTq02, leitura(clp).TemperaturaTq02);
  }
  const l = leitura(clp);
  assert.equal(l.OpConcluida, 7);
  // a 1ª rodada esfria um pouco no TQ-02 enquanto a 2ª aquece: o produto sai um pouco abaixo, dentro de ±2 °C
  assert.ok(l.TemperaturaProduto < 65 && 65 - l.TemperaturaProduto <= 2, `produto a ${l.TemperaturaProduto}`);
  assert.ok(maiorTq02 > 63 && maiorTq02 <= 65.01, `TQ-02 chegou a ${maiorTq02}`);
  assert.ok(l.TemperaturaReservatorio > 30, `reservatório a ${l.TemperaturaReservatorio}`);
  assert.ok(Math.abs(l.TemperaturaReservatorio - clp.temperaturaReservatorio) < 1e-3);
});
