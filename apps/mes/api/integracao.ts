// Contrato HTTP do MES com quem emite ordens (a Loja, pela variável MES_URL). ROTEIRO, seção 3.5.
// Os formatos estão em packages/dominio/src/integracao.ts. O MES não chama ninguém: a Loja pergunta.
//
//   POST /api/ordens                    { ordens: PedidoOrdem[] } → 201 { numeros }   (todas ou nenhuma)
//   POST /api/ordens/:numero/cancelar   → { resultado: 'cancelada' | 'pendente' } | 409 { erro }
//   POST /api/ordens/prazos             { receitas } → { prazos }   (promessa de cada uma, somando as da frente)
//   GET  /api/ordens/andamento?numeros=1,2,3 → Andamento[]
//   GET  /api/ordens/mudancas?desde=<cursor> → Mudancas
//   GET  /api/ordens/:numero            → Dossie | 404

import type { FastifyInstance } from 'fastify';
import type { PedidoOrdem, Receita, Tolerancias } from '@aupro/dominio';
import { inteiroPositivo, numero, texto } from '@aupro/servidor';
import type { Mes } from './nucleo.ts';

const MAX_ORDENS = 50;

const receitaDe = (v: unknown): Receita => {
  const r = (v ?? {}) as Record<string, unknown>;
  return {
    volume: numero(r.volume) ?? Number.NaN,
    temperatura: numero(r.temperatura) ?? Number.NaN,
    vazao: numero(r.vazao) ?? Number.NaN,
    pressao: numero(r.pressao) ?? Number.NaN,
  };
};

const toleranciasDe = (v: unknown): Tolerancias => {
  const t = (v ?? {}) as Record<string, unknown>;
  return { temperatura: numero(t.temperatura) ?? Number.NaN, volume: numero(t.volume) ?? Number.NaN };
};

export function registrarRotasIntegracao(app: FastifyInstance, mes: Mes): void {
  app.post('/api/ordens', async (req, reply) => {
    const { ordens } = (req.body ?? {}) as { ordens?: unknown };
    if (!Array.isArray(ordens) || ordens.length === 0 || ordens.length > MAX_ORDENS) {
      return reply.code(400).send({ erro: 'pedido_invalido' });
    }
    const pedidos: PedidoOrdem[] = ordens.map((o: Record<string, unknown>) => ({
      origem: texto(o.origem, 40),
      receita: receitaDe(o.receita),
      tolerancias: toleranciasDe(o.tolerancias),
      prazo: numero(o.prazo) ?? undefined,
      autor: texto(o.autor, 80),
    }));
    const r = await mes.emitirOrdens(pedidos);
    if (!r.ok) {
      const erros = r.erros.map(({ indice, campo, codigo }) => ({ campo: `ordens.${indice}.${campo}`, codigo }));
      return reply.code(422).send({ erro: 'receita_invalida', erros });
    }
    return reply.code(201).send({ numeros: r.numeros });
  });

  app.post('/api/ordens/:numero/cancelar', async (req, reply) => {
    const n = inteiroPositivo((req.params as { numero: string }).numero);
    if (n === null) return reply.code(404).send({ erro: 'inexistente' });
    const r = await mes.cancelarOrdem(n, null);
    return r === 'nao_pode' || r === 'inexistente' ? reply.code(409).send({ erro: r }) : { resultado: r };
  });

  app.post('/api/ordens/prazos', async (req, reply) => {
    const { receitas } = (req.body ?? {}) as { receitas?: unknown };
    if (!Array.isArray(receitas) || receitas.length > MAX_ORDENS) return reply.code(400).send({ erro: 'pedido_invalido' });
    return { prazos: await mes.estimarPrazos(receitas.map(receitaDe)) };
  });

  app.get('/api/ordens/andamento', async (req) => {
    const { numeros } = req.query as { numeros?: string };
    const lista = (numeros ?? '').split(',').map(inteiroPositivo).filter((n): n is number => n !== null);
    return mes.andamento(lista.slice(0, 500));
  });

  app.get('/api/ordens/mudancas', async (req, reply) => {
    const { desde } = req.query as { desde?: string };
    const cursor = desde === undefined || desde === '' ? 0 : Number(desde);
    if (!Number.isInteger(cursor) || cursor < 0) return reply.code(400).send({ erro: 'pedido_invalido' });
    return mes.mudancas(cursor);
  });

  app.get('/api/ordens/:numero', async (req, reply) => {
    const n = inteiroPositivo((req.params as { numero: string }).numero);
    const d = n === null ? null : await mes.dossie(n);
    return d ?? reply.code(404).send({ erro: 'ordem_inexistente' });
  });
}
