// Tabelas da Loja (ERP), na base "loja" (ROTEIRO, seção 9). Só a Loja lê e escreve aqui.
// O andamento da produção não fica copiado aqui: a Loja pergunta ao MES pelo contrato HTTP.

export const TABELAS_ERP = [
  `CREATE TABLE IF NOT EXISTS erp_produto (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(80) NOT NULL,
    descricao VARCHAR(255) NULL,
    preco DECIMAL(10,2) NOT NULL,
    volume DOUBLE NOT NULL,
    temperatura DOUBLE NOT NULL,
    vazao DOUBLE NOT NULL,
    pressao DOUBLE NOT NULL,
    tol_temperatura DOUBLE NOT NULL,
    tol_volume DOUBLE NOT NULL,
    sob_medida TINYINT NOT NULL DEFAULT 0,
    ativo TINYINT NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS erp_cliente (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(80) NOT NULL,
    email VARCHAR(120) NULL UNIQUE,
    turma VARCHAR(60) NULL
  )`,
  // bancos criados quando o e-mail era obrigatório: hoje o pedido só pede o nome (MODIFY pode rodar a cada partida)
  `ALTER TABLE erp_cliente MODIFY email VARCHAR(120) NULL`,
  `CREATE TABLE IF NOT EXISTS erp_pedido (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cliente_id INT NOT NULL,
    criado_em DATETIME(3) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS erp_item (
    id INT AUTO_INCREMENT PRIMARY KEY,
    pedido_id INT NOT NULL,
    produto_id INT NOT NULL,
    nome_produto VARCHAR(80) NOT NULL,
    preco DECIMAL(10,2) NOT NULL,
    volume DOUBLE NOT NULL,
    temperatura DOUBLE NOT NULL,
    vazao DOUBLE NOT NULL,
    pressao DOUBLE NOT NULL,
    tol_temperatura DOUBLE NOT NULL,
    tol_volume DOUBLE NOT NULL,
    prazo DATETIME(3) NULL,
    numero_op INT NULL,
    INDEX (pedido_id),
    INDEX (numero_op)
  )`,
  `CREATE TABLE IF NOT EXISTS erp_fatura (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_id INT NOT NULL UNIQUE,
    numero_op INT NOT NULL,
    valor DECIMAL(10,2) NOT NULL,
    emitida_em DATETIME(3) NOT NULL
  )`,
  // onde a Loja parou no feed de mudanças do MES (mudancas.ts)
  `CREATE TABLE IF NOT EXISTS erp_integracao (
    id TINYINT PRIMARY KEY,
    cursor_mes BIGINT NOT NULL DEFAULT 0
  )`,
  `INSERT IGNORE INTO erp_integracao (id) VALUES (1)`,
];

/** Catálogo sugerido (ROTEIRO, seção 2); o professor edita. */
export const CATALOGO_INICIAL = [
  { nome: 'Morna 10 L', descricao: 'Água morna para o dia a dia.', preco: 10, volume: 10, temperatura: 45, vazao: 4, pressao: 2, sobMedida: false },
  { nome: 'Quente 15 L', descricao: 'Água quente, lote maior.', preco: 18, volume: 15, temperatura: 65, vazao: 4, pressao: 2, sobMedida: false },
  { nome: 'Envase lento 8 L', descricao: 'Envase a 2 L/min: mostra o efeito da vazão no tempo de ciclo.', preco: 12, volume: 8, temperatura: 55, vazao: 2, pressao: 2, sobMedida: false },
  { nome: 'Sob medida', descricao: 'Você escolhe volume e temperatura dentro das faixas da bancada.', preco: 20, volume: 10, temperatura: 50, vazao: 4, pressao: 2, sobMedida: true },
];
