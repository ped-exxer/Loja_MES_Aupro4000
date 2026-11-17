import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fonteDbTia, variaveisDb } from './fonte-tia.ts';
import { TAMANHO_DB } from './layout.ts';

test('as variáveis em sequência caem exatamente nos deslocamentos do contrato', () => {
  // No TIA, um DB sem acesso otimizado coloca as variáveis uma depois da outra (Word, Int, DInt e Real em
  // endereço par). Somando os tamanhos em ordem, cada variável tem que cair no byte declarado.
  let pos = 0;
  for (const v of variaveisDb()) {
    assert.equal(v.byte, pos, `${v.nome} deveria estar no byte ${pos}`);
    assert.equal(v.byte % 2, 0, `${v.nome} em endereço ímpar`);
    pos += v.tamanho;
  }
  assert.equal(pos, TAMANHO_DB);
});

test('a fonte declara o DB sem acesso otimizado e com a assinatura', () => {
  const fonte = fonteDbTia();
  assert.match(fonte, /S7_Optimized_Access := 'FALSE'/);
  assert.match(fonte, /Assinatura := 16#4D45;/);
  assert.match(fonte, /AssinaturaValor := 4000\.75;/);
  assert.match(fonte, /Reservado1 : Array\[0\.\.3\] of Word;/); // bytes 24–31
  assert.match(fonte, /OpConcluida : DInt;/);
});
