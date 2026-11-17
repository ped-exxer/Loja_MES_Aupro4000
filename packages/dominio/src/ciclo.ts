// Estimativa do tempo de ciclo de uma batelada (ROTEIRO, seção 2). Alimenta a promessa de prazo e o
// tempo ideal do OEE.
//
// O TQ-01 tem 10 L e o envase só começa depois de ele atingir a temperatura. Um pedido maior que o TQ-01 é feito em
// RODADAS: pressuriza uma vez; em cada rodada aquece (ou resfria) o volume da rodada e transfere esse volume para o
// TQ-02; a B1 repõe o TQ-01 com água do reservatório; no fim devolve o TQ-02 ao reservatório.
// 15 L = 10 + 5; 20 L = 10 + 10.
//
// PARÂMETROS PROVISÓRIOS: a potência do resistor (TZ-104) e a taxa de resfriamento do trocador (FV-105 + M1/FY-105)
// não são conhecidas. Os valores abaixo são uma primeira aproximação: MEDIR NA BANCADA e ajustar (ROTEIRO, decisões).

import type { Receita } from './receita.ts';

export const PARAMETROS_CICLO = {
  /** Capacidade do TQ-01 (L): o maior volume de uma rodada. */
  volumeTq01L: 10,
  /** Pressurizar o TQ-01 (uma vez por batelada). PROVISÓRIO: medir na bancada. */
  pressurizarS: 60,
  /**
   * Aquecer pelo resistor TZ-104: segundos por °C e por litro (≈ 280 s para 10 L subirem 20 °C, ≈ 3 kW).
   * PROVISÓRIO: medir na bancada.
   */
  aquecerSPorGrauLitro: 1.4,
  /**
   * Resfriar recirculando o TQ-01 pelo trocador de calor (FV-105) com o ventilador M1 (inversor FY-105):
   * segundos por °C e por litro. Valor conservador (≈ 520 W de troca, quase 6× mais lento que aquecer: 10 L descem
   * 10 °C em ≈ 13 min). PROVISÓRIO: medir na bancada (a troca cai quando a água se aproxima da temperatura ambiente).
   */
  resfriarSPorGrauLitro: 8,
  /** Esvaziar o TQ-02 de volta ao reservatório. PROVISÓRIO: medir na bancada. */
  devolverS: 240,
  /** Temperatura da água do reservatório quando não se sabe outra. */
  temperaturaAmbiente: 25,
} as const;

export type TemposEtapas = {
  pressurizarMs: number;
  /** Soma das rodadas. */
  aquecerMs: number;
  /** Soma das rodadas (água de partida mais quente que o pedido). */
  resfriarMs: number;
  /** Soma das rodadas. */
  transferirMs: number;
  devolverMs: number;
  /** Quantas rodadas o TQ-01 faz. */
  rodadas: number;
};

/** Volumes de cada rodada (L): o TQ-01 cheio até o que falta. 15 → [10, 5]; 20 → [10, 10]; 8 → [8]. */
export function dividirEmRodadas(volume: number, capacidade: number = PARAMETROS_CICLO.volumeTq01L): number[] {
  if (!(volume > 0)) return [];
  const n = Math.ceil(volume / capacidade - 1e-9);
  return Array.from({ length: n }, (_, i) => (i < n - 1 ? capacidade : volume - capacidade * (n - 1)));
}

/** Tempo (s) para levar `litros` de `de` a `para` °C: aquece ou resfria. */
export function tempoAjusteTemperaturaS(litros: number, de: number, para: number): { aquecerS: number; resfriarS: number } {
  return {
    aquecerS: Math.max(0, para - de) * PARAMETROS_CICLO.aquecerSPorGrauLitro * litros,
    resfriarS: Math.max(0, de - para) * PARAMETROS_CICLO.resfriarSPorGrauLitro * litros,
  };
}

/**
 * Tempos estimados por etapa (somados entre as rodadas).
 * @param temperaturaPartida °C da água no TQ-01 na 1ª rodada.
 * @param temperaturaReservatorio °C da água do reservatório, que a B1 põe no TQ-01 a partir da 2ª rodada
 *   (padrão: a mesma da partida).
 */
export function estimarEtapas(
  receita: Receita,
  temperaturaPartida: number = PARAMETROS_CICLO.temperaturaAmbiente,
  temperaturaReservatorio: number = temperaturaPartida,
): TemposEtapas {
  const rodadas = dividirEmRodadas(receita.volume);
  let aquecerS = 0;
  let resfriarS = 0;
  rodadas.forEach((litros, i) => {
    const t = tempoAjusteTemperaturaS(litros, i === 0 ? temperaturaPartida : temperaturaReservatorio, receita.temperatura);
    aquecerS += t.aquecerS;
    resfriarS += t.resfriarS;
  });
  return {
    pressurizarMs: PARAMETROS_CICLO.pressurizarS * 1000,
    aquecerMs: aquecerS * 1000,
    resfriarMs: resfriarS * 1000,
    transferirMs: (receita.volume / receita.vazao) * 60_000,
    devolverMs: PARAMETROS_CICLO.devolverS * 1000,
    rodadas: rodadas.length,
  };
}

/** Tempo de ciclo estimado (ms). */
export function estimarCicloMs(receita: Receita, temperaturaPartida?: number, temperaturaReservatorio?: number): number {
  const t = estimarEtapas(receita, temperaturaPartida, temperaturaReservatorio);
  return t.pressurizarMs + t.aquecerMs + t.resfriarMs + t.transferirMs + t.devolverMs;
}
