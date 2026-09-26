# Build context: repository root (the web app depends on the workspace packages @mahjong/engine and @mahjong/bots).
#   docker build -f apps/web/Dockerfile .

FROM node:24-alpine AS build
RUN npm install -g pnpm@12.6.0
WORKDIR /repo

# Install deps first so this layer is cached until a manifest or the lockfile changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/engine/package.json packages/engine/
COPY packages/bots/package.json packages/bots/
RUN pnpm install --frozen-lockfile --filter web...

COPY packages/engine packages/engine
COPY packages/bots packages/bots
COPY apps/web apps/web
RUN pnpm --filter web build

FROM caddy:2-alpine
COPY apps/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv
