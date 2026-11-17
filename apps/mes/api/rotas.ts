// Rotas da tela do MES: fila, bancada, qualidade (só leitura: a inspeção é automática), indicadores.
// O que a Loja usa fica em integracao.ts (/api/ordens/*).

import type { FastifyInstance } from 'fastify';
import { inteiroPositivo, numero, texto } from '@aupro/servidor';
import { MOTIVOS_PARADA } from './esquema.ts';
import type { Mes } from './nucleo.ts';
import * as repo from './repositorio.ts';

export function registrarRotasMes(app: FastifyInstance, mes: Mes): void {
  app.get('/api/mes/bancada', async () => mes.despachante.estado());

  app.get('/api/mes/fila', async () => mes.fila());

  app.get('/api/mes/ordens', async (req) => {
    const { estado } = req.query as { estado?: string };
    const ordens = await repo.listarOrdens(mes.ctx.banco, estado ? (estado.split(',') as never) : undefined);
    return ordens.reverse().slice(0, 300);
  });

  app.get('/api/mes/ordens/:numero', async (req, reply) => {
    const n = inteiroPositivo((req.params as { numero: string }).numero);
    const d = n === null ? null : await mes.dossie(n);
    return d ?? reply.code(404).send({ erro: 'ordem_inexistente' });
  });

  /** OP manual (sem pedido da Loja). */
  app.post('/api/mes/ordens', async (req, reply) => {
    const c = req.body as Record<string, unknown>;
    const receita = { volume: numero(c.volume), temperatura: numero(c.temperatura), vazao: numero(c.vazao), pressao: numero(c.pressao) };
    const tolerancias = { temperatura: numero(c.tolTemperatura) ?? 2, volume: numero(c.tolVolume) ?? 0.5 };
    const r = await mes.emitirOrdens([{ origem: 'manual', receita: receita as never, tolerancias, autor: null }]);
    return r.ok
      ? reply.code(201).send({ ok: true, numero: r.numeros[0] })
      : reply.code(422).send({ erro: 'receita_invalida', erros: r.erros.map(({ indice: _, ...e }) => e) });
  });

  app.post('/api/mes/ordens/:numero/cancelar', async (req, reply) => {
    const n = inteiroPositivo((req.params as { numero: string }).numero);
    if (n === null) return reply.code(404).send({ erro: 'ordem_inexistente' });
    const r = await mes.cancelarOrdem(n, null);
    return r === 'nao_pode' || r === 'inexistente' ? reply.code(409).send({ erro: r }) : { resultado: r };
  });

  app.post('/api/mes/ordens/:numero/fixar', async (req, reply) => {
    const n = inteiroPositivo((req.params as { numero: string }).numero);
    const { posicao } = req.body as { posicao?: unknown };
    const p = posicao === null ? null : inteiroPositivo(posicao);
    if (n === null || (posicao !== null && p === null)) return reply.code(400).send({ erro: 'pedido_invalido' });
    return (await mes.fixar(n, p, null)) ? { ok: true } : reply.code(409).send({ erro: 'nao_pode' });
  });

  app.post('/api/mes/ordens/:numero/registrar-abortada', async (req, reply) => {
    const n = inteiroPositivo((req.params as { numero: string }).numero);
    return n !== null && (await mes.registrarAbortada(n, null)) ? { ok: true } : reply.code(409).send({ erro: 'nao_pode' });
  });

  app.get('/api/mes/paradas', async () => ({ motivos: MOTIVOS_PARADA, paradas: await mes.paradas() }));

  app.post('/api/mes/paradas', async (req, reply) => {
    const { motivo, observacao } = req.body as { motivo?: string; observacao?: unknown };
    const r = await mes.abrirParada(String(motivo), texto(observacao), null);
    return r.ok ? reply.code(201).send(r) : reply.code(409).send({ erro: r.codigo });
  });

  app.post('/api/mes/paradas/:id/encerrar', async (req, reply) => {
    const id = inteiroPositivo((req.params as { id: string }).id);
    return id !== null && (await mes.encerrarParada(id, null)) ? { ok: true } : reply.code(409).send({ erro: 'nao_pode' });
  });

  app.get('/api/mes/eventos', async () => repo.eventos(mes.ctx.banco, undefined, 100));

  app.get('/api/mes/indicadores', async () => mes.indicadores());

  app.get('/api/mes/relatorio.csv', async (_req, reply) => {
    const data = new Date().toISOString().slice(0, 10);
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="relatorio-aula-${data}.csv"`)
      .send(await mes.relatorioCsv());
  });
}
