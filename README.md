# AUPRO4000: Loja (ERP) e MES

Loja de aula em cima da bancada **AUPRO4000** (Exxer, CLP S7-1200): o aluno compra uma batelada de água aquecida na
vitrine, o ERP emite a ordem de produção, o MES sequencia a fila e entrega ao CLP um pedido por vez, e a bancada
produz. Qualidade, rastreabilidade, certificado e OEE no fim. Tudo offline, num `docker compose up`.

- **Por que e o quê:** [ROTEIRO.md](ROTEIRO.md)
- **Instalar e configurar:** [docs/instalacao.md](docs/instalacao.md)
- **Programa do CLP:** [docs/programa-clp.md](docs/programa-clp.md) e o DB para o TIA Portal em [docs/clp/MES.db](docs/clp/MES.db)
- **Para agentes de IA:** [AGENTS.md](AGENTS.md)

## Rápido

```
docker compose up -d --build     # http://localhost:8080
```

Desenvolvimento (Node 24):

```
npm install
npm test                         # domínio, contrato do CLP, simulador
npm run tipos                    # checagem de tipos
npm run ponta-a-ponta -- http://localhost:8080   # com a pilha no ar e o simulador (reinicia a aula)
```
