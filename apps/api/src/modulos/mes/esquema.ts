// Tabelas do MES (ROTEIRO, seção 9). Só o módulo MES lê e escreve aqui.
// mes_ordem.numero nunca é reaproveitado (reiniciar a aula apaga com DELETE, não TRUNCATE): o CLP pode ainda
// ter no DB o número de uma OP antiga.

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
];

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
