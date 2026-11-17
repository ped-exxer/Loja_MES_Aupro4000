// Acesso às tabelas do MES. Só SQL; as regras ficam no núcleo e em packages/dominio.

import type { EstadoComCLP, EstadoOp, Receita, SituacaoOp, Tolerancias } from '@loja/dominio';
import { executar, linhas, type Conexao } from '../../banco.ts';

export type Ordem = {
  numero: number;
  origem: string | null;
  receita: Receita;
  tolerancias: Tolerancias;
  prazo: number;
  chegada: number;
  fixada: number | null;
  situacao: SituacaoOp;
  cancelarAoRetirar: boolean;
  enviadaEm: number | null;
  recebidaEm: number | null;
  concluidaEm: number | null;
  autor: string | null;
};

type LinhaOrdem = {
  numero: number;
  origem: string | null;
  volume: number;
  temperatura: number;
  vazao: number;
  pressao: number;
  tol_temperatura: number;
  tol_volume: number;
  prazo: Date;
  chegada: Date;
  fixada: number | null;
  estado: EstadoOp;
  antes_da_queda: EstadoComCLP | null;
  cancelar_ao_retirar: number;
  enviada_em: Date | null;
  recebida_em: Date | null;
  concluida_em: Date | null;
  autor: string | null;
};

const ms = (d: Date | null) => (d ? d.getTime() : null);

function ordemDe(l: LinhaOrdem): Ordem {
  return {
    numero: l.numero,
    origem: l.origem,
    receita: { volume: l.volume, temperatura: l.temperatura, vazao: l.vazao, pressao: l.pressao },
    tolerancias: { temperatura: l.tol_temperatura, volume: l.tol_volume },
    prazo: l.prazo.getTime(),
    chegada: l.chegada.getTime(),
    fixada: l.fixada,
    situacao:
      l.estado === 'comunicacao_perdida'
        ? { estado: 'comunicacao_perdida', antesDaQueda: l.antes_da_queda ?? 'em_producao' }
        : { estado: l.estado },
    cancelarAoRetirar: l.cancelar_ao_retirar === 1,
    enviadaEm: ms(l.enviada_em),
    recebidaEm: ms(l.recebida_em),
    concluidaEm: ms(l.concluida_em),
    autor: l.autor,
  };
}

export async function inserirOrdem(
  c: Conexao,
  o: { origem: string | null; receita: Receita; tolerancias: Tolerancias; prazo: number; autor: string | null },
): Promise<number> {
  const r = await executar(
    c,
    `INSERT INTO mes_ordem (origem, volume, temperatura, vazao, pressao, tol_temperatura, tol_volume, prazo, chegada, estado, autor)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3), 'na_fila', ?)`,
    [o.origem, o.receita.volume, o.receita.temperatura, o.receita.vazao, o.receita.pressao,
      o.tolerancias.temperatura, o.tolerancias.volume, new Date(o.prazo), o.autor],
  );
  return r.insertId;
}

export async function buscarOrdem(c: Conexao, numero: number): Promise<Ordem | null> {
  const [l] = await linhas<LinhaOrdem>(c, 'SELECT * FROM mes_ordem WHERE numero = ?', [numero]);
  return l ? ordemDe(l) : null;
}

export async function listarOrdens(c: Conexao, estados?: readonly EstadoOp[]): Promise<Ordem[]> {
  const r = estados
    ? await linhas<LinhaOrdem>(c, 'SELECT * FROM mes_ordem WHERE estado IN (?) ORDER BY numero', [estados])
    : await linhas<LinhaOrdem>(c, 'SELECT * FROM mes_ordem ORDER BY numero');
  return r.map(ordemDe);
}

export async function buscarOrdens(c: Conexao, numeros: readonly number[]): Promise<Ordem[]> {
  if (numeros.length === 0) return [];
  return (await linhas<LinhaOrdem>(c, 'SELECT * FROM mes_ordem WHERE numero IN (?)', [numeros])).map(ordemDe);
}

