// Tempo real para as telas: Server-Sent Events (texto puro sobre HTTP, sem dependência).
// O navegador recebe avisos ("ordem mudou", "bancada") e busca o que precisar pela API.

import type { FastifyInstance } from 'fastify';
import type { ServerResponse } from 'node:http';

export type TempoReal = { publicar(tipo: string, dados: unknown): void };

export function registrarTempoReal(app: FastifyInstance): TempoReal {
  const clientes = new Set<ServerResponse>();

  app.get('/api/eventos', (req, reply) => {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    res.write('retry: 2000\n\n');
    clientes.add(res);
    req.raw.on('close', () => clientes.delete(res));
  });

  // mantém a conexão viva atrás de proxies
  const batida = setInterval(() => {
    for (const c of clientes) c.write(': batida\n\n');
  }, 15_000);
  // preClose (antes de o servidor parar de escutar), não onClose: o servidor só termina de fechar quando as
  // conexões acabam, e as do SSE ficam abertas para sempre. Sem isto, o encerramento (docker stop) penduraria.
  app.addHook('preClose', async () => {
    clearInterval(batida);
    for (const c of clientes) c.end();
    clientes.clear();
  });

  return {
    publicar(tipo, dados) {
      const mensagem = `event: ${tipo}\ndata: ${JSON.stringify(dados)}\n\n`;
      for (const c of clientes) c.write(mensagem);
    },
  };
}
