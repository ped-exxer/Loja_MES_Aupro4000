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
/** Área escrita pelo CLP e lida pelo MES (bytes 32–95; 90–95 reservados para crescer). */
export const AREA_LEITURA: Area = { inicio: 32, tamanho: 64 };
/** Assinatura que identifica o DB `MES` (bytes 96–101), depois da área do CLP. */
export const AREA_ASSINATURA: Area = { inicio: 96, tamanho: 6 };
/** Tamanho mínimo do DB. */
export const TAMANHO_DB = 102;

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
  /** Do pedido recebido: 0 aceito, > 0 recusado (tabela RECUSA, em codigos.ts). */
  Resultado: { byte: 36, tipo: 'Int' },
  Estado: { byte: 38, tipo: 'Int' },
  Etapa: { byte: 40, tipo: 'Int' },
  OpExecucao: { byte: 42, tipo: 'DInt' },
  /** Intertravamento ativo; 0 = nenhum (tabela ALARME, em codigos.ts). */
  Alarme: { byte: 46, tipo: 'Word' },
  /** Última OP que terminou; os campos seguintes são dela. */
  OpConcluida: { byte: 48, tipo: 'DInt' },
  ResultadoOp: { byte: 52, tipo: 'Int' },
  /** L no TQ-02 (LIT-101) no fim da transferência. */
  VolumeProduzido: { byte: 54, tipo: 'Real' },
  /** °C no TQ-02 (TE-105a) no fim da transferência. */
  TemperaturaProduto: { byte: 58, tipo: 'Real' },
  TempoPressurizar: { byte: 62, tipo: 'DInt' },
  /** ms aquecendo (soma das rodadas). */
  TempoAquecer: { byte: 66, tipo: 'DInt' },
  /** ms transferindo (soma das rodadas). */
  TempoTransferir: { byte: 70, tipo: 'DInt' },
  TempoDevolver: { byte: 74, tipo: 'DInt' },
  /** ms resfriando pelo trocador (soma das rodadas; 0 se não precisou). */
  TempoResfriar: { byte: 78, tipo: 'DInt' },
  // Ao vivo, escritos pelo CLP a cada ciclo (não existem no DB MB_Simulador):
  /** °C da água no TQ-02, o produto pronto (TE-105a). */
  TemperaturaTq02: { byte: 82, tipo: 'Real' },
  /** °C da água do reservatório (TE-105b). */
  TemperaturaReservatorio: { byte: 86, tipo: 'Real' },
  // 90–95 reservado
} as const satisfies Record<string, Campo>;

export const CAMPOS_ASSINATURA = {
  Assinatura: { byte: 96, tipo: 'Word' },
  AssinaturaValor: { byte: 98, tipo: 'Real' },
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
  /** Recircular o TQ-01 pelo trocador (FV-105, M1) até baixar à temperatura do pedido. */
  resfriar: 6,
} as const;

/** `ResultadoOp` da OP concluída. */
export const RESULTADO_OP = { concluida: 1, abortada: 2 } as const;

/** Sem mudança em `VidaClp` por este tempo: comunicação perdida (seção 6.4). */
export const TEMPO_VIDA_MS = 5000;

export type ValoresEscrita = { -readonly [K in keyof typeof CAMPOS_ESCRITA]: number };
export type ValoresLeitura = { -readonly [K in keyof typeof CAMPOS_LEITURA]: number };
