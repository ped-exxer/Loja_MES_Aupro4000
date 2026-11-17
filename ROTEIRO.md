# Roteiro: Loja (ERP) e MES da AUPRO4000

Documento de partida do projeto. Diz **o que** construir, **por que**, e em que ordem. As decisões marcadas
**[ABERTA]** ainda não foram tomadas; quem continuar não as decide sozinho, pergunta. As marcadas **[DECIDIDA]**
foram tomadas (resumo na seção 11).

---

## 1. Objetivo

Fechar, numa aula, o ciclo completo de uma indústria 4.0 em cima da bancada **AUPRO4000** (controle de processos
da Exxer: nível, pressão, temperatura e vazão, CLP Siemens **S7-1200**), passando pelos níveis da ISA-95:

```
 Nível 4  ERP   Cliente compra na Loja → pedido, faturamento
                                                    ↓ ordem de produção (uma por batelada)
 Nível 3  MES   Sequencia a fila (temperaturas, volumes, prazos), entrega ao CLP um pedido por vez,
                qualidade, rastreabilidade, OEE
                                                    ↓ próximo pedido (S7 PUT/GET)   ↑ "recebi", resultado
 Nível 1  CLP   S7-1200 da bancada conduz e produz a batelada
```

É um produto **didático**: o "cliente" é um aluno (ou o professor), a "fábrica" é a bancada, o "produto" é uma
batelada de água aquecida. Não há pagamento real nem entrega física.

Fica **fora do Simmaq 3DX**. O Simmaq 3DX entra só como uma das "fábricas" possíveis (seção 7).

## 2. O produto: uma batelada

O que a AUPRO4000 fabrica é água preparada no **TQ-01** (10 L, fechado, pressurizado e aquecido) e transferida para
o **TQ-02** (25 L, aberto, o produto pronto). Um pedido define:

| Atributo | Faixa na bancada | De onde vem o limite |
|---|---|---|
| Volume no TQ-02 | 2 a ~20 L | TQ-02 tem 25 L; LSH-101 fecha a FV-102 acima de 90 % |
| Temperatura do produto | 40 a 65 °C | P&ID ajusta 40..70 °C; TSH-104 corta o resistor a 70 °C |
| Vazão de envase (FIC-102) | 1 a 6 L/min | FV-102 com Kv 8 L/min/√bar a ~2 bar |
| Pressão de trabalho do TQ-01 (PIC-103) | 1,5 a 3 bar | PSH-103 a 3,8 bar, PSV a 4 bar |
| Tolerâncias de qualidade | ex.: ±2 °C, ±0,5 L | definidas no produto do catálogo |

**Catálogo sugerido** (o professor edita):

- "Morna 10 L": 10 L a 45 °C ±2 °C
- "Quente 15 L": 15 L a 65 °C ±2 °C
- "Envase lento 8 L": 8 L a 55 °C, vazão 2 L/min (para mostrar tempo de ciclo)
- "Sob medida": o cliente escolhe só **volume e temperatura**, dentro das faixas; vazão e pressão são sempre as do
  produto (o professor ajusta no catálogo). O sistema valida antes de aceitar

**Entrega** = esvaziar o TQ-02 de volta ao reservatório pela VY-01. Quando e como isso acontece (direto ou esperando
um botão na bancada) é do **programa do CLP** e não muda nada na Loja nem no MES. O TQ-02 recebe uma batelada por
vez.

Tempo de ciclo por batelada: pressurizar (~1 min, uma vez) + por rodada do TQ-01 (10 L; 15 L = 10 + 5): aquecer pelo
TZ-104 ou resfriar pelo trocador (FV-105, ventilador M1/FY-105) até a temperatura, e só então transferir (volume da
rodada ÷ vazão); a B1 repõe o TQ-01 com água do reservatório entre as rodadas + devolver (~4 min). A água quente volta
ao reservatório: a batelada seguinte começa mais quente, o que adianta pedidos mais quentes e atrasa (resfriar) os
mais frios; é isso que o sequenciamento do MES aproveita (3.3).

## 3. Dois sistemas: a Loja e o MES

Para quem usa, são **dois sistemas, em dois endereços**, cada um com a sua tela e o seu menu, sem login e sem papéis
(seção 4):

| Sistema | Endereço (padrão) | Menu |
|---|---|---|
| **Loja** (o ERP) | `http://<pc>:8080` | **Loja** (vitrine) · **Pedidos** · **Configuração** (catálogo, reiniciar a aula) |
| **MES** | `http://<pc>:8081` | **Fila** · **Bancada** · **Qualidade** · **Indicadores** · **Configuração** (bancada, reiniciar o MES) |

