// MES: um sistema próprio, num contêiner próprio. Serve a API do MES, o contrato com a Loja (/api/ordens/*) e a
// tela do MES. Fala com o CLP só pelo gateway; guarda tudo na base "mes". Não conhece a Loja (só o link na tela).

import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import { criarBanco, criarTabelas, esperarBanco, registrarSistema, registrarTela, registrarTempoReal } from '@aupro/servidor';
import { criarClienteGateway } from './cliente-gateway.ts';
import { TABELAS_CONFIGURACAO } from './configuracao.ts';
import { criarLeitorConfiguracao, registrarRotasAdministracao } from './administracao.ts';
import { TABELAS_MES, atualizarEsquema } from './esquema.ts';
import { Mes } from './nucleo.ts';
import { registrarRotasMes } from './rotas.ts';
import { registrarRotasIntegracao } from './integracao.ts';

const PORTA = Number(process.env.PORTA ?? 8081);
const GATEWAY_URL = process.env.GATEWAY_URL ?? 'http://localhost:4000';
const TELA = process.env.TELA ?? fileURLToPath(new URL('../web/dist', import.meta.url));

const banco = criarBanco({ usuario: 'mes', senha: 'mes', nome: 'mes' });
await esperarBanco(banco);
await criarTabelas(banco, [...TABELAS_CONFIGURACAO, ...TABELAS_MES]);
await atualizarEsquema(banco);

const app = Fastify({ logger: { level: process.env.LOG ?? 'warn' } });
const tempoReal = registrarTempoReal(app);
const gateway = criarClienteGateway(GATEWAY_URL);
const configuracao = criarLeitorConfiguracao(banco);

const mes = new Mes({ banco, gateway, tempoReal, configuracao: configuracao.ler });
registrarRotasMes(app, mes);
registrarRotasIntegracao(app, mes);
registrarRotasAdministracao(app, { banco, gateway, tempoReal, configuracao, reiniciar: () => mes.reiniciar() });
registrarSistema(app, 'mes', { url: process.env.LOJA_URL_PUBLICA, porta: process.env.LOJA_PORTA_PUBLICA });

/** Saúde do MES: 503 só se a base dele não responde (o gateway fora do ar aparece, mas o MES continua de pé). */
app.get('/api/saude', async (_req, reply) => {
  const [bancoOk, gatewayOk] = await Promise.all([
    banco.query('SELECT 1').then(() => true, () => false),
    gateway.saude().then(() => true, () => false),
  ]);
  return reply
    .code(bancoOk ? 200 : 503)
    .send({ sistema: 'mes', mes: 'ok', banco: bancoOk ? 'ok' : 'erro', gateway: gatewayOk ? 'ok' : 'erro' });
});

registrarTela(app, TELA);

const encerrar = async () => {
  mes.despachante.parar();
  await app.close();
  await banco.end();
  process.exit(0);
};
process.on('SIGTERM', encerrar);
process.on('SIGINT', encerrar);

await app.listen({ host: '0.0.0.0', port: PORTA });
mes.despachante.iniciar();
console.log(`MES na porta ${PORTA}`);
