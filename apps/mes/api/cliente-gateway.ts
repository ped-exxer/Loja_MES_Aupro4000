// O MES nunca fala direto com o CLP: só pelo gateway (ROTEIRO, seção 5). A Loja nem conhece o gateway.

import type { ValoresEscrita, ValoresLeitura } from '@aupro/contrato-clp';

export type Processo = { temperatura: number; nivel: number; pressao: number; vazao: number };
export type LeituraGateway = { escrita: ValoresEscrita; leitura: ValoresLeitura; processo: Processo | null };

export type ConfiguracaoGateway = {
  driver: 'simulado' | 's7';
  ip: string;
  rack: number;
  slot: number;
  numeroDb: number;
  numeroDbProcesso: number | null;
  escalaSimulador: number;
};

export class ErroGateway extends Error {
  readonly codigo: string;
  constructor(codigo: string, mensagem: string) {
    super(mensagem);
    this.codigo = codigo;
  }
}

export type ClienteGateway = ReturnType<typeof criarClienteGateway>;

export function criarClienteGateway(base: string) {
  async function pedir<T>(metodo: string, caminho: string, corpo?: unknown, tempoMs = 3000): Promise<T> {
    let r: Response;
    try {
      r = await fetch(`${base}${caminho}`, {
        method: metodo,
        headers: corpo === undefined ? undefined : { 'content-type': 'application/json' },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: AbortSignal.timeout(tempoMs),
      });
    } catch (erro) {
      throw new ErroGateway('gateway_inacessivel', erro instanceof Error ? erro.message : String(erro));
    }
    if (r.status === 204) return undefined as T;
    const dados = (await r.json().catch(() => ({}))) as { erro?: string; mensagem?: string };
    if (!r.ok) throw new ErroGateway(dados.erro ?? `http_${r.status}`, dados.mensagem ?? dados.erro ?? `HTTP ${r.status}`);
    return dados as T;
  }

  return {
    ler: () => pedir<LeituraGateway>('GET', '/leitura'),
    gravar: (escrita: ValoresEscrita) => pedir<void>('PUT', '/escrita', escrita),
    configurar: (c: ConfiguracaoGateway) => pedir<void>('PUT', '/configuracao', c),
    procurar: (c: ConfiguracaoGateway) =>
      pedir<{ mes: number | null; processo: number | null }>('POST', '/procurar-db', c, 120_000),
    falhaSimulada: (falha: string) => pedir<void>('POST', '/simulador/falha', { falha }),
    saude: () =>
      pedir<{ driver: string; conectado: boolean; assinaturaOk: boolean; erro: string | null; config: ConfiguracaoGateway }>(
        'GET', '/saude', undefined, 1500,
      ),
  };
}
