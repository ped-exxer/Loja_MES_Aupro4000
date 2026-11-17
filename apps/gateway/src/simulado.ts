// Simulador embutido: imita o programa do CLP da AUPRO4000 atrás da mesma interface (ROTEIRO, seção 7).
// Pega o pedido disponível quando está livre (copia e ecoa no mesmo ciclo), produz a batelada etapa por etapa
// e publica o bloco da OP concluída. O tempo corre `escala` vezes mais rápido que na bancada.

import {
  AREA_ESCRITA,
  AREA_LEITURA,
  AREA_ASSINATURA,
  ESTADO_CLP,
  ETAPA,
  NENHUM_PEDIDO,
  RESULTADO_OP,
  TAMANHO_DB,
  TEMPO_VIDA_MS,
  codificarAssinatura,
  codificarLeitura,
  decodificarEscrita,
  proximoWord,
  type ValoresLeitura,
} from '@loja/contrato-clp';
import { PARAMETROS_CICLO, validarReceita, type Receita } from '@loja/dominio';
import type { DbsEncontrados, Driver, Processo } from './driver.ts';

export type FalhaSimulada = 'nenhuma' | 'congelar' | 'abortar';

/** Recusa do simulador quando a receita está fora das faixas. */
export const RECUSA_FORA_DA_FAIXA = 1;

const VOLUME_RESERVATORIO_L = 50;
const CONSTANTE_RESFRIAMENTO_S = 1800;
const ESPERA_ANTES_DE_DEVOLVER_S = 10;

type Batelada = {
  numeroOp: number;
  receita: Receita;
  etapa: number;
  /** Tempo real (ms) gasto em cada etapa. */
  tempos: { [etapa: number]: number };
  /** Segundos de processo na etapa atual. */
  naEtapaS: number;
  temperaturaFinal: number;
  volumeFinal: number;
};

export type OpcoesSimulador = {
  escala?: number;
  /** Gerador de números aleatórios em [0, 1); injetável nos testes. */
  aleatorio?: () => number;
};

export class ClpSimulado {
  readonly db = new Uint8Array(TAMANHO_DB);
  escala: number;
  falha: FalhaSimulada = 'nenhuma';

  private aleatorio: () => number;
  private leitura: ValoresLeitura = {
    VidaClp: 0, EcoSeq: 0, Resultado: 0, Estado: ESTADO_CLP.ocioso, Etapa: ETAPA.nenhuma, OpExecucao: 0, Alarme: 0,
    OpConcluida: 0, ResultadoOp: 0, VolumeProduzido: 0, TemperaturaProduto: 0,
    TempoPressurizar: 0, TempoAquecer: 0, TempoTransferir: 0, TempoDevolver: 0,
  };
  private batelada: Batelada | null = null;
  private ultimaVidaMes = -1;
  private semVidaMesMs = 0;

  processo: Processo = { temperatura: PARAMETROS_CICLO.temperaturaAmbiente, nivel: 0, pressao: 0, vazao: 0 };
  temperaturaReservatorio: number = PARAMETROS_CICLO.temperaturaAmbiente;

  constructor(opcoes: OpcoesSimulador = {}) {
    this.escala = opcoes.escala ?? 20;
    this.aleatorio = opcoes.aleatorio ?? Math.random;
    this.db.set(codificarAssinatura(), AREA_ASSINATURA.inicio);
    this.publicar();
  }