/** Grava o novo estado e marca o horário das passagens importantes. */
export async function salvarSituacao(c: Conexao, numero: number, s: SituacaoOp): Promise<void> {
  const marca =
    s.estado === 'enviada' ? ', enviada_em = CURRENT_TIMESTAMP(3)'
    : s.estado === 'em_producao' ? ', recebida_em = COALESCE(recebida_em, CURRENT_TIMESTAMP(3))'
    : s.estado === 'produzida' || s.estado === 'abortada' ? ', concluida_em = CURRENT_TIMESTAMP(3)'
    : s.estado === 'na_fila' ? ', enviada_em = NULL'
    : '';
  await executar(c, `UPDATE mes_ordem SET estado = ?, antes_da_queda = ?${marca} WHERE numero = ?`, [
    s.estado, s.estado === 'comunicacao_perdida' ? s.antesDaQueda : null, numero,
  ]);
}

export async function marcarCancelarAoRetirar(c: Conexao, numero: number): Promise<void> {
  await executar(c, 'UPDATE mes_ordem SET cancelar_ao_retirar = 1 WHERE numero = ?', [numero]);
}

export async function fixarOrdem(c: Conexao, numero: number, posicao: number | null): Promise<void> {
  await executar(c, 'UPDATE mes_ordem SET fixada = ? WHERE numero = ?', [posicao, numero]);
}

export async function registrarEvento(
  c: Conexao,
  e: { numeroOp: number | null; tipo: string; detalhe?: string | null; autor?: string | null },
): Promise<void> {
  await executar(c, 'INSERT INTO mes_evento (horario, numero_op, tipo, detalhe, autor) VALUES (CURRENT_TIMESTAMP(3), ?, ?, ?, ?)', [
    e.numeroOp, e.tipo, e.detalhe ?? null, e.autor ?? null,
  ]);
}

export type Evento = { horario: number; numeroOp: number | null; tipo: string; detalhe: string | null; autor: string | null };

export async function eventos(c: Conexao, numeroOp?: number, limite = 200): Promise<Evento[]> {
  const r = await linhas<{ horario: Date; numero_op: number | null; tipo: string; detalhe: string | null; autor: string | null }>(
    c,
    numeroOp === undefined
      ? 'SELECT * FROM mes_evento ORDER BY id DESC LIMIT ?'
      : 'SELECT * FROM mes_evento WHERE numero_op = ? ORDER BY id LIMIT ?',
    numeroOp === undefined ? [limite] : [numeroOp, limite],
  );
  return r.map((l) => ({ horario: l.horario.getTime(), numeroOp: l.numero_op, tipo: l.tipo, detalhe: l.detalhe, autor: l.autor }));
}

export type Batelada = {
  numeroOp: number;
  resultadoOp: number;
  volume: number;
  temperatura: number;
  tempos: { pressurizar: number; aquecer: number; transferir: number; devolver: number };
  dentroTolerancia: boolean;
  registradaEm: number;
};

type LinhaBatelada = {
  numero_op: number; resultado_op: number; volume: number; temperatura: number;
  t_pressurizar: number; t_aquecer: number; t_transferir: number; t_devolver: number;
  dentro_tolerancia: number; registrada_em: Date;
};

function bateladaDe(l: LinhaBatelada): Batelada {
  return {
    numeroOp: l.numero_op,
    resultadoOp: l.resultado_op,
    volume: l.volume,
    temperatura: l.temperatura,
    tempos: { pressurizar: l.t_pressurizar, aquecer: l.t_aquecer, transferir: l.t_transferir, devolver: l.t_devolver },
    dentroTolerancia: l.dentro_tolerancia === 1,
    registradaEm: l.registrada_em.getTime(),
  };
}

export async function inserirBatelada(c: Conexao, b: Omit<Batelada, 'registradaEm'>): Promise<void> {
  await executar(
    c,
    `INSERT IGNORE INTO mes_batelada (numero_op, resultado_op, volume, temperatura, t_pressurizar, t_aquecer, t_transferir,
       t_devolver, dentro_tolerancia, registrada_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3))`,
    [b.numeroOp, b.resultadoOp, b.volume, b.temperatura, b.tempos.pressurizar, b.tempos.aquecer, b.tempos.transferir,
      b.tempos.devolver, b.dentroTolerancia ? 1 : 0],
  );
}

export async function buscarBatelada(c: Conexao, numeroOp: number): Promise<Batelada | null> {
  const [l] = await linhas<LinhaBatelada>(c, 'SELECT * FROM mes_batelada WHERE numero_op = ?', [numeroOp]);
  return l ? bateladaDe(l) : null;
}

