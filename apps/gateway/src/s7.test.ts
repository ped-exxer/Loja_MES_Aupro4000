// Prova do driver S7 (nodes7) e do serviço do gateway SEM CPU, contra o servidor S7 de teste (teste/servidor-s7.ts).
// O servidor é uma imitação do protocolo: estes testes não substituem a prova numa CPU real (ROTEIRO, fase 4).

import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import {
  AREA_ASSINATURA,
  AREA_ESCRITA,
  AREA_LEITURA,
  TAMANHO_DB,
  codificarAssinatura,
  codificarEscrita,
  codificarLeitura,
  decodificarEscrita,
  type ValoresEscrita,
  type ValoresLeitura,
} from '@aupro/contrato-clp';
import type { ConfiguracaoDriver } from './driver.ts';
import { DriverS7, MAIOR_DB_PROCURADO, MB_SIMULADOR } from './s7.ts';
import { ErroGateway, Servico } from './servico.ts';
import { ServidorS7Teste } from './teste/servidor-s7.ts';

const DB_MES = 7;
const DB_PROCESSO = 12;
/** Tempos curtos: os testes não esperam os segundos que a bancada espera. */
const OPCOES = { esperaReconexaoMs: 0, s7: { tempoLimiteMs: 400 } };

const ESCRITA: ValoresEscrita = {
  VidaMes: 11, SeqPedido: 3, NumeroOp: 1234, SpVolume: 10, SpTemperatura: 45.5, SpVazao: 4, SpPressao: 2.5,
};
const LEITURA: ValoresLeitura = {
  VidaClp: 65535, EcoSeq: 2, Resultado: 0, Estado: 1, Etapa: 2, OpExecucao: 1233, Alarme: 2, OpConcluida: 1232,
  ResultadoOp: 1, VolumeProduzido: 9.75, TemperaturaProduto: 44.5, TempoPressurizar: 60_000, TempoAquecer: 300_000,
  TempoTransferir: 150_000, TempoDevolver: 240_000, TempoResfriar: 0, TemperaturaTq02: 30.25, TemperaturaReservatorio: 27.5,
};

/** Um DB `MES` como o programa do CLP o teria: área do MES, área do CLP e a assinatura. */
function dbMes(): Uint8Array {
  const db = new Uint8Array(TAMANHO_DB);
  db.set(codificarEscrita(ESCRITA), AREA_ESCRITA.inicio);
  db.set(codificarLeitura(LEITURA), AREA_LEITURA.inicio);
  db.set(codificarAssinatura(), AREA_ASSINATURA.inicio);
  return db;
}

/** Um DB `MB_Simulador`: 40001..40008 em Real (nível %, vazão m³/h, pressão bar, temperatura °C) e a assinatura. */
function dbMbSimulador(processo = { nivelPct: 40, vazaoM3h: 0.24, pressao: 2.5, temperatura: 51.5 }): Uint8Array {
  const a = MB_SIMULADOR.assinatura;
  const db = new Uint8Array(a.byte + a.tamanho);
  const d = new DataView(db.buffer);
  d.setFloat32(0, processo.nivelPct, false);
  d.setFloat32(4, processo.vazaoM3h, false);
  d.setFloat32(8, processo.pressao, false);
  d.setFloat32(12, processo.temperatura, false);
  d.setUint16(a.byte, a.palavra, false);
  d.setFloat32(a.byte + 2, a.valor, false);
  return db;
}

/** Sobe a "CPU" numa porta livre; o teste a derruba no fim, com ou sem falha. */
async function cpu(t: TestContext): Promise<ServidorS7Teste> {
  const servidor = new ServidorS7Teste();
  await servidor.iniciar();
  t.after(() => servidor.parar());
  return servidor;
}

const configuracao = (servidor: ServidorS7Teste, mais: Partial<ConfiguracaoDriver> = {}): ConfiguracaoDriver => ({
  driver: 's7', ip: '127.0.0.1', porta: servidor.porta, rack: 0, slot: 1, numeroDb: DB_MES, numeroDbProcesso: null,
  escalaSimulador: 1, ...mais,
});

/** Serviço do gateway ligado à "CPU"; fecha a conexão no fim do teste. */
function servicoDe(t: TestContext, servidor: ServidorS7Teste, mais: Partial<ConfiguracaoDriver> = {}): Servico {
  const servico = new Servico(configuracao(servidor, mais), OPCOES);
  t.after(() => servico.encerrar());
  return servico;
}

const erroGateway = (codigo: string, mensagem?: RegExp) => (erro: unknown) => {
  assert.ok(erro instanceof ErroGateway, `esperava ErroGateway, veio ${String(erro)}`);
  assert.equal(erro.codigo, codigo);
  if (mensagem) assert.match(erro.message, mensagem);
  return true;
};

