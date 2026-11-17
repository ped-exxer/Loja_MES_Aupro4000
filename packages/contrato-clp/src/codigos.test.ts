import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALARME, RECUSA, RESULTADO_ACEITO, nomeAlarme, nomeRecusa, recusaPorFaixa, tabelaAlarmes, tabelaRecusas,
} from './codigos.ts';
import { fonteDbTia } from './fonte-tia.ts';

test('os códigos de alarme e de recusa são únicos, seguidos a partir de 0 e cabem no campo do DB', () => {
  for (const tabela of [ALARME, RECUSA]) {
    const valores = Object.values(tabela).sort((a, b) => a - b);
    assert.deepEqual(valores, valores.map((_, i) => i), 'códigos sem buraco nem repetição');
  }
  assert.ok(Math.max(...Object.values(ALARME)) <= 0xffff); // Alarme é Word
  assert.ok(Math.max(...Object.values(RECUSA)) <= 0x7fff); // Resultado é Int
  assert.equal(RESULTADO_ACEITO, 0);
  assert.equal(ALARME.nenhum, 0);
});

test('os números da tabela não mudam sem querer (o programa do CLP usa os mesmos)', () => {
  assert.deepEqual(ALARME, {
    nenhum: 0, emergencia: 1, pressaoAltaTq01: 2, temperaturaAltaTq01: 3, nivelBaixoTq01: 4, semVazaoB1: 5,
    nivelBaixoReservatorio: 6, nivelAltoTq02: 7, nivelBaixoTq02: 8, faltaArInstrumento: 9, falhaInversorB1: 10,
    falhaInversorM1: 11,
  });
  assert.deepEqual(RECUSA, {
    aceito: 0, foraDaFaixa: 1, volumeForaDaFaixa: 2, temperaturaForaDaFaixa: 3, vazaoForaDaFaixa: 4,
    pressaoForaDaFaixa: 5, bancadaEmFalha: 6,
  });
});

test('nome do código, e null para código fora da tabela', () => {
  assert.equal(nomeAlarme(2), 'pressaoAltaTq01');
  assert.equal(nomeAlarme(0), 'nenhum');
  assert.equal(nomeAlarme(999), null);
  assert.equal(nomeRecusa(3), 'temperaturaForaDaFaixa');
  assert.equal(nomeRecusa(-1), null);
});

test('recusa por faixa: um campo dá o código do campo; mais de um, o genérico', () => {
  assert.equal(recusaPorFaixa([]), RECUSA.aceito);
  assert.equal(recusaPorFaixa(['volume']), RECUSA.volumeForaDaFaixa);
  assert.equal(recusaPorFaixa(['temperatura']), RECUSA.temperaturaForaDaFaixa);
  assert.equal(recusaPorFaixa(['vazao']), RECUSA.vazaoForaDaFaixa);
  assert.equal(recusaPorFaixa(['pressao']), RECUSA.pressaoForaDaFaixa);
  assert.equal(recusaPorFaixa(['pressao', 'pressao']), RECUSA.pressaoForaDaFaixa);
  assert.equal(recusaPorFaixa(['volume', 'temperatura']), RECUSA.foraDaFaixa);
});

test('a fonte do TIA traz as duas tabelas nos comentários, só em ASCII', () => {
  const fonte = fonteDbTia();
  const linha = (nome: string) => fonte.split(/\r?\n/).find((l) => l.trimStart().startsWith(`${nome} :`)) ?? '';
  for (const a of tabelaAlarmes()) assert.ok(linha('Alarme').includes(`${a.codigo} ${a.tia}`), `Alarme sem ${a.nome}`);
  for (const r of tabelaRecusas()) assert.ok(linha('Resultado').includes(`${r.codigo} ${r.tia}`), `Resultado sem ${r.nome}`);
  assert.match(linha('Alarme'), /2 PSH-103 pressao alta TQ-01/);
  assert.match(linha('Resultado'), /0 aceito, 1 fora da faixa/);
  assert.ok(/^[\x20-\x7e\r\n]*$/.test(fonte), 'a fonte do TIA tem caractere fora do ASCII');
});
