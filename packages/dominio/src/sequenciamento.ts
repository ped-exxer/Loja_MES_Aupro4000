// Ordem da fila do MES (ROTEIRO, seção 3.3, "Regra de sequenciamento").

export type ItemFila = {
  temperatura: number;
  volume: number;
  /** Data prometida, em ms (epoch). */
  prazo: number;
  /** Quando entrou na fila, em ms (epoch). */
  chegada: number;
  /** Tempo de ciclo estimado, em ms (para saber se o prazo seria perdido). */
  duracaoMs?: number;
  /** Posição fixada à mão pelo PCP (1, 2, …); sem valor = livre. */
  fixada?: number;
};

export type OpcoesSequenciamento = {
  /** Agora, em ms (epoch). */
  agora: number;
  /** Quando a primeira da fila pode começar (padrão: agora). */
  inicio?: number;
  /** Temperatura da batelada em produção ou da última produzida, se houver. */
  temperaturaAtual?: number;
  /** Folga exigida antes do prazo. Padrão: MARGEM_PRAZO_PADRAO_MS. */
  margemPrazoMs?: number;
};

export const MARGEM_PRAZO_PADRAO_MS = 5 * 60_000;

const porTemperaturaVolumeChegada = (a: ItemFila, b: ItemFila) =>
  a.temperatura - b.temperatura || a.volume - b.volume || a.chegada - b.chegada;

/**
 * Devolve a fila na ordem de envio ao CLP (não altera a original):
 * 1. fixadas pelo PCP, na ordem dada;
 * 2. prazo em risco: as que, na ordem por temperatura, terminariam depois do prazo menos a margem;
 *    a mais apertada primeiro;
 * 3. o resto por temperatura crescente a partir da temperatura atual (as mais frias que ela vão para o fim),
 *    desempate por volume e chegada.
 */
export function sequenciarFila<T extends ItemFila>(fila: readonly T[], opcoes: OpcoesSequenciamento): T[] {
  const margem = opcoes.margemPrazoMs ?? MARGEM_PRAZO_PADRAO_MS;
  const fixadas = fila.filter((i) => i.fixada !== undefined);
  const livres = fila.filter((i) => i.fixada === undefined);

  fixadas.sort((a, b) => a.fixada! - b.fixada! || a.chegada - b.chegada);
  const t = opcoes.temperaturaAtual;
  const acima = livres.filter((i) => t === undefined || i.temperatura >= t).sort(porTemperaturaVolumeChegada);
  const abaixo = livres.filter((i) => t !== undefined && i.temperatura < t).sort(porTemperaturaVolumeChegada);
  const porTemperatura = [...acima, ...abaixo];

  // simula a ordem por temperatura: quem terminaria tarde demais passa na frente
  let relogio = (opcoes.inicio ?? opcoes.agora) + fixadas.reduce((s, i) => s + (i.duracaoMs ?? 0), 0);
  const emRisco: T[] = [];
  for (const item of porTemperatura) {
    relogio += item.duracaoMs ?? 0;
    if (relogio > item.prazo - margem) emRisco.push(item);
  }
  emRisco.sort((a, b) => a.prazo - b.prazo || a.chegada - b.chegada);

  return [...fixadas, ...emRisco, ...porTemperatura.filter((i) => !emRisco.includes(i))];
}