test('conecta (rack 0, slot 1), lê o DB MES inteiro num pedido e decodifica', async (t) => {
  const servidor = await cpu(t);
  servidor.dbs.set(DB_MES, dbMes());
  const servico = servicoDe(t, servidor);

  const r = await servico.ler();
  assert.deepEqual(r.escrita, ESCRITA);
  assert.deepEqual(r.leitura, LEITURA);
  assert.equal(r.processo, null);
  assert.equal(servidor.visto.rackSlot, 0 * 32 + 1);
  assert.equal(servidor.visto.conexoes, 1);
  assert.equal(servidor.visto.leituras, 1, 'o DB inteiro cabe num pedido só');
  assert.deepEqual(servico.situacao(), { ...servico.situacao(), conectado: true, assinaturaOk: true, erro: null });

  // a segunda leitura reaproveita a conexão e vê o que o CLP mudou
  servidor.dbs.get(DB_MES)!.set(codificarLeitura({ ...LEITURA, VidaClp: 0, EcoSeq: 3 }), AREA_LEITURA.inicio);
  const r2 = await servico.ler();
  assert.equal(r2.leitura.VidaClp, 0);
  assert.equal(r2.leitura.EcoSeq, 3);
  assert.equal(servidor.visto.conexoes, 1);
});

test('grava a área de escrita num pedido só, sem tocar no resto do DB, e lê de volta', async (t) => {
  const servidor = await cpu(t);
  servidor.dbs.set(DB_MES, dbMes());
  const servico = servicoDe(t, servidor);
  await servico.ler(); // confere a assinatura antes de escrever

  const nova: ValoresEscrita = {
    VidaMes: 65535, SeqPedido: 4, NumeroOp: 2_000_000_000, SpVolume: 15, SpTemperatura: 65, SpVazao: 1.5, SpPressao: 3,
  };
  const antes = servidor.dbs.get(DB_MES)!.slice();
  await servico.gravar(nova);
  const depois = servidor.dbs.get(DB_MES)!;
  assert.equal(servidor.visto.escritas, 1);
  assert.deepEqual(decodificarEscrita(depois.subarray(AREA_ESCRITA.inicio, AREA_ESCRITA.tamanho)), nova);
  assert.deepEqual(depois.subarray(AREA_ESCRITA.tamanho), antes.subarray(AREA_ESCRITA.tamanho), 'só os bytes 0–23 mudam');

  const r = await servico.ler();
  assert.deepEqual(r.escrita, nova);
  assert.deepEqual(r.leitura, LEITURA);
});

test('lê as variáveis de processo do MB_Simulador junto com o DB MES', async (t) => {
  const servidor = await cpu(t);
  servidor.dbs.set(DB_MES, dbMes());
  servidor.dbs.set(DB_PROCESSO, dbMbSimulador());
  const servico = servicoDe(t, servidor, { numeroDbProcesso: DB_PROCESSO });

  const { processo, leitura } = await servico.ler();
  assert.deepEqual(leitura, LEITURA);
  assert.ok(processo);
  assert.equal(processo.nivel, 10); // 40 % de 25 L
  assert.ok(Math.abs(processo.vazao - 4) < 1e-5, `vazão ${processo.vazao}`); // 0,24 m³/h = 4 L/min
  assert.equal(processo.pressao, 2.5);
  assert.equal(processo.temperatura, 51.5);
  assert.equal(servidor.visto.leituras, 1, 'os dois DBs vão no mesmo pedido');

  // MB_Simulador que sumiu (DB apagado): o DB MES continua valendo, só as variáveis de processo faltam
  servidor.dbs.delete(DB_PROCESSO);
  const semProcesso = await servico.ler();
  assert.equal(semProcesso.processo, null);
  assert.deepEqual(semProcesso.leitura, LEITURA);
});

