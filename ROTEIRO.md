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
- "Sob medida": o cliente escolhe dentro das faixas; o sistema valida antes de aceitar

**Entrega** = esvaziar o TQ-02 de volta ao reservatório pela VY-01. Quando e como isso acontece (direto ou esperando
um botão na bancada) é do **programa do CLP** e não muda nada na Loja nem no MES. O TQ-02 recebe uma batelada por
vez.

Tempo de ciclo por batelada: pressurizar (~1 min) + aquecer (minutos, depende do volume e da temperatura) +
transferir (volume ÷ vazão) + devolver (~4 min). Isso alimenta a **promessa de prazo** da Loja. A água quente volta
ao reservatório, então a batelada seguinte começa mais quente: é isso que o sequenciamento do MES aproveita (3.3).

## 3. Um sistema, uma interface: a Loja

Para quem usa, é **um sistema só**, num endereço só: a Loja. Ela tem duas faces:

- **Vitrine:** catálogo, carrinho, pedido, acompanhamento, certificado.
- **Retaguarda:** os menus do **ERP** e do **MES**, conforme o papel escolhido (sem login, seção 4).

Por dentro, **ERP e MES são módulos separados no código**, cada um com suas tabelas e regras, conversando só por uma
interface definida (o ERP emite e cancela ordens de produção; o MES devolve andamento e resultado). Assim a pirâmide
fica visível na aula e, se um dia entrar um ERP de verdade ou o MES for separado, nada se reescreve.

**O MES não comanda a bancada.** Ele não dá partida, não suspende, não aborta, não expede: quem conduz a batelada é
o programa do CLP. O MES só decide **a ordem** dos pedidos e entrega ao CLP **um de cada vez** (seção 6.4).

### 3.1 Vitrine

- Catálogo com os produtos da seção 2, ilustração e prazo estimado.
- Carrinho e pedido (cada unidade é uma batelada).
- Checkout **sem pagamento real**: confirmação simples, opcionalmente "crédito" fictício por turma.
- Acompanhamento ao vivo, feito pela Loja: na fila (com a posição) → em produção (com a etapa: aquecendo,
  envasando…) → produzido → aprovado. Mostra a temperatura e o volume subindo. Os valores vêm do CLP, lidos pelo
  gateway (leitura, não controle).
- Certificado da batelada (página e PDF): curva de temperatura, volume final, horários, operador, resultado.

### 3.2 ERP (retaguarda)

| Função | O que faz aqui |
|---|---|
| Clientes | Cadastro (o aluno-cliente, a turma) |
| Pedidos de venda | Recebe da vitrine, aceita ou recusa, acompanha, cancela |
| Ordens de produção | Cada unidade do pedido vira uma **ordem de produção** para o MES. Não há estoque de produto acabado: o MES não segura a batelada no TQ-02 |
| Faturamento fictício | Nota simples quando a batelada é aprovada, valor do catálogo |
| Cadastro de produtos e preços | O catálogo e as receitas-padrão |

### 3.3 MES (retaguarda)

| Função | O que faz aqui |
|---|---|
| Gestão de ordens | Recebe a OP do ERP; valida contra as faixas |
| Sequenciamento (PCP) | Ordena a fila para aproveitar temperaturas e volumes, sem estourar prazos (regra abaixo); o PCP pode reordenar à mão |
| Despacho | Entrega ao CLP o próximo pedido da fila; quando o CLP indica que recebeu, entrega o seguinte (seção 6.4) |
| Coleta de dados | Lê do CLP o andamento e o resultado de cada batelada, para OEE e rastreabilidade; série temporal (TIT-104, PIT-103, FIT-102, LIT-101…) |
| Qualidade | Comparação automática com a tolerância + inspeção do operador; aprovar/reprovar (só registro: não segura a bancada) |
| Rastreabilidade | Genealogia: pedido, OP, receita, operador, curvas, eventos, desvios |
| Paradas | Motivo apontado pelo operador (emergência, falta de água, PSH-103, troca de turno…) |
| Indicadores | OEE (disponibilidade × desempenho × qualidade), tempo de ciclo, lead time, % no prazo |
| Manutenção (fase posterior) | Horas de B1/M1/resistor, partidas, ordem de manutenção |

**[DECIDIDA] Regra de sequenciamento** (`packages/dominio`, `sequenciarFila`), nesta ordem:

1. **Fixadas pelo PCP** primeiro, na ordem que o PCP deu.
2. **Prazo em risco:** o MES simula a ordem por temperatura (item 3) com o tempo de ciclo estimado de cada OP; a
   que **terminaria depois do prazo menos uma margem** (padrão 5 min, na Configuração) passa na frente, a mais
   apertada primeiro. Prazo folgado não mexe na ordem por temperatura.
3. **O resto por temperatura crescente**, a partir da temperatura da batelada em produção (ou da última): primeiro
   as que estão na mesma temperatura ou acima dela, depois recomeça das mais frias. Esfriar é lento; a água quente
   que volta ao reservatório adianta o aquecimento da próxima.
