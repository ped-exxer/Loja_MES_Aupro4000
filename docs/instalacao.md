# Guia de instalação

A AUPRO4000 roda **offline**, num PC da escola na mesma rede da bancada. São **dois sistemas, em dois endereços**:
a **Loja** (vitrine, pedidos, faturas, catálogo) e o **MES** (fila, bancada, qualidade, indicadores, configuração da
bancada). Uma instalação atende uma bancada.

```
 navegador ──▶ Loja :8080 ──HTTP──▶ MES :8081 ──HTTP──▶ gateway ──S7 PUT/GET (porta 102)──▶ CLP
                  │                    │
                  └─ base "loja"       └─ base "mes"        (um MySQL, um usuário para cada base)
```

## 1. O que precisa

- Windows 10/11 ou Linux, com o **Docker** instalado (Docker Desktop no Windows).
- Rede com a CPU S7-1200 da bancada (só para usar a bancada física; com o simulador, não precisa).

## 2. Subir

Na pasta do projeto:

```
docker compose up -d --build
```

| Sistema | Endereço | Quem usa |
|---|---|---|
| Loja | **http://localhost:8080** | clientes (vitrine), vendas, professor (catálogo, reiniciar a aula) |
| MES | **http://localhost:8081** | PCP (fila), bancada, qualidade, indicadores, professor (configuração da bancada) |

Nos outros computadores da sala: `http://<ip-do-pc>:8080` e `http://<ip-do-pc>:8081`. Cada tela tem no topo o nome do
sistema ("AUPRO4000 · Loja" ou "AUPRO4000 · MES") e um botão para abrir o outro.

- Outras portas: variáveis `PORTA_LOJA` e `PORTA_MES` (PowerShell: `$env:PORTA_LOJA='8090'; $env:PORTA_MES='8091';
  docker compose up -d --build`). O link de um sistema para o outro usa o mesmo endereço da página com a porta do
  outro; se precisar de outro endereço (um nome na rede, por exemplo), defina `MES_URL_PUBLICA` e `LOJA_URL_PUBLICA`.
- Parar: `docker compose down`. Os dados ficam no volume `dados-banco`.
- Conferir: `docker compose ps` mostra os quatro serviços (`loja`, `mes`, `gateway`, `banco`) como `healthy`.
  `http://localhost:8080/api/saude` mostra a Loja, a base dela e se o MES responde; `http://localhost:8081/api/saude`
  mostra o MES, a base dele e se o gateway responde.
- Teste completo com o simulador: `npm run ponta-a-ponta -- http://localhost:8080 http://localhost:8081`. Precisa do
  Node 24 instalado e **reinicia a aula**: use antes da aula, não durante. Ele para o contêiner `mes` por alguns
  segundos (para conferir que a Loja recusa pedidos sem o MES) e sobe de novo; sem docker à mão, `--sem-docker`.
  Se a pilha foi subida com outro nome de projeto (`docker compose -p <nome> up`), informe o mesmo nome na variável
  `COMPOSE_PROJECT_NAME` ao rodar o teste.

**Se o MES cair**, a Loja continua no ar: mostra o catálogo com um aviso e **recusa os pedidos** com uma mensagem
clara (nada fica gravado pela metade). Quando o MES volta, a Loja retoma de onde parou (faturas e andamento).

## 3. Primeira configuração

Sem login e sem papel.

**No MES → Configuração** (a bancada):

- **Fábrica: Simulador** já vem ligado. Serve para aprender, demonstrar e testar sem a bancada. A velocidade
  (padrão 20×) faz uma batelada de ~15 min durar menos de 1 min.
- **Fábrica: Bancada (S7)**: informe o IP da CPU, rack 0 e slot 1, clique em **Procurar DBs pela assinatura** e
  depois em **Salvar**. A caixa "Gateway" tem que mostrar "Conectado" e "Assinatura do DB MES conferida".
- **Reiniciar o MES** apaga só as ordens e os registros do MES (os pedidos da Loja ficam sem produção).

**Na Loja → Configuração**:

- **Catálogo**: produtos, preços, receitas e tolerâncias.
- **Reiniciar a aula** apaga os pedidos, clientes e faturas da Loja e manda o MES apagar as ordens e os registros
  dele (marca o início da aula, para o OEE). O catálogo e a configuração da bancada ficam. Se o MES não responder,
  nada é apagado. É este o botão do começo da aula.

## 4. A CPU da bancada

Veja [programa-clp.md](programa-clp.md). Em resumo:

- Propriedades da CPU → Protection & Security → **"Permit access with PUT/GET communication from remote partner"**
  marcado, e a configuração de hardware carregada. Sem isso, toda leitura volta com o erro 16#8104.
- O DB `MES` ([clp/MES.db](clp/MES.db)) importado, **sem** "Optimized block access".
- Para o MES (e a vitrine) mostrarem temperatura e nível ao vivo, informe também o número do DB `MB_Simulador` (o
  "Procurar" acha os dois).

> **Atenção (segurança):** com o PUT/GET ligado, **qualquer computador da rede** lê e escreve a memória do CLP.
> Numa bancada de escola é aceitável, mas mantenha a bancada numa rede só do laboratório, sem acesso da internet.

## 5. Rede

- Só a **Loja** e o **MES** publicam portas no PC (8080 e 8081). O `gateway` e o `banco` ficam só na rede interna do
  Compose.
- A Loja fala com o MES pela rede interna (`MES_URL=http://mes:8081`); nunca com o gateway nem com a base do MES.
- O `gateway` é o único que fala com o CLP (ISO-on-TCP, porta 102). No Docker Desktop, a rede padrão (`bridge`) já
  alcança a LAN do PC. Se o gateway não conectar (veja a caixa "Gateway" na Configuração do MES):
  1. Confira se o PC alcança a CPU: `ping <ip-da-cpu>`.
  2. No Linux, use a rede do host: no `docker-compose.yml`, acrescente `network_mode: host` ao serviço `gateway`,
     troque o `GATEWAY_URL` do `mes` para `http://host.docker.internal:4000` e acrescente
     `extra_hosts: ["host.docker.internal:host-gateway"]` ao `mes`. O healthcheck do gateway continua valendo.

## 6. Backup

Os dados ficam no volume Docker `dados-banco` (um MySQL com as duas bases). Copie as duas:

```
docker compose exec -T banco mysqldump -uloja -ploja loja > backup-loja.sql
docker compose exec -T banco mysqldump -umes -pmes mes > backup-mes.sql
```

Para restaurar (com os sistemas parados, para não gravarem no meio):

```
docker compose stop loja mes
docker compose exec -T banco mysql -uloja -ploja loja < backup-loja.sql
docker compose exec -T banco mysql -umes -pmes mes < backup-mes.sql
docker compose start mes loja
```

Restaure as duas do mesmo momento: a Loja guarda o número das OPs e o ponto onde parou no feed de mudanças do MES.

As bases e os usuários são criados na primeira subida por [docker/banco/01-bases.sql](../docker/banco/01-bases.sql)
(só quando o volume está vazio). As senhas estão fixas ali e no `docker-compose.yml` (instalação offline e local).
Troque-as nos dois lugares se o PC estiver numa rede compartilhada; com o volume já criado, troque também no MySQL
(`ALTER USER`) ou recrie o volume (`docker compose down -v`, que **apaga os dados**).
