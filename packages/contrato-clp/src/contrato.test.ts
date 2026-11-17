import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AREA_ASSINATURA,
  AREA_ESCRITA,
  AREA_LEITURA,
  CAMPOS_ASSINATURA,
  CAMPOS_ESCRITA,
  CAMPOS_LEITURA,
  TAMANHO_DB,
  TAMANHO_TIPO,
  type Area,
  type Campo,
  type ValoresEscrita,
  type ValoresLeitura,
} from './layout.ts';
import {
  codificarAssinatura,
  codificarEscrita,
  codificarLeitura,
  conferirAssinatura,
  decodificarEscrita,
  decodificarLeitura,
  proximoWord,
} from './codec.ts';

function conferirArea(nome: string, campos: Record<string, Campo>, area: Area) {
  const ocupados = new Set<number>();
  for (const [campo, { byte, tipo }] of Object.entries(campos)) {
    assert.equal(byte % 2, 0, `${nome}.${campo} fora de endereço par`);
    for (let b = byte; b < byte + TAMANHO_TIPO[tipo]; b++) {
      assert.ok(b >= area.inicio && b < area.inicio + area.tamanho, `${nome}.${campo} sai da área (byte ${b})`);
      assert.ok(!ocupados.has(b), `${nome}.${campo} sobrepõe outro campo (byte ${b})`);
      ocupados.add(b);
    }
  }
  return ocupados.size;
}

test('campos ficam dentro das áreas, sem sobreposição', () => {
  assert.equal(conferirArea('escrita', CAMPOS_ESCRITA, AREA_ESCRITA), AREA_ESCRITA.tamanho);
  assert.equal(conferirArea('leitura', CAMPOS_LEITURA, AREA_LEITURA), AREA_LEITURA.tamanho - 6); // 90–95 reservado
  assert.equal(conferirArea('assinatura', CAMPOS_ASSINATURA, AREA_ASSINATURA), AREA_ASSINATURA.tamanho);
});

test('áreas não se sobrepõem e cabem no DB', () => {
  const areas = [AREA_ESCRITA, AREA_LEITURA, AREA_ASSINATURA];
  for (let i = 1; i < areas.length; i++) {
    assert.ok(areas[i - 1].inicio + areas[i - 1].tamanho <= areas[i].inicio);
  }
  assert.equal(AREA_ASSINATURA.inicio + AREA_ASSINATURA.tamanho, TAMANHO_DB);
});

test('leitura: posições dos campos novos e da assinatura', () => {
  assert.deepEqual(AREA_LEITURA, { inicio: 32, tamanho: 64 });
  assert.equal(CAMPOS_LEITURA.TempoResfriar.byte, 78);
  assert.deepEqual(CAMPOS_LEITURA.TemperaturaTq02, { byte: 82, tipo: 'Real' });
  assert.deepEqual(CAMPOS_LEITURA.TemperaturaReservatorio, { byte: 86, tipo: 'Real' });
  assert.deepEqual(AREA_ASSINATURA, { inicio: 96, tamanho: 6 });
  assert.equal(TAMANHO_DB, 102);
});

const escrita: ValoresEscrita = {
  VidaMes: 0x0102,
  SeqPedido: 65535,
  NumeroOp: 123456,
  SpVolume: 10,
  SpTemperatura: 45.5,
  SpVazao: 4,
  SpPressao: 2.25,
};

test('escrita: big-endian nos deslocamentos da seção 6.3', () => {
  const bytes = codificarEscrita(escrita);
  assert.equal(bytes.length, 24);
  assert.deepEqual([...bytes.subarray(0, 2)], [0x01, 0x02]); // VidaMes
  assert.deepEqual([...bytes.subarray(2, 4)], [0xff, 0xff]); // SeqPedido
  assert.deepEqual([...bytes.subarray(4, 8)], [0x00, 0x01, 0xe2, 0x40]); // NumeroOp = 123456
  assert.deepEqual([...bytes.subarray(8, 12)], [0x41, 0x20, 0x00, 0x00]); // SpVolume = 10.0
  assert.deepEqual([...bytes.subarray(20, 24)], [0x40, 0x10, 0x00, 0x00]); // SpPressao = 2.25
});

test('escrita: ida e volta', () => {
  assert.deepEqual(decodificarEscrita(codificarEscrita(escrita)), escrita);
});

test('escrita: recusa valor que não cabe no tipo', () => {
  assert.throws(() => codificarEscrita({ ...escrita, SeqPedido: 65536 }), RangeError);
  assert.throws(() => codificarEscrita({ ...escrita, NumeroOp: 1.5 }), RangeError);
  assert.throws(() => codificarEscrita({ ...escrita, SpTemperatura: Number.NaN }), RangeError);
});

test('leitura: ida e volta, com negativos e Real', () => {
  const leitura: ValoresLeitura = {
    VidaClp: 7, EcoSeq: 6, Resultado: 3, Estado: 1, Etapa: 2, OpExecucao: 123457, Alarme: 0xabcd,
    OpConcluida: 123456, ResultadoOp: 1, VolumeProduzido: 9.75, TemperaturaProduto: 44.5,
    TempoPressurizar: 60000, TempoAquecer: 300000, TempoTransferir: 150000, TempoDevolver: -1, TempoResfriar: 120000,
    TemperaturaTq02: 44.25, TemperaturaReservatorio: 31.5,
  };
  const bytes = codificarLeitura(leitura);
  assert.equal(bytes.length, AREA_LEITURA.tamanho);
  // TemperaturaTq02 = 44.25 em big-endian no byte 82
  const pos = CAMPOS_LEITURA.TemperaturaTq02.byte - AREA_LEITURA.inicio;
  assert.deepEqual([...bytes.subarray(pos, pos + 4)], [0x42, 0x31, 0x00, 0x00]);
  assert.deepEqual(decodificarLeitura(bytes), leitura);
});

test('leitura: recusa tamanho errado', () => {
  assert.throws(() => decodificarLeitura(new Uint8Array(AREA_LEITURA.tamanho - 1)), RangeError);
});

test('assinatura: 16#4D45 e 4000.75 em big-endian', () => {
  const bytes = codificarAssinatura();
  assert.deepEqual([...bytes], [0x4d, 0x45, 0x45, 0x7a, 0x0c, 0x00]);
  assert.ok(conferirAssinatura(bytes));
  assert.ok(!conferirAssinatura(new Uint8Array([0x4d, 0x45, 0x45, 0x7a, 0x0c, 0x01])));
  assert.ok(!conferirAssinatura(new Uint8Array(5)));
});

test('contador Word volta a 0 depois de 65535', () => {
  assert.equal(proximoWord(0), 1);
  assert.equal(proximoWord(65535), 0);
});
