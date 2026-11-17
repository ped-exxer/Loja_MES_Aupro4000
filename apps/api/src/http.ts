// Utilidades das rotas. Sem login (ROTEIRO, seção 4): a tela manda o nome e o papel em cabeçalhos,
// só para atribuir autoria nos eventos e no certificado.

import type { FastifyRequest } from 'fastify';

export function autorDe(req: FastifyRequest): string | null {
  const bruto = req.headers['x-autor'];
  const papel = req.headers['x-papel'];
  if (typeof bruto !== 'string' || bruto.trim() === '') return null;
  let nome: string;
  try {
    nome = decodeURIComponent(bruto).trim().slice(0, 60);
  } catch {
    nome = bruto.trim().slice(0, 60);
  }
  return typeof papel === 'string' && papel ? `${nome} (${papel.slice(0, 16)})` : nome;
}

export const numero = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export const inteiroPositivo = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : null;
};

export const texto = (v: unknown, max = 255): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, max) : null;
