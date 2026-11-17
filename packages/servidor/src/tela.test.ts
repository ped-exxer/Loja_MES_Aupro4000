import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import { caminhoNaPasta, registrarTela } from './tela.ts';

test('caminhoNaPasta não deixa sair da pasta', () => {
  const raiz = join(tmpdir(), 'tela');
  assert.equal(caminhoNaPasta(raiz, '/assets/a.js'), join(raiz, 'assets', 'a.js'));
  assert.equal(caminhoNaPasta(raiz, '/../segredo'), join(raiz, 'segredo')); // a URL normaliza o ".."
  assert.equal(caminhoNaPasta(raiz, '/%2e%2e/segredo'), join(raiz, 'segredo')); // %2e também é ponto para a URL
  assert.equal(caminhoNaPasta(raiz, '/..%2f..%2fsegredo'), null); // barra codificada: só o decode vê o ".."
  assert.equal(caminhoNaPasta(raiz, '/%E0%A4%A'), null);
});

test('registrarTela serve arquivos, cai no index.html e não engole /api', async (t) => {
  const pasta = await mkdtemp(join(tmpdir(), 'tela-'));
  t.after(() => rm(pasta, { recursive: true, force: true }));
  await mkdir(join(pasta, 'assets'));
  await writeFile(join(pasta, 'index.html'), '<p>tela</p>');
  await writeFile(join(pasta, 'assets', 'a.js'), 'x');
  const app = Fastify();
  app.get('/api/saude', async () => ({ ok: true }));
  registrarTela(app, pasta);

  const raiz = await app.inject('/');
  assert.equal(raiz.statusCode, 200);
  assert.equal(raiz.body, '<p>tela</p>');
  assert.match(String(raiz.headers['content-type']), /text\/html/);

  const js = await app.inject('/assets/a.js');
  assert.equal(js.statusCode, 200);
  assert.match(String(js.headers['cache-control']), /immutable/);

  assert.equal((await app.inject('/qualquer/rota')).body, '<p>tela</p>');
  assert.equal((await app.inject('/nao-existe.js')).statusCode, 404);
  assert.equal((await app.inject('/api/nao-existe')).statusCode, 404);
  assert.equal((await app.inject('/api/saude')).statusCode, 200);
  await app.close();
});