O topo de cada tela mostra o nome do sistema bem visível ("AUPRO4000 · Loja" e "AUPRO4000 · MES", cada um com a sua
cor) e um botão para abrir o outro. Assim a pirâmide fica visível na aula: a vitrine e as vendas são do nível 4, a
fila e a bancada do nível 3.

Cada sistema é **um contêiner** (um processo Node que serve a própria API e a própria tela) com **a sua base** no
MySQL. Os dois conversam **só por HTTP**, pelo contrato da seção 3.5: a Loja emite e cancela ordens de produção e
pergunta prazos, andamento e dossiê; o MES devolve. A Loja **nunca** fala com o gateway nem lê a base do MES; o MES
**não conhece a Loja** (não a chama: a Loja é que consulta o feed de mudanças do MES). Se um dia entrar um ERP de
verdade, ele fala com o MES pelo mesmo contrato.

**O MES não comanda a bancada.** Ele não dá partida, não suspende, não aborta, não expede: quem conduz a batelada é
o programa do CLP. O MES só decide **a ordem** dos pedidos e entrega ao CLP **um de cada vez** (seção 6.4).

### 3.1 Vitrine

- Catálogo com os produtos da seção 2, ilustração e prazo estimado.
- Carrinho e pedido (cada unidade é uma batelada).
- Checkout **sem pagamento real**: confirmação simples, pedindo só o nome do cliente.
- Acompanhamento ao vivo, feito pela Loja: na fila (com a posição) → em produção (com a etapa: aquecendo,
  resfriando, envasando…) → produzido → aprovado. Mostra a temperatura e o volume subindo. Os valores vêm do CLP,
  lidos pelo gateway (leitura, não controle), chegam ao MES, e a Loja pergunta o andamento ao MES (a tela do
  acompanhamento atualiza a cada 2 s).
- Certificado da batelada (página e PDF): curva de temperatura, volume final, horários, resultado da inspeção
  automática.

### 3.2 ERP (a Loja: menus Pedidos e Configuração)

| Função | O que faz aqui |
|---|---|
| Clientes | Cadastro (o aluno-cliente, a turma) |
| Pedidos de venda | Recebe da vitrine, aceita ou recusa, acompanha, cancela |
| Ordens de produção | Cada unidade do pedido vira uma **ordem de produção** para o MES. Não há estoque de produto acabado: o MES não segura a batelada no TQ-02 |
| Faturamento fictício | Nota simples quando a batelada é aprovada, valor do catálogo |
| Cadastro de produtos e preços | O catálogo e as receitas-padrão |

### 3.3 MES (a tela do MES: menus Fila, Bancada, Qualidade e Indicadores)

| Função | O que faz aqui |
|---|---|
| Gestão de ordens | Recebe a OP do ERP; valida contra as faixas |
| Sequenciamento (PCP) | Ordena a fila para aproveitar temperaturas e volumes, sem estourar prazos (regra abaixo); o PCP pode reordenar à mão |
| Despacho | Entrega ao CLP o próximo pedido da fila; quando o CLP indica que recebeu, entrega o seguinte (seção 6.4) |
| Coleta de dados | Lê do CLP o andamento e o resultado de cada batelada, para OEE e rastreabilidade; série temporal (TIT-104, PIT-103, FIT-102, LIT-101…) |
| Qualidade | Inspeção **sempre automática**: aprova ou reprova pela tolerância do produto (só registro: não segura a bancada); a tela só mostra |
| Rastreabilidade | Genealogia: pedido, OP, receita, curvas, eventos, desvios |
| Paradas | Motivo apontado na tela da Bancada (emergência, falta de água, PSH-103, troca de turno…) |
| Indicadores | OEE (disponibilidade × desempenho × qualidade), tempo de ciclo, lead time, % no prazo |
| Manutenção (fase posterior) | Horas de B1/M1/resistor, partidas, ordem de manutenção |

**[DECIDIDA] Regra de sequenciamento** (`packages/dominio`, `sequenciarFila`), nesta ordem:

1. **Fixadas pelo PCP** primeiro, na ordem que o PCP deu.
2. **Prazo em risco:** o MES simula a ordem por temperatura (item 3) com o tempo de ciclo estimado de cada OP; a
   que **terminaria depois do prazo menos uma margem** (padrão 5 min, na Configuração) passa na frente, a mais
   apertada primeiro. Prazo folgado não mexe na ordem por temperatura.
