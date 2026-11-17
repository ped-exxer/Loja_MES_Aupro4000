---
name: gerar-manuais
description: Cria ou atualiza os manuais da Loja/MES e da bancada AUPRO4000 (operação, instrumentos, programa do CLP) em Markdown em docs/ e gera o PDF com a identidade visual Exxer em docs/pdf/. Use quando o usuário pedir para criar, atualizar ou recriar um manual, guia ou documento para professor, aluno ou programador do CLP, ou o PDF de um manual.
---

# Gerar/atualizar manuais (Loja/MES e bancada AUPRO4000)

Adaptada da skill `gerar-manuais` da Plataforma Exxer. O `.md` em `docs/` é a fonte editável; o PDF entregue sai
dele pelo gerador `docs/tools/manuais/` (trazido da plataforma e adaptado: Chrome ou Edge headless + paged.js,
identidade visual Exxer, sem dependências npm e sem internet). Regras do gerador: `docs/tools/manuais/README.md`.

## Contexto

- Projeto: Loja (com ERP) e MES da bancada didática **AUPRO4000** (Exxer), CLP **Siemens S7-1200**. Leia o
  `AGENTS.md` e o `ROTEIRO.md` antes de escrever.
- Leitores: o **professor** e o **aluno** que operam a bancada e usam a Loja, e quem **programa o CLP**. Escreva em
  português do Brasil, frases curtas, sem jargão de software quando o leitor for o operador.
- Onde ficam os manuais: `docs/<tema>.md`, um arquivo por assunto (ex.: `docs/instrumentos.md`). Os que já existem:
  `docs/instalacao.md` (subir a Loja/MES) e `docs/programa-clp.md` (o que o programa do CLP precisa fazer).
- Dois tipos de manual:
  - **Ficha** (ex.: `docs/instrumentos.md`): curta, para entregar. Só o que é **sabido**, em tabelas compactas e
    frases curtas, com miolo de **no máximo 2 páginas A4** (fora a capa e a contracapa). Sem sumário, sem capítulo
    de Fontes, de Pendências nem de divergências. Tudo isso vai para o arquivo de notas `docs/<tema>-notas.md`
    (ex.: `docs/instrumentos-notas.md`), que é interno, **não vira PDF** e diz isso no topo. Em `MANUAIS`, a ficha
    leva `ficha: true`.
  - **Manual completo**: capítulos em página nova, sumário, e os capítulos Fontes e Pendências no fim.
  Na dúvida sobre qual o usuário quer, pergunte; para "o que temos dos sensores/atuadores", é ficha.
- PDF: `docs/pdf/<nome de entrega>.pdf`, no git (é o que se entrega). Hoje só o
  `docs/pdf/AUPRO4000 - Manual dos instrumentos.pdf` (ficha, 4 páginas: capa, 2 de miolo, contracapa; fonte
  `docs/instrumentos.md`; notas em `docs/instrumentos-notas.md`). A lista de manuais com PDF, com
  título e subtítulo da capa, é o array `MANUAIS` de `docs/tools/manuais/gerar.mjs`. O HTML intermediário fica em
  `docs/tools/manuais/out/`, fora do git.
- Gerador: `docs/tools/manuais/` — `build.mjs` (md → HTML com a identidade visual, fontes, logos e paged.js
  embutidos), `print.mjs` (HTML → PDF pelo protocolo DevTools do Chrome ou do Edge), `gerar.mjs` (orquestra).
  Fica fora dos workspaces e fora dos contêineres (`.dockerignore`).
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
2. **Não invente dado técnico.** O que nenhuma fonte confirma vai para as pendências. Quando as fontes
   discordarem, vale a de maior autoridade (lista acima), e a discordância também vai para as pendências.
3. Escreva o `.md` seguindo as convenções abaixo. No manual completo, mantenha o capítulo `## Sumário` sincronizado
   com os capítulos; a ficha não tem `## Sumário`.
4. **Fontes** (de onde veio cada dado complementar) e **Pendências** (o que ainda não se sabe, com a pergunta a
   fazer e a quem): no manual completo, são os dois últimos capítulos; na **ficha**, ficam só no arquivo de notas
   (`docs/<tema>-notas.md`), nunca no PDF. Na ficha não entram dúvida, valor estimado, dado só do modelo do
   simulador nem divergência; quando uma pendência for respondida, o dado passa das notas para a ficha.
