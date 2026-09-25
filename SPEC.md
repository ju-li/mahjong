# SPEC

## §G GOAL
MCR (Chinese Official) mahjong web game. v0 = static site, no sign-up, 1 human vs 3 bots, adjustable difficulty. Current phase: scaffold monorepo + MCR tile model only.

## §C CONSTRAINTS
- pnpm workspace monorepo. `pnpm-workspace.yaml` → `apps/*`, `packages/*`.
- `packages/engine` (`@mahjong/engine`): pure TS. ⊥ DOM, ⊥ framework, ⊥ network, ⊥ browser/Node APIs. Portable → future Colyseus server + Capacitor apps.
- engine `exports` → `./src/index.ts`. ⊥ build step.
- engine tsconfig `lib` = `["ES2022"]` only. ⊥ `"DOM"`.
- engine deterministic. ∀ randomness via seedable PRNG. ⊥ `Math.random`, ⊥ `Date.now` in engine.
- `apps/web` (pkg `web`): Vite + Vue 3 + TS SPA. client-only, ⊥ SSR. DOM/CSS render, ⊥ canvas engine.
- bots run in Web Worker inside `apps/web`, import engine.
- Vitest for engine tests.
- engine src also typechecked by web's vue-tsc (`verbatimModuleSyntax`, `erasableSyntaxOnly`, `noUnusedLocals`) ∴ engine ! use `import type` for types, ⊥ `enum`, ⊥ `namespace`.
- scope now: scaffold + tile model. ⊥ hand eval, ⊥ melds, ⊥ 81 fan, ⊥ scoring, ⊥ bot strategy.
- future (not now): Capacitor iOS/Android, PocketBase accounts/leaderboards, Colyseus authoritative multiplayer.

## §I INTERFACES
- pkg: `@mahjong/engine` → `src/index.ts` re-exports all public symbols.
- api: `Suit` = `'characters'|'dots'|'bamboo'|'winds'|'dragons'|'flowers'`.
- api: `TileKind` = suited `{suit, rank: 1..9}` | wind `{suit:'winds', wind: 'E'|'S'|'W'|'N'}` | dragon `{suit:'dragons', dragon: 'red'|'green'|'white'}` | flower `{suit:'flowers', flower: 1..8}` (1–4 flowers, 5–8 seasons).
- api: `Tile` = `{ id: number, kind: TileKind }`. `id` unique per physical tile ∈ 0..143.
- api: `PLAYABLE_KINDS` → 34 kinds. `FLOWER_KINDS` → 8 kinds. `tileKey(kind)` → stable string key.
- api: `createWall(): Tile[]` → 144 tiles, fixed canonical order.
- api: `mulberry32(seed: number): () => number` → floats ∈ [0,1).
- api: `shuffle<T>(items: readonly T[], seed: number): T[]` → new array, input unmutated.
- cmd: root `pnpm dev` → `pnpm --filter web dev`.
- cmd: root `pnpm build` → `pnpm --filter web build` → `apps/web/dist`.
- cmd: root `pnpm test` → `pnpm -r test`. ! terminate (non-watch).
- cmd: root `pnpm typecheck` → `pnpm -r typecheck`.
- worker: `apps/web/src/bots/bot.worker.ts`. msg in `any` → reply `{ echo, wallSize }`.
- ui: `App.vue` spawns worker via `new Worker(new URL('./bots/bot.worker.ts', import.meta.url), { type: 'module' })`, shows reply.

## §V INVARIANTS
V1: engine src ⊥ ref to `window`, `document`, `self`, `navigator`, `fetch`, `Math.random`, `Date.now`, Node builtins.
V2: engine tsconfig `lib` ∌ `"DOM"`; engine typecheck ! pass under that lib.
V3: `createWall()` length = 144.
V4: `createWall()` non-flower count = 136; ∀ kind ∈ `PLAYABLE_KINDS` → exactly 4 copies; `PLAYABLE_KINDS` length = 34.
V5: `createWall()` flowers = 8, all distinct kinds.
V6: ∀ tile ∈ wall → `id` unique.
V7: `shuffle(x, s)` deep-equal `shuffle(x, s)` ∀ seed s.
V8: `shuffle(x, s1)` ≠ `shuffle(x, s2)` for s1 ≠ s2 (test w/ wall + ≥1 seed pair).
V9: `shuffle` ⊥ mutate input; output = permutation of input.
V10: root `pnpm test`, `pnpm typecheck`, `pnpm build` ! exit 0; build → `apps/web/dist`.
V11: engine ⊥ TS `enum`/`namespace`; type-only imports use `import type`.

## §T TASKS
id|status|task|cites
T1|x|verify user steps 1–5 (git, root `package.json`, `.gitignore`, `pnpm-workspace.yaml`, vite app, engine `package.json`/`tsconfig.json`); report diffs. known: root `package.json` has placeholder `test`, stray `main: index.js`; engine has 0 devDeps & empty `src/`; engine `test: vitest` = watch in TTY ∴ change → `vitest run`|V2,I.cmd
T2|x|engine tile model: `src/tiles.ts` (`Suit`, `TileKind`, `Tile`, `PLAYABLE_KINDS`, `FLOWER_KINDS`, `tileKey`, `createWall`)|V1,V3,V4,V5,V6,V11,I.api
T3|x|engine PRNG: `src/rng.ts` (`mulberry32`, `shuffle` Fisher–Yates)|V1,V7,V8,V9,V11,I.api
T4|.|`src/index.ts` re-export all; `src/tiles.test.ts` + `src/rng.test.ts` cover V3–V9|V3,V4,V5,V6,V7,V8,V9
T5|x|deps: engine devDeps `vitest`, `typescript`; web dep `"@mahjong/engine": "workspace:*"`; `pnpm install`|V2,I.pkg
T6|.|`apps/web/src/bots/bot.worker.ts` import engine, reply `{ echo, wallSize }`; `App.vue` spawn worker & render reply; drop `HelloWorld` scaffold|C.worker,I.worker,I.ui
T7|.|root scripts `dev`/`build`/`test`/`typecheck`; web `typecheck: vue-tsc -b`; clean root `package.json` placeholders|V10,I.cmd
T8|.|verify: `pnpm test`, `pnpm typecheck`, `pnpm build` exit 0; `apps/web/dist` exists; dev page shows worker reply (headless check)|V10

## §B BUGS
id|date|cause|fix
