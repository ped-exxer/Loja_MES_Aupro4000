# Um alvo por serviço, todos da mesma base (monorepo com npm workspaces). Sem nginx: cada sistema (Loja, MES) é um
# processo Node que serve a própria API e a própria tela (build do Vite).

FROM node:24-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/dominio/package.json packages/dominio/
COPY packages/contrato-clp/package.json packages/contrato-clp/
COPY packages/servidor/package.json packages/servidor/
COPY packages/interface/package.json packages/interface/
COPY apps/loja/package.json apps/loja/
COPY apps/mes/package.json apps/mes/
COPY apps/gateway/package.json apps/gateway/
RUN npm ci
COPY . .

# Loja: API do ERP + tela da Loja
FROM base AS loja
RUN npm run build -w @aupro/loja
ENV PORTA=8080
EXPOSE 8080
CMD ["node", "apps/loja/api/main.ts"]

# MES: API do MES + contrato com a Loja + tela do MES
FROM base AS mes
RUN npm run build -w @aupro/mes
ENV PORTA=8081
EXPOSE 8081
CMD ["node", "apps/mes/api/main.ts"]

# Gateway: o único que fala com o CLP (driver simulado ou S7)
FROM base AS gateway
ENV PORTA=4000
CMD ["node", "apps/gateway/src/main.ts"]
