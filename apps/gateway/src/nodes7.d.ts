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
    readAllItems(aoLer: (algumRuim: boolean, valores: Record<string, Valor>) => void): void;
    writeItems(itens: string | string[], valores: Valor | Valor[], aoGravar: (algumRuim: boolean) => void): number;
  }
}
