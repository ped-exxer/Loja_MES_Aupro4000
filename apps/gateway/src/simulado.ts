// Simulador embutido: imita o programa do CLP da AUPRO4000 atrás da mesma interface (ROTEIRO, seção 7).
// Pega o pedido disponível quando está livre (copia e ecoa no mesmo ciclo), produz a batelada etapa por etapa
// e publica o bloco da OP concluída. O tempo corre `escala` vezes mais rápido que na bancada.
//
// Batelada (docs/programa-clp.md): pressurizar uma vez → por rodada do TQ-01 (10 L): aquecer (TZ-104) ou resfriar
// (trocador FV-105 + M1) até a temperatura, e só então transferir o volume da rodada → aguardar → devolver.
// Entre as rodadas a B1 repõe o TQ-01 com água do reservatório. Os tempos vêm de PARAMETROS_CICLO (provisórios).

import {
  ALARME,
  AREA_ESCRITA,
  AREA_LEITURA,
  AREA_ASSINATURA,
  ESTADO_CLP,
  ETAPA,
  NENHUM_PEDIDO,
  RESULTADO_ACEITO,
  RESULTADO_OP,
  TAMANHO_DB,
  TEMPO_VIDA_MS,
  codificarAssinatura,
  codificarLeitura,
  decodificarEscrita,
  nomeAlarme,
  proximoWord,
  recusaPorFaixa,
  type ValoresLeitura,
} from '@aupro/contrato-clp';
import { PARAMETROS_CICLO, dividirEmRodadas, validarReceita, type Receita } from '@aupro/dominio';
import type { DbsEncontrados, Driver, Processo } from './driver.ts';

/**
 * Falhas para a aula e para os testes:
 * - `congelar`: o CLP para (STOP): a vida não anda;
 * - `abortar`: a batelada em produção termina como abortada;
 * - `alarme`: um intertravamento atua (`alarme`, padrão PSH-103): o CLP publica o código em `Alarme`, fica "em
 *   falha", a batelada fica parada onde está e nenhum pedido novo é pego, até voltar a `nenhuma`.
 */
export type FalhaSimulada = 'nenhuma' | 'congelar' | 'abortar' | 'alarme';
export const FALHAS_SIMULADAS: readonly FalhaSimulada[] = ['nenhuma', 'congelar', 'abortar', 'alarme'];

/** O código serve para a falha `alarme`? (um alarme da tabela, fora o "nenhum") */
export const alarmeSimulavel = (codigo: unknown): codigo is number =>
  typeof codigo === 'number' && codigo !== ALARME.nenhum && nomeAlarme(codigo) !== null;

const VOLUME_RESERVATORIO_L = 50;
/** Constante de tempo da perda de calor do reservatório para o ambiente. */
const CONSTANTE_RESFRIAMENTO_S = 1800;
/**
 * Constante de tempo da perda de calor do TQ-02 (aberto) para o ambiente. Perde pouco, mas num pedido em rodadas a
 * água da 1ª rodada esfria enquanto a 2ª aquece (≈ 1 °C num pedido de 15 L a 65 °C).
 */
const CONSTANTE_PERDA_TQ02_S = 10_800;
const ESPERA_ANTES_DE_DEVOLVER_S = 10;
/** Banda (°C) em que a água de partida já conta como "na temperatura". */
const BANDA_TEMPERATURA = 0.05;

