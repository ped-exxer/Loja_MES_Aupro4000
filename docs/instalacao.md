# Guia de instalação

A Loja/MES da AUPRO4000 roda **offline**, num PC da escola na mesma rede da bancada. Uma instalação atende uma
bancada.

## 1. O que precisa

- Windows 10/11 ou Linux, com o **Docker** instalado (Docker Desktop no Windows).
- Rede com a CPU S7-1200 da bancada (só para usar a bancada física; com o simulador, não precisa).

## 2. Subir

Na pasta do projeto:

```
docker compose up -d --build
```

Abra **http://localhost:8080** (ou `http://<ip-do-pc>:8080` nos outros computadores da sala).

- Outra porta: `PORTA_LOJA=8090 docker compose up -d` (no PowerShell: `$env:PORTA_LOJA='8090'; docker compose up -d`).
- Parar: `docker compose down`. Os dados ficam no volume `dados-banco`.
- Conferir: `http://localhost:8080/api/saude` deve mostrar `api`, `banco` e `gateway` como `ok`.
- Teste completo com o simulador: `npm run ponta-a-ponta -- http://localhost:8080`. Precisa do Node 24 instalado e
  **reinicia a aula**: use antes da aula, não durante.

## 3. Primeira configuração (professor)

Retaguarda → escolha o papel **Professor** e o seu nome → **Configuração**.

- **Fábrica: Simulador** já vem ligado. Serve para aprender, demonstrar e testar sem a bancada. A velocidade
  (padrão 20×) faz uma batelada de ~15 min durar menos de 1 min.
- **Fábrica: Bancada (S7)**: informe o IP da CPU, rack 0 e slot 1, clique em **Procurar DBs pela assinatura** e
  depois em **Salvar**. A caixa "Gateway" tem que mostrar "Conectado" e "Assinatura do DB MES conferida".
- **Reiniciar a aula** apaga pedidos, clientes, faturas, ordens e registros e marca o início da aula (para o OEE).
  O catálogo e a configuração ficam.

## 4. A CPU da bancada

Veja [programa-clp.md](programa-clp.md). Em resumo:

- Propriedades da CPU → Protection & Security → **"Permit access with PUT/GET communication from remote partner"**
  marcado, e a configuração de hardware carregada. Sem isso, toda leitura volta com o erro 16#8104.
- O DB `MES` ([clp/MES.db](clp/MES.db)) importado, **sem** "Optimized block access".
- Para a Loja mostrar temperatura e nível ao vivo, informe também o número do DB `MB_Simulador` (o "Procurar" acha
  os dois).

> **Atenção (segurança):** com o PUT/GET ligado, **qualquer computador da rede** lê e escreve a memória do CLP.
> Numa bancada de escola é aceitável, mas mantenha a bancada numa rede só do laboratório, sem acesso da internet.

## 5. Rede do contêiner do gateway

O `gateway` é o único que fala com o CLP (ISO-on-TCP, porta 102). No Docker Desktop, a rede padrão (`bridge`) já
alcança a LAN do PC. Se o gateway não conectar (veja a caixa "Gateway" na Configuração):

1. Confira se o PC alcança a CPU: `ping <ip-da-cpu>`.
2. No Linux, use a rede do host: no `docker-compose.yml`, acrescente `network_mode: host` ao serviço `gateway` e
   troque `GATEWAY_URL` da `api` para `http://host.docker.internal:4000` (com `extra_hosts:
   ["host.docker.internal:host-gateway"]` na `api`).

## 6. Backup

Os dados ficam no volume Docker `dados-banco` (MySQL). Para copiar:

```
docker compose exec banco mysqldump -uloja -ploja loja > backup-loja.sql
```

Para restaurar: `docker compose exec -T banco mysql -uloja -ploja loja < backup-loja.sql`.

As senhas do banco estão fixas no `docker-compose.yml` (instalação offline e local). Troque-as se o PC estiver numa
rede compartilhada.
