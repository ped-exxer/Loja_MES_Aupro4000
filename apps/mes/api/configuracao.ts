// Configuração da bancada (uma linha só: um MES por bancada) e início da aula. Fica na base do MES.

import { executar, linhas, type Banco } from '@aupro/servidor';
import type { ConfiguracaoGateway } from './cliente-gateway.ts';

export const TABELAS_CONFIGURACAO = [
  `CREATE TABLE IF NOT EXISTS configuracao (
    id TINYINT PRIMARY KEY,
    driver VARCHAR(16) NOT NULL DEFAULT 'simulado',
    ip VARCHAR(64) NOT NULL DEFAULT '192.168.0.1',
    rack INT NOT NULL DEFAULT 0,
    slot INT NOT NULL DEFAULT 1,
    numero_db INT NOT NULL DEFAULT 1,
    numero_db_processo INT NULL,
    escala_simulador DOUBLE NOT NULL DEFAULT 20,
    margem_prazo_min INT NOT NULL DEFAULT 5,
    inspecao_automatica TINYINT NOT NULL DEFAULT 0, -- sem uso: a inspeção é sempre automática
    inicio_aula DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  )`,
  `INSERT IGNORE INTO configuracao (id) VALUES (1)`,
];

export type Configuracao = ConfiguracaoGateway & {
  margemPrazoMin: number;
  inicioAula: number;
};

type LinhaConfiguracao = {
  driver: 'simulado' | 's7';
  ip: string;
  rack: number;
  slot: number;
  numero_db: number;
  numero_db_processo: number | null;
  escala_simulador: number;
  margem_prazo_min: number;
  inicio_aula: Date;
};

export async function lerConfiguracao(banco: Banco): Promise<Configuracao> {
  const [l] = await linhas<LinhaConfiguracao>(banco, 'SELECT * FROM configuracao WHERE id = 1');
  return {
    driver: l.driver,
    ip: l.ip,
    rack: l.rack,
    slot: l.slot,
    numeroDb: l.numero_db,
    numeroDbProcesso: l.numero_db_processo,
    escalaSimulador: l.escala_simulador,
    margemPrazoMin: l.margem_prazo_min,
    inicioAula: l.inicio_aula.getTime(),
  };
}

export type ErroConfiguracao = { campo: string; codigo: 'invalido' };

/** Valida e normaliza o que veio da tela de Configuração. */
export function validarConfiguracao(c: Partial<Configuracao>): { ok: true; valor: Omit<Configuracao, 'inicioAula'> } | { ok: false; erros: ErroConfiguracao[] } {
  const erros: ErroConfiguracao[] = [];
  const inteiro = (campo: string, v: unknown, min: number, max: number) => {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) erros.push({ campo, codigo: 'invalido' });
  };
  if (c.driver !== 'simulado' && c.driver !== 's7') erros.push({ campo: 'driver', codigo: 'invalido' });
  if (typeof c.ip !== 'string' || !/^\d{1,3}(\.\d{1,3}){3}$/.test(c.ip)) erros.push({ campo: 'ip', codigo: 'invalido' });
  inteiro('rack', c.rack, 0, 7);
  inteiro('slot', c.slot, 0, 31);
  inteiro('numeroDb', c.numeroDb, 1, 59999);
  if (c.numeroDbProcesso !== null) inteiro('numeroDbProcesso', c.numeroDbProcesso, 1, 59999);
  if (typeof c.escalaSimulador !== 'number' || !(c.escalaSimulador >= 1 && c.escalaSimulador <= 1000)) {
    erros.push({ campo: 'escalaSimulador', codigo: 'invalido' });
  }
  inteiro('margemPrazoMin', c.margemPrazoMin, 0, 24 * 60);
  if (erros.length > 0) return { ok: false, erros };
  return { ok: true, valor: c as Omit<Configuracao, 'inicioAula'> };
}

export async function salvarConfiguracao(banco: Banco, c: Omit<Configuracao, 'inicioAula'>): Promise<void> {
  await executar(
    banco,
    `UPDATE configuracao SET driver = ?, ip = ?, rack = ?, slot = ?, numero_db = ?, numero_db_processo = ?,
       escala_simulador = ?, margem_prazo_min = ? WHERE id = 1`,
    [c.driver, c.ip, c.rack, c.slot, c.numeroDb, c.numeroDbProcesso, c.escalaSimulador, c.margemPrazoMin],
  );
}

export async function marcarInicioAula(banco: Banco): Promise<void> {
  await executar(banco, 'UPDATE configuracao SET inicio_aula = CURRENT_TIMESTAMP(3) WHERE id = 1');
}

export function paraGateway(c: Configuracao | Omit<Configuracao, 'inicioAula'>): ConfiguracaoGateway {
  return {
    driver: c.driver, ip: c.ip, rack: c.rack, slot: c.slot, numeroDb: c.numeroDb,
    numeroDbProcesso: c.numeroDbProcesso, escalaSimulador: c.escalaSimulador,
  };
}

/** Quantas vezes o tempo corre mais rápido que na bancada (só no simulado). */
export function escalaEfetiva(c: Configuracao): number {
  return c.driver === 'simulado' ? c.escalaSimulador : 1;
}
