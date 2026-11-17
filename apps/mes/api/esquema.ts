// Tabelas do MES (ROTEIRO, seção 9), na base "mes". Só o MES lê e escreve aqui; a Loja nem tem acesso a esta base.
// mes_ordem.numero nunca é reaproveitado (reiniciar a aula apaga com DELETE, não TRUNCATE): o CLP pode ainda
// ter no DB o número de uma OP antiga.

import { ALARME } from '@aupro/contrato-clp';
import { executar, linhas, type Banco } from '@aupro/servidor';

export const TABELAS_MES = [
  `CREATE TABLE IF NOT EXISTS mes_ordem (
    numero INT AUTO_INCREMENT PRIMARY KEY,
    origem VARCHAR(40) NULL,
    volume DOUBLE NOT NULL,
    temperatura DOUBLE NOT NULL,
    vazao DOUBLE NOT NULL,
    pressao DOUBLE NOT NULL,
    tol_temperatura DOUBLE NOT NULL,
    tol_volume DOUBLE NOT NULL,
    prazo DATETIME(3) NOT NULL,
    chegada DATETIME(3) NOT NULL,
    fixada INT NULL,
    estado VARCHAR(24) NOT NULL,
    antes_da_queda VARCHAR(24) NULL,
    recusa INT NULL, -- código de Resultado com que o CLP recusou a OP (tabela RECUSA do contrato)
    cancelar_ao_retirar TINYINT NOT NULL DEFAULT 0,
    enviada_em DATETIME(3) NULL,
    recebida_em DATETIME(3) NULL,
    concluida_em DATETIME(3) NULL,
    autor VARCHAR(80) NULL,
    INDEX (estado),
    INDEX idx_origem (origem)
  )`,
  `CREATE TABLE IF NOT EXISTS mes_batelada (
    numero_op INT PRIMARY KEY,
    resultado_op INT NOT NULL,
    volume DOUBLE NOT NULL,
    temperatura DOUBLE NOT NULL,
    t_pressurizar INT NOT NULL,
    t_aquecer INT NOT NULL,
    t_transferir INT NOT NULL,
    t_devolver INT NOT NULL,
    t_resfriar INT NOT NULL DEFAULT 0,
    dentro_tolerancia TINYINT NOT NULL,
    registrada_em DATETIME(3) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS mes_leitura (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    numero_op INT NOT NULL,
    horario DATETIME(3) NOT NULL,
    temperatura DOUBLE NOT NULL,
    nivel DOUBLE NOT NULL,
    pressao DOUBLE NOT NULL,
    vazao DOUBLE NOT NULL,
    INDEX (numero_op)
  )`,
  `CREATE TABLE IF NOT EXISTS mes_evento (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    horario DATETIME(3) NOT NULL,
    numero_op INT NULL,
    tipo VARCHAR(40) NOT NULL,
    detalhe VARCHAR(255) NULL,
    autor VARCHAR(80) NULL,
    INDEX (numero_op)
  )`,
  `CREATE TABLE IF NOT EXISTS mes_parada (
    id INT AUTO_INCREMENT PRIMARY KEY,
    inicio DATETIME(3) NOT NULL,
    fim DATETIME(3) NULL,
    motivo VARCHAR(40) NOT NULL,
    observacao VARCHAR(255) NULL,
    autor VARCHAR(80) NULL
  )`,
  `CREATE TABLE IF NOT EXISTS mes_inspecao (
    numero_op INT PRIMARY KEY,
    resultado VARCHAR(16) NOT NULL,
    observacao VARCHAR(255) NULL,
    autor VARCHAR(80) NULL,
    horario DATETIME(3) NOT NULL
  )`,
  // feed de mudanças para a Loja (GET /api/ordens/mudancas): o id é o cursor e nunca volta atrás (DELETE, não TRUNCATE)
  `CREATE TABLE IF NOT EXISTS mes_mudanca (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    horario DATETIME(3) NOT NULL,
    numero_op INT NOT NULL,
    origem VARCHAR(40) NULL,
    estado VARCHAR(24) NOT NULL
  )`,
];

/**
 * Colunas e índices que entraram depois de a tabela existir (o MySQL não tem ADD COLUMN IF NOT EXISTS): confere no
 * information_schema e só então acrescenta. Pode rodar a cada partida.
 */
export async function atualizarEsquema(banco: Banco): Promise<void> {
  const colunas = [
    { tabela: 'mes_batelada', coluna: 't_resfriar', definicao: 'INT NOT NULL DEFAULT 0 AFTER t_devolver' },
    { tabela: 'mes_ordem', coluna: 'recusa', definicao: 'INT NULL AFTER antes_da_queda' },
  ];
  for (const n of colunas) {
    const [{ existe }] = await linhas<{ existe: number }>(
      banco,
      'SELECT COUNT(*) AS existe FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      [n.tabela, n.coluna],
    );
    if (Number(existe) === 0) await executar(banco, `ALTER TABLE ${n.tabela} ADD COLUMN ${n.coluna} ${n.definicao}`);
  }
  // a emissão de ordens procura a OP mais recente da mesma origem (idempotência)
  const indices = [{ tabela: 'mes_ordem', indice: 'idx_origem', colunas: 'origem' }];
  for (const n of indices) {
    const [{ existe }] = await linhas<{ existe: number }>(
      banco,
      'SELECT COUNT(*) AS existe FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?',
      [n.tabela, n.indice],
    );
    if (Number(existe) === 0) await executar(banco, `ALTER TABLE ${n.tabela} ADD INDEX ${n.indice} (${n.colunas})`);
  }
}

/**
 * Motivos de parada apontados na tela da Bancada. Só os códigos: a tela traduz (`motivoParada.<código>`).
 * Há um motivo para cada intertravamento que o CLP publica em `Alarme` (MOTIVO_DO_ALARME).
 */
export const MOTIVOS_PARADA = [
  'emergencia',
  'falta_agua', // LSL do reservatório
  'psh103',
  'tsh104',
  'lsl104',
  'fsl102',
  'lsh101',
  'lsl101',
  'falta_ar', // PTT-106
  'falha_b1', // inversor FY-102
  'falha_m1', // inversor FY-105
  'troca_turno',
  'manutencao',
  'setup',
  'comunicacao',
  'outro',
] as const;
export type MotivoParada = (typeof MOTIVOS_PARADA)[number];

/** Código de `Alarme` (tabela ALARME do contrato do CLP) → motivo de parada que a tela sugere ao apontar. */
export const MOTIVO_DO_ALARME: { readonly [codigo: number]: MotivoParada } = {
  [ALARME.emergencia]: 'emergencia',
  [ALARME.pressaoAltaTq01]: 'psh103',
  [ALARME.temperaturaAltaTq01]: 'tsh104',
  [ALARME.nivelBaixoTq01]: 'lsl104',
  [ALARME.semVazaoB1]: 'fsl102',
  [ALARME.nivelBaixoReservatorio]: 'falta_agua',
  [ALARME.nivelAltoTq02]: 'lsh101',
  [ALARME.nivelBaixoTq02]: 'lsl101',
  [ALARME.faltaArInstrumento]: 'falta_ar',
  [ALARME.falhaInversorB1]: 'falha_b1',
  [ALARME.falhaInversorM1]: 'falha_m1',
};
