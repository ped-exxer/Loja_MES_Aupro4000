# Instruções para agentes de IA neste projeto

Projeto: **Loja-MES Aubot4000**, a Loja (com ERP) e o MES da bancada **AUPRO4000** (Exxer). Leia o
[ROTEIRO.md](ROTEIRO.md) antes de qualquer coisa: objetivo, módulos, implantação, comunicação com o CLP, fases e decisões em aberto.

## Regras

- Responda e escreva textos de interface em **português do Brasil**. Textos da interface separados por idioma
  (pt, en, es): os comuns em `packages/interface/src/i18n/`, os de cada sistema em `apps/<loja|mes>/web/src/i18n/`;
  os três idiomas têm as mesmas chaves (a tipagem obriga).
- **Não decida sozinho** o que o ROTEIRO marca como **[ABERTA]**: pergunte.
- **Dois sistemas, dois contêineres, dois endereços:** a **Loja** (ERP: vitrine, pedidos, faturas, catálogo,
  certificado; `:8080`) e o **MES** (fila, bancada, qualidade, indicadores, configuração da bancada; `:8081`). Cada
  um serve a própria API e a própria tela, tem a sua base no MySQL (`loja` × `mes`, um usuário para cada) e o nome no
  topo da tela ("AUPRO4000 · Loja" / "AUPRO4000 · MES"). Sem login e sem papéis em nenhum dos dois.
- A Loja fala com o MES **só por HTTP**, pelo contrato de `/api/ordens/*` (ROTEIRO, seção 3.5; tipos em
  `packages/dominio/src/integracao.ts`). A Loja **nunca** acessa a base `mes` nem o gateway. O MES **não conhece a
  Loja**: a Loja consulta o feed de mudanças (`/api/ordens/mudancas?desde=<cursor>`). "Reiniciar a aula" é da Loja.
- Tudo sobe por **Docker Compose** (`loja`, `mes`, `gateway`, `banco`). Offline, uma Loja/MES por bancada.
- **Comunicação com o CLP: S7 PUT/GET** (S7-1200, porta 102, rack 0, slot 1), no DB `MES` não otimizado.
  - O layout do DB `MES` fica **só** em `packages/contrato-clp`; ninguém repete deslocamentos de byte fora dele.
    A fonte do DB para o TIA (`docs/clp/MES.db`) é gerada dele: `npm run db-mes`.
  - O MES escreve **só** na área de escrita do DB `MES`. **Nunca** escreve no DB `MB_Simulador` (mapa 40001–40066 do
    Simmaq 3DX), que não muda; só lê dele as variáveis de processo.
  - **O MES não comanda a bancada**: só entrega ao CLP o próximo pedido da fila, um por vez, pelo aperto de mão
    (`SeqPedido` e `EcoSeq`, seção 6.4), com o contador de vida. Queda de comunicação nunca conclui uma OP.
- O MES nunca fala direto com o CLP: só pelo **gateway**, e só o MES fala com o gateway. Toda fábrica (bancada física, Simmaq 3DX, simulado) é um
  driver do gateway com a mesma interface (`apps/gateway/src/driver.ts`).
- Desenvolva e teste contra o **driver simulado**; os testes não dependem da bancada nem do banco. O driver `s7`
  é testado contra o servidor S7 de teste (`apps/gateway/src/teste/servidor-s7.ts`), uma imitação: não vale como
  prova numa CPU.
- Os códigos de `Alarme` e de `Resultado` do CLP ficam **só** em `packages/contrato-clp/src/codigos.ts`
  (proposta, a confirmar com o programa do CLP). As APIs expõem o código; o texto é da tela.
- A emissão de OPs (`POST /api/ordens`) é **idempotente pela origem**: repetir devolve a OP que já existe; produzir
  de novo um item usa `substitui`. Uma origem nunca tem duas OPs ativas (ROTEIRO, seção 3.5).
- Regras de negócio (estados da OP, validação de receita, sequenciamento, qualidade, OEE) ficam em
  `packages/dominio`, com testes, sem depender de banco nem de rede.
- Back-end em TypeScript rodando direto no Node 24: só sintaxe "apagável" (sem `enum`, `namespace`, propriedades no
  construtor) e imports com extensão `.ts`.
