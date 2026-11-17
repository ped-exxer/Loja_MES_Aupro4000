# Uma imagem por serviço, todas a partir da mesma base (monorepo com npm workspaces).

FROM node:24-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/dominio/package.json packages/dominio/
COPY packages/contrato-clp/package.json packages/contrato-clp/
COPY apps/api/package.json apps/api/
COPY apps/gateway/package.json apps/gateway/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY . .

FROM base AS api
CMD ["node", "apps/api/src/main.ts"]

FROM base AS gateway
CMD ["node", "apps/gateway/src/main.ts"]

FROM base AS web-build
RUN npm run build -w @loja/web

FROM nginx:1.27-alpine AS loja-web
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/apps/web/dist /usr/share/nginx/html
