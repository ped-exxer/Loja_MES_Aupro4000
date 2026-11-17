// Comparação automática da batelada com as tolerâncias do produto (ROTEIRO, seção 3.3, Qualidade).
// É uma sugestão: quem aprova ou reprova é a pessoa da qualidade.

import type { Receita, Tolerancias } from './receita.ts';

export type Medicao = { volume: number; temperatura: number };

export type AvaliacaoQualidade = {
  temperaturaOk: boolean;
  volumeOk: boolean;
  /** As duas dentro da tolerância. */
  dentro: boolean;
  desvioTemperatura: number;
  desvioVolume: number;
};

export function avaliarQualidade(receita: Receita, tolerancias: Tolerancias, medido: Medicao): AvaliacaoQualidade {
  const desvioTemperatura = medido.temperatura - receita.temperatura;
  const desvioVolume = medido.volume - receita.volume;
  // margem mínima para não reprovar por arredondamento do float de 32 bits
  const temperaturaOk = Math.abs(desvioTemperatura) <= tolerancias.temperatura + 1e-6;
  const volumeOk = Math.abs(desvioVolume) <= tolerancias.volume + 1e-6;
  return { temperaturaOk, volumeOk, dentro: temperaturaOk && volumeOk, desvioTemperatura, desvioVolume };
}
