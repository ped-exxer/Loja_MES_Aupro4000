// Uma conexão só com o CLP, pedidos em série (ROTEIRO, seção 6.2). Confere a assinatura antes de escrever.

import {
  AREA_ASSINATURA,
  AREA_ESCRITA,
  AREA_LEITURA,
  codificarEscrita,
  conferirAssinatura,
  decodificarEscrita,
  decodificarLeitura,
  type ValoresEscrita,
  type ValoresLeitura,
} from '@aupro/contrato-clp';
import type { ConfiguracaoDriver, DbsEncontrados, Driver, Processo } from './driver.ts';
import { DriverSimulado, alarmeSimulavel, type FalhaSimulada } from './simulado.ts';
import { DriverS7, type OpcoesS7 } from './s7.ts';

export type Leitura = { escrita: ValoresEscrita; leitura: ValoresLeitura; processo: Processo | null };

const ESPERA_RECONEXAO_MS = 2000;

export class ErroGateway extends Error {
  readonly codigo: string;
  constructor(codigo: string, mensagem: string) {
    super(mensagem);
    this.codigo = codigo;
  }
}

export const CONFIGURACAO_PADRAO: ConfiguracaoDriver = {
  driver: 'simulado',
  ip: '192.168.0.1',
  rack: 0,
  slot: 1,
  numeroDb: 1,
  numeroDbProcesso: null,
  escalaSimulador: 20,
};

/** Só os testes mudam: tempos menores para não esperar segundos. */
export type OpcoesServico = { esperaReconexaoMs?: number; s7?: OpcoesS7 };

export class Servico {
  config: ConfiguracaoDriver;
  private opcoes: OpcoesServico;
  private driver: Driver;
  private simulado: DriverSimulado | null = null;
  private conectado = false;
  private assinaturaOk = false;
  private ultimaTentativa = 0;
  private ultimoErro: string | null = null;
  private fila: Promise<unknown> = Promise.resolve();

  constructor(config: ConfiguracaoDriver, opcoes: OpcoesServico = {}) {
    this.config = config;
    this.opcoes = opcoes;
    this.driver = this.criarDriver(config);
  }

  private criarDriver(config: ConfiguracaoDriver): Driver {
    if (config.driver === 's7') return new DriverS7(config, this.opcoes.s7);
    // o simulado guarda o estado do "CLP": reaproveita entre configurações
    this.simulado ??= new DriverSimulado({ escala: config.escalaSimulador });
    this.simulado.clp.escala = config.escalaSimulador;
    return this.simulado;
  }

  /** Executa um pedido por vez na conexão. */
  private exclusivo<T>(fn: () => Promise<T>): Promise<T> {
    const r = this.fila.then(fn, fn);
    this.fila = r.catch(() => undefined);
    return r;
  }

  situacao() {
    return {
      driver: this.config.driver,
      conectado: this.conectado,
      assinaturaOk: this.assinaturaOk,
      erro: this.ultimoErro,
      config: this.config,
    };
  }

  configurar(config: ConfiguracaoDriver): Promise<void> {
    return this.exclusivo(async () => {
      await this.driver.desconectar().catch(() => undefined);
      this.config = config;
      this.driver = this.criarDriver(config);
      this.conectado = false;
      this.assinaturaOk = false;
      this.ultimaTentativa = 0;
      this.ultimoErro = null;
    });
  }

  private async garantirConexao(): Promise<void> {
    if (this.conectado) return;
    if (Date.now() - this.ultimaTentativa < (this.opcoes.esperaReconexaoMs ?? ESPERA_RECONEXAO_MS)) {
      throw new ErroGateway('sem_conexao', this.ultimoErro ?? 'sem conexão');
    }
    this.ultimaTentativa = Date.now();
    await this.driver.conectar();
    this.conectado = true;
  }

  private async falhou(erro: unknown): Promise<never> {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    this.ultimoErro = mensagem;
    if (!(erro instanceof ErroGateway && erro.codigo === 'assinatura_invalida')) {
      this.conectado = false;
      await this.driver.desconectar().catch(() => undefined);
    }
    throw erro instanceof ErroGateway ? erro : new ErroGateway('sem_conexao', mensagem);
  }

  ler(): Promise<Leitura> {
    return this.exclusivo(async () => {
      try {
        await this.garantirConexao();
        const { mes, processo } = await this.driver.ler();
        this.assinaturaOk = conferirAssinatura(mes.subarray(AREA_ASSINATURA.inicio, AREA_ASSINATURA.inicio + AREA_ASSINATURA.tamanho));
        if (!this.assinaturaOk) {
          throw new ErroGateway('assinatura_invalida', `o DB ${this.config.numeroDb} não tem a assinatura do DB MES`);
        }
        this.ultimoErro = null;
        return {
          escrita: decodificarEscrita(mes.subarray(AREA_ESCRITA.inicio, AREA_ESCRITA.inicio + AREA_ESCRITA.tamanho)),
          leitura: decodificarLeitura(mes.subarray(AREA_LEITURA.inicio, AREA_LEITURA.inicio + AREA_LEITURA.tamanho)),
          processo,
        };
      } catch (erro) {
        return this.falhou(erro);
      }
    });
  }

  gravar(valores: ValoresEscrita): Promise<void> {
    const bytes = codificarEscrita(valores); // RangeError aqui é erro de quem chamou, não da conexão
    return this.exclusivo(async () => {
      try {
        await this.garantirConexao();
        if (!this.assinaturaOk) throw new ErroGateway('assinatura_invalida', 'assinatura do DB MES não conferida');
        await this.driver.gravarEscrita(bytes);
      } catch (erro) {
        return this.falhou(erro);
      }
    });
  }

  /**
   * Procura os DBs com a configuração dada (sem trocar a atual), numa conexão própria e temporária (a CPU aceita
   * várias). Falha de conexão sai como ErroGateway, com a mensagem do driver.
   */
  async procurar(config: ConfiguracaoDriver): Promise<DbsEncontrados> {
    if (config.driver === 'simulado') return { mes: 1, processo: null };
    const temporario = new DriverS7(config, this.opcoes.s7);
    try {
      await temporario.conectar();
      return await temporario.procurarDbs();
    } catch (erro) {
      throw new ErroGateway('sem_conexao', erro instanceof Error ? erro.message : String(erro));
    } finally {
      await temporario.desconectar().catch(() => undefined);
    }
  }

  /**
   * Só no driver simulado: falhas para a aula e para os testes. Na falha `alarme`, `alarme` é o código do
   * intertravamento (tabela ALARME do contrato); sem ele, vale o último usado (de início, PSH-103).
   */
  falhaSimulada(falha: FalhaSimulada, alarme?: number): boolean {
    if (this.config.driver !== 'simulado' || !this.simulado) return false;
    if (falha === 'alarme' && alarmeSimulavel(alarme)) this.simulado.clp.alarme = alarme;
    this.simulado.clp.falha = falha;
    return true;
  }

  /** Fecha a conexão com o CLP (a CPU tem poucas conexões: não deixar uma pendurada ao parar o gateway). */
  encerrar(): Promise<void> {
    return this.exclusivo(async () => {
      this.conectado = false;
      await this.driver.desconectar().catch(() => undefined);
    });
  }
}
