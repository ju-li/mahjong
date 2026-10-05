# Backend: Railway Postgres + Logto

Decision record, current schema, and setup checklist. Supersedes the earlier
PocketBase and Supabase proposals.

## Decision

- **Database:** a Railway Postgres service in the existing Railway project.
  Every Railway environment (staging, prod, PR environments) gets its own
  isolated instance. Services reference it with `${{Postgres.DATABASE_URL}}`.
- **Auth:** self-hosted [Logto](https://logto.io) (open-source OIDC server)
  as its own Railway service, on its own subdomain (e.g. `auth.<domain>`),
  storing its data in a separate `logto` database on the same Postgres
  instance.
- **Realtime:** Colyseus only. Online status uses Colyseus `Presence`. There
  is no DB-level realtime; if DB change events are ever needed, use Postgres
  `LISTEN/NOTIFY`.
- **Data access:** the Colyseus game server is the only database client.
  Browsers never talk to Postgres.

### Why

- All DevOps stays in Railway: one project, and cloning an environment gives
  it its own database automatically. No outside BaaS vendor.
- Logto has an official Capacitor SDK (`@logto/capacitor`), which covers the
  native deep-link and Sign in with Apple flows the future iOS/Android apps
  need. That is the hardest auth piece to build yourself.
- Plain Postgres means low lock-in: `pg_dump` moves it anywhere.

### Rejected

| Option | Why not |
|---|---|
| Supabase | Mature auth, but an extra vendor; staging and prod are separate projects managed by hand; free tier pauses; its Realtime duplicates Colyseus. |
| Neon | Branching is overkill for a handful of tables; its auth is less mature. |
| PocketBase | Downtime on every deploy (volume-attached service), so game-end writes risk being lost; DIY backups; pre-1.0 breaking upgrades; single maintainer. |
| Better Auth | Good library, but the Capacitor/Apple deep-link glue is DIY. Fallback if Logto's hosted sign-in page becomes a problem. |
| Authorizer | Light and easy on Railway, but no Capacitor SDK and a small maintainer base. |
| SuperTokens | Java core plus an SDK inside Colyseus; cookie sessions are awkward in a WebView; some features need a paid licence. |
| Clerk, Firebase, Convex, Appwrite, self-hosted Supabase | Vendor lock-in or too many services to run. |

## How it fits together

```
browser (PWA)                    Railway project (per environment)
─────────────                    ──────────────────────────────────
@logto/browser  ── sign in ───▶  logto service ──▶ Postgres: logto DB
     │ access token (JWT)
     ▼
@colyseus/sdk   ── ws ────────▶  server service (Colyseus)
                                   ├─ table rooms (games, in memory)
                                   ├─ social room (friends, presence)
                                   └─ Kysely ─────▶ Postgres: app DB
```

- **Sign-in:** the web app lazy-loads `@logto/browser` only when a saved
  session exists or the player clicks Sign in, then redirects to Logto's
  hosted page (email + password with email verification, Google, Apple).
  Logto redirects back to `<web origin>/callback`.
- **Verification:** the server checks each access token (a JWT) against
  Logto's public keys (`<LOGTO_ENDPOINT>/oidc/jwks`, via `jose`), with
  `iss = <LOGTO_ENDPOINT>/oidc` and `aud = LOGTO_API_RESOURCE`. The user id is
  the token's `sub`. A missing or bad token makes the player a guest; it never
  blocks play.
- **Guests:** solo and online play need no account and never touch Logto or
  the database. Friends need an account.
- **Friends and presence:** signed-in clients keep one connection to the
  `social` room. A Presence hash counts each user's open connections (online
  = at least one), and a per-user Presence channel tells every connection
  to refresh its friends list when something changes.
- **Friends at tables:** each table room keeps two more Presence hashes up to
  date: `social:at` (user id → table code, signed-in seated players only) and
  `social:tables` (code → `{openSeats, playing}`), and refreshes the friends of
  anyone who sits down or leaves. The friends list reads them to show where a
  friend is playing. The per-user channel also carries table invites
  (`{kind: 'invite'}` next to `{kind: 'refresh'}`); the social room checks the
  friendship and the sender's seat in `social:at` before sending one.

