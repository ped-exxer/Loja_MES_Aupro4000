# Instrumentos e atuadores da AUPRO4000 (P&ID versão 2)

Ficha dos sensores e atuadores da bancada: a tag, o que é, onde fica e como o sinal chega ao CLP S7-1200. A bancada
tem o TQ-01 (10 L, fechado, pressurizado e aquecido), o TQ-02 (25 L, aberto), o reservatório (50 L) e a linha de ar
de instrumento. A cor é a da tag no P&ID.

## Cores do P&ID e tipos de sinal

| Cor | Grupo | Como chega ao CLP |
|---|---|---|
| Verde | Indicadores locais | Mecânico: lido no próprio instrumento. Não vai para o CLP nem para o software |
| Vermelho | Chaves e solenoide | Discreto: contato numa entrada digital, ou carga numa saída digital |
| Rosa | Transmissores e posicionador | Profibus PA: rede de campo de processo |
| Cinza | PT100 e malhas de controle | Os elementos entram pelo TIT-104; as malhas são funções do programa do CLP |
| Azul-escuro | Acionamentos | Profibus DP: rede de campo dos acionamentos |
| Azul-claro | Equipamentos | Sem sinal próprio: são comandados pelo acionamento |
| Laranja | Instrumentos e posicionador | IO-Link: ligação ponto a ponto com o mestre IO-Link |

## Sensores

| Tag | O que é | Onde fica | Cor | Como chega ao CLP |
|---|---|---|---|---|
| TG | Termômetro | TQ-01 | Verde | Não chega (mecânico) |
| PG | Manômetro | TQ-01 | Verde | Não chega (mecânico) |
| LG | Visor de nível | TQ-02 | Verde | Não chega (mecânico) |
| FI | Rotâmetro (indicador de vazão) | Linha de envase, do TQ-01 para o TQ-02 | Verde | Não chega (mecânico) |
| LSH-101 | Chave de nível alto | TQ-02 | Vermelho | Discreto |
| LSL-101 | Chave de nível baixo | TQ-02 | Vermelho | Discreto |
| PSH-103 | Pressostato (pressão alta), ajustado em 3,8 bar | Topo do TQ-01 | Vermelho | Discreto |
| TSH-104 | Termostato (temperatura alta), ajustável de 40 a 70 °C | TQ-01 | Vermelho | Discreto |
| LSL-104 | Chave de nível baixo | TQ-01 | Vermelho | Discreto |
| FSL-102 | Fluxostato (chave de fluxo) | Linha da bomba B1 | Vermelho | Discreto |
| LSL | Chave de nível baixo (sem número no P&ID) | Reservatório | Vermelho | Discreto |
| LIT-101 | Transmissor de pressão, usado para calcular o nível | TQ-02 | Rosa | Profibus PA |
| FIT-102 | Transmissor de pressão, usado para calcular a vazão | Linha de envase | Rosa | Profibus PA |
| PIT-103 | Transmissor de pressão | Topo do TQ-01 | Rosa | Profibus PA |
| TIT-104 | Transmissor de temperatura: lê as temperaturas dos tanques e a diferença entre elas | Elementos no TQ-01 e no reservatório | Rosa | Profibus PA |
| TE-104a | PT100 | TQ-01 | Cinza | Pelo TIT-104 |
| TE-104b | Elemento de temperatura | Reservatório | Cinza | Pelo TIT-104 |
| PTT-105 | Transmissor de pressão | Topo do TQ-01 | Laranja | IO-Link |
| PTT-106 | Transmissor de pressão | Linha de ar de instrumento | Laranja | IO-Link |
| TE-105a | Elemento de temperatura | TQ-02 | Laranja | IO-Link |
| TE-105b | Elemento de temperatura | Reservatório | Laranja | IO-Link |
| FTIT-105 | Transmissor de vazão e temperatura | Retorno da recirculação ao reservatório, depois do trocador de calor | Laranja | IO-Link |
| LT-105 | Transmissor de nível | Reservatório | Laranja | IO-Link |

## Atuadores e acionamentos

| Tag | O que é | Onde fica | Cor | Como chega ao CLP |
|---|---|---|---|---|
| VY-01 | Válvula solenoide de descarga | Saída do TQ-02 para o reservatório | Vermelho | Discreto |
| FV-102 | Posicionador da válvula de controle do envase | Linha de envase, entre o FIT-102 e o TQ-02 | Rosa | Profibus PA |
| FV-105 | Posicionador da válvula de controle da recirculação | Saída do TQ-01 para o trocador de calor | Laranja | IO-Link |
| FY-102 | Inversor de frequência da bomba B1 | Painel | Azul-escuro | Profibus DP |
| FY-105 | Inversor de frequência do ventilador M1 | Painel | Azul-escuro | Profibus DP |
| TY-104 | Relé de estado sólido da resistência TZ-104 | Painel | Azul-escuro | Profibus DP |
| B1 | Bomba | Entre o reservatório e o TQ-01 | Azul-claro | Pelo FY-102 |
| M1 | Ventilador do trocador de calor | Linha de recirculação do TQ-01 | Azul-claro | Pelo FY-105 |
| TZ-104 | Resistência de aquecimento | Dentro do TQ-01 | Azul-claro | Pelo TY-104 |

## Malhas de controle

São funções do programa do CLP (cinza no P&ID): não têm cabo próprio.

| Tag | O que controla | Mede | Atua em |
|---|---|---|---|
| PIC-103 | Pressão do TQ-01 | PIT-103 | Velocidade da B1, pelo FY-102 |
| TIC-104 | Temperatura do TQ-01 | TIT-104 | Resistência TZ-104, pelo TY-104 |
| FIC-102 | Vazão do envase | FIT-102 | FV-102 |
| LIC-101 | Nível do TQ-02 | LIT-101 | FIC-102, em cascata |
| HS-01 | Seletor de modo: escolhe qual malha comanda o inversor da B1 | — | — |
