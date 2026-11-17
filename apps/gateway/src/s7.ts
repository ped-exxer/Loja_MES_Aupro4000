// Driver S7 PUT/GET da bancada física (ROTEIRO, seções 6.1 e 6.6), pela biblioteca nodes7.
// Provado contra o servidor S7 de teste (teste/servidor-s7.ts, uma imitação do protocolo): s7.test.ts.
// AINDA NÃO PROVADO NUMA CPU REAL: é a primeira tarefa da fase 4.
//
// O que a leitura do nodes7 e a prova contra o servidor de teste mostraram (e que este arquivo trata):
// - se o equipamento aceita o TCP e não responde ao ISO-on-TCP, o nodes7 não chama o retorno da conexão (fica
//   tentando de novo sozinho, a cada 2 s): `conectar` tem o próprio tempo-limite;
// - item que falhou vem como lista de textos "BAD 255", sem o código de erro do S7, igual para "DB não existe" e
//   para "a conexão caiu": a mensagem de erro é montada aqui, olhando o estado da conexão;
// - quando uma leitura falha, o nodes7 abre outra conexão por conta própria, e depois de fechar deixa
//   temporizadores armados (2,5 s e 3,5 s): `encerrarConexao` desarma tudo e destrói o soquete, e cada conexão
//   nova é um objeto novo. Assim a CPU (que tem poucas conexões) nunca fica com uma pendurada.

import NodeS7 from 'nodes7';
import { AREA_ASSINATURA, AREA_ESCRITA, TAMANHO_DB, conferirAssinatura } from '@aupro/contrato-clp';
import type { ConfiguracaoDriver, DbsEncontrados, Driver, Processo } from './driver.ts';

export const PORTA_S7 = 102;
/**
 * Tempo-limite de cada pedido à CPU. Menor que o tempo que o MES espera o gateway (3 s): se a CPU não responde, o
 * gateway ainda devolve ao MES o erro do S7, em vez de o MES desistir sem saber por quê.
 */
const TEMPO_LIMITE_MS = 2000;
/** Folga do tempo-limite daqui sobre o do nodes7 (que deveria avisar antes). */
const FOLGA_MS = 500;
/** Faixa de DBs varrida pelo "procurar". */
export const MAIOR_DB_PROCURADO = 500;
/** DBs conferidos por leitura no "procurar" (2 itens por DB; o nodes7 divide em pedidos do tamanho do PDU). */
const DBS_POR_LEITURA = 20;
/** Estado do nodes7 com a conexão pronta (PDU negociado). */
const CONECTADO = 4;

/** DB `MB_Simulador` do Simmaq 3DX (docs/05-comunicacao-modbus.md lá): só leitura. */
export const MB_SIMULADOR = {
  /** 40001..40008 = bytes 0..15: nível TQ-02 (%), vazão FIT-102 (m³/h), pressão PIT-103 (bar), temperatura TIT-104 (°C). */
  processo: 'REAL0.4',
  assinatura: { byte: 126, tamanho: 6, palavra: 0x5358, valor: 4000.25 },
  volumeTq02L: 25,
} as const;

export type OpcoesS7 = { tempoLimiteMs?: number };

function bytesDe(valor: unknown, tamanho: number): Uint8Array | null {
  if (!Array.isArray(valor) || valor.length !== tamanho || valor.some((v) => typeof v !== 'number')) return null;
  return Uint8Array.from(valor as number[]);
}

function assinaturaMbSimulador(bytes: Uint8Array): boolean {
  const d = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return d.getUint16(0, false) === MB_SIMULADOR.assinatura.palavra && d.getFloat32(2, false) === MB_SIMULADOR.assinatura.valor;
}

/** O nodes7 devolve o erro de conexão como Error, como texto ou como objeto solto ({ code }). */
function descreverErro(erro: unknown): string {
  if (typeof erro === 'string') return erro;
  const e = erro as { code?: unknown; message?: unknown } | null;
  if (e && typeof e.code === 'string') return e.code === 'EUSERTIMEOUT' ? 'sem resposta (tempo esgotado)' : e.code;
  if (e && typeof e.message === 'string') return e.message;
  return String(erro);
}

/**
 * Fecha a conexão do nodes7 e desarma o que ele deixa para depois (nova tentativa de conexão, "reset" em 3,5 s,
 * espera de 2,5 s pelo fechamento): sem isso o objeto antigo pode voltar a conectar sozinho e o processo demora a
 * terminar. Não espera mais que meio segundo: um soquete que nunca conectou não avisa que fechou.
 */
