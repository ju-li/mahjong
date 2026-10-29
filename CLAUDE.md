# CLAUDE.md

Guidance for Claude Code (claude.ai/code) in this repo.

MCR (Chinese Official) + Hong Kong mahjong PWA. Two modes: solo vs bots in browser, or online tables (4-letter code, bots fill empty seats) on Colyseus server. Accounts optional; only add friends, history, stats, leaderboards.

# Commands

pnpm workspace (pnpm 12, Node 22). Run from repo root:

- `pnpm dev` — web app (Vite). `pnpm dev:server` — game server on :2567 (`tsx watch`). Web dev connects to `ws://<host>:2567` by default.
- `pnpm test` / `pnpm typecheck` — all packages (`vitest run`, `tsc --noEmit` / `vue-tsc -b`).
- `pnpm build` → `apps/web/dist`. `pnpm build:server` → `apps/server/dist/server.mjs` + `migrate.mjs` (esbuild bundles).
- One package / file / test: `pnpm --filter @mahjong/engine test scoring`, `pnpm --filter server test room -t 'kick'`. Package names: `web`, `server`, `@mahjong/engine`, `@mahjong/bots`, `@mahjong/protocol`.

Server tests need no DB setup: `apps/server/src/db/testDb.ts` starts migrated PGlite behind real Postgres socket. No `DATABASE_URL` / `LOGTO_ENDPOINT` / `LOGTO_API_RESOURCE` → server runs with accounts off. No `SMTP_HOST` → feedback returns 503.

# SPEC.md

`SPEC.md` = source of truth for behaviour: §C constraints, §I interfaces (APIs, wire messages, DB schema, UI), §V numbered invariants, §T tasks, §B bugs. Written in compressed "caveman" notation (`⊥` = never/not, `!` = must, `∀`, `∴`). `ck:spec`, `ck:build`, `ck:check`, `ck:backprop` skills operate on it. Behaviour change → update SPEC.md with code. Tests cite invariants (`V1`, `V33`…). `docs/backend.md` = backend decision record; `docs/house-rules.md` = house-rules plan.

# Architecture

```
packages/engine    pure rules: tiles, deal, legalActions/applyAction reducer, scoring (mcr + hk), Match
packages/bots      bot strategy + timeoutAction, pure TS on top of engine
packages/protocol  room codes, client/server message types, shared constants
apps/web           Vue 3 SPA (no SSR); solo bots run in a Web Worker
apps/server        Colyseus 0.18 server, authoritative for online tables; Kysely + pg
```

Packages export `./src/index.ts` directly — no build step; apps compile from source.

- **Engine is the single source of truth for rules.** Web, bots, server never reimplement rules; call `legalActions` / `applyAction` / `viewFor` / scoring. State JSON-serializable, `applyAction` pure → `replay(init, actions)` deterministic.
- **Engine purity is enforced.** No browser/Node globals, timers, `Math.random`, `Date.now` (randomness via seeded `mulberry32`/`shuffle`). tsconfig `lib` = `ES2022`, no DOM. `apps/web/src/engine-purity.test.ts` scans engine source for violations. Web's `vue-tsc` also typechecks engine source → engine must use `import type`, no `enum`, no `namespace`.
- **Rule sets dispatch by `RuleSet` (`'mcr' | 'hk'`).** `scoreFor`, `settleFor`, `fansFor` etc. pick implementation; hk fan ids prefixed `hk.`. House rules (`house.ts`) = closed option lists per rule set; `normalizeHouseRules` only validator for storage, network, DB input.
- **Hidden information.** Clients only get `viewFor(state, seat)` (`PlayerView`); online, server holds only full `Match`. Solo results untrusted (browser has wall) → player's own history only, never leaderboards.
- **One table UI, two sources.** `apps/web/src/game/source.ts` defines `MatchSource`; `useMatch` (local, bots via `bots/bot.worker.ts`) and `useOnline` (server snapshots) both implement it; `GameTable.vue` renders either.
- **Server layering.** `table.ts` (`Table`) = transport-free table logic — seats, bots, timers, hop-in/hop-out, kicks — time, randomness, tokens injected via `TableEnv` so tests drive directly. `room.ts` (`TableRoom`) wraps it in Colyseus room; `social.ts` (`SocialRoom`) handles friends, presence, invites via Colyseus Presence (`socialBus.ts`). Tables in memory only; redeploy ends open tables. `matchRecorder.ts` persists finished matches, updates OpenSkill ratings.
- **Services are optional.** `services.ts` holds `db` and token `verify`; either may be absent, play must still work. Server only DB client; browsers never touch Postgres.
- **Migrations** listed in code in `apps/server/src/db/migrations.ts` (so they bundle). Never edit shipped migration; add new one. Tables in `mahjong` schema (first on search path).
- **i18n:** `en` and `zh-Hans` in `apps/web/src/i18n/messages.ts` (key-parity test). zh strings may carry `{t:term}` tokens resolved per player terminology (`terms.ts`). Engine holds fan names in both languages, no other UI strings.
- **Voice callouts:** recorded mp3s per seat in `apps/web/src/assets/callouts/`. Adding phrase to `calloutVocab.ts` requires clips for all four seats (test checks). Regenerate with `pnpm --filter web gen:callouts` (needs `ELEVENLABS_API_KEY`, ffmpeg; see `apps/web/README.md`).

# Branches and deploys

- `main` = integration branch. Branch from `main`, open PRs into `main`.
- `prod` = what Railway deploys. Server pre-deploy step runs `node migrate.mjs` → merge into `prod` migrates production DB. `prod` only takes PRs from `main`; `prod-from-main` check fails any other.
- Never branch from `prod`, push to it, or open PR into it from anything but `main`, even when asked. Say so, propose going through `main` instead. Urgent fix: fix → `main` → `prod`; point out `main` → `prod` PR also ships everything else waiting on `main`.
- Fetch before comparing branches (`git fetch origin main prod`): cloud session remote-tracking refs can be days old.
- Railway services (`web`, `server`, `logto`, Postgres) configured by hand in dashboard; no Config as Code. Both Dockerfiles build from repo root.