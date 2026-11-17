// Layout do DB `MES` no S7-1200 (ROTEIRO, seção 6.3). É o ÚNICO lugar com deslocamentos de byte:
// ninguém repete esses números fora deste pacote.
// DB sem "Optimized block access", tudo big-endian. O número do DB vem da tela de Configuração.

export type TipoS7 = 'Word' | 'Int' | 'DInt' | 'Real';

export const TAMANHO_TIPO: { readonly [T in TipoS7]: number } = { Word: 2, Int: 2, DInt: 4, Real: 4 };

/** `byte` é o deslocamento absoluto no DB. */
export type Campo = { readonly byte: number; readonly tipo: TipoS7 };

export type Area = { readonly inicio: number; readonly tamanho: number };

/** Área que o MES escreve, num pedido só: o próximo pedido disponível. */
export const AREA_ESCRITA: Area = { inicio: 0, tamanho: 24 };
/** Área escrita pelo CLP e lida pelo MES. */
export const AREA_LEITURA: Area = { inicio: 32, tamanho: 48 };
/** Assinatura que identifica o DB `MES`. */
export const AREA_ASSINATURA: Area = { inicio: 80, tamanho: 6 };
/** Tamanho mínimo do DB. */
export const TAMANHO_DB = 86;

export const CAMPOS_ESCRITA = {
  VidaMes: { byte: 0, tipo: 'Word' },
  /** O MES soma 1 cada vez que troca o pedido disponível. */
  SeqPedido: { byte: 2, tipo: 'Word' },
  /** OP disponível; 0 = nenhum pedido (ver NENHUM_PEDIDO). */
  NumeroOp: { byte: 4, tipo: 'DInt' },
  SpVolume: { byte: 8, tipo: 'Real' },
  SpTemperatura: { byte: 12, tipo: 'Real' },
  SpVazao: { byte: 16, tipo: 'Real' },
  SpPressao: { byte: 20, tipo: 'Real' },
} as const satisfies Record<string, Campo>;

export const CAMPOS_LEITURA = {
  VidaClp: { byte: 32, tipo: 'Word' },
  /** SeqPedido do último pedido que o CLP recebeu (pegou para produzir). */
  EcoSeq: { byte: 34, tipo: 'Word' },
  /** Do pedido recebido: 0 aceito, > 0 recusado. */
  Resultado: { byte: 36, tipo: 'Int' },
  Estado: { byte: 38, tipo: 'Int' },
  Etapa: { byte: 40, tipo: 'Int' },
  OpExecucao: { byte: 42, tipo: 'DInt' },
  Alarme: { byte: 46, tipo: 'Word' },
  /** Última OP que terminou; os campos seguintes são dela. */
  OpConcluida: { byte: 48, tipo: 'DInt' },
  ResultadoOp: { byte: 52, tipo: 'Int' },
  VolumeProduzido: { byte: 54, tipo: 'Real' },
  TemperaturaProduto: { byte: 58, tipo: 'Real' },
  TempoPressurizar: { byte: 62, tipo: 'DInt' },
  TempoAquecer: { byte: 66, tipo: 'DInt' },
  TempoTransferir: { byte: 70, tipo: 'DInt' },
  TempoDevolver: { byte: 74, tipo: 'DInt' },
  // 78–79 reservado
} as const satisfies Record<string, Campo>;

export const CAMPOS_ASSINATURA = {
  Assinatura: { byte: 80, tipo: 'Word' },
  AssinaturaValor: { byte: 82, tipo: 'Real' },
} as const satisfies Record<string, Campo>;

export const VALORES_ASSINATURA = { Assinatura: 0x4d45, AssinaturaValor: 4000.75 } as const;

/** `NumeroOp` = 0: nenhum pedido disponível. */
export const NENHUM_PEDIDO = 0;

/** Estado informado pelo CLP (só informativo: o MES não comanda a bancada). */
export const ESTADO_CLP = {
  ocioso: 0,
  emProducao: 1,
  parada: 2,
  emFalha: 3,
} as const;

/** Etapa informada pelo CLP (só informativo). */
export const ETAPA = {
  nenhuma: 0,
  pressurizar: 1,
  aquecer: 2,
  transferir: 3,
  aguardar: 4,
  devolver: 5,
} as const;

/** `Resultado` = 0 é aceito; > 0 é recusa (os motivos ficam com o programa do CLP). */
export const RESULTADO_ACEITO = 0;

/** `ResultadoOp` da OP concluída. */
export const RESULTADO_OP = { concluida: 1, abortada: 2 } as const;

/** Sem mudança em `VidaClp` por este tempo: comunicação perdida (seção 6.4). */
export const TEMPO_VIDA_MS = 5000;

export type ValoresEscrita = { -readonly [K in keyof typeof CAMPOS_ESCRITA]: number };
export type ValoresLeitura = { -readonly [K in keyof typeof CAMPOS_LEITURA]: number };
