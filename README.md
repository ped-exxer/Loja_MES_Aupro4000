# AUPRO4000: Loja (ERP) e MES

Loja de aula em cima da bancada **AUPRO4000** (Exxer, CLP S7-1200), em **dois sistemas**: na **Loja** (o ERP) o aluno
compra uma batelada de água aquecida e a Loja emite a ordem de produção; o **MES** sequencia a fila e entrega ao CLP
um pedido por vez, e a bancada produz. Qualidade, rastreabilidade, certificado e OEE no fim. Tudo offline, num
`docker compose up`: Loja em http://localhost:8080, MES em http://localhost:8081.

- **Por que e o quê:** [ROTEIRO.md](ROTEIRO.md)
- **Instalar e configurar:** [docs/instalacao.md](docs/instalacao.md)
- **Programa do CLP:** [docs/programa-clp.md](docs/programa-clp.md) e o DB para o TIA Portal em [docs/clp/MES.db](docs/clp/MES.db)
- **Para agentes de IA:** [AGENTS.md](AGENTS.md)

## Rápido

```
docker compose up -d --build     # Loja: http://localhost:8080   MES: http://localhost:8081
```

| Serviço | O quê |
|---|---|
| `loja` | API do ERP + tela da Loja (vitrine, pedidos, faturas, catálogo, certificado) |
| `mes` | API do MES + tela do MES (fila, bancada, qualidade, indicadores, configuração da bancada) |
| `gateway` | o único que fala com o CLP (driver simulado ou S7); só o MES fala com ele |
| `banco` | um MySQL com duas bases, `loja` e `mes`, um usuário para cada |

A Loja fala com o MES só por HTTP (contrato no [ROTEIRO](ROTEIRO.md), seção 3.5).

Desenvolvimento (Node 24):

```
npm install
npm test                         # domínio, contrato do CLP, simulador, servidor, Loja
npm run tipos                    # checagem de tipos
npm run ponta-a-ponta -- http://localhost:8080 http://localhost:8081   # pilha no ar, simulador (reinicia a aula)
```
