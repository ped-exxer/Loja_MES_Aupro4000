// Backend da Loja: módulo ERP + módulo MES, que conversam só pela InterfaceMes.
// Fala com o CLP só pelo gateway.

import Fastify from 'fastify';
import { criarBanco, criarTabelas, esperarBanco } from './banco.ts';
import { criarClienteGateway } from './cliente-gateway.ts';
import { TABELAS_COMUNS } from './configuracao.ts';
import { criarLeitorConfiguracao, registrarRotasAdministracao } from './administracao.ts';
import { registrarTempoReal } from './tempo-real.ts';
import { Mes, TABELAS_MES, registrarRotasMes } from './modulos/mes/index.ts';
import { TABELAS_ERP, criarErp, semearCatalogo } from './modulos/erp/index.ts';

const PORTA = Number(process.env.PORTA ?? 3000);
const GATEWAY_URL = process.env.GATEWAY_URL ?? 'http://localhost:4000';

const banco = criarBanco();
await esperarBanco(banco);
await criarTabelas(banco, [...TABELAS_COMUNS, ...TABELAS_MES, ...TABELAS_ERP]);
await semearCatalogo(banco);

const app = Fastify({ logger: { level: process.env.LOG ?? 'warn' } });
const tempoReal = registrarTempoReal(app);
const gateway = criarClienteGateway(GATEWAY_URL);
const configuracao = criarLeitorConfiguracao(banco);

const mes = new Mes({ banco, gateway, tempoReal, configuracao: configuracao.ler });
registrarRotasMes(app, mes);
const erp = criarErp(app, banco, mes, tempoReal);

registrarRotasAdministracao(app, {
  banco,
  gateway,
  tempoReal,
  configuracao,
  reiniciar: async () => {
    await erp.reiniciar();
    await mes.reiniciar();
  },
});

app.get('/api/saude', async () => {
  const [bancoOk, gatewayOk] = await Promise.all([
    banco.query('SELECT 1').then(() => true, () => false),
    gateway.saude().then(() => true, () => false),
  ]);
  return { api: 'ok', banco: bancoOk ? 'ok' : 'erro', gateway: gatewayOk ? 'ok' : 'erro' };
});

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
console.log(`api na porta ${PORTA}`);
