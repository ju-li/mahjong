# SPEC

## §G GOAL
MCR (Chinese Official) mahjong web game. v0 = static site, no sign-up, 1 human vs 3 bots, adjustable difficulty. Current phase: multiplayer → Jackbox-style tables: host gets a 4-letter code + share link, friends join, no sign-up needed; bots fill empty & dropped seats. Optional accounts (email, Google, Apple) add basic friends.

## §C CONSTRAINTS
- pnpm workspace monorepo. `pnpm-workspace.yaml` → `apps/*`, `packages/*`.
- `packages/engine` (`@mahjong/engine`): pure TS. ⊥ DOM, ⊥ framework, ⊥ network, ⊥ browser/Node APIs. Portable → future Colyseus server + Capacitor apps.
- engine `exports` → `./src/index.ts`. ⊥ build step.
- engine tsconfig `lib` = `["ES2022"]` only. ⊥ `"DOM"`.
- engine deterministic. ∀ randomness via seedable PRNG. ⊥ `Math.random`, ⊥ `Date.now` in engine.
- `apps/web` (pkg `web`): Vite + Vue 3 + TS SPA. client-only, ⊥ SSR. DOM/CSS render, ⊥ canvas engine.
- `packages/bots` (`@mahjong/bots`): bot strategy + `timeoutAction`. pure TS like engine. runs in Web Worker (solo) & on server (online).
- `packages/protocol` (`@mahjong/protocol`): room codes + client/server message types. shared by web & server.
- `apps/server` (pkg `server`): Node + Colyseus 0.18 (`@colyseus/core`, `@colyseus/ws-transport`). authoritative: holds the only full `Match`. tables in memory only; redeploy ends open tables. esbuild → `dist/server.mjs` + `dist/migrate.mjs`.
- backend: Railway Postgres (app DB; Logto uses its own `logto` DB on the same instance) + self-hosted Logto (OIDC) as its own Railway service. decision record → `docs/backend.md`. ⊥ BaaS (Supabase/PocketBase/Neon rejected). server = only DB client; ⊥ browser → DB. Kysely + `pg`; migrations listed in code (`apps/server/src/db/migrations.ts`), applied by Railway pre-deploy `node migrate.mjs`. realtime = Colyseus only (online status via Colyseus Presence).
- accounts optional forever: ∀ modes (solo, multiplayer) playable w/o sign-in. sign-in = Logto hosted page: email + password (verified email), Google, Apple. friends need an account.
- Vitest for engine tests.
- engine src also typechecked by web's vue-tsc (`verbatimModuleSyntax`, `erasableSyntaxOnly`, `noUnusedLocals`) ∴ engine ! use `import type` for types, ⊥ `enum`, ⊥ `namespace`.
- scope now: multiplayer + optional accounts + basic friends. ⊥ ratings/leaderboards yet, ⊥ mobile shell.
- roadmap order (fixed): hardening → multiplayer (Colyseus) → accounts & friends → leaderboards (Railway Postgres + Logto) → Capacitor apps.
- leaderboards ! multiplayer only (server-authoritative results). ⊥ single-player / bot results on leaderboards.
- rule sets: `mcr` (default) & `hk` playable; picker also lists Japanese Riichi & Taiwanese 16-tile as coming soon (disabled). switching rules → new match.
- hk: faan scoring, win ! ≥ 3 faan incl flowers, cap 13 (limit hands), half-spicy base table, discarder pays 2b / others b, self-draw each 2b. ⊥ re-seating, ⊥ dealer repeat, ⊥ heavenly/earthly hands. source: en.wikipedia.org/wiki/Hong_Kong_mahjong_scoring_rules.
- rules: MCR (Chinese Official, 81 fan). win ! ≥ 8 fan excl flower fan. no dead wall; replacement draws (flower, kong) from wall back end. wall empty → drawn hand, 0 payment.
- seating: official MCR re-seating at each prevailing-wind round boundary (pattern per rulebook, source cited in code). dealer rotates every hand, ⊥ dealer repeat.
- final discard (wall empty) → claimable only for win.
- v0 simplification: ⊥ false-win penalty (UI offers only legal actions).
- i18n: UI languages `en` & `zh-Hans`. tile faces stay traditional glyphs (萬 筒 條 東 發). engine holds fan names in both; ⊥ other UI strings in engine.
- engine = single source of truth for rules. web & bots ⊥ reimplement rules; call engine only. same reducer → future Colyseus server.
- future (not now): Capacitor iOS/Android (`@logto/capacitor`), matches/ratings (OpenSkill)/leaderboards in the same Postgres.

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
- api: `viewFor(state, seat): PlayerView` → own concealed tiles; others' melds, discards, flowers, concealed counts; wall count only. once the hand has ended: every seat's concealed tiles & concealed kongs (post-hand summary).
- api: `decompose(tiles)` → standard (4 sets + pair) | seven pairs | thirteen orphans | knitted forms. `shanten(tiles, melds): number` (-1 = complete).
- api: `scoreHand(winCtx): { fans: {name, points, count}[], total, flowerPoints }`. `settle(winCtx, score): number[4]` point deltas.
- api: `RuleSet` = `'mcr'|'hk'`. `GameState.rules`, `Match.rules`, `PlayerView.rules`. `scoreFor` / `meetsMinimumFor` / `settleFor` / `fansFor` / `fanDef` dispatch by rule set; hk fan ids prefixed `hk.`.
- api: `Match` (16 hands, 4 prevailing winds × 4): `newMatch(seed, rules?)`, `nextHand(match, result)`, cumulative scores per player.
- api: `Match.seating` / `seatOf(match, player)` / `playerAt(match, seat)`: player ↔ table seat for current round. players 0..3 fixed identities; seats change per round.
- worker: `apps/web/src/bots/bot.worker.ts`. in `{ view: PlayerView, legal: Action[], difficulty: 'beginner'|'easy'|'medium'|'hard', seed }` → out `{ action }`.
- ui: table (4 seats, discards, melds, flowers), own hand, claim prompts, win screen w/ fan breakdown, difficulty picker, new match. match saved to `localStorage`.
- ui: language toggle `en` ↔ `zh-Hans`, persisted; defaults from `navigator.language`.
- ui: fan reference page: all 81 fans, points, description, exclusions, both languages.
- ui: pause (top bar) in solo & online: bots & claim timer wait; claim countdown resumes where it stopped; moves ignored while paused.
- ui: claim timer (default 40 s: 20|40|60|120, or off) → auto-pass. keyboard play for every human action. tile animations & sound (toggle; respect `prefers-reduced-motion`).
- pwa: web app manifest + service worker; installable; plays offline after first load.
- deploy: `apps/web/Dockerfile` (repo-root context, Caddy serves `dist` on `$PORT`; build arg `VITE_SERVER_URL` = game server `wss://` URL, `PUBLIC_DOMAIN` = public web domain for invite links, passed to Vite as `VITE_PUBLIC_DOMAIN`). Railway service `web` configured manually in dashboard; ⊥ Config as Code, ⊥ IaC.
- deploy: `apps/server/Dockerfile` (repo-root context, `node server.mjs` on `$PORT`, `GET /health`; pre-deploy command `node migrate.mjs`). Railway service `server` configured manually, own public domain; `DATABASE_URL=${{Postgres.DATABASE_URL}}`.
- deploy: Railway service `logto`: pinned official `svhd/logto:<version>` image, `DB_URL` → `logto` DB, `ENDPOINT` = `https://auth.<domain>`, `ADMIN_ENDPOINT` on its own restricted domain, `TRUST_PROXY_HEADER=1`. per environment: Logto SPA app (redirect `<web origin>/callback`, post sign-out `<web origin>`), API resource = `LOGTO_API_RESOURCE`, email+password w/ email verification (SMTP connector), Google & Apple connectors. Postgres backups on.
- feedback: top bar Feedback → modal {name, email?, message} → `POST /feedback` on the game server → SMTP mail to `yuanmingongling@gmail.com`, `juli@opsinsight.ai` (override: `FEEDBACK_TO`, comma-separated). attachments: `diagnostics.json` (user agent, screen, settings, profile, last 300 console lines + uncaught errors) · `game.json` (solo: full `Match` + this hand's `handLog`; online: player's snapshot ∌ token + server's full `Table.diagnostics()` incl `handLog`). server env: `SMTP_HOST` (unset → 503), `SMTP_PORT` (587; 465 = TLS), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (default `SMTP_USER`). rate limit 5 / 10 min per IP, 50 / 10 min overall.
- cmd: root `pnpm dev:server` → server on :2567 (tsx watch); web dev defaults to `ws://<host>:2567`. `pnpm build:server` → `apps/server/dist/server.mjs`.
- auth: web `@logto/browser`, lazy `import()` only when a saved session exists (`logto:<appId>:idToken`) or the player clicks Sign in; redirect `<origin>/callback` → back to the page they were on. web build vars `VITE_LOGTO_ENDPOINT`, `VITE_LOGTO_APP_ID`, `VITE_LOGTO_RESOURCE` (unset → no account UI). server verifies access tokens (JWT) with `jose` against `${LOGTO_ENDPOINT}/oidc/jwks`, `iss = ${LOGTO_ENDPOINT}/oidc`, `aud = LOGTO_API_RESOURCE`; user id = `sub`. server env `DATABASE_URL`, `LOGTO_ENDPOINT`, `LOGTO_API_RESOURCE`; any unset → accounts off, tables unchanged.
- db: `profiles(user_id text pk = Logto sub, display_name 1..16, avatar bigint seed, friend_code unique 10 chars, created_at, updated_at)` · `friendships(user_low < user_high, requested_by, status pending|accepted, created_at, accepted_at)`, one row per pair. caps: 200 friends, 50 outgoing requests.
- net: table join option `accessToken?`; `PlayerSlot.userId` = verified `sub` | null (guest/bot); client → table `identify {accessToken | null}` (signed in/out while seated).
- net: room `social` (signed-in only; `onAuth` needs a valid token): join `{accessToken, name?, avatar?}` (name/avatar seed the profile on first sign-in; afterwards the account's win). server → client `friends: {me: {userId, name, avatar, friendCode}, friends: [{userId, name, avatar, state: incoming|outgoing|friend, online}]}` pushed on every change; `inviteResult {ok, name} | {ok: false, error}`; `friendError`. client → server `friendRequest {userId}` (reverse pending ⇒ accept) · `friendRespond {userId, accept}` · `friendRemove {userId}` · `acceptInvite {code}` · `profile {name?, avatar?}`. online = ≥ 1 open social connection (Presence hash `social:online`).
- net: table invites. each `TableRoom` records its signed-in seated players in Presence hash `social:at` (userId → code) and its seats in `social:tables` (code → `{openSeats, playing}`; openSeats = bot seats + reservations lapsed > 2 min), then refreshes those players' friends. accepted friends at a table carry `table: {code, openSeats, playing}` in `friends`. client → social `tableInvite {userId, code}` → server → sender `tableInviteResult {ok, name} | {ok: false, name | null, error: offline|full|already|notFriend|notAtTable|tooSoon}`; → invitee `tableInvite {from: {userId, name, avatar}, code}`. per-user Presence topic payload `{kind: refresh} | {kind: invite, invite}`. `friends.me.table` = code of your own table (absent at none); the table room refreshes players who sit down or leave.
- net: host → table `kick {player}`: frees the seat (lobby: empty; match: bot plays on with the score, open to newcomers, no former token), bans that seat token and verified account from the table; their socket closes with code 4006 (`KICKED_CODE`); a banned join is refused with 4006 (web: `online.error.removed`, back to solo, toast).
- ui: host removes a player: lobby seat Remove button, or player card (click a seat / table badge) "Remove from table"; both confirm first. Friends dialog in solo play: Play together on an online friend hosts a new table and invites them once `friends.me.table` shows you there (gives up after 10 s).
- ui: account name: a new account's profile starts with the guest name typed, else the sign-in name (ID token `name`, e.g. Google, else `username`); an account still called the default "Player" takes the sign-in name on connect. a name the player chose is never replaced.
- ui: toasts (bottom stack, × on each, newest last, ≤ 4): table invite received (sticky, Join, replaces earlier invite to same table, gone once at that table) · new friend request (sticky, Accept) · friend joined / left your table, invite sent / refused, other notices (auto-close 5 s). Friends dialog: friend at a table shows "At table CODE · N seats open" (or "At your table") + Join if a seat is open; at a table, online friends not at it get Invite (→ "Invited" for 20 s). lobby: "Invite a friend" under Share invite; menu at a table: "Invite a friend" (both signed in only, open Friends dialog). joining a friend's table while at another asks first.
- ui: top bar Friends button: "0 friends" until any friend, else "N online" (+ green dot if any), red badge = incoming requests; Sign in (guest) / Your account (signed in). Friends dialog: scrollable; incoming (Accept/Decline) → online → offline → sent (Cancel); Invite friends shares `?friend=CODE` link (Web Share → clipboard). guest → sign-in prompt. opening `?friend=CODE` ⇒ friends immediately (signed in) or after sign-in (code kept in sessionStorage). click another player (lobby seat, table badge) → player card: Add friend / Request sent / Accept / Friends ✓ / guest or bot note / Sign in to add friends. profile dialog: account section (sign in / create account / sign out).
- net: room = Colyseus room `table`, `roomId` = code: 4 letters from `ABCDEFGHJKLMNPQRSTUVWXYZ`, rude words skipped. `client.create('table', {name})` / `client.joinById(code, {name, token})`.
- net: server → client `snapshot`: `{code, phase: lobby|playing, you, token, host, players[4]: {name|null=bot, connected}, settings: {rules, difficulty, claimSeconds ∈ 20|40|60|120}, match: {avatarSeed, handIndex, scores, seatPlayers, over, step, view, legal, claimMs, ready[4], allReady, final, paused: Player | null} | null}`.
- net: client → server `act {step, action}` · `ready` · `unready` (between hands; bots and away players never hold the table up) · `rename {name}` · `pause` · `resume` (any seated player) · host: `configure {rules?, difficulty?, claimSeconds?}` · `start` · `deal` (next hand, once `allReady` — nothing else deals it) · after last hand: `rematch` (new match, same people & settings) | `restart` (→ lobby).
- net: hop in / hop out: anyone with the code may join anytime, lobby or mid-match, taking a bot's seat (and its score); ≤ 4 humans. chosen leave → seat freed for a bot / newcomer; leaver's token gets it back while still free. dropped connection → bot covers, seat reserved 2 min for its token, then takeable. seat `token` in localStorage per code. room closes after 5 min with no human connected. idle human: claim timer auto-passes; own turn → bot move after 60 s.
- net: pause: any seated player pauses / resumes during a match. paused ⇒ no bot moves, no timers (claim countdown resumes from where it stopped), `act` rejected.
- net: last hand scored ⇒ summary stays (no auto-deal); host picks Keep going (`rematch`) or Back to lobby (`restart`); others wait or leave.
- ui: top bar "Play with friends" → dialog (name, Host a table / code + Join). invite link `https://PUBLIC_DOMAIN/?room=CODE` (else current page) opens it prefilled. lobby: big code, Share invite (Web Share → clipboard), seats, host picks rules/bots/timer, Start. solo match paused while at a table; reload rejoins (sessionStorage).

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
V16: while the hand is live, `viewFor(s, k)` ∌ other seats' concealed tile ids/kinds; always ∌ wall order.
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
V39: hk `win` legal only if hk total (flowers incl) ≥ 3; hk total ≤ 13; hk settle sums to 0; hk matches keep seating fixed.
V40: bots & UI score via rule-set dispatch (`scoreFor`, `fanDef`), ⊥ hard-coded MCR in rule-dependent paths.
V41: server → seat k snapshot ∌ other seats' concealed tile ids while the hand is live, ∌ match seed (walls derive from it); view = `viewFor(s, k)`.
V42: server applies only actions ∈ `legalActions(s, seatOf(match, sender))` quoting current `step`; applies its own copy of the matching legal action.
V43: room codes unique among live rooms in the process.
V44: join ⇔ a seat is free (bot-held, own token, or dropped > 2 min); ≤ 4 humans per table; a dropped seat is never taken within 2 min.
V45: claim-timer & turn-timer expiry online: claim → `pass` only (V31); turn → bot move for that seat.
V46: paused ⇒ game state unchanged until resume; remaining claim time preserved.
V47: last hand scored ⇒ no automatic deal; only host `rematch` / `restart` move on.
V48: guests never load the Logto SDK nor contact auth or DB; solo & online play work with accounts unconfigured or down.
V49: `PlayerSlot.userId` & social identity come only from a verified access token (iss, aud, signature, expiry); client-supplied ids ignored. missing/invalid token at a table ⇒ guest, never refused.
V50: every friend operation acts as the verified `sub` of the connection; ⊥ sender id from the client.
V51: at most one `friendships` row per pair; states: none → pending → accepted; crossing requests ⇒ accepted; invite link ⇒ accepted.
V52: friends list order: incoming → online friends → offline friends → sent requests; names A–Z within each.
V53: server boots & serves tables with no `DATABASE_URL` / Logto env (accounts off).
V54: a table invite is delivered only if sender & invitee are accepted friends, the sender is seated at `code` per the table room's own Presence record (⊥ client's word), the invitee is online and not already there, and a seat is open; ≤ 1 invite per sender → friend per 20 s. a refused invite never reveals a non-friend's name.
V55: a player's table code is shown only to their accepted friends.
V56: only the host may remove a player; never themselves or a bot seat. a removed seat token or account can't take a seat at that table again.

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
T22|x|bots beginner/easy/medium/hard: shanten-based discard, useful-tile count, claim heuristics, 8-fan awareness, defense (hard)|V25,V26
T23|x|UI full: win screen fan breakdown, scores, difficulty picker, new match, `localStorage` resume|V26,I.ui
T24|x|source ≥ 20 scored MCR example hands (official rulebook / WMO / reputable calculator), cite each; add to reference suite; mismatches → `/ck:spec bug:`|V22,V30
T25|x|V1 enforcement test: scan engine src for browser/Node globals (web vitest, `import.meta.glob` raw); rename `window` locals in `rules.ts`|V1,V33
T26|x|engine official re-seating: `Match.seating`, `seatOf`, `playerAt`; scores per player; UI maps human by player not seat|V27,V13,V23,I.api
T27|x|test last-discard rule explicitly (claims ⊆ win/pass when wall empty)|V28
T28|x|i18n: `en` + `zh-Hans` dictionaries, toggle, persistence, locale default; engine fan table gains zh descriptions; key-parity test|V29,I.ui
T29|x|fan reference page (81 fans, points, description, exclusions, bilingual), linked from result dialog|V29,I.ui
T30|x|claim timer (setting, auto-pass) + keyboard play (tile focus/arrow keys, action shortcuts)|V31,V32,I.ui
T31|x|tile animations + sound effects, toggle, reduced-motion respected|I.ui
T32|x|PWA: manifest, icons, service worker precache; offline smoke test|I.pwa
T33|x|rule sets: engine `RuleSet` + Hong Kong scoring/settlement; settings dropdown w/ rules picker (MCR, HK; Riichi, Taiwan coming soon); fan list per rule set|V39,V40
T34|.|Japanese Riichi rule set|
T35|.|Taiwanese 16-tile rule set|
T36|x|extract `packages/bots` (strategy, protocol, `timeoutAction`); `soundFor`/`calloutFor` accept `PlayerView`; `MatchSource` + `MatchScreen` so table renders any match source|V25,V26
T37|x|`packages/protocol` (codes, messages) + `apps/server`: `Table` (lobby, turn loop, bots, claim/turn timers, ready-up, tokens) + Colyseus `TableRoom`; tests incl leak check & full match|V41,V42,V43,V44,V45
T38|x|web: `useOnline`, host/join dialog, lobby, invite link, online match via `MatchScreen`; bilingual strings|V29,I.ui
T40|x|online pause/resume (any player), end-of-match choice (keep going / back to lobby), hop-in-hop-out seats (take over bots mid-match, chosen leave frees seat, drops reserved 2 min)|V44,V46,V47
T41|x|solo pause: same button & overlay as online; freezes bots & claim timer, countdown resumes|V46
T42|x|accounts + friends backend: Kysely/pg schema & migrations (pre-deploy `migrate.mjs`), Logto token verification, `userId` on seats + `identify`, `social` room (Presence online status, requests, invite codes, profile); tests on PGlite|V49,V50,V51,V53,I.db,I.auth
T43|x|web: lazy Logto sign-in, Friends button/count, Friends dialog, `?friend=` invite links, player card add-friend from lobby & table, account section in profile, Dockerfile build args|V48,V52,V29,I.ui
T46|x|invite friends to a table: table presence (`social:at`, `social:tables`), `tableInvite` on the social room, friend's table + Join / Invite in Friends dialog, lobby & menu Invite a friend, toast stack (invites, friend requests, friend joined/left, invite results); tests|V54,V55,V29,I.ui
T47|x|host removes players (lobby Remove, player card), bans by token & account, close code 4006; Play together from solo (host + invite once seated, `me.table`); sign-in name replaces the default "Player"; tests|V56,V54,V29,I.ui
T44|.|Railway: add Postgres (+ `logto` DB, backups), Logto service per env, env vars on `server`/`web`, pre-deploy command; configure Logto apps/connectors|I.deploy
T45|.|Logto Management-API bootstrap script so new environments (PR envs) need no manual console setup|I.deploy
T39|.|deploy: Railway service `server` from `apps/server/Dockerfile` + public domain; set `VITE_SERVER_URL` build variable on `web`|I.deploy

## §B BUGS
id|date|cause|fix
B1|2026-09-25|1 concealed + 1 melded kong scored 2+1; reference scores combination 5 (明暗杠)|V34
B2|2026-09-25|`fourConcealedPungs` kept `fullyConcealedHand` (4); reference gives `selfDrawn` (1)|V35
B3|2026-09-25|wait uniqueness ignored kinds fully held by player ∴ extra `singleWait`; reference counts shape waits|V36
B4|2026-09-25|`allChows` only checked standard form; reference counts knitted straight as chows|V37
B5|2026-09-25|`nineGates` excluded every terminal pung; reference cancels one|V38
