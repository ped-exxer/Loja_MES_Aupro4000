// Contrato entre os dois sistemas: o que a Loja (ERP) e o MES trocam por HTTP (ROTEIRO, seção 3.5).
// Só tipos. O MES responde em /api/ordens/*; a Loja chama pela variável MES_URL. O MES não conhece a Loja:
// a Loja fica sabendo das mudanças pelo feed (`Mudancas`), consultado a cada segundo.

import type { AvaliacaoQualidade } from './qualidade.ts';
import type { EstadoOp, SituacaoOp } from './ordem-producao.ts';
import type { Receita, Tolerancias } from './receita.ts';

/** Prefixo da origem de uma OP emitida pela Loja: `loja:item:<id do item do pedido>`. */
export const ORIGEM_LOJA = 'loja:item:';

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

export type Batelada = {
  numeroOp: number;
  resultadoOp: number;
  volume: number;
  temperatura: number;
  /** ms por etapa (aquecer, resfriar e transferir somam as rodadas do TQ-01). */
  tempos: { pressurizar: number; aquecer: number; resfriar: number; transferir: number; devolver: number };
  dentroTolerancia: boolean;
  registradaEm: number;
};

export type Processo = { temperatura: number; nivel: number; pressao: number; vazao: number };
export type Amostra = { horario: number } & Processo;
export type Evento = { horario: number; numeroOp: number | null; tipo: string; detalhe: string | null; autor: string | null };
export type Inspecao = { numeroOp: number; resultado: 'aprovada' | 'reprovada'; observacao: string | null; autor: string | null; horario: number };

/** POST /api/ordens: corpo { ordens: PedidoOrdem[] }. Todas ou nenhuma (uma transação só no MES). */
export type PedidoOrdem = { origem: string | null; receita: Receita; tolerancias: Tolerancias; prazo?: number; autor?: string | null };

/** GET /api/ordens/andamento?numeros=1,2: situação de cada OP; etapa e processo só da que está em produção. */
export type Andamento = {
  numero: number;
  estado: EstadoOp;
  prazo: number;
  posicaoFila: number | null;
  fimEstimado: number | null;
  etapa: number | null;
  processo: Processo | null;
  batelada: Batelada | null;
};

/** GET /api/ordens/:numero: rastreabilidade completa (certificado). */
export type Dossie = {
  ordem: Ordem;
  batelada: Batelada | null;
  avaliacao: AvaliacaoQualidade | null;
  inspecao: Inspecao | null;
  leituras: Amostra[];
  eventos: Evento[];
};

/** Uma mudança de estado de OP. `id` cresce sempre: é o cursor do feed. */
export type Mudanca = { id: number; numero: number; origem: string | null; estado: EstadoOp; horario: number };

/**
 * GET /api/ordens/mudancas?desde=<cursor>: as mudanças com id > cursor, em ordem (no máximo `limite`).
 * `ultimo` é o maior id que o MES tem (null se nenhum): se o cursor da Loja passar dele, a base do MES foi recriada
 * e a Loja recomeça do zero (o que ela faz com cada mudança é idempotente).
 */
export type Mudancas = { mudancas: Mudanca[]; ultimo: number | null };