type Batelada = {
  numeroOp: number;
  receita: Receita;
  etapa: number;
  /** Litros de cada rodada do TQ-01. */
  rodadas: number[];
  /** Índice da rodada atual. */
  rodada: number;
  /** Tempo real (ms) gasto em cada etapa (somado entre as rodadas). */
  tempos: { [etapa: number]: number };
  /** Segundos de processo na etapa atual. */
  naEtapaS: number;
  /** Temperatura a que o CLP leva o TQ-01 (o pedido, com o desvio de medição). */
  temperaturaAlvo: number;
  volumeFinal: number;
  /** TE-105a no fim da transferência (null até lá). */
  temperaturaFinal: number | null;
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
  /** Intertravamento publicado enquanto a falha é `alarme`. */
  alarme: number = ALARME.pressaoAltaTq01;

  private aleatorio: () => number;
  private leitura: ValoresLeitura = {
    VidaClp: 0, EcoSeq: 0, Resultado: 0, Estado: ESTADO_CLP.ocioso, Etapa: ETAPA.nenhuma, OpExecucao: 0, Alarme: 0,
    OpConcluida: 0, ResultadoOp: 0, VolumeProduzido: 0, TemperaturaProduto: 0,
    TempoPressurizar: 0, TempoAquecer: 0, TempoTransferir: 0, TempoDevolver: 0, TempoResfriar: 0,
    TemperaturaTq02: PARAMETROS_CICLO.temperaturaAmbiente, TemperaturaReservatorio: PARAMETROS_CICLO.temperaturaAmbiente,
  };
  private batelada: Batelada | null = null;
  private ultimaVidaMes = -1;
  private semVidaMesMs = 0;

  /** TQ-01 (TIT-104, PIT-103), TQ-02 (LIT-101) e envase (FIT-102). */
  processo: Processo = { temperatura: PARAMETROS_CICLO.temperaturaAmbiente, nivel: 0, pressao: 0, vazao: 0 };
  /** °C no reservatório (TE-105b). */
  temperaturaReservatorio: number = PARAMETROS_CICLO.temperaturaAmbiente;
  /** °C no TQ-02 (TE-105a). */
  temperaturaTq02: number = PARAMETROS_CICLO.temperaturaAmbiente;

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
    this.perderCalor(dtS);

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
    // intertravamento ativo: a bancada fica em falha, com a batelada parada onde está
    const emFalha = this.falha === 'alarme';
    this.leitura.Alarme = emFalha ? this.alarme : ALARME.nenhum;

    // Livre: pega o pedido disponível (cópia e eco no mesmo ciclo). Sem vida do MES ou em falha, não pega pedido
    // novo: o pedido continua disponível e é pego quando a falha passar.
    const mesVivo = this.semVidaMesMs < TEMPO_VIDA_MS;
    if (!this.batelada && !emFalha && mesVivo && escrita.SeqPedido !== this.leitura.EcoSeq && escrita.NumeroOp !== NENHUM_PEDIDO) {
      const receita: Receita = {
        volume: escrita.SpVolume, temperatura: escrita.SpTemperatura, vazao: escrita.SpVazao, pressao: escrita.SpPressao,
      };
      this.leitura.EcoSeq = escrita.SeqPedido;
      // dupla checagem das faixas: o motivo da recusa vai em Resultado (tabela RECUSA do contrato)
      this.leitura.Resultado = recusaPorFaixa(validarReceita(receita).map((e) => e.campo as keyof Receita));
      if (this.leitura.Resultado === RESULTADO_ACEITO) this.iniciar(escrita.NumeroOp, receita);
    }

    if (this.batelada && !emFalha) this.avancar(dtS, dtMs);
    this.leitura.Estado = emFalha ? ESTADO_CLP.emFalha : this.batelada ? ESTADO_CLP.emProducao : ESTADO_CLP.ocioso;
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
      rodadas: dividirEmRodadas(receita.volume),
      rodada: 0,
      tempos: {},
      naEtapaS: 0,
      temperaturaAlvo: receita.temperatura + desvio(grande ? 4 : 1),
      volumeFinal: Math.max(0, receita.volume + desvio(grande ? 1 : 0.2)),
      temperaturaFinal: null,
    };
    this.processo.temperatura = this.temperaturaReservatorio; // o TQ-01 está cheio com água do reservatório
    this.leitura.OpExecucao = numeroOp;
  }

  /** Começo de uma rodada: aquece, resfria ou, se a água já está na temperatura, transfere direto. */
  private etapaDaRodada(b: Batelada): number {
    const t = this.processo.temperatura;
    if (t < b.temperaturaAlvo - BANDA_TEMPERATURA) return ETAPA.aquecer;
    if (t > b.temperaturaAlvo + BANDA_TEMPERATURA) return ETAPA.resfriar;
    return ETAPA.transferir;
  }

  /** Nível do TQ-02 no fim da rodada atual (a última vai até o volume medido). */
  private nivelFimDaRodada(b: Batelada): number {
    if (b.rodada >= b.rodadas.length - 1) return b.volumeFinal;
    return b.rodadas.slice(0, b.rodada + 1).reduce((s, v) => s + v, 0);
  }

  private avancar(dtS: number, dtMs: number): void {
    const b = this.batelada!;
    const r = b.receita;
    const p = this.processo;
    const litrosRodada = b.rodadas[b.rodada] ?? r.volume;
    b.tempos[b.etapa] = (b.tempos[b.etapa] ?? 0) + dtMs;
    b.naEtapaS += dtS;
    let proxima: number | null = null;

    switch (b.etapa) {
      case ETAPA.pressurizar:
        p.pressao = Math.min(r.pressao, (r.pressao * b.naEtapaS) / PARAMETROS_CICLO.pressurizarS);
        if (b.naEtapaS >= PARAMETROS_CICLO.pressurizarS) proxima = this.etapaDaRodada(b);
        break;
      case ETAPA.aquecer: {
        const grausPorS = 1 / (PARAMETROS_CICLO.aquecerSPorGrauLitro * litrosRodada);
        p.temperatura = Math.min(b.temperaturaAlvo, p.temperatura + grausPorS * dtS);
        if (p.temperatura >= b.temperaturaAlvo) proxima = ETAPA.transferir;
        break;
      }
      case ETAPA.resfriar: {
        // FV-105 aberta: o TQ-01 recircula pelo trocador com o ventilador M1 ligado
        const grausPorS = 1 / (PARAMETROS_CICLO.resfriarSPorGrauLitro * litrosRodada);
        p.temperatura = Math.max(b.temperaturaAlvo, p.temperatura - grausPorS * dtS);
        if (p.temperatura <= b.temperaturaAlvo) proxima = ETAPA.transferir;
        break;
      }
      case ETAPA.transferir: {
        // o envase só começa com o TQ-01 na temperatura; a água que entra se mistura com a que já está no TQ-02
        const alvo = this.nivelFimDaRodada(b);
        const novo = Math.min(alvo, p.nivel + (r.vazao / 60) * dtS);
        const entra = Math.max(0, novo - p.nivel);
        if (entra > 0) this.temperaturaTq02 = (p.nivel * this.temperaturaTq02 + entra * p.temperatura) / (p.nivel + entra);
        p.nivel += entra;
        p.vazao = r.vazao;
        if (p.nivel >= alvo) {
          p.vazao = 0;
          if (b.rodada < b.rodadas.length - 1) {
            // a B1 repõe o TQ-01 com água do reservatório e a próxima rodada começa
            b.rodada += 1;
            p.temperatura = this.temperaturaReservatorio;
            proxima = this.etapaDaRodada(b);
          } else {
            p.pressao = 0;
            b.temperaturaFinal = this.temperaturaTq02; // TE-105a no fim da transferência
            proxima = ETAPA.aguardar;
          }
        }
        break;
      }
      case ETAPA.aguardar:
        if (b.naEtapaS >= ESPERA_ANTES_DE_DEVOLVER_S) proxima = ETAPA.devolver;
        break;
      case ETAPA.devolver:
        p.nivel = Math.max(0, b.volumeFinal * (1 - b.naEtapaS / PARAMETROS_CICLO.devolverS));
        if (b.naEtapaS >= PARAMETROS_CICLO.devolverS) {
          this.encerrar(RESULTADO_OP.concluida);
          return;
        }
        break;
    }

    if (proxima !== null) {
      b.etapa = proxima;
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
      (VOLUME_RESERVATORIO_L * this.temperaturaReservatorio + v * this.temperaturaTq02) / (VOLUME_RESERVATORIO_L + v);

    const l = this.leitura;
    l.ResultadoOp = resultadoOp;
    l.VolumeProduzido = b.volumeFinal;
    l.TemperaturaProduto = b.temperaturaFinal ?? this.temperaturaTq02;
    l.TempoPressurizar = Math.round(b.tempos[ETAPA.pressurizar] ?? 0);
    l.TempoAquecer = Math.round(b.tempos[ETAPA.aquecer] ?? 0);
    l.TempoResfriar = Math.round(b.tempos[ETAPA.resfriar] ?? 0);
    l.TempoTransferir = Math.round(b.tempos[ETAPA.transferir] ?? 0);
    l.TempoDevolver = Math.round(b.tempos[ETAPA.devolver] ?? 0);
    l.OpConcluida = b.numeroOp; // por último, como o programa do CLP deve fazer
    l.OpExecucao = 0;
    l.Etapa = ETAPA.nenhuma;

    this.batelada = null;
    p.nivel = 0;
    p.pressao = 0;
    p.vazao = 0;
    p.temperatura = this.temperaturaReservatorio;
  }

  /** Reservatório e TQ-02 perdem calor para o ambiente; parado, o TQ-01 acompanha o reservatório. */
  private perderCalor(dtS: number): void {
    const amb = PARAMETROS_CICLO.temperaturaAmbiente;
    this.temperaturaReservatorio += (amb - this.temperaturaReservatorio) * Math.min(1, dtS / CONSTANTE_RESFRIAMENTO_S);
    this.temperaturaTq02 += (amb - this.temperaturaTq02) * Math.min(1, dtS / CONSTANTE_PERDA_TQ02_S);
    if (!this.batelada) this.processo.temperatura = this.temperaturaReservatorio;
  }

  private publicar(): void {
    // ao vivo, a cada ciclo: TE-105a e TE-105b
    this.leitura.TemperaturaTq02 = this.temperaturaTq02;
    this.leitura.TemperaturaReservatorio = this.temperaturaReservatorio;
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
