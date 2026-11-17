// Códigos de `Alarme` e de `Resultado` do DB `MES` (ROTEIRO, seção 6.3; decisão 9: PROPOSTA, a confirmar com o
// programa do CLP). É o único lugar com esses números: o simulador, o MES, a fonte do TIA e o manual saem daqui.
// Só constantes nomeadas: o texto de tela é da interface (pt, en, es), pela chave ou pelo código.

/**
 * `Alarme` (Word, byte 46): o intertravamento ATIVO na bancada; 0 = nenhum. Com mais de um ativo, o CLP publica o
 * de menor código (a tabela está em ordem de gravidade). Volta a 0 quando a condição some.
 * Cada código é um intertravamento do P&ID versão 2 ou uma entrada da folha 4 do projeto elétrico.
 */
export const ALARME = {
  nenhum: 0,
  /** Botão de emergência (%I1.4). */
  emergencia: 1,
  /** PSH-103: pressão alta no TQ-01 (3,8 bar). Desliga a B1. */
  pressaoAltaTq01: 2,
  /** TSH-104: temperatura alta no TQ-01. Desliga a resistência TZ-104. */
  temperaturaAltaTq01: 3,
  /** LSL-104: TQ-01 sem nível (resistência a seco). Desliga a TZ-104. */
  nivelBaixoTq01: 4,
  /** FSL-102: B1 ligada sem vazão. Desliga a B1. */
  semVazaoB1: 5,
  /** LSL do reservatório: falta água para a B1. Desliga a B1. */
  nivelBaixoReservatorio: 6,
  /** LSH-101: TQ-02 cheio. Fecha a FV-102. */
  nivelAltoTq02: 7,
  /** LSL-101: TQ-02 sem nível quando deveria ter produto (envase que não chega, descarga aberta). */
  nivelBaixoTq02: 8,
  /** PTT-106: falta de ar de instrumento (a FV-102 e a FV-105 não se mexem). */
  faltaArInstrumento: 9,
  /** FY-102: falha do inversor da bomba B1. */
  falhaInversorB1: 10,
  /** FY-105: falha do inversor do ventilador M1. */
  falhaInversorM1: 11,
} as const;

export type NomeAlarme = keyof typeof ALARME;

/**
 * `Resultado` (Int, byte 36) do pedido que o CLP pegou: 0 = aceito; > 0 = recusado, com o motivo.
 * Um campo só fora da faixa: o código do campo. Mais de um: `foraDaFaixa`.
 */
export const RECUSA = {
  aceito: 0,
  /** Receita fora das faixas (genérico, ou mais de um campo). */
  foraDaFaixa: 1,
  volumeForaDaFaixa: 2,
  temperaturaForaDaFaixa: 3,
  vazaoForaDaFaixa: 4,
  pressaoForaDaFaixa: 5,
  /** A bancada estava em falha (intertravamento ativo) quando o CLP pegou o pedido. */
  bancadaEmFalha: 6,
} as const;

export type NomeRecusa = keyof typeof RECUSA;

/** `Resultado` = 0 é aceito; > 0 é recusa (tabela `RECUSA`). */
export const RESULTADO_ACEITO = RECUSA.aceito;

function nomeDe<T extends Record<string, number>>(tabela: T, codigo: number): keyof T | null {
  for (const [nome, valor] of Object.entries(tabela)) if (valor === codigo) return nome;
  return null;
}

/** Nome do alarme (a chave de `ALARME`), ou null se o CLP publicou um código que a tabela não tem. */
export const nomeAlarme = (codigo: number): NomeAlarme | null => nomeDe(ALARME, codigo);

/** Nome do motivo de recusa (a chave de `RECUSA`), ou null se o código não está na tabela. */
export const nomeRecusa = (codigo: number): NomeRecusa | null => nomeDe(RECUSA, codigo);

/** Campo da receita → código de recusa quando só ele está fora da faixa. */
export const RECUSA_DO_CAMPO = {
  volume: RECUSA.volumeForaDaFaixa,
  temperatura: RECUSA.temperaturaForaDaFaixa,
  vazao: RECUSA.vazaoForaDaFaixa,
  pressao: RECUSA.pressaoForaDaFaixa,
} as const;

/** Código de recusa para os campos da receita fora da faixa (lista vazia = aceito). */
export function recusaPorFaixa(camposFora: readonly (keyof typeof RECUSA_DO_CAMPO)[]): number {
  const campos = [...new Set(camposFora)];
  if (campos.length === 0) return RECUSA.aceito;
  return campos.length === 1 ? RECUSA_DO_CAMPO[campos[0]] : RECUSA.foraDaFaixa;
}

// Comentários para a fonte do TIA (sem acento: a fonte é ASCII). Não são texto de tela.
const TIA_ALARME: { readonly [K in NomeAlarme]: string } = {
  nenhum: 'nenhum',
  emergencia: 'emergencia',
  pressaoAltaTq01: 'PSH-103 pressao alta TQ-01',
  temperaturaAltaTq01: 'TSH-104 temperatura alta TQ-01',
  nivelBaixoTq01: 'LSL-104 TQ-01 sem nivel',
  semVazaoB1: 'FSL-102 B1 sem vazao',
  nivelBaixoReservatorio: 'LSL reservatorio sem agua',
  nivelAltoTq02: 'LSH-101 TQ-02 cheio',
  nivelBaixoTq02: 'LSL-101 TQ-02 sem nivel',
  faltaArInstrumento: 'PTT-106 falta de ar de instrumento',
  falhaInversorB1: 'FY-102 falha do inversor da B1',
  falhaInversorM1: 'FY-105 falha do inversor do M1',
};

const TIA_RECUSA: { readonly [K in NomeRecusa]: string } = {
  aceito: 'aceito',
  foraDaFaixa: 'fora da faixa',
  volumeForaDaFaixa: 'volume fora da faixa',
  temperaturaForaDaFaixa: 'temperatura fora da faixa',
  vazaoForaDaFaixa: 'vazao fora da faixa',
  pressaoForaDaFaixa: 'pressao fora da faixa',
  bancadaEmFalha: 'bancada em falha',
};

const lista = <T extends Record<string, number>>(tabela: T, textos: { readonly [K in keyof T]: string }) =>
  (Object.keys(tabela) as (keyof T & string)[])
    .sort((a, b) => tabela[a] - tabela[b])
    .map((nome) => ({ codigo: tabela[nome], nome, tia: textos[nome] }));

/** A tabela de alarmes em ordem de código (para a fonte do TIA e a documentação). */
export const tabelaAlarmes = () => lista(ALARME, TIA_ALARME);

/** A tabela de recusas em ordem de código. */
export const tabelaRecusas = () => lista(RECUSA, TIA_RECUSA);
