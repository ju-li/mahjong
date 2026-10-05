# Build context: repository root (the web app depends on the workspace packages under packages/).
#   docker build -f apps/web/Dockerfile .

FROM node:24-alpine AS build
RUN npm install -g pnpm@12.6.0
WORKDIR /repo

# Install deps first so this layer is cached until a manifest or the lockfile changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/engine/package.json packages/engine/
COPY packages/bots/package.json packages/bots/
COPY packages/protocol/package.json packages/protocol/
RUN pnpm install --frozen-lockfile --filter web...

COPY packages/engine packages/engine
COPY packages/bots packages/bots
COPY packages/protocol packages/protocol
COPY apps/web apps/web
# Where browsers reach the game server, e.g. wss://mahjong-server.up.railway.app (a Railway build variable).
ARG VITE_SERVER_URL
ENV VITE_SERVER_URL=$VITE_SERVER_URL
# Public domain invite links point at, e.g. mahjong.example.com (a Railway variable; defaults to the page's own address).
ARG PUBLIC_DOMAIN
ENV VITE_PUBLIC_DOMAIN=$PUBLIC_DOMAIN
# Optional accounts (Logto). Leave unset for a build without sign-in; guests play either way.
ARG VITE_LOGTO_ENDPOINT
ENV VITE_LOGTO_ENDPOINT=$VITE_LOGTO_ENDPOINT
ARG VITE_LOGTO_APP_ID
ENV VITE_LOGTO_APP_ID=$VITE_LOGTO_APP_ID
ARG VITE_LOGTO_RESOURCE
ENV VITE_LOGTO_RESOURCE=$VITE_LOGTO_RESOURCE
# Optional: Liwan analytics event endpoint (defaults to https://a.mommymahjong.com/api/event).
ARG VITE_LIWAN_ENDPOINT
ENV VITE_LIWAN_ENDPOINT=$VITE_LIWAN_ENDPOINT
RUN pnpm --filter web build

FROM caddy:2-alpine
COPY apps/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv
