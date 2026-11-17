// Driver S7 PUT/GET da bancada física (ROTEIRO, seções 6.1 e 6.6), pela biblioteca nodes7.
// AINDA NÃO PROVADO NUMA CPU REAL: é a primeira tarefa da fase 4.

import NodeS7 from 'nodes7';
import { AREA_ASSINATURA, AREA_ESCRITA, TAMANHO_DB, conferirAssinatura } from '@aupro/contrato-clp';
import type { ConfiguracaoDriver, DbsEncontrados, Driver, Processo } from './driver.ts';

const PORTA_S7 = 102;
const TEMPO_LIMITE_MS = 3000;
/** Faixa de DBs varrida pelo "procurar". */
const MAIOR_DB_PROCURADO = 500;

/** DB `MB_Simulador` do Simmaq 3DX (docs/05-comunicacao-modbus.md lá): só leitura. */
const MB_SIMULADOR = {
  /** 40001..40008 = bytes 0..15: nível TQ-02 (%), vazão FIT-102 (m³/h), pressão PIT-103 (bar), temperatura TIT-104 (°C). */
  processo: 'REAL0.4',
  assinatura: { byte: 126, palavra: 0x5358, valor: 4000.25 },
  volumeTq02L: 25,
} as const;

function bytesDe(valor: unknown, tamanho: number): Uint8Array | null {
  if (!Array.isArray(valor) || valor.length !== tamanho || valor.some((v) => typeof v !== 'number')) return null;
  return Uint8Array.from(valor as number[]);
}

function assinaturaMbSimulador(bytes: Uint8Array): boolean {
  const d = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return d.getUint16(0, false) === MB_SIMULADOR.assinatura.palavra && d.getFloat32(2, false) === MB_SIMULADOR.assinatura.valor;
}

export class DriverS7 implements Driver {
  readonly tipo = 's7';
  private conexao: NodeS7 | null = null;
  private itensAtuais: string[] = [];
  private config: ConfiguracaoDriver;

  constructor(config: ConfiguracaoDriver) {
    this.config = config;
  }

  async conectar(): Promise<void> {
    if (this.conexao) return;
    const conexao = new NodeS7({ silent: true });
    conexao.setTranslationCB((tag) => tag);
    await new Promise<void>((ok, falha) => {
      conexao.initiateConnection(
        { host: this.config.ip, port: PORTA_S7, rack: this.config.rack, slot: this.config.slot, timeout: TEMPO_LIMITE_MS },
        (erro) => (erro ? falha(new Error(`S7: não conectou em ${this.config.ip}: ${String(erro)}`)) : ok()),
      );
    });
    this.conexao = conexao;
    this.itensAtuais = [];
  }

  async desconectar(): Promise<void> {
    const c = this.conexao;
    this.conexao = null;
    if (c) await new Promise<void>((ok) => c.dropConnection(() => ok()));
  }

  /** Lê itens com o nodes7; devolve os valores (item ruim vem como texto "BAD ..."). */
  private async lerItens(itens: string[]): Promise<Record<string, unknown>> {
    const c = this.conexao;
    if (!c) throw new Error('S7: sem conexão');
    if (itens.join('|') !== this.itensAtuais.join('|')) {
      c.removeItems();
      c.addItems(itens);
      this.itensAtuais = itens;
    }
    return new Promise((ok, falha) => {
      const limite = setTimeout(() => falha(new Error('S7: leitura sem resposta')), TEMPO_LIMITE_MS * 2);
      c.readAllItems((_algumRuim, valores) => {
        clearTimeout(limite);
        ok(valores);
      });
    });
  }

  async ler(): Promise<{ mes: Uint8Array; processo: Processo | null }> {
    const itemMes = `DB${this.config.numeroDb},BYTE0.${TAMANHO_DB}`;
    const itemProcesso =
      this.config.numeroDbProcesso === null ? null : `DB${this.config.numeroDbProcesso},${MB_SIMULADOR.processo}`;
    const valores = await this.lerItens(itemProcesso ? [itemMes, itemProcesso] : [itemMes]);
    const mes = bytesDe(valores[itemMes], TAMANHO_DB);
    if (!mes) throw new Error(`S7: leitura do DB ${this.config.numeroDb} falhou (${String(valores[itemMes])})`);
    return { mes, processo: itemProcesso ? this.processoDe(valores[itemProcesso]) : null };
  }

  async gravarEscrita(bytes: Uint8Array): Promise<void> {
    const c = this.conexao;
    if (!c) throw new Error('S7: sem conexão');
    const item = `DB${this.config.numeroDb},BYTE${AREA_ESCRITA.inicio}.${AREA_ESCRITA.tamanho}`;
    await new Promise<void>((ok, falha) => {
      const limite = setTimeout(() => falha(new Error('S7: escrita sem resposta')), TEMPO_LIMITE_MS * 2);
      const naFila = c.writeItems(item, Array.from(bytes), (algumRuim) => {
        clearTimeout(limite);
        algumRuim ? falha(new Error('S7: escrita recusada pela CPU')) : ok();
      });
      if (naFila !== 0) {
        clearTimeout(limite);
        falha(new Error('S7: escrita anterior ainda em andamento'));
      }
    });
  }

  private processoDe(v: unknown): Processo | null {
    if (!Array.isArray(v) || v.length !== 4 || v.some((x) => typeof x !== 'number')) return null;
    const [nivelPct, vazaoM3h, pressao, temperatura] = v as number[];
    return {
      nivel: (nivelPct * MB_SIMULADOR.volumeTq02L) / 100,
      vazao: (vazaoM3h * 1000) / 60,
      pressao,
      temperatura,
    };
  }

  /** Varre os DBs lendo onde ficariam as assinaturas do DB `MES` e do `MB_Simulador`. */
  async procurarDbs(): Promise<DbsEncontrados> {
    const achados: DbsEncontrados = { mes: null, processo: null };
    for (let n = 1; n <= MAIOR_DB_PROCURADO && (achados.mes === null || achados.processo === null); n++) {
      const itemMes = `DB${n},BYTE${AREA_ASSINATURA.inicio}.${AREA_ASSINATURA.tamanho}`;
      const itemMb = `DB${n},BYTE${MB_SIMULADOR.assinatura.byte}.6`;
      const valores = await this.lerItens([itemMes, itemMb]);
      const mes = bytesDe(valores[itemMes], AREA_ASSINATURA.tamanho);
      const mb = bytesDe(valores[itemMb], 6);
      if (achados.mes === null && mes && conferirAssinatura(mes)) achados.mes = n;
      if (achados.processo === null && mb && assinaturaMbSimulador(mb)) achados.processo = n;
    }
    return achados;
  }
}
