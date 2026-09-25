# SPEC

## §G GOAL
MCR (Chinese Official) mahjong web game. v0 = static site, no sign-up, 1 human vs 3 bots, adjustable difficulty. Current phase: v0 hardening → verified scoring, official seating, bilingual UI (en / zh-Hans), play polish, offline PWA.

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
- scope now: v0 hardening. ⊥ accounts, ⊥ network play, ⊥ mobile shell.
- roadmap order (fixed): hardening → multiplayer (Colyseus) → accounts & leaderboards (PocketBase) → Capacitor apps.
- leaderboards ! multiplayer only (server-authoritative results). ⊥ single-player / bot results on leaderboards.
- rules: MCR (Chinese Official, 81 fan). win ! ≥ 8 fan excl flower fan. no dead wall; replacement draws (flower, kong) from wall back end. wall empty → drawn hand, 0 payment.
- seating: official MCR re-seating at each prevailing-wind round boundary (pattern per rulebook, source cited in code). dealer rotates every hand, ⊥ dealer repeat.
- final discard (wall empty) → claimable only for win.
- v0 simplification: ⊥ false-win penalty (UI offers only legal actions).
- i18n: UI languages `en` & `zh-Hans`. tile faces stay traditional glyphs (萬 筒 條 東 發). engine holds fan names in both; ⊥ other UI strings in engine.
- engine = single source of truth for rules. web & bots ⊥ reimplement rules; call engine only. same reducer → future Colyseus server.
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
- api: `Seat` = 0..3. `SeatWind` = `Wind`. `Meld` = `{ type: 'chow'|'pung'|'kong', tiles: Tile[], exposed: boolean, from?: Seat }`.
- api: `GameState` (hand-level): wall, hands, melds, discards, flowers, turn, phase, dealer, prevailingWind, seed, pending claims. JSON-serializable.
- api: `Action` = `draw` | `discard{tileId}` | `chow{tileIds}` | `pung` | `kong{tileIds?}` (exposed/concealed/promoted) | `win` | `pass`. each tagged w/ `seat`.
- api: `newHand({ seed, dealer, prevailingWind }): GameState` → shuffled, dealt (13 each, dealer 14), flowers replaced.
- api: `legalActions(state, seat): Action[]`. `applyAction(state, action): GameState` (throws on illegal).
- api: `replay(init, actions): GameState`.
- api: `viewFor(state, seat): PlayerView` → own concealed tiles; others' melds, discards, flowers, concealed counts; wall count only.
- api: `decompose(tiles)` → standard (4 sets + pair) | seven pairs | thirteen orphans | knitted forms. `shanten(tiles, melds): number` (-1 = complete).
- api: `scoreHand(winCtx): { fans: {name, points, count}[], total, flowerPoints }`. `settle(winCtx, score): number[4]` point deltas.
- api: `Match` (16 hands, 4 prevailing winds × 4): `newMatch(seed)`, `nextHand(match, result)`, cumulative scores per player.
- api: `Match.seating` / `seatOf(match, player)` / `playerAt(match, seat)`: player ↔ table seat for current round. players 0..3 fixed identities; seats change per round.
- worker: `apps/web/src/bots/bot.worker.ts`. in `{ view: PlayerView, legal: Action[], difficulty: 'easy'|'medium'|'hard', seed }` → out `{ action }`.
- ui: table (4 seats, discards, melds, flowers), own hand, claim prompts, win screen w/ fan breakdown, difficulty picker, new match. match saved to `localStorage`.
- ui: language toggle `en` ↔ `zh-Hans`, persisted; defaults from `navigator.language`.
- ui: fan reference page: all 81 fans, points, description, exclusions, both languages.
- ui: claim timer (default 10 s, setting incl off) → auto-pass. keyboard play for every human action. tile animations & sound (toggle; respect `prefers-reduced-motion`).
- pwa: web app manifest + service worker; installable; plays offline after first load.
- deploy: `apps/web/Dockerfile` (repo-root context, Caddy serves `dist` on `$PORT`). Railway service `web` configured manually in dashboard; ⊥ Config as Code, ⊥ IaC.

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
V12: ∀ reachable state → wall + hands + melds + discards + flowers hold each tile id 0..143 exactly once.
V13: `replay(init, actions)` deterministic: same (seed, actions) → deep-equal state.
V14: `applyAction` ⊥ mutate input state.
V15: action ∉ `legalActions(state, seat)` → `applyAction` throws; state unchanged.
V16: `viewFor(s, k)` ∌ other seats' concealed tile ids/kinds & ∌ wall order.
V17: chow claim legal only for seat (discarder + 1) mod 4.
V18: claim priority win > pung/kong > chow. multiple win claims → nearest seat after discarder (head bump) only.
V19: at discard decision: concealed + melded tiles = 14, each kong counted as 3.
V20: flower ⊥ in concealed hand at any decision point; always set aside & replaced from wall back.
V21: `win` legal only if `scoreHand` total excl flowers ≥ 8.
V22: fan exclusion rules (non-repeat, non-separation, non-identical, account-once) → reference hands score = expected total.
V23: `settle` deltas sum = 0. discard win: discarder −(8+fan), other two −8. self-draw: each −(8+fan).
V24: `shanten` = −1 ⇔ `decompose` finds ≥1 complete form.
V25: bots see only `PlayerView`; bot action ∈ `legal`; same (view, legal, difficulty, seed) → same action.
V26: web & worker ⊥ own rule logic; legality & scoring only via engine.
V27: ∀ prevailing-wind round → each player deals exactly once; seating changes only at round boundaries; each player sits each seat wind exactly once per match.
V28: wall empty → claim options on a discard ⊆ {win, pass}.
V29: en & zh-Hans dictionaries have identical key sets; ∀ UI string rendered via dictionary; ∀ 81 fans have en & zh names + descriptions.
V30: engine totals match ≥ 20 externally sourced scored example hands; each example cites its source.
V31: claim-timer expiry issues only `pass`, and only when `pass` ∈ `legalActions`.
V32: ∀ human action reachable by keyboard alone.
V33: engine src ⊥ browser/Node globals, enforced by automated test (not manual grep).
V34: 1 concealed kong + 1 melded kong → `concealedKongAndMeldedKong` 5 (replaces `concealedKong` + `meldedKong`), per reference calculator.
V35: `fourConcealedPungs` excludes `fullyConcealedHand`; self-drawn 4 concealed pungs score `selfDrawn` 1.
V36: wait fans (edge/closed/single) need exactly one completing kind by shape; kinds whose 4 copies the player holds still count as waits.
V37: knitted straight + chow(s) + suited pair → `allChows` (knitted straight counts as chows).
V38: `nineGates` cancels exactly one `pungOfTerminalsOrHonors`; others still count.

