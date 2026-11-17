// Despacho (ROTEIRO, seção 6.4): a cada ciclo, lê o DB MES pelo gateway, trata o eco e a OP concluída,
// escolhe o próximo pedido da fila e grava a área de escrita (com VidaMes). O MES não comanda a bancada.
//
// Se o MES parar, VidaMes para e o CLP percebe. Depois de qualquer falha, o MES se reconcilia lendo a própria
// área de escrita no CLP (SeqPedido, NumeroOp) contra o EcoSeq.

import {
  NENHUM_PEDIDO,
  RESULTADO_ACEITO,
  RESULTADO_OP,
  TEMPO_VIDA_MS,
  aoLerEco,
  apertoAoConectar,
  disponibilizar,
  escritaConfirmada,
  pedidoDisponivel,
  proximoWord,
  type EstadoAperto,
  type EventoAperto,
} from '@aupro/contrato-clp';
import { avaliarQualidade } from '@aupro/dominio';
import type { LeituraGateway, Processo } from './cliente-gateway.ts';
import { paraGateway, type Configuracao } from './configuracao.ts';
import * as repo from './repositorio.ts';
import { cicloMs, ordenarFila, type Mes } from './nucleo.ts';

const CICLO_MS = 500;
const AMOSTRA_MS = 2000;
const CONFERE_GATEWAY_MS = 5000;
export const AUTOR_SISTEMA = 'MES';

export type EstadoBancada = {
  /** O gateway respondeu no último ciclo. */
  conectado: boolean;
  /** VidaClp mudando. */
  clpVivo: boolean;
  /** Comunicação perdida (OPs com o CLP marcadas). */
  comunicacaoPerdida: boolean;
  erro: string | null;
  driver: string | null;
  estadoClp: number | null;
  etapa: number | null;
  opExecucao: number | null;
  alarme: number | null;
  disponivel: number | null;
  processo: Processo | null;
  /** °C ao vivo no TQ-02 (TE-105a) e no reservatório (TE-105b), escritos pelo CLP no DB MES. */
  temperaturaTq02: number | null;
  temperaturaReservatorio: number | null;
  atualizadoEm: number;
};

export class Despachante {
  private mes: Mes;
  private aperto: EstadoAperto | null = null;
  private vidaMes = 0;
  private ultimaVidaClp: number | null = null;
  private ultimaMudancaVida = 0;
  private semRespostaDesde: number | null = null;
  private caiu = false;
  private ultimaAmostra = 0;
  private ultimaConfereGateway = 0;
  private ultimaConcluidaTratada = 0;
  private ultimaLeitura: LeituraGateway | null = null;
  private rodando = false;
  private relogio: ReturnType<typeof setInterval> | null = null;
  private bancada: EstadoBancada = {
    conectado: false, clpVivo: false, comunicacaoPerdida: false, erro: null, driver: null, estadoClp: null, etapa: null,
    opExecucao: null, alarme: null, disponivel: null, processo: null, temperaturaTq02: null, temperaturaReservatorio: null,
    atualizadoEm: 0,
  };

  constructor(mes: Mes) {
    this.mes = mes;
  }

  iniciar(): void {
    this.relogio ??= setInterval(() => void this.tique(), CICLO_MS);
  }

  parar(): void {
    if (this.relogio) clearInterval(this.relogio);
    this.relogio = null;
  }

  estado(): EstadoBancada {
    return this.bancada;
  }

  /**
   * Temperatura da água do reservatório (TE-105b), de onde parte a próxima batelada; undefined se o CLP não
   * respondeu ou não publica (0 = campo não escrito). Para as OPs de trás da fila vale a mesma (projeção simples).
   */
  temperaturaReservatorio(): number | undefined {
    const t = this.bancada.conectado ? this.bancada.temperaturaReservatorio : null;
    return t !== null && Number.isFinite(t) && t > 0 ? t : undefined;
  }

  /** OP disponível agora ao CLP (ou null). */
  disponivel(): number | null {
    if (!this.aperto) return this.ultimaLeitura?.escrita.NumeroOp || null;
    return pedidoDisponivel(this.aperto) || null;
  }

