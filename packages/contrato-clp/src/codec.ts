// Converte entre os bytes do DB `MES` (big-endian) e objetos.

import {
  AREA_ASSINATURA,
  AREA_ESCRITA,
  AREA_LEITURA,
  CAMPOS_ASSINATURA,
  CAMPOS_ESCRITA,
  CAMPOS_LEITURA,
  VALORES_ASSINATURA,
  type Area,
  type Campo,
  type ValoresEscrita,
  type ValoresLeitura,
} from './layout.ts';

const LIMITES_INTEIROS = {
  Word: [0, 0xffff],
  Int: [-0x8000, 0x7fff],
  DInt: [-0x80000000, 0x7fffffff],
} as const;

function lerCampo(dados: DataView, campo: Campo, area: Area): number {
  const pos = campo.byte - area.inicio;
  switch (campo.tipo) {
    case 'Word': return dados.getUint16(pos, false);
    case 'Int': return dados.getInt16(pos, false);
    case 'DInt': return dados.getInt32(pos, false);
    case 'Real': return dados.getFloat32(pos, false);
  }
}

function escreverCampo(dados: DataView, campo: Campo, area: Area, nome: string, valor: number): void {
  const pos = campo.byte - area.inicio;
  if (campo.tipo === 'Real') {
    if (!Number.isFinite(valor)) throw new RangeError(`${nome}: valor não finito (${valor})`);
    dados.setFloat32(pos, valor, false);
    return;
  }
  const [min, max] = LIMITES_INTEIROS[campo.tipo];
  if (!Number.isInteger(valor) || valor < min || valor > max) {
    throw new RangeError(`${nome}: ${valor} não cabe em ${campo.tipo} (${min}..${max})`);
  }
  switch (campo.tipo) {
    case 'Word': dados.setUint16(pos, valor, false); break;
    case 'Int': dados.setInt16(pos, valor, false); break;
    case 'DInt': dados.setInt32(pos, valor, false); break;
  }
}

function visao(bytes: Uint8Array, area: Area): DataView {
  if (bytes.length !== area.tamanho) {
    throw new RangeError(`esperados ${area.tamanho} bytes a partir do byte ${area.inicio}, recebidos ${bytes.length}`);
  }
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** Monta a área de escrita do MES (AREA_ESCRITA). */
export function codificarEscrita(valores: ValoresEscrita): Uint8Array {
  const bytes = new Uint8Array(AREA_ESCRITA.tamanho);
  const dados = visao(bytes, AREA_ESCRITA);
  for (const [nome, campo] of Object.entries(CAMPOS_ESCRITA)) {
    escreverCampo(dados, campo, AREA_ESCRITA, nome, valores[nome as keyof ValoresEscrita]);
  }
  return bytes;
}

/** Lê a área de escrita de volta (útil no driver simulado e nos testes). */
export function decodificarEscrita(bytes: Uint8Array): ValoresEscrita {
  const dados = visao(bytes, AREA_ESCRITA);
  const valores = {} as ValoresEscrita;
  for (const [nome, campo] of Object.entries(CAMPOS_ESCRITA)) {
    valores[nome as keyof ValoresEscrita] = lerCampo(dados, campo, AREA_ESCRITA);
  }
  return valores;
}

/** Monta a área do CLP (usado pelo driver simulado e pelos testes). */
export function codificarLeitura(valores: ValoresLeitura): Uint8Array {
  const bytes = new Uint8Array(AREA_LEITURA.tamanho);
  const dados = visao(bytes, AREA_LEITURA);
  for (const [nome, campo] of Object.entries(CAMPOS_LEITURA)) {
    escreverCampo(dados, campo, AREA_LEITURA, nome, valores[nome as keyof ValoresLeitura]);
  }
  return bytes;
}

/** Interpreta a área do CLP (AREA_LEITURA). */
export function decodificarLeitura(bytes: Uint8Array): ValoresLeitura {
  const dados = visao(bytes, AREA_LEITURA);
  const valores = {} as ValoresLeitura;
  for (const [nome, campo] of Object.entries(CAMPOS_LEITURA)) {
    valores[nome as keyof ValoresLeitura] = lerCampo(dados, campo, AREA_LEITURA);
  }
  return valores;
}

/** Bytes da AREA_ASSINATURA do DB `MES`, com a assinatura. */
export function codificarAssinatura(): Uint8Array {
  const bytes = new Uint8Array(AREA_ASSINATURA.tamanho);
  const dados = visao(bytes, AREA_ASSINATURA);
  for (const [nome, campo] of Object.entries(CAMPOS_ASSINATURA)) {
    escreverCampo(dados, campo, AREA_ASSINATURA, nome, VALORES_ASSINATURA[nome as keyof typeof VALORES_ASSINATURA]);
  }
  return bytes;
}

/** Confere se os bytes lidos da AREA_ASSINATURA são a assinatura do DB `MES`. */
export function conferirAssinatura(bytes: Uint8Array): boolean {
  if (bytes.length !== AREA_ASSINATURA.tamanho) return false;
  const dados = visao(bytes, AREA_ASSINATURA);
  return (
    lerCampo(dados, CAMPOS_ASSINATURA.Assinatura, AREA_ASSINATURA) === VALORES_ASSINATURA.Assinatura &&
    lerCampo(dados, CAMPOS_ASSINATURA.AssinaturaValor, AREA_ASSINATURA) === VALORES_ASSINATURA.AssinaturaValor
  );
}

/** Próximo valor de um contador Word (VidaMes, SeqPedido): volta a 0 depois de 65535. */
export function proximoWord(valor: number): number {
  return (valor + 1) & 0xffff;
}
