// Loja: um sistema próprio, num contêiner próprio. Serve a API do ERP (vitrine, pedidos, faturas, catálogo,
// certificado) e a tela da Loja. Guarda tudo na base "loja". Fala com o MES só por HTTP (MES_URL); nunca com o
// gateway nem com a base do MES.

import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import { criarBanco, criarTabelas, esperarBanco, registrarSistema, registrarTela, registrarTempoReal } from '@aupro/servidor';
import { criarClienteMes } from './cliente-mes.ts';
import { TABELAS_ERP, criarErp, registrarErros, semearCatalogo } from './erp.ts';
import { acompanharMes, type EmissoesEmAndamento } from './mudancas.ts';

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

registrarErros(app);

/** Itens cujo pedido está sendo gravado agora: o acompanhamento do feed espera por eles (mudancas.ts). */
const emAndamento: EmissoesEmAndamento = new Set();
criarErp(app, banco, mes, tempoReal, emAndamento);
registrarSistema(app, 'loja', { url: process.env.MES_URL_PUBLICA, porta: process.env.MES_PORTA_PUBLICA });
const acompanhamento = acompanharMes({ banco, mes, tempoReal, emAndamento });

/** Saúde da Loja: 503 só se a base dela não responde (o MES fora do ar aparece, mas a Loja continua de pé). */
app.get('/api/saude', async (_req, reply) => {
  const [bancoOk, mesOk] = await Promise.all([
    banco.query('SELECT 1').then(() => true, () => false),
    mes.saude().then(() => true, () => false),
  ]);
  return reply.code(bancoOk ? 200 : 503).send({ sistema: 'loja', loja: 'ok', banco: bancoOk ? 'ok' : 'erro', mes: mesOk ? 'ok' : 'erro' });
});

registrarTela(app, TELA);

// Encerramento limpo (docker stop): para o acompanhamento do MES, espera o ciclo em andamento, fecha as conexões
// das telas e o banco. Se algo não fechar em 8 s, sai assim mesmo (o Docker mata em 10 s).
let encerrando = false;
const encerrar = async (sinal: string) => {
  if (encerrando) return;
  encerrando = true;
  console.log(`Loja: encerrando (${sinal})`);
  setTimeout(() => process.exit(1), 8000).unref();
  try {
    await acompanhamento.parar();
    await app.close();
    await banco.end();
  } catch (erro) {
    console.error('Loja: erro ao encerrar:', erro);
  }
  process.exit(0);
};
process.on('SIGTERM', () => void encerrar('SIGTERM'));
process.on('SIGINT', () => void encerrar('SIGINT'));

await app.listen({ host: '0.0.0.0', port: PORTA });
acompanhamento.iniciar();
console.log(`Loja na porta ${PORTA}, MES em ${MES_URL}`);
