// Formatos das respostas da API usados pelas telas.

import type { EstadoOp, Faixa, Receita, SituacaoOp, Tolerancias } from '@loja/dominio';

export type { EstadoOp, Receita, Tolerancias };

export type Processo = { temperatura: number; nivel: number; pressao: number; vazao: number };

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
  atualizadoEm: number;
};

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
  tempos: { pressurizar: number; aquecer: number; transferir: number; devolver: number };
  dentroTolerancia: boolean;
  registradaEm: number;
};

export type Amostra = { horario: number; temperatura: number; nivel: number; pressao: number; vazao: number };
export type Evento = { horario: number; numeroOp: number | null; tipo: string; detalhe: string | null; autor: string | null };
export type Inspecao = { numeroOp: number; resultado: 'aprovada' | 'reprovada'; observacao: string | null; autor: string | null; horario: number };
export type Avaliacao = { temperaturaOk: boolean; volumeOk: boolean; dentro: boolean; desvioTemperatura: number; desvioVolume: number };

export type Dossie = {
  ordem: Ordem;
  batelada: Batelada | null;
  avaliacao: Avaliacao | null;
  inspecao: Inspecao | null;
  leituras: Amostra[];
  eventos: Evento[];
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

export type Catalogo = { faixas: Record<keyof Receita, Faixa>; produtos: Produto[] };

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
  cliente: { nome: string; email: string; turma: string | null };
  itens: ItemPedido[];
};

export type Certificado = Dossie & { item: Omit<ItemPedido, 'producao'> | null; cliente: Pedido['cliente'] | null };

export type Fatura = {
  id: number;
  numeroOp: number;
  valor: number;
  emitidaEm: number;
  produto: string;
  pedidoId: number;
  cliente: { nome: string; email: string };
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
  inspecaoAutomatica: boolean;
  inicioAula: number;
};