3. **O resto por temperatura crescente**, a partir da temperatura do reservatório (TE-105b, lida do CLP; sem ela,
   a da batelada em produção ou da última): primeiro as que estão na mesma temperatura ou acima dela, depois
   recomeça das mais frias. Resfriar pelo trocador é bem mais lento que aquecer; a água quente que volta ao
   reservatório adianta o aquecimento da próxima. A estimativa de ciclo de cada OP (prazo e sequenciamento) parte
   da mesma temperatura do reservatório (projeção simples: a mesma para toda a fila).
4. Desempate por **volume** (menor primeiro) e, por fim, pela ordem de chegada.

Só se reordena ou cancela o que o CLP **ainda não recebeu**. A promessa de prazo da Loja é **uma só por pedido**
(o fim estimado do último item, com 25 % de folga), para a ordem do carrinho não mexer no sequenciamento.

**[DECIDIDA] Inspeção sempre automática:** quando a batelada termina, o MES aprova ou reprova pela tolerância do
produto, sem pessoa e sem opção para desligar. Não há inspeção manual; a tela Qualidade é só leitura (pedido ×
medido, desvio, resultado, certificado).

### 3.4 Configuração

- **Na Loja:** catálogo (com tolerâncias) e **Reiniciar a aula**.
- **No MES:** configuração da bancada (driver, IP, rack, slot, número do DB `MES`), **Reiniciar o MES**; o relatório
  da aula (CSV) fica em Indicadores.

**[DECIDIDA] "Reiniciar a aula" fica na Loja.** Como o MES não chama a Loja, quem apaga tudo é a Loja: primeiro pede
ao MES que apague as ordens e os registros dele (`POST /api/admin/reiniciar` do MES) e, só se ele responder, apaga
os pedidos, clientes e faturas dela. O MES tem o próprio "Reiniciar o MES", que só apaga o que é dele (os pedidos da
Loja ficam sem produção). O catálogo e a configuração da bancada ficam.

### 3.5 Contrato Loja ↔ MES (HTTP)

A Loja chama o MES pela variável `MES_URL` (no Compose, `http://mes:8081`). Formatos em
`packages/dominio/src/integracao.ts`; rotas em `apps/mes/api/integracao.ts`.

| Método e caminho | Corpo / resposta | Para quê |
|---|---|---|
| `POST /api/ordens` | `{ ordens: [{ origem, receita, tolerancias, prazo?, autor? }] }` → `201 { numeros }`; `422` com os erros por campo (`ordens.<i>.<campo>`) | Emitir as OPs de um pedido, **todas ou nenhuma** (uma transação no MES). Origem `loja:item:<id do item>` |
| `POST /api/ordens/:numero/cancelar` | → `{ resultado: 'cancelada' \| 'pendente' }`; `409` se não pode | Cancelar (na fila: já; disponível ao CLP: depois da retirada) |
| `POST /api/ordens/prazos` | `{ receitas }` → `{ prazos }` | Promessa de prazo de cada receita, somando a fila da frente |
| `GET /api/ordens/andamento?numeros=1,2` | → `[{ numero, estado, prazo, posicaoFila, fimEstimado, etapa, processo, batelada }]` | Acompanhamento; `etapa` e `processo` (ao vivo) só da OP em produção |
| `GET /api/ordens/:numero` | → dossiê (`ordem, batelada, avaliacao, inspecao, leituras, eventos`) ou `404` | Certificado |
| `GET /api/ordens/mudancas?desde=<cursor>` | → `{ mudancas: [{ id, numero, origem, estado, horario }], ultimo }` | **Feed de mudanças**: cada mudança de estado de OP, com `id` crescente (o cursor) |
| `POST /api/admin/reiniciar` | → `{ ok }` | "Reiniciar a aula" da Loja |

- **Feed, não chamada de volta:** a Loja consulta `/api/ordens/mudancas` a cada 1 s e guarda o último `id` na base
  dela (`erp_integracao`). Assim nada se perde se um dos dois reiniciar: ela continua de onde parou. O que ela faz
  com cada mudança é idempotente (batelada **aprovada** vira fatura, uma por item; avisa a vitrine). Se o cursor
  dela passar de `ultimo` (a base do MES foi recriada), recomeça do zero.
- **MES fora do ar:** a Loja responde `503 { erro: 'mes_fora_do_ar' }` (a tela traduz). No checkout, o pedido é
  gravado numa transação que só termina depois que o MES emitiu as OPs: se o MES não responde, nada fica gravado.
  A vitrine abre sem os prazos, com um aviso; os pedidos aparecem sem o andamento até o MES voltar.
