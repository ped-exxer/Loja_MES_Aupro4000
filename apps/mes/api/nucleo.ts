// Núcleo do MES: ordens, fila, qualidade, paradas, indicadores. As regras vêm de packages/dominio.
// Toda mudança de estado passa por `exclusivo` (uma por vez, inclusive o ciclo do despacho) e entra no feed de
// mudanças (mes_mudanca), que a Loja consulta: o MES não conhece a Loja.

import {
  avaliarQualidade,
  ORIGEM_MANUAL,
  calcularOee,
  criarOp,
  decidirEmissao,
  ehFinal,
  estimarCicloMs,
  indicadoresEntrega,
  sequenciarFila,
  transicionar,
  validarTolerancias,
  type ErroValidacao,
  type EventoOp,
  type Andamento,
  type Dossie,
  type PedidoOrdem,
  type Receita,
} from '@aupro/dominio';
import { RESULTADO_OP } from '@aupro/contrato-clp';
import { emTransacao, type Banco } from '@aupro/servidor';
import type { ClienteGateway } from './cliente-gateway.ts';
import { escalaEfetiva, type Configuracao } from './configuracao.ts';
import type { TempoReal } from '@aupro/servidor';
import * as repo from './repositorio.ts';
import { MOTIVOS_PARADA } from './esquema.ts';
import { Despachante } from './despacho.ts';

export type ContextoMes = {
  banco: Banco;
  gateway: ClienteGateway;
  tempoReal: TempoReal;
  configuracao: () => Promise<Configuracao>;
};

/** Resultado de `emitirOrdens`: os números (na ordem pedida) e quantas foram criadas agora; ou por que não. */
export type ResultadoEmissao =
  | { ok: true; numeros: number[]; criadas: number }
  | { ok: false; codigo: 'receita_invalida'; erros: (ErroValidacao & { indice: number })[] }
  /** Pediram para substituir uma OP que ainda não terminou. */
  | { ok: false; codigo: 'ordem_ativa'; indice: number; numero: number };

/** Interrompe a transação da emissão (todas ou nenhuma). */
class OrdemAtiva extends Error {
  readonly indice: number;
  readonly numero: number;
  constructor(indice: number, numero: number) {
    super(`a OP ${numero} ainda não terminou`);
    this.indice = indice;
    this.numero = numero;
  }
}

/** Folga na promessa de prazo sobre o tempo estimado. */
const FOLGA_PRAZO = 1.25;

/**
 * Tempo de ciclo estimado no relógio desta instalação (o simulador corre mais rápido). `partida` = °C da água de
 * onde a batelada parte (reservatório); sem ela, a temperatura ambiente do domínio.
 */
export function cicloMs(receita: Receita, cfg: Configuracao, partida?: number): number {
  return estimarCicloMs(receita, partida) / escalaEfetiva(cfg);
}

export function ordenarFila(
  ordens: repo.Ordem[],
  cfg: Configuracao,
  agora: number,
  contexto: { temperaturaAtual?: number; inicio?: number } = {},
): repo.Ordem[] {
  const itens = ordens.map((ordem) => ({
    ordem,
    temperatura: ordem.receita.temperatura,
    volume: ordem.receita.volume,
    prazo: ordem.prazo,
    chegada: ordem.chegada,
    duracaoMs: cicloMs(ordem.receita, cfg, contexto.temperaturaAtual),
    fixada: ordem.fixada ?? undefined,
  }));
  const margemPrazoMs = (cfg.margemPrazoMin * 60_000) / escalaEfetiva(cfg);
  return sequenciarFila(itens, { agora, margemPrazoMs, ...contexto }).map((i) => i.ordem);
}

export class Mes {
  readonly ctx: ContextoMes;
  readonly despachante: Despachante;
  private vez: Promise<unknown> = Promise.resolve();

  constructor(ctx: ContextoMes) {
    this.ctx = ctx;
    this.despachante = new Despachante(this);
  }

  exclusivo<T>(fn: () => Promise<T>): Promise<T> {
    const r = this.vez.then(fn, fn);
    this.vez = r.catch(() => undefined);
    return r;
  }