4. Desempate por **volume** (menor primeiro) e, por fim, pela ordem de chegada.

Só se reordena ou cancela o que o CLP **ainda não recebeu**. A promessa de prazo da Loja é **uma só por pedido**
(o fim estimado do último item, com 25 % de folga), para a ordem do carrinho não mexer no sequenciamento.

**[DECIDIDA] Inspeção automática** (opcional, na Configuração): aprova ou reprova pela tolerância, sem pessoa. Serve
para a Loja rodar sozinha numa demonstração; na aula, a qualidade inspeciona.

### 3.4 Administração (professor)

Catálogo (com tolerâncias), **Configuração** da bancada (driver, IP, rack, slot, número do DB `MES`), reiniciar o
cenário da aula, exportar relatórios. A turma é um campo do cliente, informado no checkout.

## 4. Papéis

| Papel | Vê / faz |
|---|---|
| Cliente | Vitrine: compra, acompanha, baixa o certificado |
| Vendas | ERP: pedidos, faturamento |
| PCP | MES: fila de OPs, sequenciamento, prazos |
| Operador | MES: tela da bancada, apontar paradas, inspeção (a operação da bancada é no painel, pelo programa do CLP) |
| Qualidade | MES: libera ou reprova bateladas, trata desvios |
| Professor | Tudo + administração; pode "ser" qualquer papel para demonstrar |

Na aula, os alunos se revezam nos papéis: é a parte didática mais valiosa.

**[DECIDIDA] Sem login.** Na retaguarda, quem usa escolhe o papel num seletor e digita o próprio nome (sem senha);
o nome vai como autor nos eventos e no certificado (ex.: operador). Na vitrine, o cliente informa nome e e-mail
institucional no checkout.

## 5. Implantação: tudo num Docker Compose

Um `docker compose up` num PC da escola, na mesma rede da bancada, sobe tudo:

```
 Navegadores (vitrine, ERP, MES)
            │ HTTP + WebSocket
 ┌──────────┴───────────────────────────────────────────┐
 │ loja-web   interface única (vitrine + retaguarda)    │
 │ api        backend: módulo ERP + módulo MES          │
 │ gateway    driver S7 PUT/GET (e driver simulado)     │──── ISO-on-TCP, porta 102 ──── S7-1200
 │ banco      MySQL                                     │
 └──────────────────────────────────────────────────────┘
```

- O **gateway** é o único que fala com o CLP. Fica num contêiner próprio porque é a parte que muda com o hardware.
- O contêiner do gateway precisa alcançar o IP da CPU (rede do Docker em modo `bridge` com rota para a LAN, ou
  `host`). Documentar no guia de instalação.
- Volume persistente para o banco; backup é exportar o volume.
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
- O S7-1200 aceita várias conexões ao mesmo tempo; o gateway abre **uma** e todos os módulos usam ela.
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

**Leitura do MES, escrita pelo CLP (bytes 32–79)**

| Byte | Nome | Tipo | Significado |
|---|---|---|---|
| 32 | VidaClp | Word | O CLP soma 1 a cada ciclo |
| 34 | EcoSeq | Word | `SeqPedido` do último pedido que o CLP **recebeu** (pegou para produzir) |
| 36 | Resultado | Int | Do pedido recebido: 0 aceito; >0 recusado (ex.: fora da faixa) |
| 38 | Estado | Int | Informativo: 0 ocioso, 1 em produção, 2 parada, 3 em falha |
| 40 | Etapa | Int | Informativo: 0 nenhuma, 1 pressurizar, 2 aquecer, 3 transferir, 4 aguardar, 5 devolver |
| 42 | OpExecucao | DInt | OP em produção (0 = nenhuma) |
| 46 | Alarme | Word | Código do último alarme/intertravamento |
| 48 | OpConcluida | DInt | Última OP que terminou; os campos abaixo são dela |
| 52 | ResultadoOp | Int | 1 concluída, 2 abortada |
| 54 | VolumeProduzido | Real | L no TQ-02 |
| 58 | TemperaturaProduto | Real | °C no fim da transferência |
| 62 | TempoPressurizar | DInt | ms |
| 66 | TempoAquecer | DInt | ms |
| 70 | TempoTransferir | DInt | ms |
| 74 | TempoDevolver | DInt | ms |
| 78–79 | reservado | | |

O CLP grava o bloco da OP concluída de uma vez, com `OpConcluida` por último; o MES percebe a mudança de
`OpConcluida` e registra a batelada. As variáveis de processo ao vivo (temperatura, nível…) vêm do `MB_Simulador`.

**Assinatura (bytes 80–85):** `Assinatura : Word := 16#4D45` ("ME") e `AssinaturaValor : Real := 4000.75`. O gateway
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
   respondendo e sem estar com ela, o operador pode **registrá-la como abortada** (tela da OP). É só registro.
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

A api não sabe qual delas está do outro lado: fala só com o gateway, que tem um **driver por fábrica**. Começar pelo
simulador embutido permite desenvolver tudo sem bancada. Um driver OPC UA pode entrar depois sem mudar a api.

## 8. Stack