5. Figura que você não consegue gerar (recorte do P&ID, foto da bancada, captura de tela): deixe um marcador visível,
   `Figura pendente: <o que deve mostrar>.`, num parágrafo sozinho, e avise no relatório. Não aponte
   `![...](...)` para arquivo que não existe.
6. Releia contra as fontes: tags, unidades e endereços escritos igual em todo o texto e nas tabelas.
7. Não edite `ROTEIRO.md`, `AGENTS.md`, `README.md` nem o código para acomodar o manual sem o usuário pedir. Se o
   manual revelar algo que eles deveriam dizer, aponte no relatório.
8. Gere o PDF, na raiz: `npm run manuais` (todos) ou `npm run manuais -- <termo do nome do PDF>` (ex.:
   `npm run manuais -- instrumentos`). Não precisa de `npm install` nem de internet; precisa do Chrome ou do Edge
   instalado (outro caminho: variável `CHROME_PATH`). Manual novo: acrescente a entrada em `MANUAIS`
   (`docs/tools/manuais/gerar.mjs`) com `md`, `html`, `pdf` (em `docs/pdf/`), `titulo`, `subtitulo` e `kicker`.
9. Confira o PDF: o comando imprime o número de páginas. Converta algumas páginas em imagem (ex.: PyMuPDF,
   `python -c "import fitz; ..."`, `page.get_pixmap(dpi=70).save(...)`) e olhe capa, sumário, tabelas, quadros e
   quebras de página. Na ficha, olhe todas as páginas, conte o miolo (1 ou 2 páginas; se passar, enxugue o texto,
   não a letra) e confira que todos os tags aparecem. Layout quebrado se corrige no gerador ou na forma do `.md` (quebra de linha, rótulo, quadro),
   nunca mudando o conteúdo técnico.
10. Commite o `.md` e o PDF juntos, para o PDF nunca ficar atrás do `.md` (só quando o usuário pedir commit).

## Convenções do Markdown (as do gerador, `docs/tools/manuais/README.md`)

- `#`: título do documento, uma vez só. Logo abaixo, um parágrafo dizendo para quem é e o que cobre.
- `##`: capítulo. Não numere à mão (`## 1. ...`): o gerador numera. Primeiro capítulo: `## Sumário`, com links
  (só no manual completo). Na ficha (`ficha: true`), os capítulos saem seguidos na mesma página, sem número, as
  tabelas em letra menor, e o parágrafo de abertura vai no alto da primeira página do miolo.
- `###`: seção dentro do capítulo.
- Parágrafo curto terminado em `:` (ex.: `Campos:`, `Ações:`, `Onde fica:`) é um rótulo.
- Quadros de destaque, cada um num parágrafo sozinho seguido da lista ou do parágrafo que ele engloba:
  - `Observação:` ou `Observações:` para informação complementar;
  - `Regra:`, `Regras:` ou `Limites:` para o que não pode ser ignorado (segurança, intertravamento, limite);
  - `Boas práticas:` ou `Uso recomendado:` para recomendação.
- Listas `- item` (aninhamento com 2 espaços; a continuação de um item longo vai recuada na linha de baixo); em
  `- Nome: descrição`, o `Nome:` sai em negrito no PDF.
- Tabelas `| a | b |`, `` `código` `` e `**negrito**`. Blocos de código cercados por ``` com a linguagem. Tabela com
  6 colunas ou mais sai em letra menor; a que passa de uma página repete o cabeçalho.
- Imagem sozinha na linha, `![legenda](caminho relativo ao .md)`, vira figura com legenda.
- `Figura pendente: ...` num parágrafo sozinho vira um quadro tracejado no PDF.

## Armadilhas conhecidas

- Tags exatamente como no P&ID v2 (LIT-101, FIT-102, TE-104a...). A etiqueta da bancada é a referência.
- Endereços do `MB_Simulador`: o registrador 4000n é o byte 2(n−1) do DB (40001 = `DBW0`). O MES **só lê** desse DB.
- Layout do DB `MES`: só de `packages/contrato-clp` (ou de `docs/programa-clp.md`, que é gerado a partir dele); não
  repita deslocamentos de byte de memória.
- O que o ROTEIRO marca como **[ABERTA]** não é decidido no manual: vai para as pendências.
- Não imprima com `chrome --headless --print-to-pdf` direto: sai antes de o paged.js paginar. Use `npm run manuais`.
- Identidade visual (cores do MIV 2023, logos em `docs/tools/manuais/identidade/`, fontes Liber Grotesque e Altone em
  `docs/tools/manuais/fonts/`): está toda neste projeto; não aponte para o repositório da plataforma.
