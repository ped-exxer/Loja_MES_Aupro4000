// Estimativa do tempo de ciclo de uma batelada (ROTEIRO, seção 2). Alimenta a promessa de prazo e o
// tempo ideal do OEE. Os parâmetros são uma primeira aproximação: ajustar com medições na bancada.

import type { Receita } from './receita.ts';

export const PARAMETROS_CICLO = {
  /** Pressurizar o TQ-01. */
  pressurizarS: 60,
  /** Aquecer: segundos por °C e por litro (≈ 280 s para 10 L subirem 20 °C). */
  aquecerSPorGrauLitro: 1.4,
  /** Esvaziar o TQ-02 de volta ao reservatório. */
  devolverS: 240,
  /** Temperatura da água do reservatório quando não se sabe outra. */
  temperaturaAmbiente: 25,
} as const;

export type TemposEtapas = {
  pressurizarMs: number;
  aquecerMs: number;
  transferirMs: number;
  devolverMs: number;
};

/** Tempos estimados por etapa, partindo da água a `temperaturaInicial`. */
export function estimarEtapas(receita: Receita, temperaturaInicial: number = PARAMETROS_CICLO.temperaturaAmbiente): TemposEtapas {
  const subida = Math.max(0, receita.temperatura - temperaturaInicial);
  return {
    pressurizarMs: PARAMETROS_CICLO.pressurizarS * 1000,
    aquecerMs: subida * PARAMETROS_CICLO.aquecerSPorGrauLitro * receita.volume * 1000,
    transferirMs: (receita.volume / receita.vazao) * 60_000,
    devolverMs: PARAMETROS_CICLO.devolverS * 1000,
  };
}

/** Tempo de ciclo estimado (ms). */
export function estimarCicloMs(receita: Receita, temperaturaInicial?: number): number {
  const t = estimarEtapas(receita, temperaturaInicial);
  return t.pressurizarMs + t.aquecerMs + t.transferirMs + t.devolverMs;
}
