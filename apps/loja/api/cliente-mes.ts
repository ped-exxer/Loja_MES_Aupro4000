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
      throw new ErroMes('mes_fora_do_ar', 503, erro instanceof Error ? erro.message : String(erro));
    }
    const dados = (await r.json().catch(() => null)) as ErroMes['dados'];
    if (r.status >= 500) throw new ErroMes('mes_fora_do_ar', 503, `MES: HTTP ${r.status}`, dados);
    if (!r.ok) throw new ErroMes(dados?.erro ?? `http_${r.status}`, r.status, `MES: HTTP ${r.status}`, dados);
    return dados as T;
  }

  return {
    emitirOrdens: (ordens: PedidoOrdem[]) => pedir<{ numeros: number[] }>('POST', '/api/ordens', { ordens }),
    cancelarOrdem: (numero: number) => pedir<{ resultado: 'cancelada' | 'pendente' }>('POST', `/api/ordens/${numero}/cancelar`, {}),
    estimarPrazos: async (receitas: Receita[]) => (await pedir<{ prazos: number[] }>('POST', '/api/ordens/prazos', { receitas })).prazos,
    andamento: (numeros: number[]) =>
      numeros.length === 0 ? Promise.resolve([]) : pedir<Andamento[]>('GET', `/api/ordens/andamento?numeros=${numeros.join(',')}`),
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