  /**
   * Aplica um evento a uma ordem (chamar dentro de `exclusivo`). `recusa` = código de `Resultado` do CLP, no evento
   * `clp_recusou`. O estado, o registro e o feed de mudanças são gravados juntos (uma transação): se o banco falhar
   * no meio, a Loja não perde uma mudança de estado nem vê uma que não houve.
   */
  async aplicar(numero: number, evento: EventoOp, autor: string | null, detalhe?: string, recusa?: number) {
    const ordem = await repo.buscarOrdem(this.ctx.banco, numero);
    if (!ordem) return { ok: false as const, codigo: 'ordem_inexistente' as const };
    const r = transicionar(ordem.situacao, evento);
    if (!r.ok) {
      await repo.registrarEvento(this.ctx.banco, { numeroOp: numero, tipo: 'evento_recusado', detalhe: `${evento} em ${ordem.situacao.estado}`, autor });
      return r;
    }
    const mudanca = { numero, origem: ordem.origem, estado: r.situacao.estado };
    await emTransacao(this.ctx.banco, async (c) => {
      await repo.salvarSituacao(c, numero, r.situacao);
      if (recusa !== undefined) await repo.marcarRecusa(c, numero, recusa);
      await repo.registrarEvento(c, { numeroOp: numero, tipo: evento, detalhe, autor });
      await repo.registrarMudanca(c, mudanca);
    });
    this.ctx.tempoReal.publicar('ordem', mudanca);
    return r;
  }

  /**
   * Emite as ordens pedidas, todas ou nenhuma (uma transação só): a Loja nunca fica com pedido pela metade.
   * Sem prazo, cada uma recebe a promessa de prazo estimada, somando as da frente.
   *
   * Idempotente pela origem (`decidirEmissao`, em packages/dominio): se a OP daquela origem já existe, devolve o
   * número dela em vez de criar outra. Quem emite pode repetir a chamada quando a resposta se perde, sem deixar
   * OP órfã na fila, e uma origem nunca fica com duas OPs ativas. As OPs manuais (origem `manual`) e sem origem
   * são sempre novas.
   */
  async emitirOrdens(pedidos: PedidoOrdem[]): Promise<ResultadoEmissao> {
    const erros = pedidos.flatMap((p, indice) => {
      const criada = criarOp(p.receita);
      return [...(criada.ok ? [] : criada.codigo === 'receita_invalida' ? criada.erros : []), ...validarTolerancias(p.tolerancias)]
        .map((e) => ({ ...e, indice }));
    });
    if (erros.length > 0) return { ok: false, codigo: 'receita_invalida', erros };
    const estimados = await this.estimarPrazos(pedidos.map((p) => p.receita));
    return this.exclusivo(async () => {
      let emitidas: { numero: number; nova: boolean }[];
      try {
        emitidas = await emTransacao(this.ctx.banco, async (c) => {
          const r: { numero: number; nova: boolean }[] = [];
          for (const [i, p] of pedidos.entries()) {
            const autor = p.autor ?? null;
            const origem = p.origem;
            // a busca usa a conexão da transação: duas ordens da mesma origem no mesmo pedido dão a mesma OP
            const anterior = origem !== null && origem !== ORIGEM_MANUAL ? await repo.ultimaOrdemDaOrigem(c, origem) : null;
            const decisao = decidirEmissao(anterior && { numero: anterior.numero, final: ehFinal(anterior.situacao.estado) }, p.substitui);
            if (anterior && decisao === 'ativa') throw new OrdemAtiva(i, anterior.numero);
            if (anterior && decisao === 'devolver') {
              await repo.registrarEvento(c, { numeroOp: anterior.numero, tipo: 'emissao_repetida', detalhe: origem, autor });
              r.push({ numero: anterior.numero, nova: false });
              continue;
            }
            const numero = await repo.inserirOrdem(c, { origem, receita: p.receita, tolerancias: p.tolerancias, prazo: p.prazo ?? estimados[i], autor });
            await repo.registrarEvento(c, { numeroOp: numero, tipo: 'criada', detalhe: origem, autor });
            // "produzir de novo": a OP anterior guarda qual a substituiu
            if (anterior) await repo.registrarEvento(c, { numeroOp: anterior.numero, tipo: 'substituida', detalhe: `OP ${numero}`, autor });
            await repo.registrarMudanca(c, { numero, origem, estado: 'na_fila' });
            r.push({ numero, nova: true });
          }
          return r;
        });
      } catch (erro) {
        if (erro instanceof OrdemAtiva) return { ok: false as const, codigo: 'ordem_ativa' as const, indice: erro.indice, numero: erro.numero };
        throw erro;
      }
      for (const [i, e] of emitidas.entries()) {
        if (e.nova) this.ctx.tempoReal.publicar('ordem', { numero: e.numero, origem: pedidos[i].origem, estado: 'na_fila' });
      }
      return { ok: true as const, numeros: emitidas.map((e) => e.numero), criadas: emitidas.filter((e) => e.nova).length };
    });
  }