  /**
   * O que o sequenciamento precisa saber da bancada: a temperatura de onde a próxima batelada parte (a do
   * reservatório, TE-105b, lida do CLP; sem ela, a da OP em produção ou a da última produzida) e quando a bancada
   * fica livre (fim estimado da OP em produção).
   */
  async contextoFila(cfg: Configuracao, agora: number): Promise<{ temperaturaAtual?: number; inicio: number }> {
    const reservatorio = this.temperaturaReservatorio();
    const [produzindo] = await repo.listarOrdens(this.mes.ctx.banco, ['em_producao', 'comunicacao_perdida']);
    if (produzindo) {
      const fim = (produzindo.recebidaEm ?? agora) + cicloMs(produzindo.receita, cfg, reservatorio);
      return { temperaturaAtual: reservatorio ?? produzindo.receita.temperatura, inicio: Math.max(agora, fim) };
    }
    return { temperaturaAtual: reservatorio ?? (await repo.ultimaBatelada(this.mes.ctx.banco))?.temperatura, inicio: agora };
  }

  /** Depois de "reiniciar a aula": reconcilia de novo com o que está no CLP. */
  reiniciar(): void {
    this.aperto = null;
    this.ultimaConcluidaTratada = 0;
  }

  private async tique(): Promise<void> {
    if (this.rodando) return;
    this.rodando = true;
    try {
      await this.mes.exclusivo(() => this.ciclo());
    } catch (erro) {
      console.error('despacho:', erro);
      this.aperto = null;
    } finally {
      this.rodando = false;
      this.mes.ctx.tempoReal.publicar('bancada', this.bancada);
    }
  }

  private get banco() {
    return this.mes.ctx.banco;
  }

  private async ciclo(): Promise<void> {
    const agora = Date.now();
    const cfg = await this.mes.ctx.configuracao();
    await this.conferirGateway(cfg, agora);

    let r: LeituraGateway;
    try {
      r = await this.mes.ctx.gateway.ler();
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      this.bancada = { ...this.bancada, conectado: false, clpVivo: false, erro: mensagem, atualizadoEm: agora };
      this.aperto = null;
      this.semRespostaDesde ??= agora;
      if (agora - this.semRespostaDesde >= TEMPO_VIDA_MS) await this.marcarQueda(mensagem);
      return;
    }
    this.semRespostaDesde = null;
    this.ultimaLeitura = r;

    if (r.leitura.VidaClp !== this.ultimaVidaClp) {
      this.ultimaVidaClp = r.leitura.VidaClp;
      this.ultimaMudancaVida = agora;
    }
    const clpVivo = agora - this.ultimaMudancaVida < TEMPO_VIDA_MS;
    this.bancada = {
      conectado: true,
      clpVivo,
      comunicacaoPerdida: this.caiu,
      erro: clpVivo ? null : 'vida_clp_parada',
      driver: cfg.driver,
      estadoClp: r.leitura.Estado,
      etapa: r.leitura.Etapa,
      opExecucao: r.leitura.OpExecucao || null,
      alarme: r.leitura.Alarme,
      disponivel: this.disponivel(),
      processo: r.processo,
      temperaturaTq02: r.leitura.TemperaturaTq02,
      temperaturaReservatorio: r.leitura.TemperaturaReservatorio,
      atualizadoEm: agora,
    };

    if (!clpVivo) {
      await this.marcarQueda('vida_clp_parada');
      await this.gravar(r, null);
      return;
    }
    if (this.caiu) await this.restabelecer();
    if (!this.aperto) await this.reconciliar(r);

    const eco = aoLerEco(this.aperto!, r.leitura.EcoSeq, r.leitura.Resultado);
    this.aperto = eco.estado;
    for (const e of eco.eventos) await this.aplicarAperto(e);

    await this.verificarConclusao(r);
    await this.amostrar(r, agora);

    // próximo pedido disponível ao CLP
    const desejado = await this.escolherProximo(cfg, agora);
    let novoSeq: number | null = null;
    if (desejado !== pedidoDisponivel(this.aperto!)) {
      const podeEnviar = desejado === NENHUM_PEDIDO || (await this.mes.aplicar(desejado, 'enviar', AUTOR_SISTEMA)).ok;
      if (podeEnviar) {
        const d = disponibilizar(this.aperto!, desejado);
        this.aperto = d.estado;
        novoSeq = d.seqPedido;
      }
    }
    await this.gravar(r, novoSeq);
    this.bancada = { ...this.bancada, disponivel: this.disponivel(), comunicacaoPerdida: this.caiu };
  }

