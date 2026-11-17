// Serve a tela do sistema (o build do Vite) pelo mesmo processo da API: um contêiner por sistema, sem nginx.
// Feito à mão com node:fs (umas 40 linhas) em vez de @fastify/static, que traria meia dúzia de pacotes.
// As rotas da tela são por hash (#/fila), então o servidor só entrega arquivos; o que não existe e não tem
// extensão cai no index.html.

import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import type { FastifyInstance } from 'fastify';

const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

/** Caminho do arquivo pedido dentro de `raiz`, ou null se a URL tentar sair dela (../). */
export function caminhoNaPasta(raiz: string, url: string): string | null {
  let caminho: string;
  try {
    caminho = decodeURIComponent(new URL(url, 'http://x').pathname);
  } catch {
    return null;
  }
  const base = resolve(raiz);
  const arquivo = resolve(join(base, caminho));
  return arquivo === base || arquivo.startsWith(base + sep) ? arquivo : null;
}

async function ehArquivo(caminho: string): Promise<boolean> {
  return stat(caminho).then((s) => s.isFile(), () => false);
}

export function registrarTela(app: FastifyInstance, pasta: string): void {
  app.get('/*', async (req, reply) => {
    if (req.url.startsWith('/api/')) return reply.code(404).send({ erro: 'rota_inexistente' });
    let arquivo = caminhoNaPasta(pasta, req.url);
    if (arquivo === null) return reply.code(404).send({ erro: 'rota_inexistente' });
    if (!(await ehArquivo(arquivo))) {
      if (extname(arquivo) !== '') return reply.code(404).send({ erro: 'rota_inexistente' });
      arquivo = join(pasta, 'index.html');
      if (!(await ehArquivo(arquivo))) return reply.code(503).type('text/plain; charset=utf-8').send('Tela não compilada (npm run build).');
    }
    // os arquivos de assets/ têm o hash no nome: podem ficar em cache; o index.html, não
    const cache = arquivo.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
    return reply
      .type(TIPOS[extname(arquivo)] ?? 'application/octet-stream')
      .header('cache-control', cache)
      .send(await readFile(arquivo));
  });
}
