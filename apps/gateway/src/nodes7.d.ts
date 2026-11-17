// Tipos mínimos da biblioteca nodes7 (JavaScript puro, sem tipos próprios), só o que o gateway usa.
declare module 'nodes7' {
  type Valor = number | number[] | string | boolean;
  export default class NodeS7 {
    constructor(opcoes?: { silent?: boolean; debug?: boolean });
    initiateConnection(
      parametros: { host: string; port: number; rack: number; slot: number; timeout?: number },
      aoConectar: (erro?: unknown) => void,
    ): void;
    dropConnection(aoFechar?: () => void): void;
    setTranslationCB(traduzir: (tag: string) => string): void;
    addItems(itens: string | string[]): void;
    removeItems(itens?: string | string[]): void;
    readAllItems(aoLer: (algumRuim: boolean, valores: Record<string, Valor | string[]>) => void): void;
    writeItems(itens: string | string[], valores: Valor | Valor[], aoGravar: (algumRuim: boolean) => void): number;

    // Internos do nodes7 0.3.x, usados só em s7.ts para saber se a conexão está de pé e para fechar sem deixar
    // temporizadores armados (ver encerrarConexao).
    /** 0 = sem conexão ... 4 = pronta (PDU negociado). */
    isoConnectionState: number;
    resetPending: boolean;
    resetTimeout: ReturnType<typeof setTimeout> | undefined;
    dropConnectionTimer: ReturnType<typeof setTimeout> | null;
    dropConnectionCallback: (() => void) | null;
    connectionCleanup(): void;
  }
}