- Cada tela recebe avisos **do seu sistema** (SSE em `/api/eventos`): a do MES, `ordem`, `bancada`, `parada`; a da
  Loja, `pedido` e `producao` (este quando o feed traz mudanças).

## 4. Sem papéis

**[DECIDIDA] Sem login e sem papéis.** Todas as telas dos dois sistemas ficam abertas a quem as usa; ninguém
escolhe papel nem informa o próprio nome. Os registros feitos pelas telas ficam sem autor; o que o próprio MES faz
(envio ao CLP, conclusão, inspeção automática) fica assinado como `MES`. Na vitrine, o cliente informa só o nome no
checkout (sem e-mail nem turma).

Na aula, os alunos podem se revezar nas telas (vendas, PCP, bancada, qualidade): a divisão é combinada na aula, não
imposta pelo sistema. A operação da bancada é no painel, pelo programa do CLP.

## 5. Implantação: tudo num Docker Compose

Um `docker compose up` num PC da escola, na mesma rede da bancada, sobe tudo:

```
 Navegadores
   │ HTTP + SSE                       │ HTTP + SSE
 ┌─┴────────────────────────────────┐ ┌┴─────────────────────────────────────────┐
 │ loja   :8080  API do ERP + tela  │─▶ mes    :8081  API do MES + tela          │
 │        (vitrine, pedidos, …)     │ │        (fila, bancada, qualidade, …)     │
 └──────────┬───────────────────────┘ └──────┬──────────────┬────────────────────┘
            │ base "loja"                    │ base "mes"   │ HTTP
 ┌──────────┴────────────────────────────────┴──┐ ┌─────────┴──────────────────────────┐
 │ banco  MySQL, um usuário para cada base       │ │ gateway  driver S7 / simulado      │── porta 102 ── S7-1200
 └───────────────────────────────────────────────┘ └────────────────────────────────────┘
```

- Quatro serviços (`loja`, `mes`, `gateway`, `banco`), todos com healthcheck (`/api/saude` na Loja e no MES,
  `/saude` no gateway, `mysqladmin ping` no banco), `depends_on` por saúde e `restart: unless-stopped`. Portas no PC:
  `PORTA_LOJA` (8080) e `PORTA_MES` (8081); gateway e banco ficam só na rede interna.
- O banco é **um MySQL com duas bases**, `loja` e `mes`, criadas na primeira subida por
  `docker/banco/01-bases.sql`, cada uma com o seu usuário e permissão só nela.
- O **gateway** é o único que fala com o CLP, e só o **MES** fala com o gateway. Fica num contêiner próprio porque é a parte que muda com o hardware.
- O contêiner do gateway precisa alcançar o IP da CPU (rede do Docker em modo `bridge` com rota para a LAN, ou
  `host`). Documentar no guia de instalação.
- Volume persistente para o banco; backup é exportar as duas bases (guia de instalação).
- **[DECIDIDA]** Totalmente **offline**: sem nuvem, sem integração com o Exxer Cloud, sem licenciamento.
- **[DECIDIDA]** **Uma Loja/MES por bancada**: cada instalação atende uma bancada só.

## 6. Comunicação com o CLP: S7 PUT/GET

**Por que S7 PUT/GET:** funciona em qualquer S7-1200/1500 **sem licença** (o OPC UA no S7-1200 exige a licença de
runtime 6ES7823-0BA00-2BA0, uma por CPU) e sem programar bloco de comunicação no CLP: o gateway lê e escreve um DB
direto. O mesmo protocolo já é usado pelo Simmaq 3DX com esta bancada.

**Cuidado conhecido:** com o PUT/GET ligado, qualquer cliente da rede lê e escreve a memória da CPU. Numa bancada de
escola é aceitável; o guia de instalação tem que dizer isso.

### 6.1 O que a CPU precisa

- Propriedades da CPU: **"Permit access with PUT/GET communication from remote partner"** marcado, configuração de
  hardware carregada. Sem isso, toda leitura volta com o erro 16#8104.
- Um DB **`MES`** **sem** "Optimized block access" (senão as variáveis não têm deslocamento em bytes).
- Rack 0, slot 1 (o padrão do S7-1200/1500), porta 102.
- **Firmware:** qualquer S7-1200 com PUT/GET serve; conferir o da bancada mesmo assim.

### 6.2 Regras de convivência com o que já existe

- O DB `MB_Simulador` (mapa 40001–40066 do Simmaq 3DX) **não muda** e o MES **nunca escreve nele**. O MES pode
  **ler** dele as variáveis de processo (40001 = `DBW0`, big-endian; tabela em `docs/05-comunicacao-modbus.md` do
  Simmaq 3DX).
