# Guia da aula: Loja e MES da AUPRO4000

Para o professor que dá a aula e para os alunos. Mostra o caminho de um pedido: o cliente compra na Loja, o MES põe
a ordem de produção (OP) na fila e entrega ao CLP uma por vez, a bancada (ou o simulador) produz a batelada de água
aquecida, e o resultado volta como inspeção, certificado, fatura e indicadores. Ninguém faz login.

## Os dois sistemas

| Sistema | Endereço | Menu | Para quê |
|---|---|---|---|
| **Loja** | `http://localhost:8080` | Loja · Pedidos · Configuração | Vitrine e carrinho, pedidos e faturas, certificado, catálogo, **Reiniciar a aula** |
| **MES** | `http://localhost:8081` | Fila · Bancada · Qualidade · Indicadores · Configuração | Ordem de produção, etapas e instrumentos, paradas, inspeção, OEE, configuração da bancada |

- Subir: na pasta do projeto, `docker compose up -d --build`. Parar: `docker compose down` (os dados ficam guardados).
- Conferir: `docker compose ps` mostra `loja`, `mes`, `gateway` e `banco` como `healthy`. Em
  `http://localhost:8080/api/saude` e `http://localhost:8081/api/saude`, tudo tem de estar `ok`.
- Nos outros computadores da sala: `http://<ip-do-pc>:8080` e `http://<ip-do-pc>:8081`. O botão **Abrir o MES**
  (ou **Abrir a Loja**), no topo, troca de sistema.

## Antes da aula

1. No MES, abra **Configuração** e escolha a **Fábrica**:
   - **Simulador** (aula sem a bancada): ajuste a **Velocidade do simulador** (1 a 1000; com 20, uma batelada
     dura menos de 1 minuto) e clique em **Salvar**.
   - **Bancada (S7)**: preencha **IP da CPU**, **Rack** 0 e **Slot** 1, clique em **Procurar DBs pela assinatura** e
     depois em **Salvar**. O quadro **Gateway** tem de mostrar **Gateway conectado** e **Assinatura do DB MES
     conferida**.
2. Na Loja, abra **Configuração** e clique em **Reiniciar a aula**. Apaga os pedidos, as faturas e as ordens do MES
   e marca o início da aula para os indicadores. O catálogo e a configuração da bancada ficam.

## Roteiro da aula

| Passo | Onde | O que fazer | O que observar |
|---|---|---|---|
| 1. Pedir | Loja → **Loja** | Escolher uma das **Receitas prontas** (vai direto à **Quantidade**) ou seguir os passos **Volume** e **Temperatura**: as opções das receitas ou **Outro valor** (2 a 20 L, 40 a 65 °C), que vira **Sob medida**. Em **Quantidade**, **Adicionar ao pedido** (até 10 unidades por pedido). Em **Revisar**, **Adicionar outro tipo** se quiser; em **Seu nome**, só o nome; **Confirmar pedido**. O carrinho no topo mostra as unidades e abre a revisão | Cada unidade vira uma OP. A página do pedido mostra **Na fila → Em produção → Inspeção → Aprovado**, com temperatura e volume ao vivo |
| 2. Fila | MES → **Fila** | Comparar a ordem da fila com a ordem dos pedidos. Testar **Fixar em 1º** e **Soltar** | A ordem é: fixadas, depois as de **prazo em risco**, depois temperatura crescente a partir da temperatura do reservatório. Aquecer é rápido e resfriar é lento: por isso a mais fria não vai sempre na frente. Só se mexe no que o CLP ainda não recebeu |
| 3. Bancada | MES → **Bancada** | Acompanhar a batelada em produção | Etapas: **Pressurizando, Aquecendo, Resfriando, Envasando, Aguardando, Devolvendo**. O TQ-01 tem 10 L: pedido maior sai em rodadas (15 L = 10 + 5), e **Aquecendo** e **Envasando** se repetem. **Resfriando** aparece quando a água está mais quente que o pedido (o reservatório esquenta com as bateladas quentes: TE-105b) |
| 4. Qualidade | MES → **Qualidade** | Ler pedido, medido, desvio e tolerância de cada batelada | A inspeção é automática: desvio dentro da tolerância do produto (no catálogo, ±2 °C e ±0,5 L) dá **Aprovada**; fora, **Reprovada** |
| 5. Certificado e faturas | Loja → **Pedidos** | **Ver certificado** no item aprovado (**Imprimir / salvar em PDF**); ver a tabela **Faturas** | A fatura só sai quando a batelada é aprovada. Item reprovado ou abortado ganha o botão **Produzir de novo** |
| 6. Paradas | MES → **Bancada** | Em **Paradas**, escolher o **Motivo**, **Apontar parada** e depois **Encerrar parada** | O tempo parado entra nos indicadores e baixa a disponibilidade |
| 7. Indicadores | MES → **Indicadores** | Ler o OEE e os três fatores; clicar em **Exportar relatório (CSV)** | OEE = disponibilidade × desempenho × qualidade. O arquivo CSV abre no Excel |

## Experimentos com o simulador

Os botões ficam no fim da tela **Bancada** do MES, no quadro **Simulador: falhas para a aula** (só aparece com a
fábrica Simulador). Faça com uma batelada em produção.

| Botão | O que acontece | O que observar |
|---|---|---|
| **Congelar o CLP** | O CLP para de responder | Em uns 5 segundos a Bancada mostra **CLP não responde** e as OPs que estavam com o CLP ficam em **Comunicação perdida** (Fila do MES e Pedidos da Loja). Nenhuma OP é concluída por queda de comunicação |
| **Simular alarme (PSH-103)** | Um intertravamento atua: pressão alta no TQ-01 | A Bancada mostra **Alarme ativo** e **Em falha**, e a batelada para. Em **Paradas**, o motivo já vem sugerido: aponte a parada e veja o tempo parado nos Indicadores |
| **Abortar a batelada** | A batelada em produção termina abortada | A OP fica **Abortada no CLP**, sem fatura. Nos Indicadores conta em **Abortadas** e como reprovada, e a qualidade cai. Na Loja, **Produzir de novo** |
| **Voltar ao normal** | Desfaz o congelamento ou o alarme | As OPs voltam ao estado em que estavam e a produção continua |

## Problemas comuns

| Problema | O que fazer |
|---|---|
| A porta 8080 ou a 8081 já está em uso | Subir em outras portas. No PowerShell: `$env:PORTA_LOJA='8090'; $env:PORTA_MES='8091'; docker compose up -d --build` |
| A Loja avisa **O MES não responde** | A Loja recusa os pedidos e não grava nada pela metade. Confira `docker compose ps` e suba de novo com `docker compose up -d`; a Loja continua de onde parou |
| O MES mostra **Sem conexão com o CLP** | Com a bancada: confira o IP da CPU (`ping`), o PUT/GET liberado na CPU e o DB `MES` carregado; depois **Procurar DBs pela assinatura** e **Salvar**. Sem a bancada: volte a fábrica para **Simulador** |
| Uma OP não sai de **Em produção** | O CLP perdeu a batelada (reset da CPU, por exemplo). Na Fila, clique no número da OP e em **Registrar como abortada**; é só registro, não muda nada na bancada |