## §T TASKS
id|status|task|cites
T1|x|verify user steps 1–5 (git, root `package.json`, `.gitignore`, `pnpm-workspace.yaml`, vite app, engine `package.json`/`tsconfig.json`); report diffs. known: root `package.json` has placeholder `test`, stray `main: index.js`; engine has 0 devDeps & empty `src/`; engine `test: vitest` = watch in TTY ∴ change → `vitest run`|V2,I.cmd
T2|x|engine tile model: `src/tiles.ts` (`Suit`, `TileKind`, `Tile`, `PLAYABLE_KINDS`, `FLOWER_KINDS`, `tileKey`, `createWall`)|V1,V3,V4,V5,V6,V11,I.api
T3|x|engine PRNG: `src/rng.ts` (`mulberry32`, `shuffle` Fisher–Yates)|V1,V7,V8,V9,V11,I.api
T4|x|`src/index.ts` re-export all; `src/tiles.test.ts` + `src/rng.test.ts` cover V3–V9|V3,V4,V5,V6,V7,V8,V9
T5|x|deps: engine devDeps `vitest`, `typescript`; web dep `"@mahjong/engine": "workspace:*"`; `pnpm install`|V2,I.pkg
T6|x|`apps/web/src/bots/bot.worker.ts` import engine, reply `{ echo, wallSize }`; `App.vue` spawn worker & render reply; drop `HelloWorld` scaffold|C.worker,I.worker,I.ui
T7|x|root scripts `dev`/`build`/`test`/`typecheck`; web `typecheck: vue-tsc -b`; clean root `package.json` placeholders|V10,I.cmd
T8|x|verify: `pnpm test`, `pnpm typecheck`, `pnpm build` exit 0; `apps/web/dist` exists; dev page shows worker reply (headless check)|V10
T9|x|rm `apps/web/railway.json` (dead: service can't use Config as Code)|I.deploy
T10|x|engine state types: `Seat`, `Meld`, `GameState`, `Action`; `newHand` deal + flower replacement|V12,V13,V19,V20,I.api
T11|x|engine turn loop: `legalActions` + `applyAction` for draw, discard, pass, wall exhaustion. win stub = never legal|V12,V13,V14,V15,V19
T12|x|engine claims: chow/pung/exposed kong on discard, concealed & promoted kong, replacement draw, claim window & priority|V12,V15,V17,V18,V19,V20
T13|x|engine `viewFor` + `replay`; property test: random legal play ∀ 200 seeds keeps V12, V19, V20|V12,V13,V16,V19,V20
T14|x|worker protocol → `{ view, legal, difficulty, seed }` → `{ action }`; placeholder bot = seeded random legal action|V25,V26,I.worker
T15|x|UI playable slice: table, own hand, click-to-discard, claim buttons from `legalActions`, bots via worker, hand ends on exhaustion|V26,I.ui
T16|x|engine `decompose` + `shanten` (standard, seven pairs, thirteen orphans, knitted forms)|V24,I.api
T17|x|engine fan framework: win context, fan table (81 entries), exclusion rules; wire `win` legality via shape + (temp) ⊥ 8-fan check|V21,V22
T18|x|engine fans 88 → 6 pt|V22
T19|x|engine fans 4 → 1 pt + flowers|V22
T20|x|reference-hand suite (≥30 hands from official rules/examples); enforce 8-fan min; `settle`|V21,V22,V23
T21|x|engine `Match`: 16 hands, prevailing wind progression, dealer rotation, cumulative scores|V13,V23,I.api
T22|x|bots easy/medium/hard: shanten-based discard, useful-tile count, claim heuristics, 8-fan awareness, defense (hard)|V25,V26
T23|x|UI full: win screen fan breakdown, scores, difficulty picker, new match, `localStorage` resume|V26,I.ui
T24|x|source ≥ 20 scored MCR example hands (official rulebook / WMO / reputable calculator), cite each; add to reference suite; mismatches → `/ck:spec bug:`|V22,V30
T25|x|V1 enforcement test: scan engine src for browser/Node globals (web vitest, `import.meta.glob` raw); rename `window` locals in `rules.ts`|V1,V33
T26|.|engine official re-seating: `Match.seating`, `seatOf`, `playerAt`; scores per player; UI maps human by player not seat|V27,V13,V23,I.api
T27|.|test last-discard rule explicitly (claims ⊆ win/pass when wall empty)|V28
T28|.|i18n: `en` + `zh-Hans` dictionaries, toggle, persistence, locale default; engine fan table gains zh descriptions; key-parity test|V29,I.ui
T29|.|fan reference page (81 fans, points, description, exclusions, bilingual), linked from result dialog|V29,I.ui
T30|.|claim timer (setting, auto-pass) + keyboard play (tile focus/arrow keys, action shortcuts)|V31,V32,I.ui
T31|.|tile animations + sound effects, toggle, reduced-motion respected|I.ui
T32|.|PWA: manifest, icons, service worker precache; offline smoke test|I.pwa

## §B BUGS
id|date|cause|fix
B1|2026-09-25|1 concealed + 1 melded kong scored 2+1; reference scores combination 5 (明暗杠)|V34
B2|2026-09-25|`fourConcealedPungs` kept `fullyConcealedHand` (4); reference gives `selfDrawn` (1)|V35
B3|2026-09-25|wait uniqueness ignored kinds fully held by player ∴ extra `singleWait`; reference counts shape waits|V36
B4|2026-09-25|`allChows` only checked standard form; reference counts knitted straight as chows|V37
B5|2026-09-25|`nineGates` excluded every terminal pung; reference cancels one|V38