- O MES escreve **só** na sua área de escrita do DB `MES` (bytes 0–23), num pedido só.
- O S7-1200 aceita várias conexões ao mesmo tempo; o gateway abre **uma**, e só o MES a usa.
- **[DECIDIDA]** Não há "modo MES": o MES não comanda a bancada, só deixa o próximo pedido disponível. Quando
  pegá-lo é decisão do programa do CLP.

### 6.3 Proposta do DB `MES` (para discutir)

Tudo **big-endian**, `Real` = float de 32 bits, `DInt` = inteiro de 32 bits. **[DECIDIDA]** número do DB: escolhido
na **tela de Configuração** da aplicação (junto com IP, rack, slot e driver). A tela tem um botão "procurar" que acha
o DB pela assinatura (como o Simmaq acha o `MB_Simulador`), e o gateway confere a assinatura do DB escolhido antes
de escrever.

**Escrita do MES (bytes 0–23): o próximo pedido**

| Byte | Nome | Tipo | Significado |
|---|---|---|---|
| 0 | VidaMes | Word | O MES soma 1 a cada ciclo |
| 2 | SeqPedido | Word | O MES soma 1 cada vez que troca o pedido disponível |
| 4 | NumeroOp | DInt | Número da OP disponível; **0 = nenhum pedido** |
| 8 | SpVolume | Real | L no TQ-02 |
| 12 | SpTemperatura | Real | °C |
| 16 | SpVazao | Real | L/min no envase |
| 20 | SpPressao | Real | bar no TQ-01 |

**Leitura do MES, escrita pelo CLP (bytes 32–95)**

| Byte | Nome | Tipo | Significado |
|---|---|---|---|
| 32 | VidaClp | Word | O CLP soma 1 a cada ciclo |
| 34 | EcoSeq | Word | `SeqPedido` do último pedido que o CLP **recebeu** (pegou para produzir) |
| 36 | Resultado | Int | Do pedido recebido: 0 aceito; >0 recusado (ex.: fora da faixa) |
| 38 | Estado | Int | Informativo: 0 ocioso, 1 em produção, 2 parada, 3 em falha |
| 40 | Etapa | Int | Informativo: 0 nenhuma, 1 pressurizar, 2 aquecer, 3 transferir, 4 aguardar, 5 devolver, 6 resfriar |
| 42 | OpExecucao | DInt | OP em produção (0 = nenhuma) |
| 46 | Alarme | Word | Código do último alarme/intertravamento |
| 48 | OpConcluida | DInt | Última OP que terminou; os campos abaixo são dela |
| 52 | ResultadoOp | Int | 1 concluída, 2 abortada |
| 54 | VolumeProduzido | Real | L no TQ-02 |
| 58 | TemperaturaProduto | Real | °C no TQ-02 (TE-105a) no fim da transferência |
| 62 | TempoPressurizar | DInt | ms |
| 66 | TempoAquecer | DInt | ms |
| 70 | TempoTransferir | DInt | ms |
| 74 | TempoDevolver | DInt | ms |
| 78 | TempoResfriar | DInt | ms (trocador) |
| 82 | TemperaturaTq02 | Real | TE-105a ao vivo |
| 86 | TemperaturaReservatorio | Real | TE-105b ao vivo |
| 90–95 | reservado | | |

O CLP grava o bloco da OP concluída de uma vez, com `OpConcluida` por último; o MES percebe a mudança de
`OpConcluida` e registra a batelada. As variáveis de processo ao vivo (temperatura, nível…) vêm do `MB_Simulador`, exceto TE-105a/b, que o CLP escreve
no DB `MES`.

**Assinatura (bytes 96–101):** `Assinatura : Word := 16#4D45` ("ME") e `AssinaturaValor : Real := 4000.75`. O gateway
procura o DB que tem esses valores.

### 6.4 Aperto de mão (handshake)

**[DECIDIDA]** O MES entrega **um pedido por vez**; "recebeu" é o momento em que o CLP **pega o pedido para
produzir**.

1. O MES grava o próximo pedido da fila (`NumeroOp` e setpoints) e soma 1 em `SeqPedido`, tudo num pedido só.
2. Quando o programa do CLP vai produzir, ele vê `SeqPedido ≠ EcoSeq`, copia `SeqPedido` e os valores para a memória
   dele, grava `Resultado` e ecoa a **cópia** de `SeqPedido` em `EcoSeq`: **"recebi"**. Detalhes para quem escreve o
   programa em [docs/programa-clp.md](docs/programa-clp.md).
