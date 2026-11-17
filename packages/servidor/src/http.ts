// Utilidades das rotas. Sem login e sem papéis (ROTEIRO, seção 4): quem usa as telas não se identifica.

export const numero = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export const inteiroPositivo = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : null;
};

export const texto = (v: unknown, max = 255): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, max) : null;
