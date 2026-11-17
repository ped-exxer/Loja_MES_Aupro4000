# Gerador dos manuais em PDF (Loja/MES e bancada AUPRO4000)

Transforma os manuais em Markdown de `docs/` (a fonte editável) em PDF com a identidade visual da Exxer
(MIV 2023): capa, sumário com número de página, capítulos numerados, cabeçalho e rodapé, quadros de destaque.
Adaptado do gerador da Plataforma Exxer (`plataforma_exxer/docs/tools/manuais/`).

## Fluxo

```
docs/instrumentos.md
        ▼
build.mjs   (md -> HTML com a identidade visual; fontes, logos e paged.js embutidos)
        ▼
out/instrumentos.html   (intermediário, fora do git)
        ▼
print.mjs   (HTML -> PDF no Chrome ou Edge headless, depois de o paged.js paginar)
        ▼
docs/pdf/AUPRO4000 - Manual dos instrumentos.pdf   (o que se entrega, vai no git)
```

A lista de manuais fica no array `MANUAIS` de `gerar.mjs` (fonte `.md`, HTML, PDF, título, subtítulo e kicker da
capa). Hoje:

| PDF | Fonte |
|---|---|
| `docs/pdf/AUPRO4000 - Manual dos instrumentos.pdf` | `docs/instrumentos.md` (ficha: capa, 2 páginas de miolo, contracapa) |

`docs/instrumentos-notas.md` (endereços, fontes, pendências, divergências) é interno e **não vira PDF**.

Dois formatos, escolhidos por manual em `MANUAIS`:

- manual completo (padrão): página de abertura com "Sobre este manual" e sumário, cada capítulo em página nova e
  numerado;
- ficha (`ficha: true`): manual curto, sem a página de abertura; a introdução do `.md` vai no alto do miolo, os
  capítulos saem seguidos na mesma página, sem número, e as tabelas em letra menor (8 pt). O cabeçalho da página
  mostra o título do manual.

**A fonte editável é sempre o `.md`.** Não edite o PDF nem o HTML de `out/`: os dois são refeitos a cada geração.

## Como gerar

Na raiz do projeto:

```powershell
npm run manuais                     # gera todos os PDFs da lista
npm run manuais -- instrumentos     # só os PDFs cujo nome contém algum dos termos
```

Ou, sem npm: `node docs/tools/manuais/gerar.mjs [termo ...]`. Cada manual leva poucos segundos.

Pré-requisitos: Node 22 ou mais novo (o projeto usa o 24) e o Google Chrome ou o Microsoft Edge instalados. Não
precisa de `npm install` nem de internet:

- `print.mjs` fala com o navegador pelo protocolo DevTools usando o `WebSocket` do próprio Node, sem
  `puppeteer-core` (que o gerador da plataforma usa).
- O paged.js 0.4.3 (MIT) está em `vendor/paged.polyfill.min.js` e vai embutido no HTML; as fontes (`fonts/`) e os
  logos (`identidade/`) também. Nada vem de CDN nem do Google Fonts.

O navegador é procurado nesta ordem: variável `CHROME_PATH`, Chrome (`C:\Program Files\Google\...`), Edge
(`C:\Program Files (x86)\Microsoft\Edge\...`). Para forçar o Edge:

```powershell
$env:CHROME_PATH = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'; npm run manuais
```

O gerador fica fora dos workspaces do npm e o `.dockerignore` deixa `docs/tools` e `docs/pdf` fora da imagem: os
contêineres da Loja, do MES e do gateway não carregam nada dele.

## Convenções do Markdown que o gerador entende

- `#`: título do documento (ignorado; a capa usa o título de `gerar.mjs`). Os parágrafos entre o `#` e o primeiro
  `##` vão para "Sobre este manual", antes do sumário.
- `##`: capítulo (página nova, numerado 01, 02...). O capítulo `Sumário` do `.md` é ignorado: o PDF gera o seu.
  Numeração manual no título (`## 1. ...`) é removida.
- `###`: seção (numerada 2.1, 2.2..., entra no sumário). `####`: subtítulo sem número, fora do sumário.
- Parágrafo curto terminado em `:` (ex.: `Campos:`, `Caminhos da água:`) vira rótulo laranja em caixa alta.
- Parágrafos `Observação:`/`Observações:` viram quadro azul; `Regra:`/`Regras:`/`Limites:`, quadro laranja;
  `Boas práticas:`/`Uso recomendado:`, quadro roxo. O quadro engloba a lista ou o parágrafo seguinte.
- `Figura pendente: <o que deve mostrar>.` num parágrafo sozinho vira um quadro tracejado.
- Listas `- item` (aninhamento com 2 espaços; item quebrado em várias linhas, com a continuação recuada, continua
  o mesmo item). Em `- Nome: descrição`, o `Nome:` sai em negrito (pode ter `código`).
- Tabelas `| a | b |`; com 6 colunas ou mais saem em letra menor. Tabela que passa de uma página repete o cabeçalho.
- `` `código` ``, `**negrito**`; links viram texto puro.
- Blocos de código cercados por ``` viram quadro cinza; a linguagem da abertura aparece como rótulo.
- Imagem sozinha na linha, `![legenda](caminho relativo ao .md)`, vira figura com legenda, embutida no HTML.
- Palavra curta com hífen (tags como `LSH-101`, `TE-104a`) não quebra no hífen.

## Identidade visual

- Cores do MIV 2023: Purple Robot `#8036C5`, Blue Skill `#45C8BB`, Electrical Orange `#FF5C29`,
  Smart Grey `#F5F5F5`.
- Logos em `identidade/` (`Exxer_roxa.png`, `xx_rx.png`), copiados da Plataforma Exxer.
- Fontes em `fonts/`: Liber Grotesque (títulos) e Altone (texto), nos pesos 400, 600 e 700, copiadas da Plataforma
  Exxer (lá elas também estão no git). O gerador embute o que estiver na pasta: "liber" no nome = títulos,
  "altone" = texto, peso pelo sufixo (`-Regular`, `-SemiBold`, `-Bold`...); itálicos e variáveis (`VF`) são
  ignorados. Sem arquivos lá, o manual sai em Segoe UI / Arial.

## Manual novo

1. Escreva o `.md` em `docs/` seguindo as convenções acima (e a skill `gerar-manuais`).
2. Acrescente uma entrada em `MANUAIS` (`gerar.mjs`): `md`, `html` (em `out/`), `pdf` (em `docs/pdf/`, com nome de
   entrega), `titulo`, `subtitulo`, `kicker` e, se for ficha, `ficha: true`.
3. `npm run manuais -- <termo>` e confira o PDF (capa, sumário, tabelas, quadros, quebras de página).

## Armadilhas

- Não use `chrome --headless --print-to-pdf` direto: ele imprime antes de o paged.js paginar. Use `print.mjs`, que
  espera a marca `window.__pagedPronto` (posta pelo `build.mjs` no fim da paginação).
- Se o paged.js não terminar em 90 s, `print.mjs` desiste com erro.