  /** Grava a área de escrita. Falhou: não sabemos se chegou; reconcilia na próxima leitura. */
  private async gravar(r: LeituraGateway, novoSeq: number | null): Promise<void> {
    this.vidaMes = proximoWord(this.vidaMes);
    let escrita = { ...r.escrita, VidaMes: this.vidaMes };
    if (this.aperto) {
      const numero = pedidoDisponivel(this.aperto);
      const ordem = numero === NENHUM_PEDIDO ? null : await repo.buscarOrdem(this.banco, numero);
      escrita = {
        VidaMes: this.vidaMes,
        SeqPedido: this.aperto.ultimoSeq,
        NumeroOp: ordem ? numero : NENHUM_PEDIDO,
        SpVolume: ordem?.receita.volume ?? 0,
        SpTemperatura: ordem?.receita.temperatura ?? 0,
        SpVazao: ordem?.receita.vazao ?? 0,
        SpPressao: ordem?.receita.pressao ?? 0,
      };
    }
    try {
      await this.mes.ctx.gateway.gravar(escrita);
      if (novoSeq !== null && this.aperto) this.aperto = escritaConfirmada(this.aperto, novoSeq);
    } catch (erro) {
      console.error('despacho: escrita falhou:', erro instanceof Error ? erro.message : erro);
      this.aperto = null;
    }
  }

  /** Ao (re)conectar: a área de escrita no CLP diz o que está disponível; as OPs "enviadas" se acertam com ela. */
  private async reconciliar(r: LeituraGateway): Promise<void> {
    this.aperto = apertoAoConectar(r.escrita.SeqPedido, r.escrita.NumeroOp, r.leitura.EcoSeq);
    this.vidaMes = r.escrita.VidaMes;
    for (const o of await repo.listarOrdens(this.banco, ['enviada'])) {
      if (o.numero !== r.escrita.NumeroOp) {
        await this.aplicarAperto({ tipo: 'retirada', numeroOp: o.numero });
      } else if (r.escrita.SeqPedido === r.leitura.EcoSeq) {
        await this.aplicarAperto(
          r.leitura.Resultado === RESULTADO_ACEITO
            ? { tipo: 'recebida', numeroOp: o.numero }
            : { tipo: 'recusada', numeroOp: o.numero, resultado: r.leitura.Resultado },
        );
      }
    }
    await repo.registrarEvento(this.banco, {
      numeroOp: null, tipo: 'reconciliado',
      detalhe: `SeqPedido ${r.escrita.SeqPedido}, NumeroOp ${r.escrita.NumeroOp}, EcoSeq ${r.leitura.EcoSeq}`,
    });
  }

  private async aplicarAperto(e: EventoAperto): Promise<void> {
    if (e.tipo === 'recebida') {
      await this.mes.aplicar(e.numeroOp, 'clp_recebeu', AUTOR_SISTEMA);
    } else if (e.tipo === 'recusada') {
      await this.mes.aplicar(e.numeroOp, 'clp_recusou', AUTOR_SISTEMA, `Resultado ${e.resultado}`);
    } else {
      const r = await this.mes.aplicar(e.numeroOp, 'retirar', AUTOR_SISTEMA);
      const o = r.ok ? await repo.buscarOrdem(this.banco, e.numeroOp) : null;
      if (o?.cancelarAoRetirar) await this.mes.aplicar(e.numeroOp, 'cancelar', AUTOR_SISTEMA);
    }
  }