3. O MES vê o eco e grava o pedido seguinte. Assim o próximo já fica esperando e a bancada não para por falta de
   pedido. O eco pode demorar minutos (o CLP só pega quando termina a batelada atual): não há tempo-limite para ele.
4. **Trocar antes de receber:** enquanto não há eco, o MES pode substituir o pedido disponível (reordenação do PCP,
   cancelamento) gravando outro, ou `NumeroOp = 0`, com um `SeqPedido` novo. O eco diz qual o CLP pegou: se vier o
   `SeqPedido` antigo, o CLP já tinha recebido o antigo, e o novo continua disponível como o próximo. Se a
   gravação do novo foi confirmada e a leitura seguinte não traz o eco do antigo, o antigo volta à fila na hora:
   os valores dele já foram sobrescritos (o CLP copia e ecoa no mesmo ciclo). Lógica em
   `packages/contrato-clp/src/aperto.ts`.
5. Ao (re)conectar, o MES lê a própria área de escrita: se `SeqPedido ≠ EcoSeq`, aquele pedido ainda está
   aguardando o CLP.
6. **Vida:** se `VidaClp` parar por 5 s (ou o gateway não responder por 5 s), as OPs com o CLP vão para
   "comunicação perdida", **nunca** para "concluída". O que fazer se `VidaMes` parar é do programa do CLP
   (sugestão: não pegar pedido novo).
7. **O CLP perdeu a batelada** (reset da CPU, por exemplo): a OP ficaria "em produção" para sempre. Com o CLP
   respondendo e sem estar com ela, dá para **registrá-la como abortada** (tela da OP). É só registro.
8. O CLP recusa receita fora das faixas da seção 2, mesmo que o MES já tenha validado (dupla checagem).

### 6.5 Mudança no programa do CLP

O programa do CLP passa a pegar os setpoints de cada batelada no DB `MES` (passo 2 da seção 6.4) e a publicar o
resultado de cada uma (bloco da OP concluída). Todo o resto (partida, etapas, espera antes de devolver, paradas) é do
programa do CLP. Isso muda o **programa do CLP**, não o mapa. **[DECIDIDA]** o responsável do projeto escreve esse
programa na fase 4, seguindo [docs/programa-clp.md](docs/programa-clp.md). A fonte do DB `MES` para o TIA Portal é
gerada do contrato: [docs/clp/MES.db](docs/clp/MES.db) (`npm run db-mes`).

### 6.6 Cliente S7 no gateway

**[DECIDIDA]** Biblioteca pronta: **`nodes7`** (JavaScript puro, sem compilação nativa, boa no Docker; `node-snap7`
foi descartada por precisar compilar). O gateway lê e escreve faixas de bytes do DB `MES` com ela e converte com
`packages/contrato-clp`. A busca do DB pela assinatura (botão "procurar" da Configuração) é do gateway: lê os bytes
80–85 de cada DB candidato e confere com `conferirAssinatura`. O cliente S7 do Simmaq 3DX
(`src/main/modbus/s7/`) fica só como referência de tratamento de erros.

