import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cursorValido, decidirMudanca, itemDaOrigem } from './mudancas.ts';
import { ErroMes, repetirSeForaDoAr } from './cliente-mes.ts';

test('itemDaOrigem reconhece só as OPs emitidas pela Loja', () => {
  assert.equal(itemDaOrigem('loja:item:42'), 42);
  assert.equal(itemDaOrigem('manual'), null);
  assert.equal(itemDaOrigem(null), null);
  assert.equal(itemDaOrigem('loja:item:'), null);
  assert.equal(itemDaOrigem('loja:item:abc'), null);
});

test('cursorValido recomeça do zero se a base do MES foi recriada', () => {
  assert.equal(cursorValido(10, 25), 10);
  assert.equal(cursorValido(10, 10), 10);
  assert.equal(cursorValido(10, null), 10); // MES reiniciado: a numeração continua, o cursor vale
  assert.equal(cursorValido(10, 3), 0); // base nova: ids recomeçaram
});

test('decidirMudanca: o que a Loja faz com cada mudança do feed', () => {
  const naFila = { numero: 12, estado: 'na_fila' } as const;
  const aprovada = { numero: 12, estado: 'aprovada' } as const;
  // OP que não é da Loja (manual)
  assert.equal(decidirMudanca(naFila, null, null, false), 'ignorar');
  // o caso normal: a OP do item
  assert.equal(decidirMudanca(aprovada, 5, { numeroOp: 12 }, false), 'aplicar');
  // o checkout ainda está gravando o pedido: não decide nada agora
  assert.equal(decidirMudanca(naFila, 5, null, true), 'esperar');
  // OP na fila do MES sem item na Loja (pedido desfeito, resposta perdida): cancela no MES
  assert.equal(decidirMudanca(naFila, 5, null, false), 'cancelar_orfa');
  // a órfã que já andou (ou já foi cancelada) não gera outro cancelamento
  assert.equal(decidirMudanca({ numero: 12, estado: 'cancelada' }, 5, null, false), 'ignorar');
  assert.equal(decidirMudanca({ numero: 12, estado: 'enviada' }, 5, null, false), 'ignorar');
  // "produzir de novo" sem resposta: a OP nova (número maior) é adotada pelo item
  assert.equal(decidirMudanca(naFila, 5, { numeroOp: 9 }, false), 'adotar');
  assert.equal(decidirMudanca(naFila, 5, { numeroOp: null }, false), 'adotar');
  // mudança de uma OP antiga do item (ele já foi refeito)
  assert.equal(decidirMudanca({ numero: 9, estado: 'reprovada' }, 5, { numeroOp: 12 }, false), 'ignorar');
});

test('repetirSeForaDoAr: repete só quando o MES não respondeu, e desiste depois das tentativas', async () => {
  const foraDoAr = () => new ErroMes('mes_fora_do_ar', 503, 'sem resposta');
  const silencio = console.error;
  console.error = () => undefined;
  try {
    // a resposta se perde uma vez e a repetição dá certo
    let chamadas = 0;
    const r = await repetirSeForaDoAr(async () => {
      chamadas += 1;
      if (chamadas === 1) throw foraDoAr();
      return 'ok';
    }, [0, 0]);
    assert.equal(r, 'ok');
    assert.equal(chamadas, 2);

    // o MES continua fora: a primeira tentativa e mais duas, depois desiste com o mesmo erro
    chamadas = 0;
    await assert.rejects(
      repetirSeForaDoAr(async () => {
        chamadas += 1;
        throw foraDoAr();
      }, [0, 0]),
      (erro: unknown) => erro instanceof ErroMes && erro.codigo === 'mes_fora_do_ar',
    );
    assert.equal(chamadas, 3);

    // recusa do MES (422, 409) é resposta: não repete
    chamadas = 0;
    await assert.rejects(
      repetirSeForaDoAr(async () => {
        chamadas += 1;
        throw new ErroMes('receita_invalida', 422, 'recusada');
      }, [0, 0]),
      (erro: unknown) => erro instanceof ErroMes && erro.codigo === 'receita_invalida',
    );
    assert.equal(chamadas, 1);

    // erro que não é do MES (defeito, banco) também não repete
    chamadas = 0;
    await assert.rejects(
      repetirSeForaDoAr(async () => {
        chamadas += 1;
        throw new TypeError('defeito');
      }, [0, 0]),
      TypeError,
    );
    assert.equal(chamadas, 1);
  } finally {
    console.error = silencio;
  }
});