  /** Na fila: cancela já. Enviada: pede a retirada ao CLP e cancela quando confirmada. */
  cancelarOrdem(numero: number, autor: string | null): Promise<'cancelada' | 'pendente' | 'nao_pode' | 'inexistente'> {
    return this.exclusivo(async () => {
      const o = await repo.buscarOrdem(this.ctx.banco, numero);
      if (!o) return 'inexistente';
      if (o.situacao.estado === 'na_fila') {
        await this.aplicar(numero, 'cancelar', autor);
        return 'cancelada';
      }
      if (o.situacao.estado === 'enviada') {
        await repo.marcarCancelarAoRetirar(this.ctx.banco, numero);
        await repo.registrarEvento(this.ctx.banco, { numeroOp: numero, tipo: 'cancelamento_pedido', autor });
        return 'pendente';
      }
      return 'nao_pode';
    });
  }

  /** PCP fixa a posição de uma OP que o CLP ainda não recebeu (null solta). */
  fixar(numero: number, posicao: number | null, autor: string | null): Promise<boolean> {
    return this.exclusivo(async () => {
      const o = await repo.buscarOrdem(this.ctx.banco, numero);
      if (!o || (o.situacao.estado !== 'na_fila' && o.situacao.estado !== 'enviada')) return false;
      await repo.fixarOrdem(this.ctx.banco, numero, posicao);
      await repo.registrarEvento(this.ctx.banco, { numeroOp: numero, tipo: 'fixada', detalhe: posicao === null ? 'livre' : String(posicao), autor });
      this.ctx.tempoReal.publicar('ordem', { numero, origem: o.origem, estado: o.situacao.estado });
      return true;
    });
  }

  /**
   * O CLP perdeu a batelada (reset da CPU, por exemplo) e nunca vai publicar a conclusão: registra a OP como
   * abortada. Só vale com o CLP respondendo e sem estar com essa OP. Não muda nada na bancada.
   */
  registrarAbortada(numero: number, autor: string | null): Promise<boolean> {
    return this.exclusivo(async () => {
      const o = await repo.buscarOrdem(this.ctx.banco, numero);
      const b = this.despachante.estado();
      if (!o || o.situacao.estado !== 'em_producao' || !b.conectado || !b.clpVivo || b.opExecucao === numero) return false;
      return (await this.aplicar(numero, 'clp_abortou', autor, 'registrada à mão: o CLP não está com esta OP')).ok;
    });
  }

  /** Promessa de prazo de cada receita, na ordem, somando o que já está na frente. */
  async estimarPrazos(receitas: Receita[]): Promise<number[]> {
    const cfg = await this.ctx.configuracao();
    const escala = escalaEfetiva(cfg);
    const frente = await repo.listarOrdens(this.ctx.banco, ['na_fila', 'enviada', 'em_producao', 'comunicacao_perdida']);
    // todas partem da temperatura do reservatório lida agora (projeção simples para as de trás)
    const partida = this.despachante.temperaturaReservatorio();
    let acumulado = frente.reduce((s, o) => s + estimarCicloMs(o.receita, partida), 0);
    const agora = Date.now();
    return receitas.map((r) => {
      acumulado += estimarCicloMs(r, partida);
      return agora + (acumulado * FOLGA_PRAZO) / escala;
    });
  }

  /** Fila na ordem de produção: em produção, disponível ao CLP, depois a fila sequenciada. */
  async fila() {
    const cfg = await this.ctx.configuracao();
    const escala = escalaEfetiva(cfg);
    const ativas = await repo.listarOrdens(this.ctx.banco, ['na_fila', 'enviada', 'em_producao', 'comunicacao_perdida']);
    const emProducao = ativas.filter((o) => o.situacao.estado === 'em_producao' || o.situacao.estado === 'comunicacao_perdida');
    const disponivel = this.despachante.disponivel();
    const candidatas = ativas.filter((o) => o.situacao.estado === 'na_fila' || o.situacao.estado === 'enviada');
    const agora = Date.now();
    const contexto = await this.despachante.contextoFila(cfg, agora);
    const enviada = candidatas.filter((o) => o.numero === disponivel);
    const ordenadas = ordenarFila(candidatas.filter((o) => o.numero !== disponivel), cfg, agora, {
      ...contexto,
      inicio: contexto.inicio + enviada.reduce((s, o) => s + estimarCicloMs(o.receita, contexto.temperaturaAtual) / escala, 0),
    });
    let inicio = agora;
    return [...emProducao, ...enviada, ...ordenadas].map((o, i) => {
      // a em produção começou quando o CLP a recebeu
      const estimadoInicio = i === 0 && o.recebidaEm && emProducao.includes(o) ? o.recebidaEm : inicio;
      inicio = Math.max(agora, estimadoInicio + estimarCicloMs(o.receita, contexto.temperaturaAtual) / escala);
      return { posicao: i + 1, ordem: o, disponivel: o.numero === disponivel, inicioEstimado: estimadoInicio, fimEstimado: inicio };
    });
  }

