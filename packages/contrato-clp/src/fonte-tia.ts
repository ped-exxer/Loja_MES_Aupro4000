// Gera a fonte do DB `MES` para o TIA Portal (External source files → "Generate blocks from source"),
// a partir do layout deste pacote: o programa do CLP e o MES nunca divergem nos deslocamentos.

import {
  AREA_ASSINATURA,
  AREA_ESCRITA,
  AREA_LEITURA,
  CAMPOS_ASSINATURA,
  CAMPOS_ESCRITA,
  CAMPOS_LEITURA,
  TAMANHO_TIPO,
  VALORES_ASSINATURA,
  type Campo,
} from './layout.ts';

const COMENTARIOS: Record<string, string> = {
  VidaMes: 'MES soma 1 a cada ciclo',
  SeqPedido: 'MES soma 1 ao trocar o pedido disponivel',
  NumeroOp: 'OP disponivel (0 = nenhum pedido)',
  SpVolume: 'L no TQ-02',
  SpTemperatura: 'graus C',
  SpVazao: 'L/min no envase',
  SpPressao: 'bar no TQ-01',
  VidaClp: 'CLP soma 1 a cada ciclo',
  EcoSeq: 'SeqPedido do ultimo pedido recebido (copiar no mesmo ciclo em que pega o pedido)',
  Resultado: 'do pedido recebido: 0 aceito, >0 recusado',
  Estado: '0 ocioso, 1 em producao, 2 parada, 3 em falha',
  Etapa: '0 nenhuma, 1 pressurizar, 2 aquecer, 3 transferir, 4 aguardar, 5 devolver',
  OpExecucao: 'OP em producao (0 = nenhuma)',
  Alarme: 'codigo do ultimo alarme/intertravamento',
  OpConcluida: 'ultima OP terminada: gravar POR ULTIMO, depois dos campos abaixo',
  ResultadoOp: '1 concluida, 2 abortada',
  VolumeProduzido: 'L no TQ-02',
  TemperaturaProduto: 'graus C no fim da transferencia',
  TempoPressurizar: 'ms',
  TempoAquecer: 'ms',
  TempoTransferir: 'ms',
  TempoDevolver: 'ms',
  Assinatura: 'nao mudar: o MES acha o DB por ela',
  AssinaturaValor: 'nao mudar: o MES acha o DB por ela',
};

type Linha = { nome: string; tipo: string; comentario: string; byte: number; tamanho: number };

/** Lista as variáveis em ordem, com o preenchimento (reservado) entre as áreas. */
export function variaveisDb(): Linha[] {
  const campos = [CAMPOS_ESCRITA, CAMPOS_LEITURA, CAMPOS_ASSINATURA].flatMap((grupo) =>
    Object.entries(grupo as Record<string, Campo>).map(([nome, c]) => ({
      nome, tipo: c.tipo, comentario: COMENTARIOS[nome] ?? '', byte: c.byte, tamanho: TAMANHO_TIPO[c.tipo],
    })),
  );
  campos.sort((a, b) => a.byte - b.byte);
  const linhas: Linha[] = [];
  let pos = 0;
  let reservas = 0;
  for (const c of campos) {
    if (c.byte > pos) {
      const palavras = (c.byte - pos) / 2;
      linhas.push({
        nome: `Reservado${++reservas}`,
        tipo: palavras === 1 ? 'Word' : `Array[0..${palavras - 1}] of Word`,
        comentario: 'reservado',
        byte: pos,
        tamanho: c.byte - pos,
      });
    }
    linhas.push(c);
    pos = c.byte + c.tamanho;
  }
  return linhas;
}

export function fonteDbTia(): string {
  const area = (byte: number) =>
    byte < AREA_ESCRITA.inicio + AREA_ESCRITA.tamanho ? 'escrita do MES'
    : byte >= AREA_LEITURA.inicio && byte < AREA_LEITURA.inicio + AREA_LEITURA.tamanho ? 'escrita do CLP'
    : byte >= AREA_ASSINATURA.inicio ? 'assinatura'
    : '';
  const corpo = variaveisDb()
    .map((l) => `      ${l.nome} : ${l.tipo};   // byte ${l.byte}${area(l.byte) ? ` (${area(l.byte)})` : ''}: ${l.comentario}`)
    .join('\n');
  return [
    '// DB MES da Loja/MES AUPRO4000. Gerado por packages/contrato-clp (npm run db-mes): nao editar a mao.',
    '// Sem "Optimized block access": o MES le e escreve por deslocamento de byte (S7 PUT/GET).',
    'DATA_BLOCK "MES"',
    "{ S7_Optimized_Access := 'FALSE' }",
    'VERSION : 0.1',
    'NON_RETAIN',
    '   STRUCT',
    corpo,
    '   END_STRUCT;',
    '',
    'BEGIN',
    `   Assinatura := 16#${VALORES_ASSINATURA.Assinatura.toString(16).toUpperCase()};`,
    `   AssinaturaValor := ${VALORES_ASSINATURA.AssinaturaValor};`,
    '',
    'END_DATA_BLOCK',
    '',
  ].join('\r\n');
}
