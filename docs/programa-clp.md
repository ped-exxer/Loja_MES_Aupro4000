# O que o programa do CLP precisa fazer

Para quem vai escrever o programa do S7-1200 da AUPRO4000 (fase 4 do [ROTEIRO](../ROTEIRO.md)). O MES **não comanda
a bancada**: ele só deixa disponível, no DB `MES`, o próximo pedido da fila. Partida, etapas, intertravamentos,
espera antes de devolver e paradas continuam sendo do programa do CLP.

O driver simulado do gateway ([apps/gateway/src/simulado.ts](../apps/gateway/src/simulado.ts)) faz exatamente o que está
descrito aqui. Ele é a referência executável: dá para ler o código dele ao lado deste texto.

## 1. O DB `MES`

Importe [docs/clp/MES.db](clp/MES.db) no TIA Portal: *External source files → Add new external file → Generate
blocks from source*. Esse arquivo é gerado a partir de `packages/contrato-clp` (`npm run db-mes`). Não edite os
deslocamentos à mão: se o layout precisar mudar, mude no contrato e gere de novo.

- O DB tem que ficar **sem** "Optimized block access" (o arquivo já declara isso).
- O número do DB pode ser qualquer um. A Loja acha o DB pela assinatura (botão "Procurar" na Configuração), e o
  gateway confere a assinatura antes de escrever.
- Nas propriedades da CPU: **"Permit access with PUT/GET communication from remote partner"**.

| Bytes | Quem escreve | Conteúdo |
|---|---|---|
| 0–23 | MES | `VidaMes`, `SeqPedido`, `NumeroOp` e os setpoints do próximo pedido |
| 24–31 | ninguém | reservado |
| 32–47 | CLP | vida, eco, resultado, estado, etapa, OP em produção, alarme |
| 48–81 | CLP | bloco da OP concluída (com `TempoResfriar` em 78) |
| 82–89 | CLP | ao vivo: `TemperaturaTq02` (TE-105a) e `TemperaturaReservatorio` (TE-105b) |
| 90–95 | ninguém | reservado |
| 96–101 | ninguém | assinatura (`16#4D45`, `4000.75`) |

O DB tem **102 bytes**. O programa do CLP **não escreve nos bytes 0–23**, e o MES não escreve nos bytes 32–101.

## 2. Vida

- `VidaClp`: some 1 a cada ciclo (ou a cada 100 ms). Se ficar parado por 5 s, o MES marca "comunicação perdida".
- `VidaMes`: o MES soma 1 a cada 0,5 s. Sugestão: se ficar parado por 5 s, **não pegue pedido novo** (termine a
  batelada atual normalmente).

## 3. Pegar o pedido ("recebi")

Quando a bancada estiver livre para começar uma batelada:

```
SE SeqPedido <> EcoSeq E NumeroOp <> 0 ENTÃO
    seq      := SeqPedido            // 1. copie o número do pedido primeiro
    receita  := NumeroOp e Sp*       // 2. copie os valores
    SE SeqPedido = seq ENTÃO         // 3. confira que o MES não trocou o pedido no meio da cópia
        SE receita fora das faixas → Resultado := motivo (> 0)
        SENÃO                        → Resultado := 0; OpExecucao := NumeroOp; começa a batelada
        EcoSeq := seq                // 4. ecoe a CÓPIA, no mesmo ciclo
    FIM   // senão: tente de novo no próximo ciclo
FIM
```

- **Ecoe a cópia** (`seq`), não o `SeqPedido` atual. O MES pode trocar o pedido disponível a qualquer momento antes
  do eco (reordenação, cancelamento), e é o eco que diz qual pedido você pegou.
- **Cópia e eco no mesmo ciclo.** Com isso, se o MES troca o pedido e a leitura seguinte não traz o eco do antigo,
  ele pode devolver o antigo à fila na hora.
- `NumeroOp = 0` quer dizer "nenhum pedido": não pegue nada.
- Faixas (dupla checagem; o MES já validou): volume 2–20 L, temperatura 40–65 °C, vazão 1–6 L/min, pressão
  1,5–3 bar. Os códigos de `Resultado` > 0 são seus: anote-os no ROTEIRO quando definir.

## 4. Durante a batelada

### 4.1 Rodadas do TQ-01

O TQ-01 tem **10 L** e **o envase só começa depois de o TQ-01 atingir a temperatura do pedido**. Um pedido maior que
o TQ-01 é feito em **rodadas** (15 L = 10 + 5; 20 L = 10 + 10; até 10 L, uma rodada só):

