// Acesso às tabelas do MES. Só SQL; as regras ficam no núcleo e em packages/dominio.

import type {
  Amostra, Batelada, EstadoComCLP, EstadoOp, Evento, Inspecao, Mudanca, Ordem, Receita, SituacaoOp, Tolerancias,
} from '@aupro/dominio';
import { executar, linhas, type Conexao } from '@aupro/servidor';

// os formatos são os do contrato com a Loja (packages/dominio/src/integracao.ts)
export type { Amostra, Batelada, Evento, Inspecao, Mudanca, Ordem };

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
  recusa: number | null;
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
    recusa: l.recusa ?? null,
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

/** Todas as ordens nesses estados, em ordem de número. Para os estados em que a lista é curta (a fila, as com o CLP). */
export async function listarOrdens(c: Conexao, estados: readonly EstadoOp[]): Promise<Ordem[]> {
  if (estados.length === 0) return [];
  return (await linhas<LinhaOrdem>(c, 'SELECT * FROM mes_ordem WHERE estado IN (?) ORDER BY numero', [estados])).map(ordemDe);
}

/** As ordens mais recentes primeiro, uma página por vez (a lista de todas as ordens cresce sem fim). */
export async function listarOrdensRecentes(
  c: Conexao,
  p: { estados?: readonly string[]; limite: number; antes: number | null },
): Promise<Ordem[]> {
  const filtros: string[] = [];
  const valores: unknown[] = [];
  if (p.estados && p.estados.length > 0) {
    filtros.push('estado IN (?)');
    valores.push(p.estados);
  }
  if (p.antes !== null) {
    filtros.push('numero < ?');
    valores.push(p.antes);
  }
  const onde = filtros.length > 0 ? `WHERE ${filtros.join(' AND ')}` : '';
  return (await linhas<LinhaOrdem>(c, `SELECT * FROM mes_ordem ${onde} ORDER BY numero DESC LIMIT ?`, [...valores, p.limite])).map(ordemDe);
}

/** As ordens que chegaram desde `desde` (relatório da aula), em ordem de número. */
export async function ordensDesde(c: Conexao, desde: number): Promise<Ordem[]> {
  return (await linhas<LinhaOrdem>(c, 'SELECT * FROM mes_ordem WHERE chegada >= ? ORDER BY numero', [new Date(desde)])).map(ordemDe);
}