- Sem pagamento real; dados pessoais só o nome do cliente. Sem login e sem papéis: ninguém se identifica nas telas
  e os registros feitos por elas ficam sem autor (o MES assina `MES` no que ele mesmo faz).
- Commit só quando pedido. Mensagens de commit em português.

## Mapa

| Onde | O quê |
|---|---|
| `packages/dominio` | receita e faixas, máquina de estados da OP, sequenciamento, estimativa de ciclo por rodadas, qualidade, OEE; tipos do contrato Loja↔MES (`integracao.ts`) |
| `packages/contrato-clp` | layout do DB `MES`, conversão de bytes, aperto de mão (`aperto.ts`), códigos de alarme e de recusa (`codigos.ts`), fonte para o TIA |
| `packages/servidor` | o comum aos dois back-ends: banco, SSE, utilidades das rotas, tela servida pelo processo (`tela.ts`), `/api/sistema` |
| `packages/interface` | o comum às duas telas: API, SSE, formatação, componentes (botões, campos, avisos, diálogos), gráficos em SVG, estilo, tema claro/escuro, idioma, textos comuns, topo com o nome do sistema |
| `apps/loja/api` | a Loja (ERP): catálogo, clientes, pedidos, faturas, vitrine (`erp.ts`), cliente HTTP do MES (`cliente-mes.ts`), feed de mudanças (`mudancas.ts`) |
| `apps/loja/web` | a tela da Loja (React + Vite): vitrine, acompanhamento, certificado, pedidos, catálogo, reiniciar a aula |
| `apps/mes/api` | o MES: ordens, fila, despacho (laço com o CLP, `despacho.ts`), qualidade, paradas, indicadores; contrato com a Loja (`integracao.ts`); configuração da bancada e reiniciar o MES (`administracao.ts`) |
| `apps/mes/web` | a tela do MES (React + Vite): fila, bancada, qualidade, indicadores, detalhe da OP, configuração |
| `apps/gateway` | drivers `simulado` (imita o programa do CLP) e `s7` (nodes7); HTTP para o MES; servidor S7 de teste (`src/teste/`) |
| `docker/banco` | script da primeira subida do MySQL: bases `loja` e `mes` e os dois usuários |
| `docs/` | instalação, programa do CLP, DB `MES` para o TIA |

## Comandos

- `npm install`: instala tudo (workspaces).
- `npm test`: testes de `packages/*` e `apps/*` (sem bancada, sem banco).
- `npm run tipos`: checagem de tipos (`tsc --noEmit`).
- `npm run build`: compila as duas telas (`apps/loja/web/dist`, `apps/mes/web/dist`).
- Nome do projeto Compose: `loja-mes-aubot4000` (fixo no `docker-compose.yml`, não depende da pasta): contêineres
  `loja-mes-aubot4000-<serviço>-1`, volume `loja-mes-aubot4000_dados-banco`.
- `docker compose up -d --build`: sobe `banco`, `gateway`, `mes` e `loja` (Loja em http://localhost:8080, MES em
  http://localhost:8081; outras portas com `PORTA_LOJA` e `PORTA_MES`). `docker compose ps` mostra os quatro
  `healthy`; `GET /api/saude` de cada sistema mostra a base dele e o vizinho (MES na Loja, gateway no MES).
- Desenvolvimento sem Docker: `npm run dev:gateway`, `dev:mes`, `dev:loja` (back-ends) e `dev:mes-web`,
  `dev:loja-web` (Vite, com proxy de `/api`). Precisa de um MySQL com as bases de `docker/banco/01-bases.sql`.
- `npm run ponta-a-ponta -- <url-da-loja> <url-do-mes>`: teste de ponta a ponta com a pilha no ar e o simulador
  (reinicia a aula; para e sobe o contêiner `mes` para conferir a recusa do pedido; `--sem-docker` pula isso).
  Pilha subida com outro nome de projeto (`docker compose -p <nome>`): informe o nome em `COMPOSE_PROJECT_NAME`.
- `npm run db-mes`: gera `docs/clp/MES.db` do contrato.
- `npm run manuais`: gera os PDFs dos manuais de `docs/` em `docs/pdf/` (ver `.claude/skills/gerar-manuais`).
