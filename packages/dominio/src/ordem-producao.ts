// Máquina de estados da ordem de produção (ROTEIRO, seção 9).
// O MES não comanda a bancada: depois do envio, os estados só mudam pelo que o CLP informa.

import { validarReceita, type ErroValidacao, type Receita } from './receita.ts';

export type EstadoOp =
  | 'na_fila'
  | 'enviada'
  | 'em_producao'
  | 'produzida'
  | 'aprovada'
  | 'reprovada'
  | 'recusada'
  | 'abortada'
  | 'cancelada'
  | 'comunicacao_perdida';

export type EventoOp =
  /** MES: deixou a OP disponível para o CLP. */
  | 'enviar'
  /** MES: trocou o pedido disponível e o eco confirmou que o CLP não pegou esta OP. */
  | 'retirar'
  | 'cancelar'
  /** CLP: pegou a OP para produzir (eco com Resultado aceito). */
  | 'clp_recebeu'
  /** CLP: pegou a OP e recusou (eco com Resultado > 0). */
  | 'clp_recusou'
  /** CLP: OpConcluida = esta OP, ResultadoOp concluída. */
  | 'clp_concluiu'
  /** CLP: OpConcluida = esta OP, ResultadoOp abortada. */
  | 'clp_abortou'
  /** Qualidade: só registro, não muda nada na bancada. */
  | 'aprovar'
  | 'reprovar'
  | 'perder_comunicacao'
  | 'restabelecer_comunicacao';

/** Estados em que a OP está com o CLP: uma queda de comunicação importa. */
export const ESTADOS_COM_CLP = ['enviada', 'em_producao'] as const satisfies readonly EstadoOp[];
export type EstadoComCLP = (typeof ESTADOS_COM_CLP)[number];

export const ESTADOS_FINAIS = [
  'aprovada',
  'reprovada',
  'recusada',
  'abortada',
  'cancelada',
] as const satisfies readonly EstadoOp[];

/** `antesDaQueda` só existe em "comunicação perdida". */
export type SituacaoOp =
  | { estado: Exclude<EstadoOp, 'comunicacao_perdida'> }
  | { estado: 'comunicacao_perdida'; antesDaQueda: EstadoComCLP };

const TRANSICOES: { readonly [E in EstadoOp]: { readonly [V in EventoOp]?: EstadoOp } } = {
  na_fila: { enviar: 'enviada', cancelar: 'cancelada' },
  enviada: { retirar: 'na_fila', clp_recebeu: 'em_producao', clp_recusou: 'recusada' },
  em_producao: { clp_concluiu: 'produzida', clp_abortou: 'abortada' },
  produzida: { aprovar: 'aprovada', reprovar: 'reprovada' },
  comunicacao_perdida: {},
  aprovada: {},
  reprovada: {},
  recusada: {},
  abortada: {},
  cancelada: {},
};

export type ResultadoTransicao =
  | { ok: true; situacao: SituacaoOp }
  | { ok: false; codigo: 'transicao_invalida'; estado: EstadoOp; evento: EventoOp }
  | { ok: false; codigo: 'receita_invalida'; erros: ErroValidacao[] };

function temCLP(estado: EstadoOp): estado is EstadoComCLP {
  return (ESTADOS_COM_CLP as readonly EstadoOp[]).includes(estado);
}

export function ehFinal(estado: EstadoOp): boolean {
  return (ESTADOS_FINAIS as readonly EstadoOp[]).includes(estado);
}

/** A OP nasce na fila só se a receita estiver dentro das faixas da bancada. */
export function criarOp(receita: Receita): ResultadoTransicao {
  const erros = validarReceita(receita);
  if (erros.length > 0) return { ok: false, codigo: 'receita_invalida', erros };
  return { ok: true, situacao: { estado: 'na_fila' } };
}

/**
 * Aplica um evento à OP.
 * Queda de comunicação nunca conclui a OP: ela guarda o estado anterior e, ao voltar, retorna a ele.
 */
export function transicionar(situacao: SituacaoOp, evento: EventoOp): ResultadoTransicao {
  const { estado } = situacao;
  const invalida = { ok: false, codigo: 'transicao_invalida', estado, evento } as const;

  if (evento === 'perder_comunicacao') {
    if (!temCLP(estado)) return invalida;
    return { ok: true, situacao: { estado: 'comunicacao_perdida', antesDaQueda: estado } };
  }

  if (evento === 'restabelecer_comunicacao') {
    if (situacao.estado !== 'comunicacao_perdida') return invalida;
    return { ok: true, situacao: { estado: situacao.antesDaQueda } };
  }

  const destino = TRANSICOES[estado][evento];
  if (destino === undefined || destino === 'comunicacao_perdida') return invalida;
  return { ok: true, situacao: { estado: destino } };
}

/** Eventos aceitos num estado (para a interface mostrar só os botões possíveis). */
export function eventosPossiveis(situacao: SituacaoOp): EventoOp[] {
  const eventos = Object.keys(TRANSICOES[situacao.estado]) as EventoOp[];
  if (temCLP(situacao.estado)) eventos.push('perder_comunicacao');
  if (situacao.estado === 'comunicacao_perdida') eventos.push('restabelecer_comunicacao');
  return eventos;
}
