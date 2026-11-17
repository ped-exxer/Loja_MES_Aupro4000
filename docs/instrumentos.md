# Instrumentos e atuadores da AUPRO4000 (P&ID versão 2)

Para o professor e o aluno que operam a bancada e para quem programa o CLP S7-1200. Explica cada instrumento e
atuador do P&ID versão 2: o que é, onde fica, o que mede ou faz, como o sinal chega ao CLP e se a Loja/MES usa esse
sinal. A classificação por cor e por tipo de sinal é a do projetista da bancada; faixas, unidades e endereços vêm das
fontes listadas no capítulo Fontes. O que ainda não se sabe está no capítulo Pendências.

## Sumário

1. [Visão geral da bancada](#visão-geral-da-bancada)
2. [Tipos de sinal](#tipos-de-sinal)
3. [As cores do P&ID](#as-cores-do-pid)
4. [Indicadores locais (verde)](#indicadores-locais-verde)
5. [Chaves e solenoide (vermelho)](#chaves-e-solenoide-vermelho)
6. [Transmissores e posicionador Profibus PA (rosa)](#transmissores-e-posicionador-profibus-pa-rosa)
7. [Elementos, malhas e seletor (cinza)](#elementos-malhas-e-seletor-cinza)
8. [Acionamentos Profibus DP (azul-escuro)](#acionamentos-profibus-dp-azul-escuro)
9. [Cargas (azul-claro)](#cargas-azul-claro)
10. [Instrumentos e posicionador IO-Link (laranja)](#instrumentos-e-posicionador-io-link-laranja)
11. [O que a Loja/MES usa](#o-que-a-lojames-usa)
12. [Tabela-resumo](#tabela-resumo)
13. [Fontes](#fontes)
14. [Pendências](#pendências)

## Visão geral da bancada

A bancada tem três volumes de água e um circuito de ar de instrumento.

Figura pendente: recorte do P&ID v2 com os três volumes, as linhas e as tags coloridas.

- TQ-01: 10 L, fechado, pressurizado e aquecido. É onde a água é preparada (pressão e temperatura do pedido).
- TQ-02: 25 L, aberto. Recebe o produto pronto pela linha de envase.
- Reservatório: 50 L. Guarda a água de reposição e recebe o retorno de tudo.
- Ar de instrumento: filtro e regulador, com o PTT-106. Alimenta os conversores I/P (corrente para pressão) dos
  posicionadores da FV-102 e da FV-105.

Caminhos da água:

- Reservatório → bomba B1 (inversor FY-102) → TQ-01. O fluxostato FSL-102 fica na linha da B1.
- TQ-01 → linha de envase (FI, FIT-102, FV-102 com desvio manual) → TQ-02.
- TQ-01 → FV-105 → trocador de calor com o ventilador M1 (inversor FY-105) → FTIT-105 → reservatório. É a
  recirculação que resfria o TQ-01.
- TQ-02 → solenoide VY-01 e válvulas manuais → reservatório. É a "entrega" da batelada.

Malhas de controle:

| Malha | O que controla | Como |
|---|---|---|
| PIC-103 | Pressão do TQ-01 | Pela velocidade da B1 (inversor FY-102) |
| TIC-104 | Temperatura do TQ-01 | Pela potência da resistência TZ-104, através do TY-104 |
| FIC-102 | Vazão do envase | Pela FV-102 |
| LIC-101 | Nível do TQ-02 | Em cascata com o FIC-102 |
| HS-01 | Seletor de modo | Escolhe qual malha comanda o inversor da B1 |

Observação:

- O PSV de 4 bar do TQ-01 e os losangos "I" e "I/O" do desenho não entram neste manual, por decisão do usuário.

## Tipos de sinal

Cada instrumento chega ao CLP (ou não chega) de um destes jeitos:

- Mecânico: o instrumento só mostra o valor no próprio corpo (ponteiro, visor, boia). Não tem fio para o CLP; quem lê
  é a pessoa na frente da bancada.
- Discreto: um contato que abre ou fecha, ligado a uma entrada digital do CLP (`%I`), ou uma saída digital do CLP
  (`%Q`) que liga ou desliga uma carga. Só diz "sim ou não": nível alto, pressão alta, válvula aberta.
- Profibus PA: rede de campo de processo. Um par de fios leva alimentação e dados digitais até vários transmissores e
  posicionadores. Cada aparelho manda o valor já em unidade de engenharia e um byte de status (bom ou ruim). Na
  bancada, a rede PA chega ao mestre Profibus DP do CLP por um acoplador DP/PA.
- Profibus DP: rede de campo rápida, usada para acionamentos. O CLP manda comando e referência de velocidade e lê
  estado, frequência e falha do inversor.
- IO-Link: ligação ponto a ponto de um sensor ou atuador a um mestre IO-Link, por cabo comum de 3 fios. Leva o valor
  medido e dados de diagnóstico. Na bancada, o mestre IO-Link fica na rede PROFINET do CLP.

Observação:

- A topologia do painel (projeto 208450, rev. 2, citado no doc 05 do Simmaq 3DX) mostra: CPU S7-1200, módulo mestre
  Profibus DP, acoplador DP/PA com distribuidor PA, mestre IO-Link na rede PROFINET, inversores FY-102 e FY-105 no DP,
  e LIT-101, FIT-102, PIT-103, TIT-104 e FV-102 no PA.

## As cores do P&ID

O desenho não tem legenda de cores. A leitura abaixo é a que o projetista passou ao usuário.

| Cor | Grupo | Tags |
|---|---|---|
| Verde | Indicador mecânico local, não vai para o software | TG, PG, LG, FI |
| Vermelho | Sinais discretos | LSH-101, LSL-101, PSH-103, TSH-104, LSL-104, FSL-102, LSL do reservatório, VY-01 |
| Rosa | Profibus PA | LIT-101, FIT-102, FV-102, PIT-103, TIT-104 |
| Cinza | Elementos ligados a um transmissor, e funções do programa | TE-104a, TE-104b, FIC-102, PIC-103, TIC-104, LIC-101, HS-01 |
| Azul-escuro | Profibus DP (acionamentos) | FY-102, FY-105, TY-104 |
| Azul-claro | Cargas elétricas | B1, M1, TZ-104 |
| Laranja | IO-Link | PTT-105, PTT-106, TE-105a, TE-105b, FTIT-105, LT-105, FV-105 |

Como ler uma tag: a primeira letra diz a grandeza (L nível, F vazão, P pressão, T temperatura, H manual) e as
seguintes, a função (I indicador, T transmissor, C controlador, S chave, E elemento, V válvula, Y conversor ou
acionamento, Z elemento final, G visor). O número liga o instrumento à malha: 101 nível, 102 vazão, 103 pressão,
104 temperatura; 105 e 106 são os instrumentos IO-Link.

## Indicadores locais (verde)

Os quatro são mecânicos: não têm sinal para o CLP e o MES não os vê. Servem para a pessoa conferir, na bancada, o
que o supervisório mostra.

### TG: termômetro do TQ-01

- O que é: termômetro de leitura local.
- Onde fica: no TQ-01.
- O que mede: temperatura da água do TQ-01.
- Como chega ao CLP: não chega (mecânico).
- Loja/MES: não usa.

### PG: manômetro do TQ-01

- O que é: manômetro de leitura local.
- Onde fica: no TQ-01.
- O que mede: pressão do TQ-01.
- Como chega ao CLP: não chega (mecânico).
- Loja/MES: não usa.

### LG: visor de nível do TQ-02

- O que é: visor (tubo de vidro) ao lado do tanque.
- Onde fica: no TQ-02.
- O que mede: nível do TQ-02, a olho.
- Como chega ao CLP: não chega (mecânico).
- Loja/MES: não usa.

### FI: rotâmetro da linha de envase

- O que é: indicador de vazão local; no P&ID v2 é um rotâmetro (doc 20 do Simmaq 3DX).
- Onde fica: na linha de envase, do TQ-01 para o TQ-02.
- O que mede: vazão do envase, a olho.
- Como chega ao CLP: não chega (mecânico).
- Loja/MES: não usa.

## Chaves e solenoide (vermelho)

As chaves de processo são contatos ligados às entradas digitais do CLP. A VY-01 é a única saída digital do grupo.
Endereços `%I`/`%Q` da folha 4 do projeto elétrico (doc 05 do Simmaq 3DX). O programa do CLP publica as chaves, já
convertidas para 1 = condição ativa, na palavra 40063 do `MB_Simulador` (bits indicados abaixo).

Regra:

- Os valores de atuação marcados "no simulador" são do modelo do Simmaq 3DX, não medidos na bancada. Os únicos
  ajustes do P&ID são o do PSH-103 (3,8 bar) e a faixa do TSH-104 (40 a 70 °C).
- A polaridade de todos os contatos (NA ou NF) ainda não está confirmada (doc 05, P-SIM-05).

### LSH-101: nível alto do TQ-02

- O que é: chave de nível alto.
- Onde fica: no TQ-02.
- O que faz: avisa que o TQ-02 está quase cheio.
- Como chega ao CLP: discreto, entrada `%I0.5`; bit 1 da 40063.
- Atuação: no simulador, acima de 90 % do TQ-02. O ROTEIRO (seção 2) limita o volume do pedido a cerca de 20 L por
  causa dele.
- Intertravamento: no simulador, fecha a FV-102 (o desvio manual continua passando).
- Loja/MES: não usa diretamente.

### LSL-101: nível baixo do TQ-02

- O que é: chave de nível baixo.
- Onde fica: no TQ-02.
- O que faz: avisa que o TQ-02 está quase vazio.
- Como chega ao CLP: discreto, entrada `%I0.4`; bit 0 da 40063.
- Atuação: no simulador, abaixo de 10 % do TQ-02. Na sequência do simulador, marca o fim da devolução pela VY-01.
- Loja/MES: não usa diretamente.

### PSH-103: pressostato do TQ-01

- O que é: chave de pressão alta.
- Onde fica: no topo do TQ-01.
- O que faz: avisa que a pressão do TQ-01 passou do limite.
- Como chega ao CLP: discreto, entrada `%I0.6`; bit 2 da 40063.
- Atuação: 3,8 bar (P&ID v2). No simulador, rearma abaixo de 3,5 bar.
- Intertravamento: no simulador, desliga a B1.
- Loja/MES: não usa diretamente. É por causa dele que a pressão do pedido vai só até 3 bar (ROTEIRO, seção 2).

### TSH-104: termostato do TQ-01

- O que é: chave de temperatura alta (termostato ajustável).
- Onde fica: no TQ-01.
- O que faz: avisa que a água do TQ-01 passou da temperatura ajustada.
- Como chega ao CLP: discreto, entrada `%I0.7`; bit 3 da 40063.
- Atuação: ajuste de 40 a 70 °C (P&ID v2). O ponto ajustado na bancada não é conhecido; o simulador usa 70 °C. A
  temperatura do pedido vai só até 65 °C (ROTEIRO, seção 2).
- Intertravamento: no simulador, desliga a resistência TZ-104.
- Loja/MES: não usa diretamente.

### LSL-104: nível baixo do TQ-01

- O que é: chave de nível baixo.
- Onde fica: no TQ-01.
- O que faz: avisa que falta água no TQ-01.
- Como chega ao CLP: discreto, entrada `%I1.0`; bit 4 da 40063.
- Atuação: no simulador, menos de 2 L no TQ-01 (a confirmar: supõe a chave na altura da resistência).
- Intertravamento: no simulador, desliga a resistência TZ-104, para ela não aquecer a seco.
- Loja/MES: não usa diretamente.

### FSL-102: fluxostato da linha da B1

- O que é: chave de fluxo.
- Onde fica: na linha da B1, na descarga da bomba, depois da retenção (P&ID v2, doc 20).
- O que faz: avisa que a B1 está ligada sem água passando ("contra seco").
- Como chega ao CLP: discreto, entrada `%I1.5`; bit 8 da 40063.
- Intertravamento: no simulador, desliga a B1.
- Loja/MES: não usa diretamente.

### LSL do reservatório (sem número)

- O que é: chave de nível baixo. No Simmaq 3DX aparece como "nível baixo TQ-00".
- Onde fica: no reservatório.
- O que faz: avisa que falta água para a B1 puxar.
- Como chega ao CLP: discreto, entrada `%I1.1`; bit 5 da 40063.
- Atuação: no simulador, abaixo de 10 % do reservatório.
- Intertravamento: no simulador, desliga a B1.
- Loja/MES: não usa diretamente.

### VY-01: solenoide de descarga do TQ-02

- O que é: válvula solenoide (abre ou fecha, sem posição intermediária).
- Onde fica: na saída do TQ-02 para o reservatório.
- O que faz: esvazia o TQ-02 no reservatório. É a "entrega" da batelada.
- Como chega ao CLP: discreto, saída `%Q0.2`; bit 2 da 40021 (cópia das saídas).
- Loja/MES: não usa. Quando esvaziar o TQ-02 é decisão do programa do CLP (ROTEIRO, seção 2).

Observação:

- A folha 4 também tem entradas que não estão no P&ID: falha da B1 (`%I1.2`), falha do M1 (`%I1.3`), emergência
  (`%I1.4`) e as quatro chaves do painel (`%I0.0` a `%I0.3`). Estão no doc 05 do Simmaq 3DX.

## Transmissores e posicionador Profibus PA (rosa)

Os cinco estão na rede Profibus PA. O CLP lê o valor de cada um e o republica no DB `MB_Simulador`, em `Real`
(unidade de engenharia), e monta o status de cada um nos bits 4 a 8 da palavra 40019 (status bom = byte de status PA
≥ 16#80). É daí que o MES lê.

### LIT-101: nível do TQ-02

- O que é: transmissor de pressão usado para calcular o nível. Mede a pressão da coluna de água no fundo do tanque:
  quanto mais alta a coluna, maior a pressão.
- Onde fica: no TQ-02, na linha de baixo do tanque.
- O que mede: nível do TQ-02.
- Como chega ao CLP: Profibus PA.
- No `MB_Simulador`: 40001 (`DBD0`), %, 0 a 100.
- Malha: LIC-101.
- Loja/MES: usa. O MES lê o nível ao vivo e o converte para litros (TQ-02 = 25 L). O CLP usa o LIT-101 para saber
  quando o volume do pedido (`SpVolume`) foi atingido e para gravar o `VolumeProduzido` (`docs/programa-clp.md`).

### FIT-102: vazão do envase

- O que é: transmissor de pressão usado para calcular a vazão. No P&ID ele fica numa placa de orifício: a queda de
  pressão na placa cresce com a vazão.
- Onde fica: na linha de envase, do TQ-01 para o TQ-02, junto do rotâmetro FI.
- O que mede: vazão do produto.
- Como chega ao CLP: Profibus PA.
- No `MB_Simulador`: 40003 (`DBD4`), m³/h, 0 a 2 (faixa estimada, a confirmar). 1 L/min = 0,06 m³/h.
- Malha: FIC-102.
- Loja/MES: usa. O MES lê a vazão ao vivo e a mostra em L/min. O pedido traz a vazão de envase (`SpVazao`, 1 a
  6 L/min).

### FV-102: posicionador da válvula de envase

- O que é: válvula de controle pneumática com posicionador Profibus PA. O posicionador recebe a abertura pedida, e o
  conversor I/P transforma isso em pressão de ar no atuador.
- Onde fica: na linha de envase, entre o FIT-102 e o TQ-02, com bloqueio de cada lado e desvio (bypass) manual.
- O que faz: regula quanto produto passa do TQ-01 para o TQ-02.
- Como chega ao CLP: Profibus PA. Ar: do circuito de ar de instrumento (PTT-106).
- No `MB_Simulador`: 40009 (`DBD16`), posição lida do posicionador (READBACK), %, 0 a 100; 40011 (`DBD20`), comando
  do controlador, %, 0 a 100.
- Malha: FIC-102 (e LIC-101, pela cascata).
- Loja/MES: não usa.

Observação:

- O desvio manual passa produto mesmo com a FV-102 fechada. Se ele estiver aberto, o FIC-102 perde o controle da
  vazão.

### PIT-103: pressão do TQ-01

- O que é: transmissor de pressão.
- Onde fica: no topo do TQ-01.
- O que mede: pressão manométrica do TQ-01 (o colchão de ar comprimido pela água).
- Como chega ao CLP: Profibus PA.
- No `MB_Simulador`: 40005 (`DBD8`), bar, 0 a 10.
- Malha: PIC-103.
- Loja/MES: usa. O MES lê a pressão ao vivo. O pedido traz a pressão de trabalho (`SpPressao`, 1,5 a 3 bar).

### TIT-104: temperaturas dos tanques

- O que é: transmissor de temperatura. Pelo projetista, trata as temperaturas dos tanques e a diferença entre elas.
  Os elementos ligados a ele são o TE-104a e o TE-104b (P&ID v2, doc 20).
- Onde fica: o transmissor no painel ou junto dos tanques (posição não confirmada); os elementos, no TQ-01 e no
  reservatório.
- O que mede: no `MB_Simulador`, só a temperatura do TQ-01.
- Como chega ao CLP: Profibus PA.
- No `MB_Simulador`: 40007 (`DBD12`), °C, 0 a 150.
- Malha: TIC-104 (e o arrefecimento pela FV-105 e o M1, no programa do simulador).
- Loja/MES: usa. O MES lê a temperatura do TQ-01 ao vivo. O pedido traz a temperatura do produto (`SpTemperatura`,
  40 a 65 °C), e o envase só começa depois de o TQ-01 atingi-la.

## Elementos, malhas e seletor (cinza)

Nenhum deles tem cabo próprio até o CLP. Os elementos TE-104a e TE-104b são ligados ao TIT-104. Os controladores e o
seletor são funções do programa do CLP: o desenho mostra a ligação entre transmissor, controlador e atuador.

### TE-104a: PT100 do TQ-01

- O que é: termorresistência PT100 (resistência de platina que muda com a temperatura).
- Onde fica: no TQ-01.
- O que mede: temperatura da água do TQ-01.
- Como chega ao CLP: pelo TIT-104 (Profibus PA).
- Loja/MES: usa indiretamente, pelo TIT-104.

### TE-104b: elemento do reservatório

- O que é: elemento de temperatura ligado ao TIT-104. O tipo (PT100 ou outro) não está confirmado.
- Onde fica: no reservatório.
- O que mede: temperatura da água do reservatório.
- Como chega ao CLP: pelo TIT-104 (Profibus PA). Não há endereço dele no `MB_Simulador`.
- Loja/MES: não usa. A temperatura do reservatório que o MES recebe é a do TE-105b.

### FIC-102: controlador de vazão do envase

- O que é: malha de controle de vazão, no programa do CLP.
- Mede: FIT-102. Atua em: FV-102.
- Faz: mantém a vazão do envase no valor do pedido (`SpVazao`).
- Loja/MES: entrega o setpoint (`SpVazao`) no DB `MES`.

### PIC-103: controlador de pressão do TQ-01

- O que é: malha de controle de pressão, no programa do CLP.
- Mede: PIT-103. Atua em: velocidade da B1, pelo inversor FY-102.
- Faz: enche o TQ-01 até a pressão de trabalho e a mantém enquanto o produto sai.
- Loja/MES: entrega o setpoint (`SpPressao`) no DB `MES`.

### TIC-104: controlador de temperatura do TQ-01

- O que é: malha de controle de temperatura, no programa do CLP.
- Mede: TIT-104. Atua em: TY-104, que comanda a resistência TZ-104.
- Faz: aquece o TQ-01 até a temperatura do pedido. Para resfriar, o programa usa a FV-105 e o M1
  (`docs/programa-clp.md`, 4.2).
- Loja/MES: entrega o setpoint (`SpTemperatura`) no DB `MES`.

### LIC-101: controlador de nível do TQ-02

- O que é: malha de controle de nível, no programa do CLP.
- Mede: LIT-101. Atua em: FIC-102, em cascata. O LIC-101 é a malha externa e dá o valor de vazão que o FIC-102 tem de
  seguir; o FIC-102 é a malha interna e mexe na FV-102.
- Loja/MES: não usa.

### HS-01: seletor de modo

- O que é: seletor manual (H = hand), tratado como um seletor do programa.
- Faz: escolhe qual malha comanda o inversor da B1.
- Como chega ao CLP: não está definido (ver Pendências). No `MB_Simulador`, o estado dele vai no bit 1 da 40022.
- Loja/MES: não usa.

## Acionamentos Profibus DP (azul-escuro)

Os três recebem o comando do CLP pela rede Profibus DP, segundo o projetista.

### FY-102: inversor da bomba B1

- O que é: inversor de frequência do motor da B1.
- Onde fica: no painel.
- O que faz: liga a B1 e varia a velocidade dela. A velocidade decide quanta água entra no TQ-01 e, com isso, a
  pressão.
- Como chega ao CLP: Profibus DP (confirmado também pela topologia do painel).
- No `MB_Simulador`: 40013 (`DBD24`), frequência, Hz, 0 a 60 (faixa estimada); 40025 (`DBD48`), referência da B1,
  %, 0 a 100; 40019 bit 0 (em operação) e bit 1 (em falha). Pela folha 4: `%Q0.0` liga a B1 pelo inversor, na
  velocidade da 40025; `%Q0.4` liga a B1 a 60 Hz, direto na rede.
- Malha: PIC-103 (pelo HS-01).
- Loja/MES: não usa.

### FY-105: inversor do ventilador M1

- O que é: inversor de frequência do motor do ventilador M1.
- Onde fica: no painel.
- O que faz: liga o M1 e varia a velocidade dele, ou seja, quanto calor o trocador tira da água que volta ao
  reservatório.
- Como chega ao CLP: Profibus DP (confirmado também pela topologia do painel).
- No `MB_Simulador`: 40015 (`DBD28`), frequência, Hz, 0 a 60 (faixa estimada); 40031 (`DBD60`), referência, %, 0 a
  100; 40022 bit 0 liga o M1; 40019 bit 2 (em operação) e bit 3 (em falha).
- Loja/MES: não usa.

### TY-104: relé de estado sólido da resistência

- O que é: relé de estado sólido (SSR), que liga e desliga a resistência muito depressa para dosar a potência.
- Onde fica: no painel.
- O que faz: comanda a potência da TZ-104.
- Como chega ao CLP: Profibus DP, pelo projetista (ver Pendências: o Simmaq 3DX indica uma saída analógica).
- No `MB_Simulador`: 40023 (`DBD44`), controle da resistência, %, 0 a 100; `%Q0.1` liga a resistência (folha 4).
- Malha: TIC-104.
- Loja/MES: não usa.

## Cargas (azul-claro)

São os equipamentos que gastam energia. Nenhum fala com o CLP: quem os comanda é o acionamento ao lado.

### B1: bomba

- O que é: bomba de água.
- Onde fica: entre o reservatório e o TQ-01.
- O que faz: leva água do reservatório ao TQ-01 e pressuriza o TQ-01. Pelo modelo do simulador, a vazão máxima é
  1,2 m³/h (20 L/min) e cai a zero com 5 bar no TQ-01 (valores de partida, a calibrar).
- Comandada por: FY-102.
- Intertravamentos (no simulador): PSH-103, LSL do reservatório e FSL-102 a desligam.

### M1: ventilador do trocador de calor

- O que é: ventilador que sopra ar no trocador de calor.
- Onde fica: no trocador, na linha de recirculação do TQ-01 (depois da FV-105).
- O que faz: resfria a água que volta ao reservatório. Parado, o trocador ainda tira um pouco de calor.
- Comandado por: FY-105.

### TZ-104: resistência do TQ-01

- O que é: resistência elétrica de aquecimento. No P&ID v2 é uma serpentina dentro do TQ-01 (doc 20).
- Onde fica: dentro do TQ-01.
- O que faz: aquece a água do TQ-01.
- Comandada por: TY-104.
- Potência: não conhecida (ver Pendências).
- Intertravamentos (no simulador): TSH-104 e LSL-104 a desligam.

Regra:

- A resistência não pode ligar sem água cobrindo o elemento. É para isso que serve o LSL-104.

## Instrumentos e posicionador IO-Link (laranja)

Os sete chegam ao CLP pelo mestre IO-Link. Os endereços do `MB_Simulador` são os do D-51 do Simmaq 3DX, uma alocação
estimada, feita para o simulador; o status de LT-105, FTIT-105, PTT-105 e FV-105 vai nos bits 12 a 15 da 40019.
PTT-106, TE-105a e TE-105b não têm endereço no `MB_Simulador`.

### PTT-105: pressão do TQ-01 (IO-Link)

- O que é: transmissor de pressão IO-Link.
- Onde fica: no topo do TQ-01, ao lado do PIT-103 e do PSH-103.
- O que mede: pressão do TQ-01.
- Como chega ao CLP: IO-Link.
- No `MB_Simulador`: 40039 (`DBD76`), bar, 0 a 10; status no bit 14 da 40019.
- Loja/MES: não usa. O MES lê a pressão do PIT-103.

### PTT-106: pressão do ar de instrumento

- O que é: transmissor de pressão IO-Link.
- Onde fica: na linha de ar de instrumento, depois do filtro, do regulador e da válvula 3/2 manual, antes dos I/P
  da FV-102 e da FV-105 (doc 20).
- O que mede: pressão do ar que move as válvulas de controle. Sem ar, a FV-102 e a FV-105 não se mexem.
- Como chega ao CLP: IO-Link.
- No `MB_Simulador`: não tem endereço. O P&ID não dá faixa nem unidade.
- Loja/MES: não usa.

### TE-105a: temperatura do TQ-02

- O que é: elemento de temperatura IO-Link.
- Onde fica: na parede do TQ-02, entre o LSH-101 e o LSL-101 (doc 20).
- O que mede: temperatura do produto no TQ-02.
- Como chega ao CLP: IO-Link.
- No DB `MES`: o CLP escreve `TemperaturaTq02` (byte 82, `Real`, °C) a cada ciclo e `TemperaturaProduto` (byte 58,
  °C) no fim da transferência da última rodada. Não existe no `MB_Simulador`.
- Loja/MES: usa. É a temperatura do produto que a qualidade confere.

### TE-105b: temperatura do reservatório

- O que é: elemento de temperatura IO-Link.
- Onde fica: na parede do reservatório, no alto (doc 20).
- O que mede: temperatura da água do reservatório, que esquenta com as bateladas devolvidas.
- Como chega ao CLP: IO-Link.
- No DB `MES`: o CLP escreve `TemperaturaReservatorio` (byte 86, `Real`, °C) a cada ciclo. Não existe no
  `MB_Simulador`.
- Loja/MES: usa. A partir da 2ª rodada, a B1 enche o TQ-01 com água do reservatório: a estimativa de ciclo do MES
  usa essa temperatura para calcular quanto a rodada vai aquecer ou resfriar (`packages/dominio/src/ciclo.ts`), e o
  sequenciamento aproveita isso (ROTEIRO, seção 2).

### FTIT-105: vazão e temperatura do retorno

- O que é: transmissor IO-Link de vazão e temperatura num só aparelho.
- Onde fica: no retorno da recirculação, depois do trocador, antes do reservatório.
- O que mede: vazão que volta ao reservatório e a temperatura dela, já resfriada pelo trocador.
- Como chega ao CLP: IO-Link.
- No `MB_Simulador`: 40035 (`DBD68`), vazão, m³/h, 0 a 2; 40037 (`DBD72`), temperatura, °C, 0 a 150; status no bit 13
  da 40019.
- Loja/MES: não usa.

### LT-105: nível do reservatório

- O que é: transmissor de nível IO-Link.
- Onde fica: no reservatório.
- O que mede: nível do reservatório.
- Como chega ao CLP: IO-Link.
- No `MB_Simulador`: 40033 (`DBD64`), %, 0 a 100; status no bit 12 da 40019.
- Loja/MES: não usa.

### FV-105: posicionador da válvula de recirculação

- O que é: válvula de controle pneumática com posicionador IO-Link e conversor I/P.
- Onde fica: na saída do TQ-01 para o trocador de calor, com bloqueios e desvio manual (doc 20).
- O que faz: abre a recirculação do TQ-01 pelo trocador, para resfriar a água. Também alivia a pressão do TQ-01.
- Como chega ao CLP: IO-Link. Ar: do circuito de ar de instrumento (PTT-106).
- No `MB_Simulador`: 40027 (`DBD52`), comando, %, 0 a 100; 40029 (`DBD56`), posição lida, %, 0 a 100; status no bit
  15 da 40019. No simulador, `%Q0.3` ("liga arrefecimento") é a permissão: sem ela a FV-105 fica fechada.
- Loja/MES: não usa.

## O que a Loja/MES usa

O MES não comanda a bancada. Ele só entrega o próximo pedido ao CLP e lê o que precisa para mostrar e registrar.

| Sinal | De onde o MES lê | Para quê |
|---|---|---|
| TIT-104 (°C, TQ-01) | `MB_Simulador` 40007 | Tela da bancada, ao vivo |
| LIT-101 (nível do TQ-02) | `MB_Simulador` 40001, convertido para L | Tela da bancada, ao vivo |
| PIT-103 (bar, TQ-01) | `MB_Simulador` 40005 | Tela da bancada, ao vivo |
| FIT-102 (vazão do envase) | `MB_Simulador` 40003, convertido para L/min | Tela da bancada, ao vivo |
| TE-105a (°C, TQ-02) | DB `MES`, bytes 82 (ao vivo) e 58 (fim da OP) | Temperatura do produto e qualidade |
| TE-105b (°C, reservatório) | DB `MES`, byte 86 | Tela da bancada e estimativa de ciclo |

O que o MES manda ao CLP (DB `MES`, bytes 0–23) são os setpoints do pedido: `SpVolume` (LIT-101), `SpTemperatura`
(TIC-104), `SpVazao` (FIC-102) e `SpPressao` (PIC-103). O MES nunca escreve no `MB_Simulador`.

Os indicadores verdes não vão para o software. Os demais instrumentos chegam ao CLP, mas a Loja/MES não os lê.

## Tabela-resumo

| Tag | O que é | Onde | Cor | Sinal | No software | Faixa e unidade (fonte) |
|---|---|---|---|---|---|---|
| TG | Termômetro | TQ-01 | Verde | Mecânico | Não vai | — |
| PG | Manômetro | TQ-01 | Verde | Mecânico | Não vai | — |
| LG | Visor de nível | TQ-02 | Verde | Mecânico | Não vai | — |
| FI | Rotâmetro | Envase | Verde | Mecânico | Não vai | — |
| LSH-101 | Nível alto | TQ-02 | Vermelho | Discreto `%I0.5` | 40063 bit 1; MES não usa | 90 % (simulador) |
| LSL-101 | Nível baixo | TQ-02 | Vermelho | Discreto `%I0.4` | 40063 bit 0; MES não usa | 10 % (simulador) |
| PSH-103 | Pressostato | TQ-01 | Vermelho | Discreto `%I0.6` | 40063 bit 2; MES não usa | 3,8 bar (P&ID) |
| TSH-104 | Termostato | TQ-01 | Vermelho | Discreto `%I0.7` | 40063 bit 3; MES não usa | ajuste 40–70 °C (P&ID) |
| LSL-104 | Nível baixo | TQ-01 | Vermelho | Discreto `%I1.0` | 40063 bit 4; MES não usa | 2 L (simulador) |
| FSL-102 | Fluxostato | Linha da B1 | Vermelho | Discreto `%I1.5` | 40063 bit 8; MES não usa | — |
| LSL | Nível baixo | Reservatório | Vermelho | Discreto `%I1.1` | 40063 bit 5; MES não usa | 10 % (simulador) |
| VY-01 | Solenoide | TQ-02 → reservatório | Vermelho | Discreto `%Q0.2` | 40021 bit 2; MES não usa | aberta/fechada |
| LIT-101 | Pressão → nível | TQ-02 | Rosa | Profibus PA | 40001; **MES usa** | 0–100 % (doc 05) |
| FIT-102 | Pressão → vazão | Envase | Rosa | Profibus PA | 40003; **MES usa** | 0–2 m³/h, a confirmar (doc 05) |
| FV-102 | Posicionador | Envase | Rosa | Profibus PA | 40009 e 40011; MES não usa | 0–100 % (doc 05) |
| PIT-103 | Pressão | TQ-01 | Rosa | Profibus PA | 40005; **MES usa** | 0–10 bar (doc 05) |
| TIT-104 | Temperaturas | TQ-01 e reservatório | Rosa | Profibus PA | 40007; **MES usa** | 0–150 °C (doc 05) |
| TE-104a | PT100 | TQ-01 | Cinza | Pelo TIT-104 | Pelo TIT-104 | — |
| TE-104b | Elemento de temperatura | Reservatório | Cinza | Pelo TIT-104 | Sem endereço | — |
| FIC-102 | Malha de vazão | Programa do CLP | Cinza | — | MES manda `SpVazao` | 1–6 L/min no pedido (ROTEIRO) |
| PIC-103 | Malha de pressão | Programa do CLP | Cinza | — | MES manda `SpPressao` | 1,5–3 bar no pedido (ROTEIRO) |
| TIC-104 | Malha de temperatura | Programa do CLP | Cinza | — | MES manda `SpTemperatura` | 40–65 °C no pedido (ROTEIRO) |
| LIC-101 | Malha de nível | Programa do CLP | Cinza | — | Não usa | — |
| HS-01 | Seletor de modo | Programa do CLP | Cinza | — | 40022 bit 1; MES não usa | — |
| FY-102 | Inversor da B1 | Painel | Azul-escuro | Profibus DP | 40013, 40025; MES não usa | 0–60 Hz, estimada (doc 05) |
| FY-105 | Inversor do M1 | Painel | Azul-escuro | Profibus DP | 40015, 40031; MES não usa | 0–60 Hz, estimada (doc 05) |
| TY-104 | Relé de estado sólido | Painel | Azul-escuro | Profibus DP | 40023; MES não usa | 0–100 % (doc 05) |
| B1 | Bomba | RES → TQ-01 | Azul-claro | Pelo FY-102 | — | — |
| M1 | Ventilador | Trocador | Azul-claro | Pelo FY-105 | — | — |
| TZ-104 | Resistência | Dentro do TQ-01 | Azul-claro | Pelo TY-104 | — | potência desconhecida |
| PTT-105 | Pressão | TQ-01 | Laranja | IO-Link | 40039; MES não usa | 0–10 bar, estimada (doc 05) |
| PTT-106 | Pressão do ar | Ar de instrumento | Laranja | IO-Link | Sem endereço | — |
| TE-105a | Temperatura | TQ-02 | Laranja | IO-Link | DB `MES` 82 e 58; **MES usa** | °C (ROTEIRO 6.3) |
| TE-105b | Temperatura | Reservatório | Laranja | IO-Link | DB `MES` 86; **MES usa** | °C (ROTEIRO 6.3) |
| FTIT-105 | Vazão e temperatura | Retorno ao reservatório | Laranja | IO-Link | 40035 e 40037; MES não usa | 0–2 m³/h e 0–150 °C, estimadas (doc 05) |
| LT-105 | Nível | Reservatório | Laranja | IO-Link | 40033; MES não usa | 0–100 %, estimada (doc 05) |
| FV-105 | Posicionador | TQ-01 → trocador | Laranja | IO-Link | 40027 e 40029; MES não usa | 0–100 % (doc 05) |

## Fontes

- Classificação por cor e por tipo de sinal, e localização de cada item: o projetista da bancada, pelo usuário
  (P&ID versão 2). Vale mais que qualquer outra fonte.
- Endereços, faixas e unidades do `MB_Simulador` (40001–40066, `%I`/`%Q` da folha 4, palavras 40019, 40021, 40022 e
  40063) e topologia do painel: `simmaq3dx\docs\05-comunicacao-modbus.md`. As faixas são as que o simulador usa;
  algumas o próprio documento chama de estimadas (FIT-102, inversores e tudo do D-51: FV-105, M1, LT-105, FTIT-105,
  PTT-105).
- Valores de atuação das chaves, efeitos dos intertravamentos, vazão da B1 e o funcionamento do trocador:
  `simmaq3dx\docs\06-simulacao-processo.md`. São do **modelo do simulador**, ponto de partida para calibrar, não
  medidas da bancada.
- PSH-103 a 3,8 bar, faixa do TSH-104 (40 a 70 °C), placa de orifício do FIT-102, serpentina da TZ-104, posição do
  FSL-102, do PTT-106, do TE-105a e do TE-105b, e TE-104a/TE-104b como elementos do TIT-104:
  `simmaq3dx\docs\20-diagrama-v2.md`.
- Faixas do pedido, DB `MES` (bytes 58, 82 e 86) e o que o MES lê: `ROTEIRO.md` (seções 2 e 6) e
  `docs/programa-clp.md`; leitura dos bytes 0 a 15 do `MB_Simulador` pelo gateway: `apps/gateway/src/s7.ts`.

## Pendências

O que ainda não se sabe, com a pergunta a fazer. Quem responde é o projetista da bancada, salvo indicação.

### Dados que faltam

- Potência do TZ-104: quantos watts tem a resistência? Sem isso, a estimativa de ciclo do MES usa valores
  provisórios (`docs/programa-clp.md`, 4.3).
- O que cada intertravamento desliga na bancada real: o circuito elétrico corta a carga direto, ou o contato só entra
  no CLP e o programa decide? E o quê, exatamente? Hoje só se sabe o que o simulador faz: PSH-103, LSL do
  reservatório e FSL-102 desligam a B1; TSH-104 e LSL-104 desligam a TZ-104; LSH-101 fecha a FV-102. Falta também a
  polaridade (NA ou NF) de cada contato.
- Valor de atuação das chaves de nível (LSH-101, LSL-101, LSL-104, LSL do reservatório): os números deste manual são
  do simulador.
- Ponto em que o TSH-104 está ajustado na bancada (o P&ID só dá a faixa de 40 a 70 °C).
- Faixas reais de calibração de todos os transmissores e dos inversores. As do `MB_Simulador` são as do simulador; a
  do FIT-102 e as do D-51 são estimadas.
- PTT-106: faixa, unidade e se ele entra no programa do CLP (o P&ID não dá nenhuma das três).
- TE-105a e TE-105b: faixa e endereço no mestre IO-Link. O ROTEIRO só diz que o CLP os escreve em °C no DB `MES`.
- Tipo do TE-104b (PT100 como o TE-104a, ou outro).

### Dúvidas da classificação

- FV-102 "(quando passa)": a nota do usuário sobre a FV-102 não ficou clara. Quer dizer que o posicionador só atua
  quando há produto passando (envase)? Que a posição só é lida nesse momento? Ou se refere ao desvio manual, que
  passa produto com a FV-102 fechada? Perguntar ao usuário.
- TE-104b × TE-105b: os dois ficam no reservatório. O TE-104b vai ao TIT-104 (Profibus PA) e o TE-105b ao mestre
  IO-Link (e dele ao DB `MES`). Medem a mesma coisa em pontos diferentes, ou têm papéis diferentes? Qual o MES deve
  considerar como "temperatura do reservatório"? Hoje é o TE-105b.
- PIT-103 × PTT-105: os dois medem a pressão no topo do TQ-01, um em Profibus PA e outro em IO-Link. É redundância,
  comparação didática entre redes, ou um deles tem outra função? O PIC-103 e o MES usam o PIT-103.
- TIT-104 "temperaturas dos tanques e a diferença entre elas": o `MB_Simulador` só tem uma temperatura (40007, a do
  TQ-01). Onde ficam a temperatura do TE-104b e a diferença? Elas entram em alguma malha?

### Onde as fontes discordam da classificação do projetista

- HS-01: o projetista diz que ele escolhe qual malha comanda o inversor da B1. No Simmaq 3DX (doc 06 e bit 1 da 40022)
  o HS-01 escolhe se a **FV-102** segue o FIC-102 ou o LIC-101, e o PIC-103 fica sempre na B1. O doc 20 lê o desenho
  com o HS-01 ligado à FV-102 e ao FY-102 ao mesmo tempo. Qual é o certo, e quais são as posições do seletor?
- LIC-101: o projetista diz que ele trabalha em cascata com o FIC-102 (o doc 20 desenha a ligação LIC-101 → FIC-102).
  O simulador não faz cascata: põe o LIC-101 direto na FV-102, no lugar do FIC-102, conforme o HS-01.
- TY-104: o projetista o põe no Profibus DP. O doc 05 do Simmaq 3DX diz que a potência da resistência sai da saída
  analógica `%QW64` (convertida para % em 40023), e a topologia do painel não mostra o TY-104 na rede DP. Confirmar
  como o TY-104 recebe o comando.
- FY-102: o projetista e a topologia dizem Profibus DP, mas a folha 4 (doc 05) também tem a referência da B1 numa
  saída analógica (`%QW66`, 40025) e uma saída `%Q0.4` que liga a B1 a 60 Hz direto na rede. Confirmar se esses sinais
  ainda existem com o inversor em DP.
- FY-105: o doc 20 o pinta de laranja, com "I/O", junto dos IO-Link, e o doc 05 diz que o "habilita FY105" vem do
  mestre IO-Link. O projetista (e a topologia) o põem no Profibus DP.
- Cinza: o doc 20 chama de preto a cor de TE-104a, TE-104b e das malhas. É provavelmente a mesma cor; vale o cinza do
  projetista.
- FV-105 no IO-Link e os endereços 40027 a 40040 são uma alocação estimada do Simmaq 3DX (D-51), não do projeto
  elétrico. O projetista confirma o IO-Link; os endereços continuam a confirmar.