test('procura os DBs pela assinatura no meio de vários DBs, em poucos pedidos', async (t) => {
  const servidor = await cpu(t);
  servidor.dbs.set(1, new Uint8Array(40)); // menor que o DB MES
  servidor.dbs.set(2, new Uint8Array(400)); // grande, sem assinatura nenhuma
  servidor.dbs.set(3, dbMes().fill(0, AREA_ASSINATURA.inicio)); // do tamanho do DB MES, sem a assinatura
  servidor.dbs.set(DB_MES, dbMes());
  servidor.dbs.set(DB_PROCESSO, dbMbSimulador());
  servidor.dbs.set(30, dbMes()); // um segundo DB MES: vale o de menor número
  const servico = servicoDe(t, servidor);

  assert.deepEqual(await servico.procurar(configuracao(servidor)), { mes: DB_MES, processo: DB_PROCESSO });
  assert.equal(servidor.visto.itensLidos, 40, 'achou os dois no primeiro lote de 20 DBs e parou');
  assert.ok(servidor.visto.maiorPedido <= servidor.pdu, `pedido de ${servidor.visto.maiorPedido} bytes num PDU de ${servidor.pdu}`);
  assert.ok(servidor.visto.maiorResposta <= servidor.pdu, `resposta de ${servidor.visto.maiorResposta} bytes num PDU de ${servidor.pdu}`);

  // só o DB MES (bancada sem o MB_Simulador): varre até o fim e diz que o de processo não existe
  servidor.dbs.delete(DB_PROCESSO);
  const antes = { ...servidor.visto };
  const inicio = Date.now();
  assert.deepEqual(await servico.procurar(configuracao(servidor)), { mes: DB_MES, processo: null });
  assert.equal(servidor.visto.itensLidos - antes.itensLidos, MAIOR_DB_PROCURADO * 2, 'conferiu todos os DBs');
  assert.ok(servidor.visto.leituras - antes.leituras <= 80, `${servidor.visto.leituras - antes.leituras} pedidos para varrer 500 DBs`);
  assert.ok(Date.now() - inicio < 5000, `a busca levou ${Date.now() - inicio} ms`);
  assert.ok(servidor.visto.maiorPedido <= servidor.pdu && servidor.visto.maiorResposta <= servidor.pdu);

  // nenhum dos dois
  servidor.dbs.delete(DB_MES);
  servidor.dbs.delete(30);
  assert.deepEqual(await servico.procurar(configuracao(servidor)), { mes: null, processo: null });

  // a busca usa uma conexão própria e a fecha
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(servidor.visto.conexoes, 3);
  assert.equal(servidor.abertas, 0, 'a busca deixou conexão aberta na CPU');
});

test('DB sem a assinatura: erro claro, e o gateway não escreve nele', async (t) => {
  const servidor = await cpu(t);
  servidor.dbs.set(DB_MES, new Uint8Array(TAMANHO_DB)); // um DB qualquer, do tamanho certo
  const servico = servicoDe(t, servidor);

  await assert.rejects(servico.ler(), erroGateway('assinatura_invalida', /DB 7 não tem a assinatura/));
  await assert.rejects(servico.gravar(ESCRITA), erroGateway('assinatura_invalida'));
  assert.equal(servidor.visto.escritas, 0);
  assert.ok(servidor.dbs.get(DB_MES)!.every((b) => b === 0), 'nada foi escrito no DB errado');
  assert.equal(servico.situacao().assinaturaOk, false);

  // o DB certo aparece (programa carregado na CPU): volta a valer sem reconfigurar
  servidor.dbs.set(DB_MES, dbMes());
  assert.deepEqual((await servico.ler()).leitura, LEITURA);
  await servico.gravar(ESCRITA);
  assert.equal(servidor.visto.escritas, 1);
});

test('DB que não existe ou é pequeno demais: erro que diz o que há de errado', async (t) => {
  const servidor = await cpu(t);
  const servico = servicoDe(t, servidor);
  await assert.rejects(servico.ler(), erroGateway('sem_conexao', /DB 7.*não existe ou tem menos de 102 bytes/));

  servidor.dbs.set(DB_MES, new Uint8Array(50));
  await assert.rejects(servico.ler(), erroGateway('sem_conexao', /DB 7.*não existe ou tem menos de 102 bytes/));
  assert.match(servico.situacao().erro ?? '', /DB 7/);
});

test('CPU fora do ar: erro; quando ela volta, o gateway reconecta sozinho', async (t) => {
  const servidor = await cpu(t);
  servidor.dbs.set(DB_MES, dbMes());
  const porta = servidor.porta;
  const servico = servicoDe(t, servidor);

  // 1. nem conecta
  await servidor.parar();
  await assert.rejects(servico.ler(), erroGateway('sem_conexao', /não conectou em 127\.0\.0\.1/));
  assert.equal(servico.situacao().conectado, false);

  // 2. a CPU aparece: a leitura seguinte conecta
  await servidor.iniciar(porta);
  assert.deepEqual((await servico.ler()).leitura, LEITURA);
  assert.equal(servico.situacao().conectado, true);

  // 3. a CPU cai com a conexão aberta: a leitura e a escrita falham, sem pendurar
  await servidor.parar();
  await assert.rejects(servico.ler(), erroGateway('sem_conexao'));
  await assert.rejects(servico.gravar(ESCRITA), erroGateway('sem_conexao'));
  assert.equal(servico.situacao().conectado, false);

  // 4. volta: reconecta, lê e escreve de novo
  await servidor.iniciar(porta);
  assert.deepEqual((await servico.ler()).escrita, ESCRITA);
  await servico.gravar({ ...ESCRITA, VidaMes: 12 });
  assert.equal((await servico.ler()).escrita.VidaMes, 12);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(servidor.abertas, 1, 'conexão pendurada na CPU');
});