  /** Para a Loja: andamento das ordens pedidas (contrato, GET /api/ordens/andamento). */
  async andamento(numeros: number[]): Promise<Andamento[]> {
    const ordens = await repo.buscarOrdens(this.ctx.banco, numeros);
    const fila = await this.fila();
    const bancada = this.despachante.estado();
    const bateladas = new Map((await repo.buscarBateladas(this.ctx.banco, ordens.map((o) => o.numero))).map((b) => [b.numeroOp, b]));
    return ordens.map((o) => {
      const naFila = fila.find((f) => f.ordem.numero === o.numero);
      const produzindo = bancada.opExecucao === o.numero;
      return {
        numero: o.numero,
        estado: o.situacao.estado,
        prazo: o.prazo,
        posicaoFila: naFila ? naFila.posicao : null,
        fimEstimado: naFila ? naFila.fimEstimado : null,
        etapa: produzindo ? bancada.etapa : null,
        processo: produzindo ? bancada.processo : null,
        batelada: bateladas.get(o.numero) ?? null,
        recusa: o.recusa,
      };
    });
  }

  /** Feed para a Loja (contrato, GET /api/ordens/mudancas). */
  mudancas(desde: number, limite = 500) {
    return repo.mudancas(this.ctx.banco, desde, limite);
  }

  /** Rastreabilidade completa de uma OP (certificado e tela de detalhe). */
  async dossie(numero: number): Promise<Dossie | null> {
    const ordem = await repo.buscarOrdem(this.ctx.banco, numero);
    if (!ordem) return null;
    const batelada = await repo.buscarBatelada(this.ctx.banco, numero);
    return {
      ordem,
      batelada,
      avaliacao: batelada ? avaliarQualidade(ordem.receita, ordem.tolerancias, batelada) : null,
      inspecao: await repo.buscarInspecao(this.ctx.banco, numero),
      leituras: await repo.leituras(this.ctx.banco, numero),
      eventos: await repo.eventosDaOrdem(this.ctx.banco, numero),
    };
  }

  abrirParada(motivo: string, observacao: string | null, autor: string | null) {
    return this.exclusivo(async () => {
      if (!(MOTIVOS_PARADA as readonly string[]).includes(motivo)) return { ok: false as const, codigo: 'motivo_invalido' };
      const abertas = (await repo.paradas(this.ctx.banco)).filter((p) => p.fim === null);
      if (abertas.length > 0) return { ok: false as const, codigo: 'parada_aberta' };
      const id = await repo.abrirParada(this.ctx.banco, { motivo, observacao, autor });
      await repo.registrarEvento(this.ctx.banco, { numeroOp: null, tipo: 'parada_inicio', detalhe: motivo, autor });
      this.ctx.tempoReal.publicar('parada', { id });
      return { ok: true as const, id };
    });
  }

  encerrarParada(id: number, autor: string | null) {
    return this.exclusivo(async () => {
      const ok = await repo.encerrarParada(this.ctx.banco, id);
      if (ok) {
        await repo.registrarEvento(this.ctx.banco, { numeroOp: null, tipo: 'parada_fim', detalhe: String(id), autor });
        this.ctx.tempoReal.publicar('parada', { id });
      }
      return ok;
    });
  }

  async paradas() {
    const cfg = await this.ctx.configuracao();
    return repo.paradas(this.ctx.banco, cfg.inicioAula);
  }

