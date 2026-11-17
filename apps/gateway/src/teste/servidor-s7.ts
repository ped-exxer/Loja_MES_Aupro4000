// Servidor S7 mínimo, SÓ PARA TESTE: imita o que uma CPU S7-1200 responde ao S7 PUT/GET, com os DBs em memória.
// É uma imitação escrita a partir da descrição do protocolo (ISO-on-TCP, RFC 1006; S7comm como o snap7 e o
// Wireshark o descrevem), não uma CPU: prova que o driver fala o protocolo e trata os erros, não substitui a prova
// na bancada (ROTEIRO, fase 4).
//
// O que ele entende:
//   TPKT + COTP  pedido de conexão (CR) → confirmação (CC); dados (DT)
//   S7 0xF0      negociação (setup communication): PDU e pedidos em paralelo
//   S7 0x04      leitura (read var), só na área de DB, vários itens por pedido
//   S7 0x05      escrita (write var), só na área de DB
// Item de DB que não existe → 0x0A (objeto inexistente); endereço além do fim do DB → 0x05 (fora da faixa).

import { createServer, type Server, type Socket } from 'node:net';

/** Códigos de retorno de um item (S7comm). */
export const RETORNO = { ok: 0xff, foraDaFaixa: 0x05, tipoNaoSuportado: 0x06, inexistente: 0x0a } as const;

const AREA_DB = 0x84;
const FUNCAO = { negociar: 0xf0, ler: 0x04, escrever: 0x05 } as const;

/**
 * - `normal`: responde como a CPU;
 * - `mudo`: aceita o TCP e não responde nada (um equipamento que não é uma CPU S7, ou uma CPU travada);
 * - `semPutGet`: conecta e negocia, mas recusa leitura e escrita com o erro 16#8104 no cabeçalho (o que a
 *   literatura do snap7 diz que a CPU faz sem "Permit access with PUT/GET"; não medido numa CPU real).
 */
export type ModoServidorS7 = 'normal' | 'mudo' | 'semPutGet';

export class ServidorS7Teste {
  /** DBs da "CPU": número → bytes. Os testes leem e escrevem aqui direto. */
  readonly dbs = new Map<number, Uint8Array>();
  modo: ModoServidorS7 = 'normal';
  /** Tamanho do PDU e pedidos em paralelo que a "CPU" aceita (S7-1200: 240 bytes). */
  pdu = 240;
  paralelo = 3;
  porta = 0;
  /** O que chegou, para os testes conferirem. */
  readonly visto = {
    conexoes: 0, leituras: 0, escritas: 0, itensLidos: 0,
    /** Maior pedido e maior resposta S7, em bytes (têm de caber no PDU negociado). */
    maiorPedido: 0, maiorResposta: 0,
    /** Último byte do TSAP de destino do pedido de conexão: rack × 32 + slot. */
    rackSlot: -1,
  };

  private servidor: Server | null = null;
  private soquetes = new Set<Socket>();

  /** Sobe o servidor; porta 0 = uma porta livre. Devolve a porta. */
  iniciar(porta = 0): Promise<number> {
    return new Promise((ok, falha) => {
      const servidor = createServer((soquete) => this.atender(soquete));
      servidor.once('error', falha);
      servidor.listen(porta, '127.0.0.1', () => {
        servidor.off('error', falha);
        this.servidor = servidor;
        const endereco = servidor.address();
        this.porta = typeof endereco === 'object' && endereco ? endereco.port : porta;
        ok(this.porta);
      });
    });
  }

  /** Conexões abertas agora (para conferir que o gateway não deixa conexão pendurada na CPU). */
  get abertas(): number {
    return this.soquetes.size;
  }

  /** Derruba as conexões abertas (a "CPU" some da rede) sem parar de escutar. */
  derrubarConexoes(): void {
    for (const s of this.soquetes) s.destroy();
    this.soquetes.clear();
  }

  /** Para de escutar e derruba as conexões: nenhum soquete fica aberto. */
  parar(): Promise<void> {
    const servidor = this.servidor;
    this.servidor = null;
    this.derrubarConexoes();
    return new Promise((ok) => (servidor ? servidor.close(() => ok()) : ok()));
  }

