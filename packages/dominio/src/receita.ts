// Receita da batelada e validação contra as faixas da bancada (ROTEIRO, seção 2).
// O CLP refaz esta checagem (dupla checagem, seção 6.4).

/** Setpoints que vão para o CLP. */
export type Receita = {
  /** L no TQ-02 */
  volume: number;
  /** °C do produto */
  temperatura: number;
  /** L/min no envase (FIC-102) */
  vazao: number;
  /** bar no TQ-01 (PIC-103) */
  pressao: number;
};

/** Tolerâncias de qualidade, definidas no produto do catálogo. */
export type Tolerancias = {
  /** ± °C */
  temperatura: number;
  /** ± L */
  volume: number;
};

export type Faixa = { min: number; max: number };

export const FAIXAS: { readonly [K in keyof Receita]: Faixa } = {
  volume: { min: 2, max: 20 },
  temperatura: { min: 40, max: 65 },
  vazao: { min: 1, max: 6 },
  pressao: { min: 1.5, max: 3 },
};

/** Códigos, não textos: a interface traduz (pt, en, es). */
export type ErroValidacao =
  | { campo: keyof Receita; codigo: 'invalido' }
  | { campo: keyof Receita; codigo: 'fora_da_faixa'; faixa: Faixa }
  | { campo: `tolerancia.${keyof Tolerancias}`; codigo: 'tolerancia_invalida' };

const CAMPOS_RECEITA = Object.keys(FAIXAS) as (keyof Receita)[];

export function validarReceita(receita: Receita): ErroValidacao[] {
  const erros: ErroValidacao[] = [];
  for (const campo of CAMPOS_RECEITA) {
    const valor = receita[campo];
    const faixa = FAIXAS[campo];
    if (typeof valor !== 'number' || !Number.isFinite(valor)) {
      erros.push({ campo, codigo: 'invalido' });
    } else if (valor < faixa.min || valor > faixa.max) {
      erros.push({ campo, codigo: 'fora_da_faixa', faixa });
    }
  }
  return erros;
}

export function validarTolerancias(tolerancias: Tolerancias): ErroValidacao[] {
  const erros: ErroValidacao[] = [];
  for (const campo of ['temperatura', 'volume'] as const) {
    const valor = tolerancias[campo];
    if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0) {
      erros.push({ campo: `tolerancia.${campo}`, codigo: 'tolerancia_invalida' });
    }
  }
  return erros;
}
