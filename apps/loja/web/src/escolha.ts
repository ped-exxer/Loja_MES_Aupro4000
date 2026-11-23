// O pedido em passos (volume, temperatura, quantidade) sobre o catálogo que já existe: as opções vêm das receitas
// prontas e cada escolha cai num produto do catálogo, sem mudar a API. Regra:
// - volume e temperatura iguais aos de uma receita pronta com a vazão e a pressão padrão (as do Sob medida) → esse
//   produto, com o preço e a receita dele;
// - qualquer outra combinação dentro das faixas → o produto Sob medida, que manda só volume e temperatura (vazão e
//   pressão são as dele), como a vitrine sempre fez;
// - uma receita pronta com outra vazão (o "Envase lento") só sai pelo atalho das receitas prontas: escolhida nos
//   passos, a mesma combinação vira Sob medida, porque o cliente não escolhe vazão.

import { validarReceita } from '@aupro/dominio';
import type { Catalogo, Produto } from '@aupro/interface';

export type Escolha = {
  /** A receita pronta escolhida no atalho (id do produto); some quando o cliente muda volume ou temperatura. */
  prontaId: number | null;
  volume: number;
  temperatura: number;
};

export const ESCOLHA_VAZIA: Escolha = { prontaId: null, volume: Number.NaN, temperatura: Number.NaN };

export const prontas = (c: Catalogo): Produto[] => c.produtos.filter((p) => !p.sobMedida);
export const sobMedida = (c: Catalogo): Produto | null => c.produtos.find((p) => p.sobMedida) ?? null;

const distintos = (valores: number[]) => [...new Set(valores)].sort((a, b) => a - b);

/** As opções de volume e de temperatura: os valores das receitas prontas. */
export const opcoesVolume = (c: Catalogo) => distintos(prontas(c).map((p) => p.receita.volume));
export const opcoesTemperatura = (c: Catalogo) => distintos(prontas(c).map((p) => p.receita.temperatura));

/** Morna ou quente, pela posição da temperatura na faixa da bancada (como "Morna 10 L" e "Quente 15 L"). */
export const tipoTemperatura = (c: Catalogo, temperatura: number): 'morna' | 'quente' =>
  temperatura < (c.faixas.temperatura.min + c.faixas.temperatura.max) / 2 ? 'morna' : 'quente';

/** O produto em que a escolha cai, ou null (valor fora da faixa, ou combinação sem produto). */
export function produtoDa(c: Catalogo, e: Escolha): Produto | null {
  if (e.prontaId !== null) return c.produtos.find((p) => p.id === e.prontaId) ?? null;
  if (!Number.isFinite(e.volume) || !Number.isFinite(e.temperatura)) return null;
  const medida = sobMedida(c);
  const padrao = medida?.receita;
  const pronta = prontas(c).find(
    (p) =>
      p.receita.volume === e.volume &&
      p.receita.temperatura === e.temperatura &&
      (!padrao || (p.receita.vazao === padrao.vazao && p.receita.pressao === padrao.pressao)),
  );
  if (pronta) return pronta;
  if (medida && validarReceita({ ...medida.receita, volume: e.volume, temperatura: e.temperatura }).length === 0) return medida;
  return null;
}

/** A receita que vai para a bancada: a do produto, ou, no Sob medida, o volume e a temperatura escolhidos. */
export const receitaDa = (p: Produto, e: Escolha) => (p.sobMedida ? { ...p.receita, volume: e.volume, temperatura: e.temperatura } : p.receita);