/** A OP mais recente com esta origem (a emissão é idempotente pela origem). */
export async function ultimaOrdemDaOrigem(c: Conexao, origem: string): Promise<Ordem | null> {
  const [l] = await linhas<LinhaOrdem>(c, 'SELECT * FROM mes_ordem WHERE origem = ? ORDER BY numero DESC LIMIT 1', [origem]);
  return l ? ordemDe(l) : null;
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

/** Guarda o código de `Resultado` com que o CLP recusou a OP. */
export async function marcarRecusa(c: Conexao, numero: number, codigo: number): Promise<void> {
  await executar(c, 'UPDATE mes_ordem SET recusa = ? WHERE numero = ?', [codigo, numero]);
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

/** O último registro de começo ou de fim de alarme (para o despacho saber se há um alarme já registrado como ativo). */
export async function ultimoEventoDeAlarme(c: Conexao): Promise<{ tipo: string; detalhe: string | null } | null> {
  const [l] = await linhas<{ tipo: string; detalhe: string | null }>(
    c, "SELECT tipo, detalhe FROM mes_evento WHERE tipo IN ('alarme', 'alarme_fim') ORDER BY id DESC LIMIT 1",
  );
  return l ?? null;
}

type LinhaEvento = { id: number; horario: Date; numero_op: number | null; tipo: string; detalhe: string | null; autor: string | null };

const eventoDe = (l: LinhaEvento): Evento => ({
  id: Number(l.id), horario: l.horario.getTime(), numeroOp: l.numero_op, tipo: l.tipo, detalhe: l.detalhe, autor: l.autor,
});

/** Eventos de uma OP, do mais antigo ao mais novo (os primeiros `limite`). */
export async function eventosDaOrdem(c: Conexao, numeroOp: number, limite = 200): Promise<Evento[]> {
  return (await linhas<LinhaEvento>(c, 'SELECT * FROM mes_evento WHERE numero_op = ? ORDER BY id LIMIT ?', [numeroOp, limite])).map(eventoDe);
}

/** Últimos eventos do MES, do mais novo ao mais antigo, uma página por vez (`antes` = id do último da página anterior). */
export async function eventosRecentes(c: Conexao, p: { limite: number; antes: number | null }): Promise<Evento[]> {
  const r = p.antes === null
    ? await linhas<LinhaEvento>(c, 'SELECT * FROM mes_evento ORDER BY id DESC LIMIT ?', [p.limite])
    : await linhas<LinhaEvento>(c, 'SELECT * FROM mes_evento WHERE id < ? ORDER BY id DESC LIMIT ?', [p.antes, p.limite]);
  return r.map(eventoDe);
}

type LinhaBatelada = {
  numero_op: number; resultado_op: number; volume: number; temperatura: number;
  t_pressurizar: number; t_aquecer: number; t_transferir: number; t_devolver: number; t_resfriar: number;
  dentro_tolerancia: number; registrada_em: Date;
};

function bateladaDe(l: LinhaBatelada): Batelada {
  return {
    numeroOp: l.numero_op,
    resultadoOp: l.resultado_op,
    volume: l.volume,
    temperatura: l.temperatura,
    tempos: { pressurizar: l.t_pressurizar, aquecer: l.t_aquecer, resfriar: l.t_resfriar, transferir: l.t_transferir, devolver: l.t_devolver },
    dentroTolerancia: l.dentro_tolerancia === 1,
    registradaEm: l.registrada_em.getTime(),
  };
}

export async function inserirBatelada(c: Conexao, b: Omit<Batelada, 'registradaEm'>): Promise<void> {
  await executar(
    c,
    `INSERT IGNORE INTO mes_batelada (numero_op, resultado_op, volume, temperatura, t_pressurizar, t_aquecer, t_transferir,
       t_devolver, t_resfriar, dentro_tolerancia, registrada_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3))`,
    [b.numeroOp, b.resultadoOp, b.volume, b.temperatura, b.tempos.pressurizar, b.tempos.aquecer, b.tempos.transferir,
      b.tempos.devolver, b.tempos.resfriar, b.dentroTolerancia ? 1 : 0],
  );
}

export async function buscarBateladas(c: Conexao, numeros: readonly number[]): Promise<Batelada[]> {
  if (numeros.length === 0) return [];
  return (await linhas<LinhaBatelada>(c, 'SELECT * FROM mes_batelada WHERE numero_op IN (?)', [numeros])).map(bateladaDe);
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

export async function inserirLeitura(c: Conexao, numeroOp: number, a: Omit<Amostra, 'horario'>): Promise<void> {
  await executar(
    c,
    'INSERT INTO mes_leitura (numero_op, horario, temperatura, nivel, pressao, vazao) VALUES (?, CURRENT_TIMESTAMP(3), ?, ?, ?, ?)',
    [numeroOp, a.temperatura, a.nivel, a.pressao, a.vazao],
  );
}

/**
 * Série temporal de uma OP, em ordem. Uma batelada normal tem algumas centenas de amostras (uma a cada 2 s); uma
 * que ficou horas parada na bancada teria milhares: aí valem as `limite` mais recentes.
 */
export async function leituras(c: Conexao, numeroOp: number, limite = 3000): Promise<Amostra[]> {
  const r = await linhas<{ horario: Date; temperatura: number; nivel: number; pressao: number; vazao: number }>(
    c,
    `SELECT horario, temperatura, nivel, pressao, vazao FROM
       (SELECT id, horario, temperatura, nivel, pressao, vazao FROM mes_leitura WHERE numero_op = ? ORDER BY id DESC LIMIT ?) ultimas
     ORDER BY id`,
    [numeroOp, limite],
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

/** Uma inspeção por OP: repetir (retomada depois de uma falha) não duplica nem dá erro. */
export async function inserirInspecao(c: Conexao, i: Omit<Inspecao, 'horario'>): Promise<void> {
  await executar(c, 'INSERT IGNORE INTO mes_inspecao (numero_op, resultado, observacao, autor, horario) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP(3))', [
    i.numeroOp, i.resultado, i.observacao, i.autor,
  ]);
}

export async function buscarInspecao(c: Conexao, numeroOp: number): Promise<Inspecao | null> {
  const [l] = await linhas<{ numero_op: number; resultado: 'aprovada' | 'reprovada'; observacao: string | null; autor: string | null; horario: Date }>(
    c, 'SELECT * FROM mes_inspecao WHERE numero_op = ?', [numeroOp],
  );
  return l ? { numeroOp: l.numero_op, resultado: l.resultado, observacao: l.observacao, autor: l.autor, horario: l.horario.getTime() } : null;
}

/** Feed de mudanças para a Loja: cada mudança de estado de OP, com id crescente (o cursor). */
export async function registrarMudanca(c: Conexao, m: { numero: number; origem: string | null; estado: EstadoOp }): Promise<void> {
  await executar(c, 'INSERT INTO mes_mudanca (horario, numero_op, origem, estado) VALUES (CURRENT_TIMESTAMP(3), ?, ?, ?)', [
    m.numero, m.origem, m.estado,
  ]);
}

export async function mudancas(c: Conexao, desde: number, limite: number): Promise<{ mudancas: Mudanca[]; ultimo: number | null }> {
  const r = await linhas<{ id: number; horario: Date; numero_op: number; origem: string | null; estado: EstadoOp }>(
    c, 'SELECT * FROM mes_mudanca WHERE id > ? ORDER BY id LIMIT ?', [desde, limite],
  );
  const [{ ultimo }] = await linhas<{ ultimo: number | null }>(c, 'SELECT MAX(id) AS ultimo FROM mes_mudanca');
  return {
    mudancas: r.map((l) => ({ id: Number(l.id), numero: l.numero_op, origem: l.origem, estado: l.estado, horario: l.horario.getTime() })),
    ultimo: ultimo === null ? null : Number(ultimo),
  };
}

export async function apagarTudo(c: Conexao): Promise<void> {
  for (const t of ['mes_mudanca', 'mes_leitura', 'mes_evento', 'mes_batelada', 'mes_inspecao', 'mes_parada', 'mes_ordem']) {
    await executar(c, `DELETE FROM ${t}`);
  }
}