## Schema (v0)

Migrations live in `apps/server/src/db/migrations.ts` and run as the
Railway pre-deploy command `node migrate.mjs`. Never edit a shipped
migration; add a new one.

```sql
create table profiles (
  user_id      text primary key,            -- Logto sub
  display_name text not null check (char_length(display_name) between 1 and 16),
  avatar       bigint check (avatar >= 0 and avatar < 4294967296),
  friend_code  text not null unique,        -- in the ?friend= invite link
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table friendships (                 -- one row per pair
  user_low     text not null references profiles on delete cascade,
  user_high    text not null references profiles on delete cascade,
  requested_by text not null,
  status       text not null check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  primary key (user_low, user_high),
  check (user_low < user_high),
  check (requested_by in (user_low, user_high))
);
```

Rules: crossing requests become a friendship; opening an invite link makes
you friends immediately; caps of 200 friends and 50 outgoing requests.

### Match history and ratings (migration 0002)

- `matches`, `match_players`, `match_hands` (hand seeds and every action, so
  any online match replays with the engine), `ratings`, `rating_history`.
- Written only by the game server: online matches when their last hand is
  scored (idempotent, retried), solo matches uploaded by the signed-in
  player who played them (validated, never rated).
- Ratings: OpenSkill (Plackett–Luce) per rule set. A match is rated when at
  least two signed-in players held their seat for the whole match; they
  are ranked by final score among themselves. Displayed rating =
  1000 + 40 × (μ − 3σ). Leaderboard: ≥ 5 rated matches, public
  `GET /leaderboard?rules=mcr|hk`.
- History and stats are read over the social room; nothing about another
  player's matches is served except the public leaderboard.

## Environment variables

| Service | Variable | Value |
|---|---|---|
| server | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| server | `LOGTO_ENDPOINT` | `https://auth.<domain>` |
| server | `LOGTO_API_RESOURCE` | API resource indicator from Logto, e.g. `https://api.<domain>` |
| web (build) | `VITE_LOGTO_ENDPOINT` | same as `LOGTO_ENDPOINT` |
| web (build) | `VITE_LOGTO_APP_ID` | the Logto SPA application's App ID |
| web (build) | `VITE_LOGTO_RESOURCE` | same as `LOGTO_API_RESOURCE` |
| web (build) | `VITE_LIWAN_ENDPOINT` | optional; Liwan event API, default `https://a.mommymahjong.com/api/event` |
| logto | `DB_URL` | the `logto` database on the same Postgres |
| logto | `ENDPOINT` | `https://auth.<domain>` |
| logto | `ADMIN_ENDPOINT` | admin console URL (own domain or port) |
| logto | `TRUST_PROXY_HEADER` | `1` |

Leave any of the server or web values unset and accounts are simply off:
the game plays exactly as it does for guests.

## Setup checklist (per environment)

1. **Postgres:** add the Railway Postgres service; create a second database
   `logto` on it; turn on backups and test a restore.
2. **Logto service:** deploy the official `svhd/logto` image pinned to a
   version (the community Railway template is unverified; use it only as a
   reference). Set the variables above. Give `ENDPOINT` the public
   `auth.<domain>` and put the admin console on a separate, restricted
   domain or port.
3. **In the Logto console:**
   - Create a *Single page app*. Redirect URI `<web origin>/callback`; post
     sign-out redirect `<web origin>`. Add the Capacitor custom scheme (e.g.
     `com.<app>://callback`) when the mobile apps arrive.
   - Create an *API resource* (e.g. `https://api.<domain>`); use it for
     `LOGTO_API_RESOURCE` and `VITE_LOGTO_RESOURCE`.
   - Sign-in experience: email as identifier, password, **verify email on
     sign-up**; add the SMTP email connector (the Feedback SMTP account works).
   - Social connectors: Google (Google Cloud OAuth client) and Apple (Apple
     Developer account, Services ID, key).
4. **server service:** set its three variables and the pre-deploy command
   `node migrate.mjs`.
5. **web service:** set the three `VITE_LOGTO_*` build variables.

Environments created by cloning (including PR environments) start with an
empty Logto, so step 3 is manual per environment until a Management-API
bootstrap script exists (SPEC T45).
