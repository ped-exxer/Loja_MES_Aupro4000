# Instruções para agentes de IA neste projeto

Projeto: **Loja (com ERP) e MES da bancada AUPRO4000** (Exxer). Leia o [ROTEIRO.md](ROTEIRO.md) antes de qualquer
coisa: objetivo, módulos, implantação, comunicação com o CLP, fases e decisões em aberto.

## Regras

- Responda e escreva textos de interface em **português do Brasil**. Textos da interface separados por idioma
  (pt, en, es) em `apps/web/src/i18n/`; os três têm as mesmas chaves (a tipagem obriga).
- **Não decida sozinho** o que o ROTEIRO marca como **[ABERTA]**: pergunte.
- A interface é **uma só, a Loja** (vitrine + retaguarda). No código, **ERP e MES são módulos separados** que
  conversam por interface definida (`InterfaceMes` em `apps/api/src/modulos/mes/index.ts`); um não lê as tabelas
  do outro (`erp_*` × `mes_*`).
- Tudo sobe por **Docker Compose** (`loja-web`, `api`, `gateway`, `banco`). Offline, uma Loja/MES por bancada.
- **Comunicação com o CLP: S7 PUT/GET** (S7-1200, porta 102, rack 0, slot 1), no DB `MES` não otimizado.
  - O layout do DB `MES` fica **só** em `packages/contrato-clp`; ninguém repete deslocamentos de byte fora dele.
    A fonte do DB para o TIA (`docs/clp/MES.db`) é gerada dele: `npm run db-mes`.
  - O MES escreve **só** na área de escrita do DB `MES`. **Nunca** escreve no DB `MB_Simulador` (mapa 40001–40066 do
    Simmaq 3DX), que não muda; só lê dele as variáveis de processo.
  - **O MES não comanda a bancada**: só entrega ao CLP o próximo pedido da fila, um por vez, pelo aperto de mão
    (`SeqPedido` e `EcoSeq`, seção 6.4), com o contador de vida. Queda de comunicação nunca conclui uma OP.
- A api nunca fala direto com o CLP: só pelo **gateway**. Toda fábrica (bancada física, Simmaq 3DX, simulado) é um
  driver do gateway com a mesma interface (`apps/gateway/src/driver.ts`).
- Desenvolva e teste contra o **driver simulado**; os testes não dependem da bancada nem do banco.
- Regras de negócio (estados da OP, validação de receita, sequenciamento, qualidade, OEE) ficam em
  `packages/dominio`, com testes, sem depender de banco nem de rede.
- Back-end em TypeScript rodando direto no Node 24: só sintaxe "apagável" (sem `enum`, `namespace`, propriedades no
  construtor) e imports com extensão `.ts`.
- Sem pagamento real; dados pessoais só nome e e-mail institucional. Sem login: o nome e o papel vêm em cabeçalhos
  (`x-autor`, `x-papel`) só para autoria.
- Commit só quando pedido. Mensagens de commit em português.

## Mapa

| Onde | O quê |
|---|---|
| `packages/dominio` | receita e faixas, máquina de estados da OP, sequenciamento, estimativa de ciclo, qualidade, OEE |
| `packages/contrato-clp` | layout do DB `MES`, conversão de bytes, aperto de mão (`aperto.ts`), fonte para o TIA |
| `apps/gateway` | drivers `simulado` (imita o programa do CLP) e `s7` (nodes7); HTTP para a api |
| `apps/api/src/modulos/mes` | ordens, fila, despacho (laço com o CLP, `despacho.ts`), qualidade, paradas, indicadores |
| `apps/api/src/modulos/erp` | catálogo, clientes, pedidos, faturas, vitrine |
| `apps/api/src/administracao.ts` | configuração da bancada, procurar DB, falhas do simulador, reiniciar a aula |
| `apps/web` | a Loja (React + Vite): vitrine, acompanhamento, certificado, retaguarda por papel |
| `docs/` | instalação, programa do CLP, DB `MES` para o TIA |

## Comandos

- `npm install`: instala tudo (workspaces).
- `npm test`: testes de `packages/*` e `apps/*` (sem bancada, sem banco).
- `npm run tipos`: checagem de tipos (`tsc --noEmit`).
- `docker compose up --build`: sobe `banco`, `api`, `gateway` e `loja-web` (http://localhost:8080; outra porta com
  a variável `PORTA_LOJA`). `GET /api/saude` mostra se api, banco e gateway respondem.
- `npm run ponta-a-ponta -- <url>`: teste de ponta a ponta com a pilha no ar e o simulador (reinicia a aula).
- `npm run db-mes`: gera `docs/clp/MES.db` do contrato.
