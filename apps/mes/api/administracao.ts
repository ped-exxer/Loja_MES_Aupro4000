// Administração do MES (professor): configuração da bancada, procurar o DB, falhas do simulador, reiniciar o MES.
// "Reiniciar a aula" inteira é da Loja: ela apaga os dados dela e chama o reiniciar daqui (o MES não chama a Loja).

import type { FastifyInstance } from 'fastify';
import { objeto, type Banco } from '@aupro/servidor';
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
    /**
     * Manda a configuração nova ao gateway e faz o despacho reconciliar com o CLP que está do outro lado agora.
     * Fora do ciclo do despacho (um por vez): senão um ciclo leria de um CLP e escreveria no outro.
     */
    aplicarNoGateway: (c: Omit<Configuracao, 'inicioAula'>) => Promise<void>;
  },
): void {
  app.get('/api/admin/configuracao', async () => p.configuracao.ler());

  app.put('/api/admin/configuracao', async (req, reply) => {
    const v = validarConfiguracao(objeto(req.body));
    if (!v.ok) return reply.code(422).send({ erro: 'configuracao_invalida', erros: v.erros });
    await salvarConfiguracao(p.banco, v.valor);
    p.configuracao.invalidar();
    await p.aplicarNoGateway(v.valor); // se o gateway estiver fora, o despacho reenvia quando ele voltar
    p.tempoReal.publicar('configuracao', {});
    return { ok: true };
  });

  /** Procura os DBs MES e MB_Simulador pela assinatura, com a configuração da tela (ainda não salva). */
  app.post('/api/admin/procurar-db', async (req, reply) => {
    const atual = await p.configuracao.ler();
    const v = validarConfiguracao({ ...atual, ...objeto(req.body) });
    if (!v.ok) return reply.code(422).send({ erro: 'configuracao_invalida', erros: v.erros });
    try {
      return await p.gateway.procurar(paraGateway(v.valor));
    } catch (erro) {
      return reply.code(502).send({
        erro: erro instanceof ErroGateway ? erro.codigo : 'gateway', mensagem: erro instanceof Error ? erro.message : String(erro),
      });
    }
  });

  app.get('/api/admin/gateway', async (_req, reply) => {
    try {
      return await p.gateway.saude();
    } catch (erro) {
      return reply.code(502).send({ erro: 'gateway_inacessivel', mensagem: String(erro) });
    }
  });

  /**
   * Falhas do simulador para a aula: `nenhuma`, `congelar`, `abortar` ou `alarme` (um intertravamento; `alarme` =
   * código da tabela ALARME do contrato do CLP, padrão PSH-103).
   */
  app.post('/api/admin/simulador/falha', async (req, reply) => {
    const { falha, alarme } = objeto(req.body);
    try {
      await p.gateway.falhaSimulada(String(falha), typeof alarme === 'number' ? alarme : undefined);
      return { ok: true };
    } catch (erro) {
      const codigo = erro instanceof ErroGateway ? erro.codigo : 'gateway';
      // falha ou código de alarme que não existe: 400; driver que não é o simulado (ou gateway fora): 409
      return reply.code(codigo === 'pedido_invalido' ? 400 : 409).send({ erro: codigo });
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