export async function bateladasDesde(c: Conexao, desde: number): Promise<Batelada[]> {
  return (await linhas<LinhaBatelada>(c, 'SELECT * FROM mes_batelada WHERE registrada_em >= ? ORDER BY registrada_em', [new Date(desde)]))
    .map(bateladaDe);
}

export async function ultimaBatelada(c: Conexao): Promise<Batelada | null> {
  const [l] = await linhas<LinhaBatelada>(c, 'SELECT * FROM mes_batelada ORDER BY registrada_em DESC LIMIT 1');
  return l ? bateladaDe(l) : null;
}

export type Amostra = { horario: number; temperatura: number; nivel: number; pressao: number; vazao: number };

export async function inserirLeitura(c: Conexao, numeroOp: number, a: Omit<Amostra, 'horario'>): Promise<void> {
  await executar(
    c,
    'INSERT INTO mes_leitura (numero_op, horario, temperatura, nivel, pressao, vazao) VALUES (?, CURRENT_TIMESTAMP(3), ?, ?, ?, ?)',
    [numeroOp, a.temperatura, a.nivel, a.pressao, a.vazao],
  );
}

export async function leituras(c: Conexao, numeroOp: number): Promise<Amostra[]> {
  const r = await linhas<{ horario: Date; temperatura: number; nivel: number; pressao: number; vazao: number }>(
    c, 'SELECT horario, temperatura, nivel, pressao, vazao FROM mes_leitura WHERE numero_op = ? ORDER BY id', [numeroOp],
  );
  return r.map((l) => ({ ...l, horario: l.horario.getTime() }));
}

export type Parada = { id: number; inicio: number; fim: number | null; motivo: string; observacao: string | null; autor: string | null };

export async function paradas(c: Conexao, desde = 0): Promise<Parada[]> {
  const r = await linhas<{ id: number; inicio: Date; fim: Date | null; motivo: string; observacao: string | null; autor: string | null }>(
    c, 'SELECT * FROM mes_parada WHERE fim IS NULL OR fim >= ? ORDER BY inicio DESC', [new Date(desde)],
  );
  return r.map((l) => ({ ...l, inicio: l.inicio.getTime(), fim: ms(l.fim) }));
}

export async function abrirParada(c: Conexao, p: { motivo: string; observacao: string | null; autor: string | null }): Promise<number> {
  const r = await executar(c, 'INSERT INTO mes_parada (inicio, motivo, observacao, autor) VALUES (CURRENT_TIMESTAMP(3), ?, ?, ?)', [
    p.motivo, p.observacao, p.autor,
  ]);
  return r.insertId;
}

export async function encerrarParada(c: Conexao, id: number): Promise<boolean> {
  const r = await executar(c, 'UPDATE mes_parada SET fim = CURRENT_TIMESTAMP(3) WHERE id = ? AND fim IS NULL', [id]);
  return r.affectedRows === 1;
}

export type Inspecao = { numeroOp: number; resultado: 'aprovada' | 'reprovada'; observacao: string | null; autor: string | null; horario: number };

export async function inserirInspecao(c: Conexao, i: Omit<Inspecao, 'horario'>): Promise<void> {
  await executar(c, 'INSERT INTO mes_inspecao (numero_op, resultado, observacao, autor, horario) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP(3))', [
    i.numeroOp, i.resultado, i.observacao, i.autor,
  ]);
}

export async function buscarInspecao(c: Conexao, numeroOp: number): Promise<Inspecao | null> {
  const [l] = await linhas<{ numero_op: number; resultado: 'aprovada' | 'reprovada'; observacao: string | null; autor: string | null; horario: Date }>(
    c, 'SELECT * FROM mes_inspecao WHERE numero_op = ?', [numeroOp],
  );
  return l ? { numeroOp: l.numero_op, resultado: l.resultado, observacao: l.observacao, autor: l.autor, horario: l.horario.getTime() } : null;
}

export async function apagarTudo(c: Conexao): Promise<void> {
  for (const t of ['mes_leitura', 'mes_evento', 'mes_batelada', 'mes_inspecao', 'mes_parada', 'mes_ordem']) {
    await executar(c, `DELETE FROM ${t}`);
  }
}
