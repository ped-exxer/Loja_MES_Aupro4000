// OEE e indicadores de entrega (ROTEIRO, seção 3.3, Indicadores).
//   Disponibilidade = (tempo planejado − paradas) / tempo planejado
//   Desempenho      = Σ tempo de ciclo ideal / tempo operando
//   Qualidade       = aprovadas / inspecionadas
//   OEE             = disponibilidade × desempenho × qualidade

export type Intervalo = { inicio: number; fim: number };

export type BateladaOee = {
  /** Tempo de ciclo ideal (estimado) da receita, em ms. */
  cicloIdealMs: number;
  /** null = ainda não inspecionada. */
  aprovada: boolean | null;
};

export type ResultadoOee = {
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
};

/** Soma a duração dos intervalos dentro da janela, sem contar duas vezes o que se sobrepõe. */
export function duracaoUniao(intervalos: readonly Intervalo[], janela: Intervalo): number {
  const cortados = intervalos
    .map((i) => ({ inicio: Math.max(i.inicio, janela.inicio), fim: Math.min(i.fim, janela.fim) }))
    .filter((i) => i.fim > i.inicio)
    .sort((a, b) => a.inicio - b.inicio);
  let total = 0;
  let atual: Intervalo | null = null;
  for (const i of cortados) {
    if (atual && i.inicio <= atual.fim) {
      atual.fim = Math.max(atual.fim, i.fim);
    } else {
      if (atual) total += atual.fim - atual.inicio;
      atual = { ...i };
    }
  }
  if (atual) total += atual.fim - atual.inicio;
  return total;
}

export function calcularOee(janela: Intervalo, paradas: readonly Intervalo[], bateladas: readonly BateladaOee[]): ResultadoOee {
  const tempoPlanejadoMs = Math.max(0, janela.fim - janela.inicio);
  const tempoParadoMs = duracaoUniao(paradas, janela);
  const tempoOperandoMs = tempoPlanejadoMs - tempoParadoMs;
  const idealMs = bateladas.reduce((s, b) => s + b.cicloIdealMs, 0);
  const aprovadas = bateladas.filter((b) => b.aprovada === true).length;
  const reprovadas = bateladas.filter((b) => b.aprovada === false).length;

  const disponibilidade = tempoPlanejadoMs > 0 ? tempoOperandoMs / tempoPlanejadoMs : null;
  const desempenho = tempoOperandoMs > 0 && bateladas.length > 0 ? Math.min(1, idealMs / tempoOperandoMs) : null;
  const qualidade = aprovadas + reprovadas > 0 ? aprovadas / (aprovadas + reprovadas) : null;
  const oee =
    disponibilidade !== null && desempenho !== null && qualidade !== null ? disponibilidade * desempenho * qualidade : null;

  return {
    tempoPlanejadoMs, tempoParadoMs, tempoOperandoMs, disponibilidade, desempenho, qualidade, oee,
    produzidas: bateladas.length, aprovadas, reprovadas,
  };
}

export type OrdemEntrega = { criadaEm: number; concluidaEm: number; prazo: number };

export function indicadoresEntrega(ordens: readonly OrdemEntrega[]): { leadTimeMedioMs: number | null; noPrazo: number | null } {
  if (ordens.length === 0) return { leadTimeMedioMs: null, noPrazo: null };
  const lead = ordens.reduce((s, o) => s + (o.concluidaEm - o.criadaEm), 0) / ordens.length;
  const noPrazo = ordens.filter((o) => o.concluidaEm <= o.prazo).length / ordens.length;
  return { leadTimeMedioMs: lead, noPrazo };
}