  private atender(soquete: Socket): void {
    this.visto.conexoes += 1;
    this.soquetes.add(soquete);
    soquete.setNoDelay(true);
    let pendente: Buffer = Buffer.alloc(0);
    soquete.on('error', () => undefined);
    soquete.on('close', () => this.soquetes.delete(soquete));
    soquete.on('data', (dados: Buffer) => {
      pendente = pendente.length === 0 ? dados : Buffer.concat([pendente, dados]);
      // o TCP entrega um fluxo: junta até ter um TPKT inteiro (versão 3, comprimento nos bytes 2 e 3)
      while (pendente.length >= 4) {
        const tamanho = pendente.readUInt16BE(2);
        if (pendente[0] !== 0x03 || tamanho < 7) return void soquete.destroy();
        if (pendente.length < tamanho) break;
        const pacote = pendente.subarray(0, tamanho);
        pendente = pendente.subarray(tamanho);
        if (this.modo === 'mudo') continue;
        const resposta = this.responder(pacote);
        if (resposta) soquete.write(resposta);
      }
    });
  }

  private responder(pacote: Buffer): Buffer | null {
    const tipoCotp = pacote[5];
    if (tipoCotp === 0xe0) return this.confirmarConexao(pacote);
    if (tipoCotp !== 0xf0 || pacote.length < 17 || pacote[7] !== 0x32) return null;

    // S7: 0x32, tipo (1 = pedido), 2 reservados, referência (2), tamanho dos parâmetros (2), tamanho dos dados (2)
    const s7 = pacote.subarray(7);
    this.visto.maiorPedido = Math.max(this.visto.maiorPedido, s7.length);
    const referencia = s7.readUInt16BE(4);
    const tamanhoParametros = s7.readUInt16BE(6);
    const parametros = s7.subarray(10, 10 + tamanhoParametros);
    const dados = s7.subarray(10 + tamanhoParametros);
    const funcao = parametros[0];

    if (funcao === FUNCAO.negociar) {
      const p = Buffer.from(parametros.subarray(0, 8));
      p.writeUInt16BE(Math.min(p.readUInt16BE(2), this.paralelo), 2);
      p.writeUInt16BE(Math.min(p.readUInt16BE(4), this.paralelo), 4);
      p.writeUInt16BE(Math.min(p.readUInt16BE(6), this.pdu), 6);
      return this.respostaS7(referencia, p, Buffer.alloc(0));
    }
    if (funcao !== FUNCAO.ler && funcao !== FUNCAO.escrever) return null;
    if (this.modo === 'semPutGet') return this.respostaS7(referencia, Buffer.alloc(0), Buffer.alloc(0), 0x8104);

    const quantos = parametros[1];
    const itens = Array.from({ length: quantos }, (_, i) => {
      const item = parametros.subarray(2 + i * 12, 14 + i * 12);
      return {
        valido: item[0] === 0x12 && item[1] === 0x0a && item[2] === 0x10,
        /** 1 = bit, 2 = byte (o nodes7 pede sempre em bytes). */
        tipo: item[3],
        tamanho: item.readUInt16BE(4),
        db: item.readUInt16BE(6),
        area: item[8],
        /** O endereço é em bits (3 bytes): byte × 8 + bit. */
        byte: item.readUIntBE(9, 3) >> 3,
      };
    });
    /** O bloco de bytes pedido, ou o código de retorno do erro. */
    const localizar = (item: (typeof itens)[number]): Uint8Array | number => {
      if (!item.valido || item.tipo !== 0x02) return RETORNO.tipoNaoSuportado;
      const db = item.area === AREA_DB ? this.dbs.get(item.db) : undefined;
      if (!db) return RETORNO.inexistente;
      if (item.byte + item.tamanho > db.length) return RETORNO.foraDaFaixa;
      return db.subarray(item.byte, item.byte + item.tamanho);
    };

    if (funcao === FUNCAO.ler) {
      this.visto.leituras += 1;
      this.visto.itensLidos += quantos;
      const partes: Buffer[] = [];
      itens.forEach((item, i) => {
        const bloco = localizar(item);
        if (typeof bloco === 'number') {
          partes.push(Buffer.from([bloco, 0x00, 0x00, 0x00]));
          return;
        }
        // 0xFF, tipo de transporte 0x04 (bytes, com o comprimento em bits), comprimento, dados; item de tamanho
        // ímpar ganha um byte de enchimento, menos o último
        const cabecalho = Buffer.from([RETORNO.ok, 0x04, 0x00, 0x00]);
        cabecalho.writeUInt16BE(bloco.length * 8, 2);
        partes.push(cabecalho, Buffer.from(bloco));
        if (bloco.length % 2 === 1 && i < itens.length - 1) partes.push(Buffer.from([0x00]));
      });
      return this.respostaS7(referencia, Buffer.from([FUNCAO.ler, quantos]), Buffer.concat(partes));
    }

    this.visto.escritas += 1;
    const retornos: number[] = [];
    let pos = 0;
    for (const [i, item] of itens.entries()) {
      // dados de cada item: 0x00, tipo de transporte, comprimento (em bits para 3, 4 e 5; senão em bytes), bytes
      const transporte = dados[pos + 1];
      const declarado = dados.readUInt16BE(pos + 2);
      const tamanho = transporte === 0x03 || transporte === 0x04 || transporte === 0x05 ? Math.ceil(declarado / 8) : declarado;
      const valor = dados.subarray(pos + 4, pos + 4 + tamanho);
      pos += 4 + tamanho + (tamanho % 2 === 1 && i < itens.length - 1 ? 1 : 0);
      const bloco = localizar(item);
      if (typeof bloco === 'number') retornos.push(bloco);
      else if (valor.length !== item.tamanho) retornos.push(RETORNO.tipoNaoSuportado);
      else {
        bloco.set(valor);
        retornos.push(RETORNO.ok);
      }
    }
    return this.respostaS7(referencia, Buffer.from([FUNCAO.escrever, quantos]), Buffer.from(retornos));
  }

