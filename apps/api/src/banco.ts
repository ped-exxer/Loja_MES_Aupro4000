// MySQL. Cada módulo declara as próprias tabelas (ERP: erp_*, MES: mes_*); um não lê as tabelas do outro.

import mysql, { type Pool, type PoolConnection, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';

export type Banco = Pool;
export type Conexao = Pool | PoolConnection;
export type Linha = RowDataPacket;
export type ResultadoEscrita = ResultSetHeader;

export function criarBanco(): Banco {
  return mysql.createPool({
    host: process.env.BANCO_HOST ?? 'localhost',
    port: Number(process.env.BANCO_PORTA ?? 3306),
    user: process.env.BANCO_USUARIO ?? 'loja',
    password: process.env.BANCO_SENHA ?? 'loja',
    database: process.env.BANCO_NOME ?? 'loja',
    connectionLimit: 10,
    timezone: 'Z',
    decimalNumbers: true,
  });
}

/** Espera o banco aceitar conexões (o contêiner do MySQL demora a subir). */
export async function esperarBanco(banco: Banco, tentativas = 60): Promise<void> {
  for (let i = 1; ; i++) {
    try {
      await banco.query('SELECT 1');
      return;
    } catch (erro) {
      if (i >= tentativas) throw erro;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

/** Cria as tabelas que não existem. Sem migrações versionadas: o esquema só cresce. */
export async function criarTabelas(banco: Banco, comandos: readonly string[]): Promise<void> {
  for (const sql of comandos) await banco.query(sql);
}

export async function emTransacao<T>(banco: Banco, fn: (c: PoolConnection) => Promise<T>): Promise<T> {
  const c = await banco.getConnection();
  try {
    await c.beginTransaction();
    const r = await fn(c);
    await c.commit();
    return r;
  } catch (erro) {
    await c.rollback();
    throw erro;
  } finally {
    c.release();
  }
}

export async function linhas<T>(c: Conexao, sql: string, valores: unknown[] = []): Promise<T[]> {
  const [r] = await c.query<Linha[]>(sql, valores);
  return r as unknown as T[];
}

export async function executar(c: Conexao, sql: string, valores: unknown[] = []): Promise<ResultadoEscrita> {
  const [r] = await c.query<ResultadoEscrita>(sql, valores);
  return r;
}
