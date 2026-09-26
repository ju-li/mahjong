# Build context: repository root (the server bundles the workspace packages).
#   docker build -f apps/server/Dockerfile .

FROM node:24-alpine AS build
RUN npm install -g pnpm@12.6.0
WORKDIR /repo

# Install deps first so this layer is cached until a manifest or the lockfile changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY packages/engine/package.json packages/engine/
COPY packages/bots/package.json packages/bots/
COPY packages/protocol/package.json packages/protocol/
RUN pnpm install --frozen-lockfile --filter server...

COPY packages packages
COPY apps/server apps/server
RUN pnpm --filter server build

# One self-contained file: no node_modules needed at runtime.
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/apps/server/dist/server.mjs ./
USER node
CMD ["node", "server.mjs"]