**[DECIDIDA]** O mínimo necessário, sem complicar:

- **TypeScript em tudo**, monorepo (npm workspaces), **Node 24** rodando o `.ts` direto (remoção de tipos nativa,
  sem etapa de build no back-end; só sintaxe "apagável": nada de `enum` nem `namespace`).
  - `apps/web`: React + Vite, a Loja (vitrine e retaguarda com rotas por papel)
  - `apps/api`: Node + Fastify, com `modulos/erp` e `modulos/mes` separados
  - `apps/gateway`: Node, drivers `s7` e `simulado`
  - `packages/dominio`: tipos, máquina de estados da OP, validação da receita, cálculo do OEE
  - `packages/contrato-clp`: o layout do DB `MES` (seção 6.3) num lugar só, usado pelo gateway e pelos testes
- **MySQL 8**; série temporal numa tabela própria.
- **Testes:** `node:test` nativo, sem framework; `scripts/ponta-a-ponta.mjs` testa a pilha no ar com o simulador.
- **Tempo real:** **Server-Sent Events** da api para as telas (texto sobre HTTP, sem dependência; as telas só
  recebem avisos e buscam o resto pela API). Entre api e gateway, **HTTP simples**: o laço do despacho fica na api,
  que lê e grava pelo gateway a cada 0,5 s. Assim, se a api parar, `VidaMes` para e o CLP percebe. **Sem MQTT, sem
  WebSocket.**
- **Dependências:** fastify e mysql2 (api), nodes7 (gateway), react, react-dom e vite (web).
- **Idiomas:** pt-BR primeiro, textos já separados para en e es.

## 9. Modelo de dados (primeiro corte)

- Comum: `configuracao` (uma linha só: driver, IP, rack/slot, DBs, velocidade do simulador, margem de prazo,
  inspeção automática, início da aula)
- ERP: `erp_cliente` (nome, e-mail, turma), `erp_produto` (preço, receita, tolerâncias, sob medida), `erp_pedido` →
  `erp_item` (uma linha por unidade, com a receita copiada e a OP), `erp_fatura`
- MES: `OrdemProducao` (estado, posição fixada pelo PCP, prazo, item de pedido de origem), `Batelada` (volume,
  temperatura, tempos por etapa, aprovada?), `Leitura` (batelada, variável, horário, valor), `Evento` (alarmes,
  envios, mudanças de estado, com horário e autor), `Parada`, `Inspecao`

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

As fases 1 a 3 passam no `scripts/ponta-a-ponta.mjs` (pedido → sequenciamento → produção → inspeção → fatura →
certificado → cancelamento → queda de comunicação → OP abortada → OEE e CSV), e o MES foi testado reiniciando a api
e o gateway no meio da produção (reconcilia sem perder nem duplicar OP).

## 11. Decisões

1. **[DECIDIDA]** Número do DB: escolhido na tela de Configuração, com busca pela assinatura (seção 6.3). Ajustes
   no layout do DB `MES` continuam abertos até a prova na bancada.
2. **[DECIDIDA]** O programa do CLP é escrito pelo responsável do projeto, na fase 4 (seção 6.5). Não há "modo
   MES": o MES não comanda a bancada, só entrega o próximo pedido (seções 3 e 6.4).
3. **[DECIDIDA]** Cliente S7: biblioteca pronta, **`nodes7`** (JavaScript puro, MIT, sem dependências). A busca do
   DB pela assinatura é feita no gateway, por cima dela (seção 6.6). Só entra na fase 4.
4. **[DECIDIDA]** Stack: seção 8 (MySQL, sem MQTT, o mínimo de dependências).
5. **[DECIDIDA]** Totalmente offline, sem nuvem nem Exxer Cloud.
6. **[DECIDIDA]** Sem licenciamento e sem nome de produto: o topo da interface mostra **AUPRO4000**.
7. **[DECIDIDA]** Uma Loja/MES por bancada.
8. **[DECIDIDA]** Sem login: seletor de papel e nome, sem senha (seção 4).
9. **[ABERTA]** Códigos de `Resultado` > 0 (motivos de recusa do CLP) e de `Alarme`: definir com o programa do CLP.
10. **[ABERTA]** Parâmetros da estimativa de ciclo (`packages/dominio/src/ciclo.ts`: 60 s pressurizar,
    1,4 s por °C e por litro, 240 s devolver): medir na bancada e ajustar. Eles alimentam a promessa de prazo, o
    sequenciamento e o desempenho do OEE.

## 12. Referências no Simmaq 3DX (só consulta)

Caminhos relativos ao repositório do Simmaq 3DX, ao lado deste (`..\simmaq3dx\`). Lá só se lê: nada deste projeto
é escrito ou commitado lá.

- Processo da bancada, malhas, intertravamentos e etapas: `docs/06-simulacao-processo.md`
- Mapa 40001–40066, S7 PUT/GET, busca do DB pela assinatura, erros: `docs/05-comunicacao-modbus.md`
- Cliente S7 em TypeScript: `src/main/modbus/s7/`
- P&ID versão 2: `docs/20-diagrama-v2.md`
