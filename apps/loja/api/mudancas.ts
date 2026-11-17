// A Loja acompanha o MES pelo feed de mudanças (GET /api/ordens/mudancas?desde=<cursor>), a cada segundo.
// O cursor fica na base da Loja: se um dos dois reiniciar, ela continua de onde parou e nada se perde.
// O que se faz com cada mudança é idempotente (a fatura é única por item), então reprocessar não estraga nada.

import { ORIGEM_LOJA, type Mudanca } from '@aupro/dominio';
import { executar, linhas, type Banco, type TempoReal } from '@aupro/servidor';
import type { ClienteMes } from './cliente-mes.ts';

const INTERVALO_MS = 1000;

/** Item do pedido da Loja a que a mudança se refere, ou null se a OP não veio da Loja. */
export function itemDaOrigem(origem: string | null): number | null {
  if (!origem?.startsWith(ORIGEM_LOJA)) return null;
  const id = Number(origem.slice(ORIGEM_LOJA.length));
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Próximo cursor: se o da Loja passou do último id do MES, a base do MES foi recriada e recomeça do zero. */
export function cursorValido(cursor: number, ultimo: number | null): number {
  return ultimo !== null && cursor > ultimo ? 0 : cursor;
}

export function acompanharMes(p: { banco: Banco; mes: ClienteMes; tempoReal: TempoReal }) {
  let parado = false;
  let relogio: ReturnType<typeof setTimeout> | null = null;
  let falhando = false;

  async function aplicar(m: Mudanca): Promise<void> {
    const itemId = itemDaOrigem(m.origem);
    if (itemId === null) return;
    const [item] = await linhas<{ id: number; pedido_id: number; preco: number }>(
      p.banco, 'SELECT id, pedido_id, preco FROM erp_item WHERE id = ? AND numero_op = ?', [itemId, m.numero],
    );
    if (!item) return;
    // batelada aprovada vira fatura
    if (m.estado === 'aprovada') {
      await executar(p.banco, 'INSERT IGNORE INTO erp_fatura (item_id, numero_op, valor, emitida_em) VALUES (?, ?, ?, CURRENT_TIMESTAMP(3))', [
        item.id, m.numero, item.preco,
      ]);
    }
    p.tempoReal.publicar('pedido', { pedidoId: item.pedido_id, numeroOp: m.numero, estado: m.estado });
  }

  async function ciclo(): Promise<void> {
    const [{ cursor_mes }] = await linhas<{ cursor_mes: number }>(p.banco, 'SELECT cursor_mes FROM erp_integracao WHERE id = 1');
    let cursor = Number(cursor_mes);
    const r = await p.mes.mudancas(cursor);
    const valido = cursorValido(cursor, r.ultimo);
    if (valido !== cursor) {
      await executar(p.banco, 'UPDATE erp_integracao SET cursor_mes = ? WHERE id = 1', [valido]);
      return;
    }
    for (const m of r.mudancas) {
      await aplicar(m);
      cursor = m.id;
      await executar(p.banco, 'UPDATE erp_integracao SET cursor_mes = ? WHERE id = 1', [cursor]);
    }
    // a vitrine e os pedidos se atualizam com este aviso (andamento, prazos)
    if (r.mudancas.length > 0) p.tempoReal.publicar('producao', { cursor });
  }

  async function laco(): Promise<void> {
    try {
      await ciclo();
      if (falhando) console.log('loja: MES respondendo de novo');
      falhando = false;
    } catch (erro) {
      if (!falhando) console.error('loja: sem resposta do MES:', erro instanceof Error ? erro.message : erro);
      falhando = true;
    }
    if (!parado) relogio = setTimeout(laco, INTERVALO_MS);
  }

  return {
    iniciar: () => void laco(),
    parar: () => {
      parado = true;
      if (relogio) clearTimeout(relogio);
    },
  };
}
