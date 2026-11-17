---
name: gerar-manuais
description: Cria ou atualiza os manuais em Markdown da Loja/MES e da bancada AUPRO4000 (operação, instrumentos, programa do CLP) em docs/, seguindo as convenções de manual técnico da Exxer. Use quando o usuário pedir para criar, atualizar ou recriar um manual, guia ou documento para professor, aluno ou programador do CLP.
---

# Gerar/atualizar manuais (Loja/MES e bancada AUPRO4000)

Adaptada da skill `gerar-manuais` da Plataforma Exxer. Lá os `.md` viram PDF por um gerador próprio
(`docs/tools/manuais/`, Chrome headless + paged.js, identidade visual Exxer). **Esse gerador não existe neste
projeto**: aqui o manual entregue é o `.md`. As convenções de escrita são as mesmas, para que o texto possa ser
levado ao gerador da plataforma sem retrabalho, se um dia for preciso um PDF.

## Contexto

- Projeto: Loja (com ERP) e MES da bancada didática **AUPRO4000** (Exxer), CLP **Siemens S7-1200**. Leia o
  `AGENTS.md` e o `ROTEIRO.md` antes de escrever.
- Leitores: o **professor** e o **aluno** que operam a bancada e usam a Loja, e quem **programa o CLP**. Escreva em
  português do Brasil, frases curtas, sem jargão de software quando o leitor for o operador.
- Onde ficam os manuais: `docs/<tema>.md`, um arquivo por assunto (ex.: `docs/instrumentos.md`). Os que já existem:
  `docs/instalacao.md` (subir a Loja/MES) e `docs/programa-clp.md` (o que o programa do CLP precisa fazer).
- Fontes de dado técnico, nesta ordem de autoridade:
  1. o que o **usuário** ou o **projetista da bancada** informou na conversa;
  2. este projeto: `ROTEIRO.md`, `docs/programa-clp.md`, `packages/contrato-clp` (layout do DB `MES`);
  3. o Simmaq 3DX, só leitura (`c:\MAICON\Repositorios\simmaq3dx\docs\`): `05-comunicacao-modbus.md` (mapa
     40001–40066 do DB `MB_Simulador`), `06-simulacao-processo.md` (processo, malhas, intertravamentos do modelo),
     `20-diagrama-v2.md` (P&ID v2 em texto).

## Passos

1. Junte as fontes antes de escrever. Anote, para cada dado (faixa, unidade, endereço, ajuste), de onde ele veio.
   Dado do Simmaq 3DX que for só do **modelo do simulador** (limites, ganhos, tempos) tem de aparecer como tal, não
   como dado da bancada.
2. **Não invente dado técnico.** O que nenhuma fonte confirma vai para o capítulo de pendências. Quando as fontes
   discordarem, vale a de maior autoridade (lista acima), e a discordância também vai para as pendências.
3. Escreva o `.md` seguindo as convenções abaixo. Mantenha o capítulo `## Sumário` sincronizado com os capítulos.
4. Feche o manual com dois capítulos: **Fontes** (de onde veio cada dado complementar) e **Pendências** (o que ainda
   não se sabe, com a pergunta a fazer e a quem).
5. Figura que você não consegue gerar (recorte do P&ID, foto da bancada, captura de tela): deixe um marcador visível,
   `Figura pendente: <o que deve mostrar>.`, num parágrafo sozinho, e avise no relatório. Não aponte
   `![...](...)` para arquivo que não existe.
6. Releia contra as fontes: tags, unidades e endereços escritos igual em todo o texto e nas tabelas.
7. Não edite `ROTEIRO.md`, `AGENTS.md`, `README.md` nem o código para acomodar o manual sem o usuário pedir. Se o
   manual revelar algo que eles deveriam dizer, aponte no relatório.

## Convenções do Markdown (as mesmas do gerador da Plataforma Exxer)

- `#`: título do documento, uma vez só. Logo abaixo, um parágrafo dizendo para quem é e o que cobre.
- `##`: capítulo. Não numere à mão (`## 1. ...`): o gerador numera. Primeiro capítulo: `## Sumário`, com links.
- `###`: seção dentro do capítulo.
- Parágrafo curto terminado em `:` (ex.: `Campos:`, `Ações:`, `Onde fica:`) é um rótulo.
- Quadros de destaque, cada um num parágrafo sozinho seguido da lista ou do parágrafo que ele engloba:
  - `Observação:` ou `Observações:` para informação complementar;
  - `Regra:`, `Regras:` ou `Limites:` para o que não pode ser ignorado (segurança, intertravamento, limite);
  - `Boas práticas:` ou `Uso recomendado:` para recomendação.
- Listas `- item` (aninhamento com 2 espaços); em `- Nome: descrição`, o `Nome:` sai em negrito no PDF.
- Tabelas `| a | b |`, `` `código` `` e `**negrito**`. Blocos de código cercados por ``` com a linguagem.
- Imagem sozinha na linha, `![legenda](caminho relativo ao .md)`, vira figura com legenda.

## Armadilhas conhecidas

- Tags exatamente como no P&ID v2 (LIT-101, FIT-102, TE-104a...). A etiqueta da bancada é a referência.
- Endereços do `MB_Simulador`: o registrador 4000n é o byte 2(n−1) do DB (40001 = `DBW0`). O MES **só lê** desse DB.
- Layout do DB `MES`: só de `packages/contrato-clp` (ou de `docs/programa-clp.md`, que é gerado a partir dele); não
  repita deslocamentos de byte de memória.
- O que o ROTEIRO marca como **[ABERTA]** não é decidido no manual: vai para as pendências.
