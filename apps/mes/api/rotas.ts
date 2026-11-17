// Rotas da tela do MES: fila, bancada, qualidade (só leitura: a inspeção é automática), indicadores.
// O que a Loja usa fica em integracao.ts (/api/ordens/*).

import type { FastifyInstance } from 'fastify';
import { ORIGEM_MANUAL } from '@aupro/dominio';
import { inteiroPositivo, numero, objeto, pagina, texto } from '@aupro/servidor';
import { MOTIVOS_PARADA, MOTIVO_DO_ALARME } from './esquema.ts';
import type { Mes } from './nucleo.ts';
import * as repo from './repositorio.ts';

export function registrarRotasMes(app: FastifyInstance, mes: Mes): void {
  app.get('/api/mes/bancada', async () => mes.despachante.estado());

  app.get('/api/mes/fila', async () => mes.fila());

  /** As ordens, da mais recente à mais antiga: `?estado=a,b` filtra; `?limite=` (até 300) e `?antes=<número>` paginam. */
  app.get('/api/mes/ordens', async (req) => {
    const { estado } = objeto(req.query);
    const estados = typeof estado === 'string' ? estado.split(',').map((e) => e.trim()).filter((e) => e !== '') : [];
    return repo.listarOrdensRecentes(mes.ctx.banco, { estados, ...pagina(req.query, 300, 300) });
  });

  /** Totais da tela Qualidade: todas as ordens aprovadas e reprovadas, e não só as da página carregada. */
  app.get('/api/mes/qualidade', async () => {
    const c = await repo.contarOrdens(mes.ctx.banco, ['aprovada', 'reprovada']);
    return { aprovadas: c.aprovada, reprovadas: c.reprovada };
  });

  app.get('/api/mes/ordens/:numero', async (req, reply) => {
    const n = inteiroPositivo((req.params as { numero: string }).numero);
    const d = n === null ? null : await mes.dossie(n);
    return d ?? reply.code(404).send({ erro: 'ordem_inexistente' });
  });

  /** OP manual (sem pedido da Loja). */
  app.post('/api/mes/ordens', async (req, reply) => {
    const c = objeto(req.body);
    const receita = { volume: numero(c.volume), temperatura: numero(c.temperatura), vazao: numero(c.vazao), pressao: numero(c.pressao) };
    // tolerância ausente = a padrão (±2 °C, ±0,5 L); presente e sem valor (campo em branco na tela) é erro, não padrão
    const tolerancia = (v: unknown, padrao: number) => (v === undefined ? padrao : (numero(v) ?? Number.NaN));
    const tolerancias = { temperatura: tolerancia(c.tolTemperatura, 2), volume: tolerancia(c.tolVolume, 0.5) };
    const r = await mes.emitirOrdens([{ origem: ORIGEM_MANUAL, receita: receita as never, tolerancias, autor: null }]);
    if (r.ok) return reply.code(201).send({ ok: true, numero: r.numeros[0] });
    // a OP manual é sempre nova: só a receita ou as tolerâncias podem estar erradas
    return reply.code(422).send({ erro: 'receita_invalida', erros: r.codigo === 'receita_invalida' ? r.erros.map(({ indice: _, ...e }) => e) : [] });
  });

  app.post('/api/mes/ordens/:numero/cancelar', async (req, reply) => {
    const n = inteiroPositivo((req.params as { numero: string }).numero);
    if (n === null) return reply.code(404).send({ erro: 'ordem_inexistente' });
    const r = await mes.cancelarOrdem(n, null);
    return r === 'nao_pode' || r === 'inexistente' ? reply.code(409).send({ erro: r }) : { resultado: r };
  });

  app.post('/api/mes/ordens/:numero/fixar', async (req, reply) => {
    const n = inteiroPositivo((req.params as { numero: string }).numero);
    const { posicao } = objeto(req.body);
    const p = posicao === null ? null : inteiroPositivo(posicao);
    if (n === null || (posicao !== null && p === null)) return reply.code(400).send({ erro: 'pedido_invalido' });
    return (await mes.fixar(n, p, null)) ? { ok: true } : reply.code(409).send({ erro: 'nao_pode' });
  });

  app.post('/api/mes/ordens/:numero/registrar-abortada', async (req, reply) => {
    const n = inteiroPositivo((req.params as { numero: string }).numero);
    return n !== null && (await mes.registrarAbortada(n, null)) ? { ok: true } : reply.code(409).send({ erro: 'nao_pode' });
  });

  /** `sugerido`: o motivo que casa com o intertravamento ativo no CLP agora (null se não há alarme). */
  app.get('/api/mes/paradas', async () => ({
    motivos: MOTIVOS_PARADA,
    sugerido: MOTIVO_DO_ALARME[mes.despachante.estado().alarme ?? 0] ?? null,
    paradas: await mes.paradas(),
  }));

  app.post('/api/mes/paradas', async (req, reply) => {
    const { motivo, observacao } = objeto(req.body);
    const r = await mes.abrirParada(String(motivo), texto(observacao), null);
    return r.ok ? reply.code(201).send(r) : reply.code(409).send({ erro: r.codigo });
  });

  app.post('/api/mes/paradas/:id/encerrar', async (req, reply) => {
    const id = inteiroPositivo((req.params as { id: string }).id);
    return id !== null && (await mes.encerrarParada(id, null)) ? { ok: true } : reply.code(409).send({ erro: 'nao_pode' });
  });

  /** Últimos registros do MES, do mais novo ao mais antigo: `?limite=` (até 500) e `?antes=<id>` paginam. */
  app.get('/api/mes/eventos', async (req) => repo.eventosRecentes(mes.ctx.banco, pagina(req.query, 100, 500)));

  app.get('/api/mes/indicadores', async () => mes.indicadores());

  app.get('/api/mes/relatorio.csv', async (_req, reply) => {
    const data = new Date().toISOString().slice(0, 10);
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="relatorio-aula-${data}.csv"`)
      .send(await mes.relatorioCsv());
  });
}
