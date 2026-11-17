// Administração do MES (professor): configuração da bancada, procurar o DB, falhas do simulador, reiniciar o MES.
// "Reiniciar a aula" inteira é da Loja: ela apaga os dados dela e chama o reiniciar daqui (o MES não chama a Loja).

import type { FastifyInstance } from 'fastify';
import type { Banco } from '@aupro/servidor';
import { ErroGateway, type ClienteGateway } from './cliente-gateway.ts';
import {
  lerConfiguracao,
  marcarInicioAula,
  paraGateway,
  salvarConfiguracao,
  validarConfiguracao,
  type Configuracao,
} from './configuracao.ts';
import type { TempoReal } from '@aupro/servidor';

/** Configuração lida do banco, guardada em memória (o despacho pede a cada ciclo). */
export function criarLeitorConfiguracao(banco: Banco) {
  let cache: Configuracao | null = null;
  return {
    ler: async () => (cache ??= await lerConfiguracao(banco)),
    invalidar: () => {
      cache = null;
    },
  };
}

export function registrarRotasAdministracao(
  app: FastifyInstance,
  p: {
    banco: Banco;
    gateway: ClienteGateway;
    tempoReal: TempoReal;
    configuracao: ReturnType<typeof criarLeitorConfiguracao>;
    reiniciar: () => Promise<void>;
  },
): void {
  app.get('/api/admin/configuracao', async () => p.configuracao.ler());

  app.put('/api/admin/configuracao', async (req, reply) => {
    const v = validarConfiguracao(req.body as Partial<Configuracao>);
    if (!v.ok) return reply.code(422).send({ erro: 'configuracao_invalida', erros: v.erros });
    await salvarConfiguracao(p.banco, v.valor);
    p.configuracao.invalidar();
    await p.gateway.configurar(paraGateway(v.valor)).catch(() => undefined); // o despacho reenvia se o gateway estiver fora
    p.tempoReal.publicar('configuracao', {});
    return { ok: true };
  });

  /** Procura os DBs MES e MB_Simulador pela assinatura, com a configuração da tela (ainda não salva). */
  app.post('/api/admin/procurar-db', async (req, reply) => {
    const atual = await p.configuracao.ler();
    const v = validarConfiguracao({ ...atual, ...(req.body as Partial<Configuracao>) });
    if (!v.ok) return reply.code(422).send({ erro: 'configuracao_invalida', erros: v.erros });
    try {
      return await p.gateway.procurar(paraGateway(v.valor));
    } catch (erro) {
      return reply.code(502).send({ erro: erro instanceof ErroGateway ? erro.codigo : 'gateway', mensagem: String(erro) });
    }
  });

  app.get('/api/admin/gateway', async (_req, reply) => {
    try {
      return await p.gateway.saude();
    } catch (erro) {
      return reply.code(502).send({ erro: 'gateway_inacessivel', mensagem: String(erro) });
    }
  });

  app.post('/api/admin/simulador/falha', async (req, reply) => {
    const { falha } = req.body as { falha?: string };
    try {
      await p.gateway.falhaSimulada(String(falha));
      return { ok: true };
    } catch (erro) {
      return reply.code(409).send({ erro: erro instanceof ErroGateway ? erro.codigo : 'gateway' });
    }
  });

  app.post('/api/admin/reiniciar', async () => {
    await p.reiniciar();
    await marcarInicioAula(p.banco);
    p.configuracao.invalidar();
    p.tempoReal.publicar('reiniciado', {});
    return { ok: true };
  });
}
