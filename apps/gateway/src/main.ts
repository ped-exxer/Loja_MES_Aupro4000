// Gateway: o único que fala com o CLP (ROTEIRO, seção 5). Um driver por fábrica: simulado ou s7.
// HTTP simples, só para o MES (a Loja não fala com o gateway):
//   GET  /saude               situação da conexão
//   GET  /leitura             DB MES decodificado + variáveis de processo
//   PUT  /escrita             grava a área de escrita do MES (ValoresEscrita)
//   PUT  /configuracao        troca driver, IP, rack, slot, DBs
//   POST /procurar-db         acha os DBs pela assinatura (corpo: configuração a testar)
//   POST /simulador/falha     só no simulado: { falha: "nenhuma" | "congelar" | "abortar" }

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { ConfiguracaoDriver } from './driver.ts';
import { CONFIGURACAO_PADRAO, ErroGateway, Servico } from './servico.ts';
import type { FalhaSimulada } from './simulado.ts';

const PORTA = Number(process.env.PORTA ?? 4000);

const servico = new Servico({
  ...CONFIGURACAO_PADRAO,
  driver: process.env.DRIVER === 's7' ? 's7' : 'simulado',
  escalaSimulador: Number(process.env.ESCALA_SIMULADOR ?? CONFIGURACAO_PADRAO.escalaSimulador),
});

function responder(res: ServerResponse, status: number, corpo?: unknown) {
  if (corpo === undefined) {
    res.writeHead(status).end();
    return;
  }
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(corpo));
}

async function lerCorpo(req: IncomingMessage): Promise<unknown> {
  const partes: Buffer[] = [];
  for await (const parte of req) partes.push(parte as Buffer);
  const texto = Buffer.concat(partes).toString('utf8');
  return texto ? JSON.parse(texto) : {};
}

function configuracaoDe(corpo: unknown): ConfiguracaoDriver {
  const c = corpo as Partial<ConfiguracaoDriver>;
  const numero = (v: unknown, padrao: number) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : padrao);
  return {
    driver: c.driver === 's7' ? 's7' : 'simulado',
    ip: typeof c.ip === 'string' ? c.ip : CONFIGURACAO_PADRAO.ip,
    rack: numero(c.rack, CONFIGURACAO_PADRAO.rack),
    slot: numero(c.slot, CONFIGURACAO_PADRAO.slot),
    numeroDb: numero(c.numeroDb, CONFIGURACAO_PADRAO.numeroDb),
    numeroDbProcesso: typeof c.numeroDbProcesso === 'number' ? c.numeroDbProcesso : null,
    escalaSimulador:
      typeof c.escalaSimulador === 'number' && c.escalaSimulador > 0 ? c.escalaSimulador : CONFIGURACAO_PADRAO.escalaSimulador,
  };
}

async function tratar(req: IncomingMessage, res: ServerResponse) {
  const rota = `${req.method} ${req.url}`;
  switch (rota) {
    case 'GET /saude':
      return responder(res, 200, { gateway: 'ok', ...servico.situacao() });
    case 'GET /leitura':
      return responder(res, 200, await servico.ler());
    case 'PUT /escrita':
      await servico.gravar((await lerCorpo(req)) as never);
      return responder(res, 204);
    case 'PUT /configuracao':
      await servico.configurar(configuracaoDe(await lerCorpo(req)));
      return responder(res, 204);
    case 'POST /procurar-db':
      return responder(res, 200, await servico.procurar(configuracaoDe(await lerCorpo(req))));
    case 'POST /simulador/falha': {
      const { falha } = (await lerCorpo(req)) as { falha?: FalhaSimulada };
      const ok = falha === 'nenhuma' || falha === 'congelar' || falha === 'abortar' ? servico.falhaSimulada(falha) : false;
      return responder(res, ok ? 204 : 409, ok ? undefined : { erro: 'so_no_simulado' });
    }
    default:
      return responder(res, 404, { erro: 'rota_inexistente' });
  }
}

const servidor = createServer((req, res) => {
  tratar(req, res).catch((erro: unknown) => {
    if (erro instanceof ErroGateway) return responder(res, 503, { erro: erro.codigo, mensagem: erro.message });
    if (erro instanceof RangeError || erro instanceof SyntaxError) return responder(res, 400, { erro: 'pedido_invalido', mensagem: erro.message });
    console.error(erro);
    return responder(res, 500, { erro: 'interno' });
  });
});

const encerrar = () => servidor.close(() => process.exit(0));
process.on('SIGTERM', encerrar);
process.on('SIGINT', encerrar);

servidor.listen(PORTA, '0.0.0.0', () => console.log(`gateway na porta ${PORTA}, driver ${servico.config.driver}`));
