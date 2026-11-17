// Quem é este sistema e onde fica o outro, para o topo da tela ("AUPRO4000 · Loja" e o link para o MES).
// É só um link para o navegador: um sistema não chama o outro por aqui.

import type { FastifyInstance } from 'fastify';

export type NomeSistema = 'loja' | 'mes';

export type Sistema = {
  sistema: NomeSistema;
  /** URL pública do outro sistema; null = mesmo endereço desta página, na `porta` do outro. */
  outro: { sistema: NomeSistema; url: string | null; porta: number };
};

export function registrarSistema(app: FastifyInstance, sistema: NomeSistema, outro: { url?: string; porta?: string }): void {
  const resposta: Sistema = {
    sistema,
    outro: {
      sistema: sistema === 'loja' ? 'mes' : 'loja',
      url: outro.url?.trim() ? outro.url.trim().replace(/\/+$/, '') : null,
      porta: Number(outro.porta) || (sistema === 'loja' ? 8081 : 8080),
    },
  };
  app.get('/api/sistema', async () => resposta);
}