  private async verificarConclusao(r: LeituraGateway): Promise<void> {
    const n = r.leitura.OpConcluida;
    if (n === 0 || n === this.ultimaConcluidaTratada) return;
    const o = await repo.buscarOrdem(this.banco, n);
    if (o && o.situacao.estado === 'em_producao') {
      const medido = { volume: r.leitura.VolumeProduzido, temperatura: r.leitura.TemperaturaProduto };
      const avaliacao = avaliarQualidade(o.receita, o.tolerancias, medido);
      const abortada = r.leitura.ResultadoOp === RESULTADO_OP.abortada;
      await repo.inserirBatelada(this.banco, {
        numeroOp: n,
        resultadoOp: r.leitura.ResultadoOp,
        ...medido,
        tempos: {
          pressurizar: r.leitura.TempoPressurizar,
          aquecer: r.leitura.TempoAquecer,
          resfriar: r.leitura.TempoResfriar,
          transferir: r.leitura.TempoTransferir,
          devolver: r.leitura.TempoDevolver,
        },
        dentroTolerancia: !abortada && avaliacao.dentro,
      });
      await this.mes.aplicar(n, abortada ? 'clp_abortou' : 'clp_concluiu', AUTOR_SISTEMA,
        `${medido.volume.toFixed(2)} L, ${medido.temperatura.toFixed(1)} °C`);
      // inspeção sempre automática: aprova ou reprova pela tolerância do produto
      if (!abortada) {
        const resultado = avaliacao.dentro ? 'aprovada' : 'reprovada';
        await repo.inserirInspecao(this.banco, { numeroOp: n, resultado, observacao: 'automática', autor: AUTOR_SISTEMA });
        await this.mes.aplicar(n, avaliacao.dentro ? 'aprovar' : 'reprovar', AUTOR_SISTEMA, 'inspeção automática');
      }
    }
    // OP com a comunicação perdida ainda vai ser tratada quando a comunicação voltar
    if (!o || o.situacao.estado !== 'comunicacao_perdida') this.ultimaConcluidaTratada = n;
  }

  private async amostrar(r: LeituraGateway, agora: number): Promise<void> {
    const n = r.leitura.OpExecucao;
    if (!r.processo || n === 0 || agora - this.ultimaAmostra < AMOSTRA_MS) return;
    const o = await repo.buscarOrdem(this.banco, n);
    if (o?.situacao.estado !== 'em_producao') return;
    this.ultimaAmostra = agora;
    await repo.inserirLeitura(this.banco, n, r.processo);
  }

  private async escolherProximo(cfg: Configuracao, agora: number): Promise<number> {
    const disponivel = pedidoDisponivel(this.aperto!);
    const candidatas = (await repo.listarOrdens(this.banco, ['na_fila', 'enviada'])).filter(
      (o) => o.situacao.estado === 'na_fila' || (o.numero === disponivel && !o.cancelarAoRetirar),
    );
    if (candidatas.length === 0) return NENHUM_PEDIDO;
    const [primeira] = ordenarFila(candidatas, cfg, agora, await this.contextoFila(cfg, agora));
    return primeira.numero;
  }

  private async marcarQueda(motivo: string): Promise<void> {
    if (this.caiu) return;
    this.caiu = true;
    for (const o of await repo.listarOrdens(this.banco, ['enviada', 'em_producao'])) {
      await this.mes.aplicar(o.numero, 'perder_comunicacao', AUTOR_SISTEMA, motivo);
    }
    await repo.registrarEvento(this.banco, { numeroOp: null, tipo: 'comunicacao_perdida', detalhe: motivo });
  }

  private async restabelecer(): Promise<void> {
    this.caiu = false;
    for (const o of await repo.listarOrdens(this.banco, ['comunicacao_perdida'])) {
      await this.mes.aplicar(o.numero, 'restabelecer_comunicacao', AUTOR_SISTEMA);
    }
    await repo.registrarEvento(this.banco, { numeroOp: null, tipo: 'comunicacao_restabelecida' });
    this.aperto = null;
    this.ultimaConcluidaTratada = 0;
  }

  /** O gateway reiniciou ou está com outra configuração: manda a do MES. */
  private async conferirGateway(cfg: Configuracao, agora: number): Promise<void> {
    if (agora - this.ultimaConfereGateway < CONFERE_GATEWAY_MS) return;
    this.ultimaConfereGateway = agora;
    try {
      const saude = await this.mes.ctx.gateway.saude();
      const desejada = paraGateway(cfg);
      const igual = (Object.keys(desejada) as (keyof typeof desejada)[]).every((k) => saude.config[k] === desejada[k]);
      if (!igual) {
        await this.mes.ctx.gateway.configurar(desejada);
        this.aperto = null;
      }
    } catch {
      // sem gateway: a leitura logo abaixo vai falhar e tratar
    }
  }
}
