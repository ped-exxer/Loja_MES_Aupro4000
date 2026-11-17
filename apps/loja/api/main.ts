// Loja: um sistema próprio, num contêiner próprio. Serve a API do ERP (vitrine, pedidos, faturas, catálogo,
// certificado) e a tela da Loja. Guarda tudo na base "loja". Fala com o MES só por HTTP (MES_URL); nunca com o
// gateway nem com a base do MES.

import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import { criarBanco, criarTabelas, esperarBanco, registrarSistema, registrarTela, registrarTempoReal } from '@aupro/servidor';
import { ErroMes, criarClienteMes } from './cliente-mes.ts';
import { TABELAS_ERP, criarErp, semearCatalogo } from './erp.ts';
import { acompanharMes } from './mudancas.ts';

const PORTA = Number(process.env.PORTA ?? 8080);
const MES_URL = process.env.MES_URL ?? 'http://localhost:8081';
const TELA = process.env.TELA ?? fileURLToPath(new URL('../web/dist', import.meta.url));

const banco = criarBanco({ usuario: 'loja', senha: 'loja', nome: 'loja' });
await esperarBanco(banco);
await criarTabelas(banco, TABELAS_ERP);
await semearCatalogo(banco);

const app = Fastify({ logger: { level: process.env.LOG ?? 'warn' } });
const tempoReal = registrarTempoReal(app);
const mes = criarClienteMes(MES_URL);

// Erro do MES numa rota: fora do ar vira 503 'mes_fora_do_ar' (a tela traduz); recusa do MES (409, 422) passa adiante.
app.setErrorHandler((erro, _req, reply) => {
  if (erro instanceof ErroMes) {
    return reply.code(erro.status).send({ erro: erro.codigo, ...(erro.dados?.erros ? { erros: erro.dados.erros } : {}) });
  }
  reply.log.error(erro);
  return reply.code((erro as { statusCode?: number }).statusCode ?? 500).send({ erro: 'interno' });
});

criarErp(app, banco, mes, tempoReal);
registrarSistema(app, 'loja', { url: process.env.MES_URL_PUBLICA, porta: process.env.MES_PORTA_PUBLICA });
const acompanhamento = acompanharMes({ banco, mes, tempoReal });

/** Saúde da Loja: 503 só se a base dela não responde (o MES fora do ar aparece, mas a Loja continua de pé). */
app.get('/api/saude', async (_req, reply) => {
  const [bancoOk, mesOk] = await Promise.all([
    banco.query('SELECT 1').then(() => true, () => false),
    mes.saude().then(() => true, () => false),
  ]);
  return reply.code(bancoOk ? 200 : 503).send({ sistema: 'loja', loja: 'ok', banco: bancoOk ? 'ok' : 'erro', mes: mesOk ? 'ok' : 'erro' });
});

registrarTela(app, TELA);

const encerrar = async () => {
  acompanhamento.parar();
  await app.close();
  await banco.end();
  process.exit(0);
};
process.on('SIGTERM', encerrar);
process.on('SIGINT', encerrar);

await app.listen({ host: '0.0.0.0', port: PORTA });
acompanhamento.iniciar();
console.log(`Loja na porta ${PORTA}, MES em ${MES_URL}`);