test('a CPU derruba a conexão no meio (cabo, STOP/RUN): a leitura seguinte falha e a outra reconecta', async (t) => {
  const servidor = await cpu(t);
  servidor.dbs.set(DB_MES, dbMes());
  const servico = servicoDe(t, servidor);
  await servico.ler();

  servidor.derrubarConexoes();
  await assert.rejects(servico.ler(), erroGateway('sem_conexao'));
  assert.deepEqual((await servico.ler()).leitura, LEITURA);
  // o nodes7 tenta reconectar sozinho quando a leitura falha; o driver fecha essa conexão e abre a dele:
  // no fim, a CPU fica com uma conexão só (ela tem poucas)
  await new Promise((r) => setTimeout(r, 100));
  assert.ok(servidor.visto.conexoes >= 2);
  assert.equal(servidor.abertas, 1, 'conexão pendurada na CPU');
});

test('equipamento que aceita o TCP mas não fala S7: a conexão desiste no tempo-limite, sem pendurar', async (t) => {
  const servidor = await cpu(t);
  servidor.modo = 'mudo';
  const servico = servicoDe(t, servidor);

  const inicio = Date.now();
  await assert.rejects(servico.ler(), erroGateway('sem_conexao', /não respondeu como uma CPU S7|não conectou/));
  assert.ok(Date.now() - inicio < 3000, `levou ${Date.now() - inicio} ms`);

  // vira uma CPU de verdade: conecta
  servidor.modo = 'normal';
  servidor.dbs.set(DB_MES, dbMes());
  assert.deepEqual((await servico.ler()).leitura, LEITURA);
});

test('CPU que para de responder com a conexão aberta: a leitura desiste no tempo-limite', async (t) => {
  const servidor = await cpu(t);
  servidor.dbs.set(DB_MES, dbMes());
  const servico = servicoDe(t, servidor);
  await servico.ler();

  servidor.modo = 'mudo';
  const inicio = Date.now();
  await assert.rejects(servico.ler(), erroGateway('sem_conexao', /não respondeu/));
  assert.ok(Date.now() - inicio < 3000, `levou ${Date.now() - inicio} ms`);

  servidor.modo = 'normal';
  assert.deepEqual((await servico.ler()).leitura, LEITURA);
});

test('PUT/GET não liberado na CPU (erro 16#8104 da literatura): erro que cita o PUT/GET, sem pendurar', async (t) => {
  const servidor = await cpu(t);
  servidor.dbs.set(DB_MES, dbMes());
  servidor.modo = 'semPutGet';
  const servico = servicoDe(t, servidor);

  await assert.rejects(servico.ler(), erroGateway('sem_conexao', /PUT\/GET/));
  servidor.modo = 'normal'; // marcaram a opção e carregaram a configuração de hardware
  assert.deepEqual((await servico.ler()).leitura, LEITURA);
});

test('trocar a configuração (outro DB) fecha a conexão antiga e passa a ler o DB novo', async (t) => {
  const servidor = await cpu(t);
  servidor.dbs.set(DB_MES, dbMes());
  const outro = dbMes();
  outro.set(codificarEscrita({ ...ESCRITA, NumeroOp: 99 }), AREA_ESCRITA.inicio);
  servidor.dbs.set(20, outro);
  const servico = servicoDe(t, servidor);
  assert.equal((await servico.ler()).escrita.NumeroOp, 1234);

  await servico.configurar(configuracao(servidor, { numeroDb: 20, numeroDbProcesso: DB_PROCESSO }));
  servidor.dbs.set(DB_PROCESSO, dbMbSimulador());
  const r = await servico.ler();
  assert.equal(r.escrita.NumeroOp, 99);
  assert.equal(r.processo?.temperatura, 51.5);
  assert.equal(servidor.visto.conexoes, 2);
});

test('o driver sozinho: procurar sem conexão é erro, e desconectar duas vezes não pendura', async (t) => {
  const servidor = await cpu(t);
  servidor.dbs.set(DB_MES, dbMes());
  const driver = new DriverS7(configuracao(servidor), OPCOES.s7);
  await assert.rejects(driver.procurarDbs(), /sem conexão/);
  await driver.conectar();
  await driver.conectar(); // já conectado: não abre outra
  assert.equal(servidor.visto.conexoes, 1);
  assert.equal((await driver.ler()).mes.length, TAMANHO_DB);
  await driver.desconectar();
  await driver.desconectar();
  await assert.rejects(driver.ler(), /sem conexão/);
});
