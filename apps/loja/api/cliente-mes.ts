// A Loja fala com o MES só por HTTP, pelo contrato de /api/ordens/* (MES_URL). Nunca lê a base do MES nem
// conhece o gateway. Formatos em packages/dominio/src/integracao.ts.

import type { Andamento, Dossie, Mudancas, PedidoOrdem, Receita } from '@aupro/dominio';

/** `codigo` = 'mes_fora_do_ar' quando o MES não responde; senão, o código de erro que o MES devolveu. */
export class ErroMes extends Error {
  readonly codigo: string;
  readonly status: number;
  readonly dados: { erro?: string; erros?: { campo: string; codigo: string }[] } | null;
  constructor(codigo: string, status: number, mensagem: string, dados: ErroMes['dados'] = null) {
    super(mensagem);
    this.codigo = codigo;
    this.status = status;
    this.dados = dados;
  }
}

export type ClienteMes = ReturnType<typeof criarClienteMes>;

/** Esperas entre as tentativas de uma chamada que pode ser repetida (ms): a primeira tentativa e mais duas. */
const ESPERAS_REPETICAO_MS = [300, 1000];
/** Quantos números de OP vão em cada consulta de andamento (o MES aceita até 500 por consulta). */
const ANDAMENTO_POR_CONSULTA = 200;

/**
 * Repete `fn` quando o MES não respondeu (`mes_fora_do_ar`: rede, tempo esgotado, erro 5xx). Só serve para chamada
 * IDEMPOTENTE, em que repetir não duplica nada (a emissão de ordens é idempotente pela origem). Uma recusa do MES
 * (409, 422) não é repetida: é a resposta.
 */
export async function repetirSeForaDoAr<T>(fn: () => Promise<T>, esperasMs: readonly number[] = ESPERAS_REPETICAO_MS): Promise<T> {
  for (let tentativa = 0; ; tentativa++) {
    try {
      return await fn();
    } catch (erro) {
      if (!(erro instanceof ErroMes) || erro.codigo !== 'mes_fora_do_ar' || tentativa >= esperasMs.length) throw erro;
      console.error(`loja: o MES não respondeu (${erro.message}); tentativa ${tentativa + 2} de ${esperasMs.length + 1}`);
      await new Promise((r) => setTimeout(r, esperasMs[tentativa]));
    }
  }
}

export function criarClienteMes(base: string) {
  async function pedir<T>(metodo: string, caminho: string, corpo?: unknown, tempoMs = 5000): Promise<T> {
    let r: Response;
    try {
      r = await fetch(`${base}${caminho}`, {
        method: metodo,
        headers: corpo === undefined ? undefined : { 'content-type': 'application/json' },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: AbortSignal.timeout(tempoMs),
      });
    } catch (erro) {
      throw new ErroMes('mes_fora_do_ar', 503, `${metodo} ${caminho.split('?')[0]}: ${erro instanceof Error ? erro.message : String(erro)}`);
    }
    const dados = (await r.json().catch(() => null)) as ErroMes['dados'];
    if (r.status >= 500) throw new ErroMes('mes_fora_do_ar', 503, `MES: HTTP ${r.status}`, dados);
    if (!r.ok) throw new ErroMes(dados?.erro ?? `http_${r.status}`, r.status, `MES: HTTP ${r.status}`, dados);
    return dados as T;
  }

  return {
    /**
     * Emite as OPs (todas ou nenhuma). Repete se a resposta se perder: o MES devolve as OPs que já criou em vez de
     * duplicar (idempotente pela origem), então nunca fica OP órfã na fila por causa de uma resposta perdida.
     */
    emitirOrdens: (ordens: PedidoOrdem[]) =>
      repetirSeForaDoAr(() => pedir<{ numeros: number[] }>('POST', '/api/ordens', { ordens })),
    cancelarOrdem: (numero: number) => pedir<{ resultado: 'cancelada' | 'pendente' }>('POST', `/api/ordens/${numero}/cancelar`, {}),
    estimarPrazos: async (receitas: Receita[]) => (await pedir<{ prazos: number[] }>('POST', '/api/ordens/prazos', { receitas })).prazos,
    /** Andamento das OPs, em consultas de até 200 números (uma lista de pedidos grande não cabe numa só). */
    andamento: async (numeros: number[]) => {
      const partes: Promise<Andamento[]>[] = [];
      for (let i = 0; i < numeros.length; i += ANDAMENTO_POR_CONSULTA) {
        partes.push(pedir<Andamento[]>('GET', `/api/ordens/andamento?numeros=${numeros.slice(i, i + ANDAMENTO_POR_CONSULTA).join(',')}`));
      }
      return (await Promise.all(partes)).flat();
    },
    dossie: async (numero: number) => {
      try {
        return await pedir<Dossie>('GET', `/api/ordens/${numero}`);
      } catch (erro) {
        if (erro instanceof ErroMes && erro.status === 404) return null;
        throw erro;
      }
    },
    mudancas: (desde: number) => pedir<Mudancas>('GET', `/api/ordens/mudancas?desde=${desde}`),
    reiniciar: () => pedir<{ ok: true }>('POST', '/api/admin/reiniciar', {}, 15_000),
    saude: () => pedir<{ mes: string }>('GET', '/api/saude', undefined, 1500),
  };
}
