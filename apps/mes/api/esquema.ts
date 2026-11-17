// Tabelas do MES (ROTEIRO, seção 9), na base "mes". Só o MES lê e escreve aqui; a Loja nem tem acesso a esta base.
// mes_ordem.numero nunca é reaproveitado (reiniciar a aula apaga com DELETE, não TRUNCATE): o CLP pode ainda
// ter no DB o número de uma OP antiga.

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
    cancelar_ao_retirar TINYINT NOT NULL DEFAULT 0,
    enviada_em DATETIME(3) NULL,
    recebida_em DATETIME(3) NULL,
    concluida_em DATETIME(3) NULL,
    autor VARCHAR(80) NULL,
    INDEX (estado)
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
 * Colunas que entraram depois de a tabela existir (o MySQL não tem ADD COLUMN IF NOT EXISTS): confere no
 * information_schema e só então acrescenta. Pode rodar a cada partida.
 */
export async function atualizarEsquema(banco: Banco): Promise<void> {
  const novas = [{ tabela: 'mes_batelada', coluna: 't_resfriar', definicao: 'INT NOT NULL DEFAULT 0 AFTER t_devolver' }];
  for (const n of novas) {
    const [{ existe }] = await linhas<{ existe: number }>(
      banco,
      'SELECT COUNT(*) AS existe FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      [n.tabela, n.coluna],
    );
    if (Number(existe) === 0) await executar(banco, `ALTER TABLE ${n.tabela} ADD COLUMN ${n.coluna} ${n.definicao}`);
  }
}

export const MOTIVOS_PARADA = [
  'emergencia',
  'falta_agua',
  'psh103',
  'troca_turno',
  'manutencao',
  'setup',
  'comunicacao',
  'outro',
] as const;
export type MotivoParada = (typeof MOTIVOS_PARADA)[number];
