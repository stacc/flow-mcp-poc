FROM node:22.18-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.1 --activate
WORKDIR /app

# --------- Pruner ------------
FROM base AS pruner

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
RUN pnpm install --frozen-lockfile

COPY . .

# Prune the workspace for the server component
RUN pnpm turbo prune --scope=server --docker

# --------- Server ----------
FROM base AS server

RUN apk add dumb-init
ENV NODE_ENV=production
RUN apk add --no-cache openssl

COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml

RUN NODE_ENV=development pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .

USER node
EXPOSE 3000

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "components/server/src/http-server.ts"]
