// Utilidades das rotas. Sem login e sem papéis (ROTEIRO, seção 4): quem usa as telas não se identifica.

export const numero = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export const inteiroPositivo = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : null;
};

export const texto = (v: unknown, max = 255): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, max) : null;

/**
 * O corpo (ou um pedaço dele) como objeto: o que não for objeto (corpo vazio, `null`, lista, texto, número) vira {}.
 * Assim uma rota nunca quebra (500) lendo um campo de um corpo malformado: os campos só ficam ausentes e a
 * validação da rota responde 4xx.
 */
export const objeto = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/**
 * Paginação simples das listas que crescem sem fim (`?limite=50&antes=<id>`): `limite` entre 1 e `maximo` (sem
 * ele, `padrao`); `antes` = só os registros com id menor que este (o id do último da página anterior), ou null.
 */
export function pagina(consulta: unknown, padrao: number, maximo: number): { limite: number; antes: number | null } {
  const c = objeto(consulta);
  const limite = inteiroPositivo(c.limite);
  return { limite: Math.min(limite ?? padrao, maximo), antes: inteiroPositivo(c.antes) };
}
