// Aperto de mão do pedido disponível (ROTEIRO, seção 6.4), sem bytes nem rede.
// O MES deixa um pedido disponível com um SeqPedido novo; o CLP, quando pega o pedido para produzir,
// copia SeqPedido para EcoSeq (cópia e eco no mesmo ciclo do CLP). O MES pode trocar o pedido antes do eco.
//
// Ordem das chamadas (uma conexão só, pedidos em série no gateway):
//   disponibilizar → grava no CLP → escritaConfirmada → leituras seguintes → aoLerEco

import { proximoWord } from './codec.ts';
import { NENHUM_PEDIDO, RESULTADO_ACEITO } from './layout.ts';

export type Envio = {
  seq: number;
  numeroOp: number;
  /** A gravação no CLP foi confirmada. */
  gravado: boolean;
};

export type EstadoAperto = {
  /** Último SeqPedido gerado pelo MES. */
  ultimoSeq: number;
  /** Envios ainda sem desfecho, do mais antigo ao mais novo. */
  semEco: Envio[];
};

export type EventoAperto =
  /** O CLP pegou esta OP para produzir. */
  | { tipo: 'recebida'; numeroOp: number }
  /** O CLP pegou esta OP e recusou (Resultado > 0). */
  | { tipo: 'recusada'; numeroOp: number; resultado: number }
  /** A OP foi trocada antes de o CLP pegá-la: volta para a fila. */
  | { tipo: 'retirada'; numeroOp: number };

/**
 * Estado ao (re)conectar, a partir da própria área de escrita lida do CLP:
 * se SeqPedido ≠ EcoSeq, aquele pedido ainda está esperando o CLP.
 */
export function apertoAoConectar(seqPedido: number, numeroOp: number, ecoSeq: number): EstadoAperto {
  return {
    ultimoSeq: seqPedido,
    semEco: seqPedido !== ecoSeq ? [{ seq: seqPedido, numeroOp, gravado: true }] : [],
  };
}

/** OP disponível agora (a mais nova sem desfecho), ou NENHUM_PEDIDO. */
export function pedidoDisponivel(estado: EstadoAperto): number {
  return estado.semEco.at(-1)?.numeroOp ?? NENHUM_PEDIDO;
}

/**
 * Deixa `numeroOp` disponível (ou NENHUM_PEDIDO, para retirar o que estava).
 * Devolve o SeqPedido a gravar junto com o pedido, num único envio.
 */
export function disponibilizar(estado: EstadoAperto, numeroOp: number): { estado: EstadoAperto; seqPedido: number } {
  const seqPedido = proximoWord(estado.ultimoSeq);
  return {
    estado: { ultimoSeq: seqPedido, semEco: [...estado.semEco, { seq: seqPedido, numeroOp, gravado: false }] },
    seqPedido,
  };
}

/** O CLP confirmou a gravação do envio com este SeqPedido. */
export function escritaConfirmada(estado: EstadoAperto, seqPedido: number): EstadoAperto {
  return { ...estado, semEco: estado.semEco.map((e) => (e.seq === seqPedido ? { ...e, gravado: true } : e)) };
}

/** A gravação falhou: o envio nunca chegou ao CLP. */
export function escritaFalhou(estado: EstadoAperto, seqPedido: number): { estado: EstadoAperto; eventos: EventoAperto[] } {
  const envio = estado.semEco.find((e) => e.seq === seqPedido);
  const eventos: EventoAperto[] =
    envio && envio.numeroOp !== NENHUM_PEDIDO ? [{ tipo: 'retirada', numeroOp: envio.numeroOp }] : [];
  return { estado: { ...estado, semEco: estado.semEco.filter((e) => e.seq !== seqPedido) }, eventos };
}

const retirada = (envios: Envio[]): EventoAperto[] =>
  envios.filter((e) => e.numeroOp !== NENHUM_PEDIDO).map((e) => ({ tipo: 'retirada', numeroOp: e.numeroOp }));

/**
 * Trata uma leitura do CLP feita depois das escritas já confirmadas.
 * - Eco de um envio: ele foi pego; os anteriores a ele nunca foram (viram "retirada").
 * - Envio sem eco, coberto por outro mais novo já gravado: os valores dele sumiram do DB, o CLP não o pega
 *   mais (viram "retirada").
 */
export function aoLerEco(
  estado: EstadoAperto,
  ecoSeq: number,
  resultado: number,
): { estado: EstadoAperto; eventos: EventoAperto[] } {
  let semEco = estado.semEco;
  const eventos: EventoAperto[] = [];

  const i = semEco.findIndex((e) => e.seq === ecoSeq);
  if (i >= 0) {
    eventos.push(...retirada(semEco.slice(0, i)));
    const pego = semEco[i];
    if (pego.numeroOp !== NENHUM_PEDIDO) {
      eventos.push(
        resultado === RESULTADO_ACEITO
          ? { tipo: 'recebida', numeroOp: pego.numeroOp }
          : { tipo: 'recusada', numeroOp: pego.numeroOp, resultado },
      );
    }
    semEco = semEco.slice(i + 1);
  }

  const ultimoGravado = semEco.findLastIndex((e) => e.gravado);
  if (ultimoGravado > 0) {
    eventos.push(...retirada(semEco.slice(0, ultimoGravado)));
    semEco = semEco.slice(ultimoGravado);
  }

  return { estado: { ultimoSeq: estado.ultimoSeq, semEco }, eventos };
}