function encerrarConexao(c: NodeS7): Promise<void> {
  return new Promise((ok) => {
    let feito = false;
    const fim = () => {
      if (feito) return;
      feito = true;
      clearTimeout(limite);
      clearTimeout(c.resetTimeout);
      c.resetTimeout = undefined;
      c.resetPending = false;
      clearTimeout(c.dropConnectionTimer ?? undefined);
      c.dropConnectionCallback = null;
      c.connectionCleanup(); // destrói o soquete e tira os ouvintes
      ok();
    };
    const limite = setTimeout(fim, FOLGA_MS);
    try {
      c.dropConnection(fim);
    } catch {
      fim();
    }
  });
}

export class DriverS7 implements Driver {
  readonly tipo = 's7';
  private conexao: NodeS7 | null = null;
  private itensAtuais: string[] = [];
  private config: ConfiguracaoDriver;
  private tempoLimiteMs: number;

  constructor(config: ConfiguracaoDriver, opcoes: OpcoesS7 = {}) {
    this.config = config;
    this.tempoLimiteMs = opcoes.tempoLimiteMs ?? TEMPO_LIMITE_MS;
  }

  private get destino(): string {
    const porta = this.config.porta ?? PORTA_S7;
    return porta === PORTA_S7 ? this.config.ip : `${this.config.ip}:${porta}`;
  }

  async conectar(): Promise<void> {
    if (this.conexao) return;
    const conexao = new NodeS7({ silent: true });
    conexao.setTranslationCB((tag) => tag);
    try {
      await new Promise<void>((ok, falha) => {
        // o nodes7 não avisa quando a CPU aceita o TCP mas não responde ao ISO-on-TCP: tempo-limite próprio
        const limite = setTimeout(
          () => falha(new Error(`S7: ${this.destino} não respondeu como uma CPU S7 (conexão ISO-on-TCP sem resposta)`)),
          this.tempoLimiteMs + FOLGA_MS,
        );
        conexao.initiateConnection(
          {
            host: this.config.ip, port: this.config.porta ?? PORTA_S7, rack: this.config.rack, slot: this.config.slot,
            timeout: this.tempoLimiteMs,
          },
          (erro) => {
            clearTimeout(limite);
            if (erro) falha(new Error(`S7: não conectou em ${this.destino} (rack ${this.config.rack}, slot ${this.config.slot}): ${descreverErro(erro)}`));
            else ok();
          },
        );
      });
    } catch (erro) {
      await encerrarConexao(conexao);
      throw erro;
    }
    this.conexao = conexao;
    this.itensAtuais = [];
  }

  async desconectar(): Promise<void> {
    const c = this.conexao;
    this.conexao = null;
    this.itensAtuais = [];
    if (c) await encerrarConexao(c);
  }

  /** Lê itens com o nodes7; devolve os valores (item que falhou vem como lista de textos "BAD 255"). */
  private async lerItens(itens: string[]): Promise<Record<string, unknown>> {
    const c = this.conexao;
    if (!c) throw new Error('S7: sem conexão');
    if (itens.join('|') !== this.itensAtuais.join('|')) {
      c.removeItems(); // sem argumento: tira todos (a troca só vale na próxima leitura, na ordem pedida)
      c.addItems(itens);
      this.itensAtuais = itens;
    }
    return new Promise((ok, falha) => {
      const limite = setTimeout(() => falha(new Error('S7: leitura sem resposta da CPU')), this.tempoLimiteMs + FOLGA_MS);
      c.readAllItems((_algumRuim, valores) => {
        clearTimeout(limite);
        ok(valores ?? {});
      });
    });
  }

  /** A conexão continua de pé depois de um pedido? (o nodes7 zera o estado quando a CPU some ou responde errado) */
  private conexaoDePe(): boolean {
    return this.conexao?.isoConnectionState === CONECTADO;
  }