  /** Confirmação de conexão (CC): devolve os parâmetros do pedido (tamanho do TPDU e os dois TSAPs). */
  private confirmarConexao(pedido: Buffer): Buffer {
    // pedido: TPKT(4) | LI, 0xE0, ref. destino (2), ref. origem (2), classe | parâmetros
    const parametros = pedido.subarray(11);
    this.visto.rackSlot = pedido[pedido.length - 1];
    const cc = Buffer.alloc(11 + parametros.length);
    cc[0] = 0x03;
    cc.writeUInt16BE(cc.length, 2);
    cc[4] = cc.length - 5;
    cc[5] = 0xd0;
    pedido.copy(cc, 6, 8, 10); // a referência de origem do cliente vira a de destino
    cc.writeUInt16BE(0x0001, 8);
    cc[10] = 0x00;
    parametros.copy(cc, 11);
    return cc;
  }

  /** Resposta S7 (tipo 3, com os 2 bytes de erro no cabeçalho) dentro de TPKT + COTP de dados. */
  private respostaS7(referencia: number, parametros: Buffer, dados: Buffer, erro = 0): Buffer {
    const s7 = Buffer.alloc(12);
    s7[0] = 0x32;
    s7[1] = 0x03;
    s7.writeUInt16BE(referencia, 4);
    s7.writeUInt16BE(parametros.length, 6);
    s7.writeUInt16BE(dados.length, 8);
    s7.writeUInt16BE(erro, 10);
    const corpo = Buffer.concat([s7, parametros, dados]);
    this.visto.maiorResposta = Math.max(this.visto.maiorResposta, corpo.length);
    const tpkt = Buffer.from([0x03, 0x00, 0x00, 0x00, 0x02, 0xf0, 0x80]);
    tpkt.writeUInt16BE(7 + corpo.length, 2);
    return Buffer.concat([tpkt, corpo]);
  }
}
