// Despacho (ROTEIRO, seção 6.4): a cada ciclo, lê o DB MES pelo gateway, trata o eco e a OP concluída,
// escolhe o próximo pedido da fila e grava a área de escrita (com VidaMes). O MES não comanda a bancada.
//
// Se o MES parar, VidaMes para e o CLP percebe. Depois de qualquer falha, o MES se reconcilia lendo a própria
// área de escrita no CLP (SeqPedido, NumeroOp) contra o EcoSeq.

import {
  ALARME,
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
/** O mesmo aviso no log do contêiner só se repete depois deste tempo (o ciclo roda duas vezes por segundo). */
const REPETE_AVISO_MS = 60_000;
export const AUTOR_SISTEMA = 'MES';

/**
 * Registros de alarme, a partir da mudança de `Alarme` (o intertravamento ativo; tabela ALARME do contrato) entre
 * duas leituras: o que estava ativo terminou (`alarme_fim`) e o novo começou (`alarme`). O detalhe é o nome do
 * campo e o código (`Alarme 2`): a tela traduz.
 */
export function eventosDeAlarme(anterior: number, atual: number): { tipo: 'alarme' | 'alarme_fim'; detalhe: string }[] {
  if (anterior === atual) return [];
  return [
    ...(anterior !== ALARME.nenhum ? [{ tipo: 'alarme_fim' as const, detalhe: `Alarme ${anterior}` }] : []),
    ...(atual !== ALARME.nenhum ? [{ tipo: 'alarme' as const, detalhe: `Alarme ${atual}` }] : []),
  ];
}

/**
 * O alarme que os registros dão como ativo: o código do último `alarme` se depois dele não veio o `alarme_fim`.
 * É de onde o despacho parte quando o MES sobe (ou a aula é reiniciada): sem isso, um alarme que já estava ativo
 * seria registrado de novo, sem o fim do anterior.
 */
export function alarmeAtivoDe(ultimo: { tipo: string; detalhe: string | null } | null): number {
  if (!ultimo || ultimo.tipo !== 'alarme') return ALARME.nenhum;
  const codigo = Number(/^Alarme (\d+)$/.exec(ultimo.detalhe ?? '')?.[1]);
  return Number.isInteger(codigo) ? codigo : ALARME.nenhum;
}

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
  /** Código do intertravamento ativo no CLP (tabela ALARME do contrato; 0 = nenhum). A tela traduz. */
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
  /** Último `Alarme` registrado (para registrar só as mudanças); null = ainda não conferido com os registros. */
  private ultimoAlarme: number | null = null;
  private avisos = new Map<string, { texto: string; em: number }>();
  private emCurso: Promise<void> | null = null;
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

  /** Para o laço e espera o ciclo em andamento terminar (para o encerramento não fechar o banco no meio dele). */
  async parar(): Promise<void> {
    if (this.relogio) clearInterval(this.relogio);
    this.relogio = null;
    await this.emCurso;
  }

  /** Escreve no log do contêiner sem inundar: o mesmo aviso (por assunto) só se repete depois de um minuto. */
  private avisar(assunto: string, texto: string): void {
    const ultimo = this.avisos.get(assunto);
    const agora = Date.now();
    if (ultimo && ultimo.texto === texto && agora - ultimo.em < REPETE_AVISO_MS) return;
    this.avisos.set(assunto, { texto, em: agora });
    console.error(`despacho: ${texto}`);
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

  /**
   * Depois de "reiniciar a aula" ou de trocar a configuração da bancada (outro driver, outro CLP, outro DB):
   * esquece o que achava do aperto de mão e reconcilia de novo com o que está no CLP.
   */
  reiniciar(): void {
    this.aperto = null;
    this.ultimaConcluidaTratada = 0;
    this.ultimaConfereGateway = 0;
    this.ultimoAlarme = null;
  }

  private tique(): Promise<void> {
    // um ciclo por vez: se o anterior ainda não terminou (gateway lento), este tique não faz nada
    this.emCurso ??= this.umCiclo().finally(() => {
      this.emCurso = null;
    });
    return this.emCurso;
  }

  private async umCiclo(): Promise<void> {
    try {
      await this.mes.exclusivo(() => this.ciclo());
      this.avisos.delete('ciclo');
    } catch (erro) {
      // quase sempre o banco: o ciclo seguinte reconcilia com o CLP e continua de onde parou
      this.avisar('ciclo', `ciclo falhou (reconcilia no próximo): ${erro instanceof Error ? (erro.stack ?? erro.message) : String(erro)}`);
      this.aperto = null;
    } finally {
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
      this.bancada = { ...this.bancada, conectado: false, clpVivo: false, erro: mensagem, driver: cfg.driver, atualizadoEm: agora };
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
    await this.registrarAlarme(r);
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
      this.avisos.delete('escrita');
    } catch (erro) {
      this.avisar('escrita', `escrita no CLP falhou (reconcilia na próxima leitura): ${erro instanceof Error ? erro.message : String(erro)}`);
      this.aperto = null;
    }
  }

  /** `Alarme` mudou no CLP: registra o que terminou e o que começou, na OP que estava em produção (se havia). */
  private async registrarAlarme(r: LeituraGateway): Promise<void> {
    // o MES acabou de subir (ou a aula foi reiniciada): parte do que os registros dizem, não de "nenhum"
    this.ultimoAlarme ??= alarmeAtivoDe(await repo.ultimoEventoDeAlarme(this.banco));
    const eventos = eventosDeAlarme(this.ultimoAlarme, r.leitura.Alarme);
    for (const e of eventos) {
      await repo.registrarEvento(this.banco, { numeroOp: r.leitura.OpExecucao || null, tipo: e.tipo, detalhe: e.detalhe, autor: AUTOR_SISTEMA });
      // um por vez: se o banco falhar entre o fim de um e o começo do outro, o ciclo seguinte não repete o fim
      this.ultimoAlarme = e.tipo === 'alarme_fim' ? ALARME.nenhum : r.leitura.Alarme;
    }
    if (eventos.length > 0) this.mes.ctx.tempoReal.publicar('alarme', { alarme: r.leitura.Alarme });
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
    // OP que terminou e ficou sem a inspeção (o MES parou ou o banco falhou entre uma coisa e outra)
    for (const o of await repo.listarOrdens(this.banco, ['produzida'])) await this.inspecionar(o.numero);
    await repo.registrarEvento(this.banco, {
      numeroOp: null, tipo: 'reconciliado',
      detalhe: `SeqPedido ${r.escrita.SeqPedido}, NumeroOp ${r.escrita.NumeroOp}, EcoSeq ${r.leitura.EcoSeq}`,
    });
  }

  private async aplicarAperto(e: EventoAperto): Promise<void> {
    if (e.tipo === 'recebida') {
      await this.mes.aplicar(e.numeroOp, 'clp_recebeu', AUTOR_SISTEMA);
    } else if (e.tipo === 'recusada') {
      // o código da recusa (tabela RECUSA do contrato) fica na OP e no registro; a tela traduz
      await this.mes.aplicar(e.numeroOp, 'clp_recusou', AUTOR_SISTEMA, `Resultado ${e.resultado}`, e.resultado);
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
    }
    // também retoma a OP que já estava "produzida" sem inspeção (falha entre a conclusão e a inspeção)
    await this.inspecionar(n);
    // OP com a comunicação perdida ainda vai ser tratada quando a comunicação voltar
    if (!o || o.situacao.estado !== 'comunicacao_perdida') this.ultimaConcluidaTratada = n;
  }

  /**
   * Inspeção sempre automática: a OP produzida é aprovada ou reprovada pela tolerância do produto. Pode repetir:
   * só age na OP que está "produzida" e tem a batelada registrada, e a inspeção é uma por OP.
   */
  private async inspecionar(numero: number): Promise<void> {
    const o = await repo.buscarOrdem(this.banco, numero);
    const b = o?.situacao.estado === 'produzida' ? await repo.buscarBatelada(this.banco, numero) : null;
    if (!o || !b) return;
    const dentro = avaliarQualidade(o.receita, o.tolerancias, b).dentro;
    await repo.inserirInspecao(this.banco, {
      numeroOp: numero, resultado: dentro ? 'aprovada' : 'reprovada', observacao: 'automática', autor: AUTOR_SISTEMA,
    });
    await this.mes.aplicar(numero, dentro ? 'aprovar' : 'reprovar', AUTOR_SISTEMA, 'inspeção automática');
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
    console.error(`despacho: comunicação com o CLP perdida (${motivo})`);
  }

  private async restabelecer(): Promise<void> {
    this.caiu = false;
    for (const o of await repo.listarOrdens(this.banco, ['comunicacao_perdida'])) {
      await this.mes.aplicar(o.numero, 'restabelecer_comunicacao', AUTOR_SISTEMA);
    }
    await repo.registrarEvento(this.banco, { numeroOp: null, tipo: 'comunicacao_restabelecida' });
    console.log('despacho: comunicação com o CLP restabelecida');
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