  /** Avança o simulador `dtMs` de tempo real (um ou mais ciclos do CLP). */
  passo(dtMs: number): void {
    if (this.falha === 'congelar') return;
    this.leitura.VidaClp = proximoWord(this.leitura.VidaClp);
    const dtS = (dtMs / 1000) * this.escala;
    this.esfriarReservatorio(dtS);

    const escrita = decodificarEscrita(this.db.subarray(AREA_ESCRITA.inicio, AREA_ESCRITA.inicio + AREA_ESCRITA.tamanho));
    if (escrita.VidaMes !== this.ultimaVidaMes) {
      this.ultimaVidaMes = escrita.VidaMes;
      this.semVidaMesMs = 0;
    } else {
      this.semVidaMesMs += dtMs;
    }

    if (this.falha === 'abortar' && this.batelada) {
      this.encerrar(RESULTADO_OP.abortada);
      this.falha = 'nenhuma';
    }

    // Livre: pega o pedido disponível (cópia e eco no mesmo ciclo). Sem vida do MES, não pega pedido novo.
    const mesVivo = this.semVidaMesMs < TEMPO_VIDA_MS;
    if (!this.batelada && mesVivo && escrita.SeqPedido !== this.leitura.EcoSeq && escrita.NumeroOp !== NENHUM_PEDIDO) {
      const receita: Receita = {
        volume: escrita.SpVolume, temperatura: escrita.SpTemperatura, vazao: escrita.SpVazao, pressao: escrita.SpPressao,
      };
      this.leitura.EcoSeq = escrita.SeqPedido;
      if (validarReceita(receita).length > 0) {
        this.leitura.Resultado = RECUSA_FORA_DA_FAIXA;
      } else {
        this.leitura.Resultado = 0;
        this.iniciar(escrita.NumeroOp, receita);
      }
    }

    if (this.batelada) this.avancar(dtS, dtMs);
    this.publicar();
  }

  private iniciar(numeroOp: number, receita: Receita): void {
    // desvio de medição: quase sempre pequeno; de vez em quando, fora da tolerância (para a aula de qualidade)
    const grande = this.aleatorio() < 0.1;
    const desvio = (amplitude: number) => (this.aleatorio() * 2 - 1) * amplitude;
    this.batelada = {
      numeroOp,
      receita,
      etapa: ETAPA.pressurizar,
      tempos: {},
      naEtapaS: 0,
      // não há resfriamento: se a água do reservatório já estiver mais quente, o produto sai mais quente
      temperaturaFinal: Math.max(this.temperaturaReservatorio, receita.temperatura + desvio(grande ? 4 : 1)),
      volumeFinal: Math.max(0, receita.volume + desvio(grande ? 1 : 0.2)),
    };
    this.processo.temperatura = this.temperaturaReservatorio;
    this.leitura.OpExecucao = numeroOp;
    this.leitura.Estado = ESTADO_CLP.emProducao;
  }

  private avancar(dtS: number, dtMs: number): void {
    const b = this.batelada!;
    const r = b.receita;
    const p = this.processo;
    b.tempos[b.etapa] = (b.tempos[b.etapa] ?? 0) + dtMs;
    b.naEtapaS += dtS;
    let proxima = false;

    switch (b.etapa) {
      case ETAPA.pressurizar:
        p.pressao = Math.min(r.pressao, (r.pressao * b.naEtapaS) / PARAMETROS_CICLO.pressurizarS);
        proxima = b.naEtapaS >= PARAMETROS_CICLO.pressurizarS;
        break;
      case ETAPA.aquecer: {
        const grausPorS = 1 / (PARAMETROS_CICLO.aquecerSPorGrauLitro * r.volume);
        p.temperatura = Math.min(b.temperaturaFinal, p.temperatura + grausPorS * dtS);
        proxima = p.temperatura >= b.temperaturaFinal;
        break;
      }
      case ETAPA.transferir:
        p.vazao = r.vazao;
        p.nivel = Math.min(b.volumeFinal, p.nivel + (r.vazao / 60) * dtS);
        proxima = p.nivel >= b.volumeFinal;
        if (proxima) {
          p.vazao = 0;
          p.pressao = 0;
        }
        break;
      case ETAPA.aguardar:
        proxima = b.naEtapaS >= ESPERA_ANTES_DE_DEVOLVER_S;
        break;
      case ETAPA.devolver:
        p.nivel = Math.max(0, b.volumeFinal * (1 - b.naEtapaS / PARAMETROS_CICLO.devolverS));
        if (b.naEtapaS >= PARAMETROS_CICLO.devolverS) {
          this.encerrar(RESULTADO_OP.concluida);
          return;
        }
        break;
    }

    if (proxima) {
      b.etapa += 1;
      b.naEtapaS = 0;
    }
    this.leitura.Etapa = b.etapa;
  }

