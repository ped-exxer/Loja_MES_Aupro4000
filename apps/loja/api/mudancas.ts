// A Loja acompanha o MES pelo feed de mudanças (GET /api/ordens/mudancas?desde=<cursor>), a cada segundo.
// O cursor fica na base da Loja: se um dos dois reiniciar, ela continua de onde parou e nada se perde.
// O que se faz com cada mudança é idempotente (a fatura é única por item), então reprocessar não estraga nada.
//
// O feed também conserta o que uma resposta perdida deixou para trás (`decidirMudanca`): OP criada no MES para um
// item que a Loja não gravou (o pedido foi desfeito) é cancelada; OP nova de um item que a Loja ainda aponta para
// a antiga ("produzir de novo" sem resposta) é adotada.

import { ORIGEM_LOJA, type EstadoOp, type Mudanca } from '@aupro/dominio';
import { executar, linhas, type Banco, type TempoReal } from '@aupro/servidor';
import { ErroMes, type ClienteMes } from './cliente-mes.ts';

const INTERVALO_MS = 1000;

/** Item do pedido da Loja a que a mudança se refere, ou null se a OP não veio da Loja. */
export function itemDaOrigem(origem: string | null): number | null {
  if (!origem?.startsWith(ORIGEM_LOJA)) return null;
  const id = Number(origem.slice(ORIGEM_LOJA.length));
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Itens cujo pedido a Loja está gravando agora (a transação do checkout ainda não terminou). O feed não decide nada
 * sobre eles: a OP já existe no MES, mas o item ainda não aparece na base (ou vai sumir, se o pedido for desfeito).
 */
export type EmissoesEmAndamento = Set<number>;

export type AcaoMudanca =
  /** Não é da Loja, ou é de uma OP antiga do item. */
  | 'ignorar'
  /** O pedido do item ainda está sendo gravado: para aqui e olha de novo no próximo ciclo. */
  | 'esperar'
  /** OP na fila do MES sem item na Loja (a emissão foi desfeita, ou a resposta se perdeu): cancela no MES. */
  | 'cancelar_orfa'
  /** OP mais nova que a do item (um "produzir de novo" cuja resposta se perdeu): o item passa a apontar para ela. */
  | 'adotar'
  | 'aplicar';

/** O que a Loja faz com uma mudança do feed. `item` = o item do pedido da origem (null se não existe). */
export function decidirMudanca(
  m: { numero: number; estado: EstadoOp },
  itemId: number | null,
  item: { numeroOp: number | null } | null,
  emAndamento: boolean,
): AcaoMudanca {
  if (itemId === null) return 'ignorar';
  if (emAndamento) return 'esperar';
  if (!item) return m.estado === 'na_fila' ? 'cancelar_orfa' : 'ignorar';
  if (item.numeroOp === m.numero) return 'aplicar';
  // o MES só cria outra OP para a mesma origem no lugar de uma que terminou: a de número maior é a que vale
  return item.numeroOp === null || m.numero > item.numeroOp ? 'adotar' : 'ignorar';
}

/** Próximo cursor: se o da Loja passou do último id do MES, a base do MES foi recriada e recomeça do zero. */
export function cursorValido(cursor: number, ultimo: number | null): number {
  return ultimo !== null && cursor > ultimo ? 0 : cursor;
}

export function acompanharMes(p: { banco: Banco; mes: ClienteMes; tempoReal: TempoReal; emAndamento: EmissoesEmAndamento }) {
  let parado = false;
  let relogio: ReturnType<typeof setTimeout> | null = null;
  let falhando = false;
  let emCurso: Promise<void> | null = null;

  /** Trata uma mudança; devolve false se ela tem de esperar (o cursor não passa dela). */
  async function aplicar(m: Mudanca): Promise<boolean> {
    const itemId = itemDaOrigem(m.origem);
    // "em andamento" é conferido ANTES de ler o item: se o checkout terminar no meio, o item já é lido gravado
    // (ou, desfeito, não existe mesmo). Na ordem contrária, um pedido bom poderia passar por órfão.
    const emAndamento = itemId !== null && p.emAndamento.has(itemId);
    const [item] = itemId === null ? [] : await linhas<{ id: number; pedido_id: number; preco: number; numero_op: number | null }>(
      p.banco, 'SELECT id, pedido_id, preco, numero_op FROM erp_item WHERE id = ?', [itemId],
    );
    const acao = decidirMudanca(m, itemId, item ? { numeroOp: item.numero_op } : null, emAndamento);
    if (acao === 'esperar') return false;
    if (acao === 'ignorar') return true;
    if (acao === 'cancelar_orfa') {
      try {
        const r = await p.mes.cancelarOrdem(m.numero);
        console.error(`loja: a OP ${m.numero} (${m.origem}) não tem pedido na Loja: cancelamento pedido ao MES (${r.resultado})`);
      } catch (erro) {
        // 409: o MES não pode mais cancelar (o CLP já pegou, ou ela já terminou): fica registrado e segue
        if (!(erro instanceof ErroMes) || erro.codigo === 'mes_fora_do_ar') throw erro;
        console.error(`loja: a OP ${m.numero} (${m.origem}) não tem pedido na Loja e o MES não a cancelou (${erro.codigo})`);
      }
      return true;
    }
    if (!item) return true; // não acontece: "adotar" e "aplicar" só saem com o item
    if (acao === 'adotar') {
      await executar(p.banco, 'UPDATE erp_item SET numero_op = ? WHERE id = ? AND (numero_op IS NULL OR numero_op < ?)', [m.numero, item.id, m.numero]);
      console.error(`loja: o item ${item.id} passou a apontar para a OP ${m.numero} (era ${item.numero_op ?? 'nenhuma'})`);
    }
    // batelada aprovada vira fatura
    if (m.estado === 'aprovada') {
      await executar(p.banco, 'INSERT IGNORE INTO erp_fatura (item_id, numero_op, valor, emitida_em) VALUES (?, ?, ?, CURRENT_TIMESTAMP(3))', [
        item.id, m.numero, item.preco,
      ]);
    }
    p.tempoReal.publicar('pedido', { pedidoId: item.pedido_id, numeroOp: m.numero, estado: m.estado });
    return true;
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
    let aplicadas = 0;
    for (const m of r.mudancas) {
      if (!(await aplicar(m))) break; // esta espera: as seguintes também (o feed é tratado em ordem)
      cursor = m.id;
      aplicadas += 1;
      await executar(p.banco, 'UPDATE erp_integracao SET cursor_mes = ? WHERE id = 1', [cursor]);
    }
    // a vitrine e os pedidos se atualizam com este aviso (andamento, prazos)
    if (aplicadas > 0) p.tempoReal.publicar('producao', { cursor });
  }

  async function laco(): Promise<void> {
    try {
      await ciclo();
      if (falhando) console.log('loja: acompanhamento do MES de volta ao normal');
      falhando = false;
    } catch (erro) {
      // pode ser o MES fora do ar ou a base da Loja: a mensagem diz qual; tenta de novo no próximo ciclo
      if (!falhando) console.error('loja: acompanhamento do MES falhou (tenta de novo a cada segundo):', erro instanceof Error ? erro.message : erro);
      falhando = true;
    }
  }

  function agendar(): void {
    if (parado) return;
    emCurso = laco().finally(() => {
      emCurso = null;
      if (!parado) relogio = setTimeout(agendar, INTERVALO_MS);
    });
  }

  return {
    iniciar: agendar,
    /** Para o laço e espera o ciclo em andamento terminar. */
    parar: async () => {
      parado = true;
      if (relogio) clearTimeout(relogio);
      await emCurso;
    },
  };
}