  async indicadores() {
    const cfg = await this.ctx.configuracao();
    const escala = escalaEfetiva(cfg);
    const agora = Date.now();
    const janela = { inicio: cfg.inicioAula, fim: agora };
    const bateladas = await repo.bateladasDesde(this.ctx.banco, cfg.inicioAula);
    const ordens = new Map((await repo.buscarOrdens(this.ctx.banco, bateladas.map((b) => b.numeroOp))).map((o) => [o.numero, o]));
    const paradas = (await repo.paradas(this.ctx.banco, cfg.inicioAula)).map((p) => ({ inicio: p.inicio, fim: p.fim ?? agora }));

    const paraOee = bateladas.flatMap((b) => {
      const o = ordens.get(b.numeroOp);
      if (!o) return [];
      const aprovada =
        b.resultadoOp === RESULTADO_OP.abortada ? false
        : o.situacao.estado === 'aprovada' ? true
        : o.situacao.estado === 'reprovada' ? false
        : null;
      return [{ cicloIdealMs: estimarCicloMs(o.receita) / escala, aprovada }];
    });
    const oee = calcularOee(janela, paradas, paraOee);

    const concluidas = bateladas.filter((b) => b.resultadoOp !== RESULTADO_OP.abortada);
    const entrega = indicadoresEntrega(
      concluidas.flatMap((b) => {
        const o = ordens.get(b.numeroOp);
        return o && o.concluidaEm !== null ? [{ criadaEm: o.chegada, concluidaEm: o.concluidaEm, prazo: o.prazo }] : [];
      }),
    );
    const cicloMedioMs =
      concluidas.length === 0 ? null
      : concluidas.reduce((s, b) => s + b.tempos.pressurizar + b.tempos.aquecer + b.tempos.resfriar + b.tempos.transferir + b.tempos.devolver, 0) / concluidas.length;

    return { inicioAula: cfg.inicioAula, agora, escala, ...oee, abortadas: bateladas.length - concluidas.length, cicloMedioMs, ...entrega };
  }

  /** Relatório da aula em CSV (separador ";" e vírgula decimal, como o Excel em português abre). */
  async relatorioCsv(): Promise<string> {
    const ind = await this.indicadores();
    const cfg = await this.ctx.configuracao();
    const todas = await repo.ordensDesde(this.ctx.banco, cfg.inicioAula);
    const n = (v: number | null | undefined, casas = 2) => (v === null || v === undefined ? '' : v.toFixed(casas).replace('.', ','));
    const pct = (v: number | null) => (v === null ? '' : `${n(v * 100, 1)} %`);
    const data = (v: number | null) => (v === null ? '' : new Date(v).toISOString());
    const linhas: string[] = [
      `Relatório da aula;${data(ind.inicioAula)};${data(ind.agora)}`,
      `OEE;${pct(ind.oee)}`,
      `Disponibilidade;${pct(ind.disponibilidade)}`,
      `Desempenho;${pct(ind.desempenho)}`,
      `Qualidade;${pct(ind.qualidade)}`,
      `Produzidas;${ind.produzidas};Aprovadas;${ind.aprovadas};Reprovadas;${ind.reprovadas};Abortadas;${ind.abortadas}`,
      `Lead time médio (min);${n(ind.leadTimeMedioMs === null ? null : ind.leadTimeMedioMs / 60_000)}`,
      `No prazo;${pct(ind.noPrazo)}`,
      '',
      'OP;Origem;Estado;Volume pedido (L);Temperatura pedida (°C);Vazão (L/min);Pressão (bar);Chegada;Enviada;Recebida;Concluída;Prazo;' +
        'Volume medido (L);Temperatura medida (°C);Pressurizar (s);Aquecer (s);Resfriar (s);Transferir (s);Devolver (s);Inspeção',
    ];
    for (const o of todas) {
      const b = await repo.buscarBatelada(this.ctx.banco, o.numero);
      const i = await repo.buscarInspecao(this.ctx.banco, o.numero);
      const s = (v: number | undefined) => (v === undefined ? '' : n(v / 1000, 1));
      linhas.push([
        o.numero, o.origem ?? '', o.situacao.estado, n(o.receita.volume, 1), n(o.receita.temperatura, 1), n(o.receita.vazao, 1),
        n(o.receita.pressao, 1), data(o.chegada), data(o.enviadaEm), data(o.recebidaEm), data(o.concluidaEm), data(o.prazo),
        n(b?.volume), n(b?.temperatura), s(b?.tempos.pressurizar), s(b?.tempos.aquecer), s(b?.tempos.resfriar),
        s(b?.tempos.transferir),
        s(b?.tempos.devolver), i?.resultado ?? '',
      ].join(';'));
    }
    return '﻿' + linhas.join('\r\n') + '\r\n';
  }

  /** Reinicia o cenário da aula: apaga ordens e registros do MES (a numeração das OPs continua). */
  reiniciar(): Promise<void> {
    return this.exclusivo(async () => {
      await emTransacao(this.ctx.banco, (c) => repo.apagarTudo(c)); // tudo ou nada: não fica a aula apagada pela metade
      this.despachante.reiniciar();
      this.ctx.tempoReal.publicar('ordem', { reiniciado: true });
    });
  }
}