  private encerrar(resultadoOp: number): void {
    const b = this.batelada!;
    const p = this.processo;
    // a água do TQ-02 volta ao reservatório e se mistura (abortada: só o que já tinha sido transferido)
    const v = resultadoOp === RESULTADO_OP.concluida ? b.volumeFinal : p.nivel;
    this.temperaturaReservatorio =
      (VOLUME_RESERVATORIO_L * this.temperaturaReservatorio + v * b.temperaturaFinal) / (VOLUME_RESERVATORIO_L + v);

    const l = this.leitura;
    l.ResultadoOp = resultadoOp;
    l.VolumeProduzido = b.volumeFinal;
    l.TemperaturaProduto = b.temperaturaFinal;
    l.TempoPressurizar = Math.round(b.tempos[ETAPA.pressurizar] ?? 0);
    l.TempoAquecer = Math.round(b.tempos[ETAPA.aquecer] ?? 0);
    l.TempoTransferir = Math.round(b.tempos[ETAPA.transferir] ?? 0);
    l.TempoDevolver = Math.round(b.tempos[ETAPA.devolver] ?? 0);
    l.OpConcluida = b.numeroOp; // por último, como o programa do CLP deve fazer
    l.OpExecucao = 0;
    l.Etapa = ETAPA.nenhuma;
    l.Estado = ESTADO_CLP.ocioso;

    this.batelada = null;
    p.nivel = 0;
    p.pressao = 0;
    p.vazao = 0;
    p.temperatura = this.temperaturaReservatorio;
  }

  private esfriarReservatorio(dtS: number): void {
    const amb = PARAMETROS_CICLO.temperaturaAmbiente;
    this.temperaturaReservatorio += (amb - this.temperaturaReservatorio) * Math.min(1, dtS / CONSTANTE_RESFRIAMENTO_S);
    if (!this.batelada) this.processo.temperatura = this.temperaturaReservatorio;
  }

  private publicar(): void {
    this.db.set(codificarLeitura(this.leitura), AREA_LEITURA.inicio);
  }
}

/** Driver do gateway em volta do CLP simulado, com o relógio de verdade. */
export class DriverSimulado implements Driver {
  readonly tipo = 'simulado';
  readonly clp: ClpSimulado;
  private relogio: ReturnType<typeof setInterval> | null = null;
  private ultimo = 0;

  constructor(opcoes: OpcoesSimulador = {}) {
    this.clp = new ClpSimulado(opcoes);
  }

  async conectar(): Promise<void> {
    if (this.relogio) return;
    this.ultimo = Date.now();
    this.relogio = setInterval(() => {
      const agora = Date.now();
      this.clp.passo(agora - this.ultimo);
      this.ultimo = agora;
    }, 100);
  }

  async desconectar(): Promise<void> {
    if (this.relogio) clearInterval(this.relogio);
    this.relogio = null;
  }

  /** Com a falha "congelar" (CLP em STOP), o DB continua legível, mas VidaClp não muda. */
  async ler(): Promise<{ mes: Uint8Array; processo: Processo }> {
    return { mes: this.clp.db.slice(), processo: { ...this.clp.processo } };
  }

  async gravarEscrita(bytes: Uint8Array): Promise<void> {
    if (bytes.length !== AREA_ESCRITA.tamanho) throw new RangeError('tamanho da área de escrita');
    this.clp.db.set(bytes, AREA_ESCRITA.inicio);
  }

  async procurarDbs(): Promise<DbsEncontrados> {
    return { mes: 1, processo: null };
  }
}