```
pressurizar (B1, PIC-103)                       // uma vez por batelada
PARA cada rodada (volume da rodada = mín(10 L, o que falta)):
    SE TIT-104 < SpTemperatura → aquecer (TZ-104) até a temperatura
    SE TIT-104 > SpTemperatura → resfriar até a temperatura (ver 4.2)
    transferir o volume da rodada para o TQ-02 (FIC-102 na SpVazao)
    // a B1 repõe o TQ-01 com água do reservatório: a próxima rodada parte da temperatura do reservatório
aguardar → devolver o TQ-02 ao reservatório (VY-01)  // uma vez por batelada
```

A última rodada termina quando o LIT-101 chega a `SpVolume`. A água da 1ª rodada perde um pouco de calor no TQ-02
enquanto a 2ª aquece (no simulador, ≈ 1 °C num pedido de 15 L a 65 °C); se isso tirar o produto da tolerância na
bancada, compensar (por exemplo, levar a última rodada um pouco acima) é decisão do programa do CLP.

### 4.2 Resfriar pelo trocador

A bancada tem resfriamento: com a **FV-105** aberta, o TQ-01 recircula pelo trocador de calor com o ventilador **M1**
(inversor **FY-105**). Se a água de partida (do reservatório, que esquenta com as bateladas devolvidas) estiver
**acima** da temperatura do pedido, a rodada resfria até a temperatura em vez de aquecer. Água já na temperatura vai
direto para a transferência.

### 4.3 O que o CLP publica

`Estado` (0 ocioso, 1 em produção, 2 parada, 3 em falha), `Etapa` (1 pressurizar, 2 aquecer, 3 transferir,
4 aguardar, 5 devolver, **6 resfriar**), `OpExecucao` e `Alarme` aparecem nas telas. Numa batelada em rodadas a
`Etapa` volta de 3 para 2 (ou 6) a cada rodada nova. O MES não decide nada com eles.

**A cada ciclo**, mesmo ocioso, escreva no DB `MES`:

- `TemperaturaTq02` (byte 82, Real): °C do **TE-105a**, a água no TQ-02 (o produto pronto);
- `TemperaturaReservatorio` (byte 86, Real): °C do **TE-105b**, a água do reservatório.

Esses dois sensores **não existem** no DB `MB_Simulador`: só chegam ao MES por aqui. As outras variáveis de processo
ao vivo (TIT-104, LIT-101, PIT-103, FIT-102) o MES lê do DB `MB_Simulador`, que não muda.

A potência do resistor e a taxa de resfriamento do trocador ainda não são conhecidas: a estimativa de ciclo do MES
usa valores provisórios (`packages/dominio/src/ciclo.ts`: aquecer 1,4 s por °C e por litro, resfriar 8 s por °C e
por litro). Meça na bancada (os `Tempo*` do bloco da OP concluída servem para isso).

## 5. Terminar a batelada

No fim (concluída ou abortada), grave o bloco da OP concluída **com `OpConcluida` por último**:

```
ResultadoOp        := 1 (concluída) ou 2 (abortada)
VolumeProduzido    := L medidos no TQ-02 (LIT-101) no fim da transferência
TemperaturaProduto := °C do TE-105a (TQ-02) no fim da transferência da última rodada
TempoPressurizar, TempoAquecer, TempoResfriar, TempoTransferir, TempoDevolver := ms de cada etapa
                     // aquecer, resfriar e transferir: soma das rodadas; resfriar = 0 se não precisou
OpConcluida        := número da OP                       // por último
OpExecucao := 0; Estado := 0; Etapa := 0
```

O MES percebe a mudança de `OpConcluida` e registra a batelada. Gravar `OpConcluida` por último garante que,
quando o MES vê o número novo, os valores já são dessa OP.

Quando esvaziar o TQ-02 (direto, ou esperando um botão na bancada) é decisão sua: não muda nada no MES. A "OP
concluída" pode ser publicada no fim da transferência ou no fim da devolução; o simulador publica no fim da
devolução, quando a bancada fica livre.

## 6. Como testar sem a Loja inteira

1. Com a Loja no ar e a Configuração em "Bancada (S7)", com o IP, rack 0 e slot 1, clique em **Procurar** para
   achar o DB e depois em **Salvar**.
2. No menu Bancada, confira "Conectado" e "CLP respondendo".
3. Crie uma OP manual em Fila (PCP) e veja `NumeroOp`/`SeqPedido` mudarem no DB (tabela de observação no TIA).
4. Mude `EcoSeq` à mão para o valor de `SeqPedido`: a OP passa a "Em produção". Escreva o bloco da OP concluída:
   ela passa a "Produzida".
