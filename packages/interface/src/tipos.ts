// Formatos das respostas das APIs usados pelas telas. Os do contrato Loja↔MES vêm de packages/dominio.

import type { Andamento, Faixa, Processo, Receita, Tolerancias, Ordem, Dossie } from '@aupro/dominio';

export type {
  Amostra, Andamento, AvaliacaoQualidade as Avaliacao, Batelada, Dossie, EstadoOp, Evento, Inspecao, Ordem, Processo, Receita, Tolerancias,
} from '@aupro/dominio';

export type Bancada = {
  conectado: boolean;
  clpVivo: boolean;
  comunicacaoPerdida: boolean;
  erro: string | null;
  driver: string | null;
  estadoClp: number | null;
  etapa: number | null;
  opExecucao: number | null;
  alarme: number | null;
  disponivel: number | null;
  processo: Processo | null;
  temperaturaTq02: number | null;
  temperaturaReservatorio: number | null;
  atualizadoEm: number;
};

export type ItemFila = { posicao: number; ordem: Ordem; disponivel: boolean; inicioEstimado: number; fimEstimado: number };

export type Produto = {
  id: number;
  nome: string;
  descricao: string | null;
  preco: number;
  receita: Receita;
  tolerancias: Tolerancias;
  sobMedida: boolean;
  ativo: boolean;
  prazoEstimado?: number;
};

export type Catalogo = { faixas: Record<keyof Receita, Faixa>; mesNoAr: boolean; produtos: Produto[] };

export type ItemPedido = {
  id: number;
  pedidoId: number;
  produtoId: number;
  nomeProduto: string;
  preco: number;
  receita: Receita;
  tolerancias: Tolerancias;
  prazo: number | null;
  numeroOp: number | null;
  producao: Andamento | null;
};

export type Pedido = {
  id: number;
  criadoEm: number;
  cliente: { nome: string; email: string | null; turma: string | null };
  itens: ItemPedido[];
  mesNoAr?: boolean;
};

export type Certificado = Dossie & { item: Omit<ItemPedido, 'producao'> | null; cliente: Pedido['cliente'] | null };

/** Pedidos da Loja: `mesNoAr` falso quando o MES não respondeu (itens sem andamento). */
export type ListaPedidos = { mesNoAr: boolean; pedidos: Pedido[] };

export type Fatura = {
  id: number;
  numeroOp: number;
  valor: number;
  emitidaEm: number;
  produto: string;
  pedidoId: number;
  cliente: { nome: string; email: string | null };
};

export type Parada = { id: number; inicio: number; fim: number | null; motivo: string; observacao: string | null; autor: string | null };

export type Indicadores = {
  inicioAula: number;
  agora: number;
  escala: number;
  tempoPlanejadoMs: number;
  tempoParadoMs: number;
  tempoOperandoMs: number;
  disponibilidade: number | null;
  desempenho: number | null;
  qualidade: number | null;
  oee: number | null;
  produzidas: number;
  aprovadas: number;
  reprovadas: number;
  abortadas: number;
  cicloMedioMs: number | null;
  leadTimeMedioMs: number | null;
  noPrazo: number | null;
};

export type Configuracao = {
  driver: 'simulado' | 's7';
  ip: string;
  rack: number;
  slot: number;
  numeroDb: number;
  numeroDbProcesso: number | null;
  escalaSimulador: number;
  margemPrazoMin: number;
  inicioAula: number;
};
