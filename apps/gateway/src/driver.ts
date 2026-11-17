// Interface comum das "fábricas" (ROTEIRO, seção 7). A api não sabe qual está do outro lado.

/** Variáveis de processo ao vivo (na bancada, lidas do DB MB_Simulador; só leitura). */
export type Processo = {
  /** °C no TQ-01 (TIT-104) */
  temperatura: number;
  /** L no TQ-02 (LIT-101) */
  nivel: number;
  /** bar no TQ-01 (PIT-103) */
  pressao: number;
  /** L/min no envase (FIT-102) */
  vazao: number;
};

export type ConfiguracaoDriver = {
  driver: 'simulado' | 's7';
  ip: string;
  rack: number;
  slot: number;
  /** Número do DB `MES`. */
  numeroDb: number;
  /** Número do DB `MB_Simulador` (variáveis de processo), se houver. */
  numeroDbProcesso: number | null;
  /** Só no simulado: quantas vezes o tempo corre mais rápido que na bancada. */
  escalaSimulador: number;
};

export type DbsEncontrados = { mes: number | null; processo: number | null };

export interface Driver {
  readonly tipo: ConfiguracaoDriver['driver'];
  conectar(): Promise<void>;
  desconectar(): Promise<void>;
  /** Lê o DB `MES` inteiro (TAMANHO_DB bytes a partir do byte 0) e, se houver, as variáveis de processo. */
  ler(): Promise<{ mes: Uint8Array; processo: Processo | null }>;
  /** Grava a área de escrita do MES (a partir do byte 0), num pedido só. */
  gravarEscrita(bytes: Uint8Array): Promise<void>;
  /** Procura os DBs pela assinatura. */
  procurarDbs(): Promise<DbsEncontrados>;
}