  async ler(): Promise<{ mes: Uint8Array; processo: Processo | null }> {
    const itemMes = `DB${this.config.numeroDb},BYTE0.${TAMANHO_DB}`;
    const itemProcesso =
      this.config.numeroDbProcesso === null ? null : `DB${this.config.numeroDbProcesso},${MB_SIMULADOR.processo}`;
    const valores = await this.lerItens(itemProcesso ? [itemMes, itemProcesso] : [itemMes]);
    const mes = bytesDe(valores[itemMes], TAMANHO_DB);
    if (!mes) {
      throw new Error(
        this.conexaoDePe()
          ? `S7: a CPU recusou a leitura do DB ${this.config.numeroDb}: o DB não existe ou tem menos de ${TAMANHO_DB} bytes`
          : `S7: a CPU em ${this.destino} não respondeu à leitura do DB ${this.config.numeroDb} (conexão caiu, ou o acesso PUT/GET não está liberado na CPU)`,
      );
    }
    return { mes, processo: itemProcesso ? this.processoDe(valores[itemProcesso]) : null };
  }

  async gravarEscrita(bytes: Uint8Array): Promise<void> {
    const c = this.conexao;
    if (!c) throw new Error('S7: sem conexão');
    if (bytes.length !== AREA_ESCRITA.tamanho) throw new RangeError('tamanho da área de escrita');
    const item = `DB${this.config.numeroDb},BYTE${AREA_ESCRITA.inicio}.${AREA_ESCRITA.tamanho}`;
    await new Promise<void>((ok, falha) => {
      const limite = setTimeout(() => falha(new Error('S7: escrita sem resposta da CPU')), this.tempoLimiteMs + FOLGA_MS);
      const naFila = c.writeItems(item, Array.from(bytes), (algumRuim) => {
        clearTimeout(limite);
        if (!algumRuim) return ok();
        falha(new Error(
          this.conexaoDePe()
            ? `S7: a CPU recusou a escrita no DB ${this.config.numeroDb} (DB protegido contra escrita ou inexistente)`
            : `S7: a CPU em ${this.destino} não respondeu à escrita no DB ${this.config.numeroDb}`,
        ));
      });
      if (naFila !== 0) {
        clearTimeout(limite);
        falha(new Error('S7: escrita anterior ainda em andamento'));
      }
    });
  }

  /** Variáveis de processo do MB_Simulador; null se o DB não respondeu (as telas ficam sem elas, o resto segue). */
  private processoDe(v: unknown): Processo | null {
    if (!Array.isArray(v) || v.length !== 4 || v.some((x) => typeof x !== 'number' || !Number.isFinite(x))) return null;
    const [nivelPct, vazaoM3h, pressao, temperatura] = v as number[];
    return {
      nivel: (nivelPct * MB_SIMULADOR.volumeTq02L) / 100,
      vazao: (vazaoM3h * 1000) / 60,
      pressao,
      temperatura,
    };
  }

  /**
   * Varre os DBs 1..MAIOR_DB_PROCURADO lendo onde ficariam as assinaturas do DB `MES` e do `MB_Simulador`; fica com
   * o de menor número de cada um. Vários DBs por leitura: uma CPU sem os DBs é varrida em ~25 leituras, não em 500.
   */
  async procurarDbs(): Promise<DbsEncontrados> {
    const achados: DbsEncontrados = { mes: null, processo: null };
    const a = MB_SIMULADOR.assinatura;
    const itemMes = (n: number) => `DB${n},BYTE${AREA_ASSINATURA.inicio}.${AREA_ASSINATURA.tamanho}`;
    const itemMb = (n: number) => `DB${n},BYTE${a.byte}.${a.tamanho}`;
    for (let inicio = 1; inicio <= MAIOR_DB_PROCURADO && (achados.mes === null || achados.processo === null); inicio += DBS_POR_LEITURA) {
      const numeros: number[] = [];
      for (let n = inicio; n < inicio + DBS_POR_LEITURA && n <= MAIOR_DB_PROCURADO; n++) numeros.push(n);
      const valores = await this.lerItens(numeros.flatMap((n) => [itemMes(n), itemMb(n)]));
      // DB que não existe vem como item ruim: normal. Conexão caída também: aí a busca não vale.
      if (!this.conexaoDePe()) throw new Error(`S7: a conexão com ${this.destino} caiu durante a busca dos DBs`);
      for (const n of numeros) {
        const mes = bytesDe(valores[itemMes(n)], AREA_ASSINATURA.tamanho);
        const mb = bytesDe(valores[itemMb(n)], a.tamanho);
        if (achados.mes === null && mes && conferirAssinatura(mes)) achados.mes = n;
        if (achados.processo === null && mb && assinaturaMbSimulador(mb)) achados.processo = n;
      }
    }
    return achados;
  }
}