Os códigos de erro do S7 (16#8104, 16#05, 16#0A) vêm da literatura do snap7 e **ainda não foram medidos numa CPU real**:
a primeira tarefa de integração (fase 4) é uma prova na bancada.

## 7. As três "fábricas" possíveis

| Fábrica | Quando usar | O que precisa |
|---|---|---|
| Bancada AUPRO4000 física | Aula no laboratório | Programa do CLP com o DB `MES` (seção 6) |
| Simmaq 3DX (AUPRO4000 virtual) | Escola sem bancada, casa, demonstração | O Simmaq 3DX expor o DB `MES` (tarefa futura **naquele** projeto, não aqui) |
| Simulador embutido no gateway | Desenvolvimento e testes automatizados | Um modelo simples (tempo de aquecer/encher) atrás da mesma interface |

O MES não sabe qual delas está do outro lado: fala só com o gateway, que tem um **driver por fábrica**. Começar pelo
simulador embutido permite desenvolver tudo sem bancada. Um driver OPC UA pode entrar depois sem mudar o MES.

## 8. Stack

**[DECIDIDA]** O mínimo necessário, sem complicar:

- **TypeScript em tudo**, monorepo (npm workspaces), **Node 24** rodando o `.ts` direto (remoção de tipos nativa,
  sem etapa de build no back-end; só sintaxe "apagável": nada de `enum` nem `namespace`).
  - `apps/loja`: a Loja (ERP). `api/` (Node + Fastify) e `web/` (React + Vite, rotas por hash)
  - `apps/mes`: o MES. `api/` (Node + Fastify: ordens, fila, despacho, qualidade, indicadores, contrato com a Loja) e
    `web/` (React + Vite)
  - `apps/gateway`: Node, drivers `s7` e `simulado`
  - `packages/dominio`: tipos, máquina de estados da OP, validação da receita, cálculo do OEE
  - `packages/contrato-clp`: o layout do DB `MES` (seção 6.3) num lugar só, usado pelo gateway e pelos testes
  - `packages/servidor`: infraestrutura comum aos dois back-ends (banco, SSE, rotas, a tela servida pelo próprio
    processo); `packages/interface`: o comum às duas telas (chamadas à API, SSE, formatação, componentes, estilo,
    textos comuns e o topo). Os textos e as páginas de cada sistema ficam no app dele
- **MySQL 8**; série temporal numa tabela própria.
- **Testes:** `node:test` nativo, sem framework; `scripts/ponta-a-ponta.mjs` testa a pilha no ar com o simulador.
- **Tempo real:** **Server-Sent Events** de cada sistema para a sua tela (texto sobre HTTP, sem dependência; as telas só
  recebem avisos e buscam o resto pela API). Entre MES e gateway, **HTTP simples**: o laço do despacho fica no
  MES, que lê e grava pelo gateway a cada 0,5 s. Assim, se o MES parar, `VidaMes` para e o CLP percebe. Entre Loja e
  MES, **HTTP** pelo contrato da seção 3.5, com o feed de mudanças por cursor. **Sem MQTT, sem
  WebSocket.**
- **Dependências:** fastify e mysql2 (Loja e MES), nodes7 (gateway), react, react-dom e vite (telas). A tela de cada
  sistema é servida pelo próprio processo Node, com `node:fs` (sem nginx e sem `@fastify/static`).
- **Idiomas:** pt-BR primeiro, textos já separados para en e es.

## 9. Modelo de dados (primeiro corte)

- Base `mes`: `configuracao` (uma linha só: driver, IP, rack/slot, DBs, velocidade do simulador, margem de prazo,
  início da aula)
- Base `loja` (ERP): `erp_integracao` (cursor do feed de mudanças do MES), `erp_cliente` (só o nome, um registro por pedido; e-mail e turma ficaram como colunas nulas), `erp_produto`
  (preço, receita, tolerâncias, sob medida), `erp_pedido` → `erp_item` (uma linha por unidade, com a receita copiada
  e a OP), `erp_fatura`
- Base `mes` (MES): `mes_mudanca` (feed para a Loja), `OrdemProducao` (estado, posição fixada pelo PCP, prazo, item de pedido de origem), `Batelada` (volume,
  temperatura, tempos por etapa, inclusive resfriar, aprovada?), `Leitura` (batelada, variável, horário, valor), `Evento` (alarmes,
  envios, mudanças de estado, com horário; autor só `MES`), `Parada`, `Inspecao` (sempre automática)

**[DECIDIDA] Máquina de estados da OP** (`packages/dominio`). Como o MES não comanda a bancada, os estados depois
do envio só mudam pelo que o CLP informa:

```
 na fila ──enviar──▶ enviada ──CLP recebeu──▶ em produção ──CLP concluiu──▶ produzida ──▶ aprovada / reprovada
    ▲                  │  └──CLP recusou──▶ recusada          └──CLP abortou──▶ abortada
    └──── retirar ─────┘
 na fila ──cancelar──▶ cancelada
 enviada / em produção ──queda──▶ comunicação perdida ──volta──▶ estado anterior
```

- A OP nasce **na fila** só se a receita estiver dentro das faixas.
- **Cancelar** só na fila. Uma OP enviada é primeiro **retirada** (o MES troca o pedido disponível, seção 6.4) e,
  confirmada a retirada pelo eco, volta à fila e pode ser cancelada.
- **Comunicação perdida:** ao voltar, a OP retorna ao estado anterior, e daí em diante o que o CLP informa manda
  (eco, `OpConcluida`). Queda de comunicação nunca conclui uma OP.
- **Aprovar/reprovar** é só registro da qualidade; não muda nada na bancada.

## 10. Fases

| Fase | Entrega | Pronto quando | Situação |
|---|---|---|---|
| 0 | Monorepo, Docker Compose, `dominio` e `contrato-clp` com testes | `docker compose up` sobe; testes da máquina de estados passam | Feita |
| 1 | MES com o driver simulado: OP manual, fila sequenciada, despacho um por vez, registro da batelada | Várias OPs passam pelo simulado, na ordem do sequenciamento | Feita |
| 2 | Vitrine + ERP: catálogo, pedido, ordens de produção, acompanhamento, certificado | Pedido na vitrine vira OP e o cliente vê a produção | Feita |
| 3 | Qualidade, paradas, OEE, faturamento fictício, relatórios | OEE da aula calculado e exportável | Feita |
| 4 | Driver S7: prova na bancada (conectar, achar o DB, ler, escrever), depois o programa do CLP com o DB `MES` | Uma batelada real pedida na vitrine | Driver S7 (`nodes7`) e busca do DB escritos, **não provados numa CPU**; programa do CLP: com o responsável |
| 5 | Simmaq 3DX como fábrica (projeto do Simmaq) | A mesma aula sem bancada | — |
| 6 | Manutenção, driver OPC UA | Conforme a demanda | — |

As fases 1 a 3 passam no `scripts/ponta-a-ponta.mjs` (pedido → sequenciamento → produção → inspeção automática → fatura →
certificado → cancelamento → queda de comunicação → OP abortada → OEE e CSV), e o MES foi testado reiniciando o MES
e o gateway no meio da produção (reconcilia sem perder nem duplicar OP). Depois da separação em dois sistemas, o
mesmo script recebe as duas URLs e confere também a Loja recusando o pedido com o MES parado.

## 11. Decisões

1. **[DECIDIDA]** Número do DB: escolhido na tela de Configuração, com busca pela assinatura (seção 6.3). Ajustes
   no layout do DB `MES` continuam abertos até a prova na bancada.
2. **[DECIDIDA]** O programa do CLP é escrito pelo responsável do projeto, na fase 4 (seção 6.5). Não há "modo
   MES": o MES não comanda a bancada, só entrega o próximo pedido (seções 3 e 6.4).
3. **[DECIDIDA]** Cliente S7: biblioteca pronta, **`nodes7`** (JavaScript puro, MIT, sem dependências). A busca do
   DB pela assinatura é feita no gateway, por cima dela (seção 6.6). Só entra na fase 4.
4. **[DECIDIDA]** Stack: seção 8 (MySQL, sem MQTT, o mínimo de dependências).
5. **[DECIDIDA]** Totalmente offline, sem nuvem nem Exxer Cloud.
6. **[DECIDIDA]** Sem licenciamento e sem nome de produto: o topo mostra **AUPRO4000 · Loja** ou **AUPRO4000 · MES**.
7. **[DECIDIDA]** Uma Loja/MES por bancada.
8. **[DECIDIDA]** Sem login e sem papéis: ninguém se identifica (seção 4).
9. **[ABERTA]** Códigos de `Resultado` > 0 (motivos de recusa do CLP) e de `Alarme`: definir com o programa do CLP.
10. **[ABERTA]** Parâmetros da estimativa de ciclo (`packages/dominio/src/ciclo.ts`: 60 s pressurizar, 1,4 s/°C/L
    aquecer, 8 s/°C/L resfriar, 240 s devolver, TQ-01 de 10 L): medir na bancada e ajustar. A potência do resistor
    TZ-104 ainda não é conhecida (pergunta enviada ao projetista).
11. **[DECIDIDA]** **Dois sistemas, dois contêineres, dois endereços** (seções 3 e 5): Loja (ERP) e MES, cada um com
    a sua tela, a sua base e o seu usuário no MySQL. Conversam só por HTTP (contrato da seção 3.5); só o MES fala com
    o gateway. Substitui o "um sistema, uma interface" do primeiro corte.
12. **[DECIDIDA]** A Loja fica sabendo das mudanças do MES por um **feed com cursor** (`/api/ordens/mudancas`),
    consultado a cada 1 s, e não por chamada do MES à Loja: o MES não conhece a Loja e nada se perde se um dos dois
    reiniciar. "Reiniciar a aula" fica na Loja (seção 3.4).

## 12. Referências no Simmaq 3DX (só consulta)

Caminhos relativos ao repositório do Simmaq 3DX, ao lado deste (`..\simmaq3dx\`). Lá só se lê: nada deste projeto
é escrito ou commitado lá.

- Processo da bancada, malhas, intertravamentos e etapas: `docs/06-simulacao-processo.md`
- Mapa 40001–40066, S7 PUT/GET, busca do DB pela assinatura, erros: `docs/05-comunicacao-modbus.md`
- Cliente S7 em TypeScript: `src/main/modbus/s7/`
- P&ID versão 2: `docs/20-diagrama-v2.md`
