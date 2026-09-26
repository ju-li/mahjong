# Backend schema plan (Supabase)

Status: **plan only**. Nothing here is migrated yet. Phase 1 lands with
accounts & leaderboards (after Colyseus multiplayer, per SPEC roadmap); later
phases are sketched now so their keys and ownership rules don't force a
rewrite of phase 1.

## Principles

1. **One identity key.** Every user-owned row references `profiles.id`,
   which equals `auth.users.id`. No second user id, ever.
2. **Two writers.**
   - *Server* (Colyseus game server, Supabase Edge Functions, payment
     webhooks) uses the service role and bypasses RLS. It alone writes
     anything that affects fairness or money: matches, ratings, wallets,
     inventory grants, achievement unlocks, bans.
   - *Client* (web / Capacitor via `supabase-js`) writes only social and
     cosmetic-preference data, guarded by RLS: own profile fields, friend
     requests, blocks, messages, clan membership, equipped loadout.
3. **Money and items are ledgers.** Append-only rows with an idempotency
   key; balances are caches updated in the same transaction. Never
   `update wallets set balance = balance + x` without a ledger row.
4. **History survives account deletion.** App Store requires in-app account
   deletion. User FKs on shared history (`match_players`, `messages`) are
   `on delete set null`; personal data (`profiles`, inventory, friends)
   cascades.
5. **Text + CHECK over Postgres enums.** Adding a value to a CHECK is a
   one-line migration; altering an enum type is not.
6. **Definitions in code, state in DB.** Achievement criteria, item art and
   i18n strings live in the repo; DB holds stable slugs and per-user state.
7. **Replayable matches.** The engine is deterministic (V13), so each hand
   stores `seed` + action log + `engine_version`. Enables replays, dispute
   review, anti-cheat, and back-filling achievements added later.

Conventions: `uuid` PKs default `gen_random_uuid()` (except `profiles`),
`bigint generated always as identity` for high-volume append tables,
`timestamptz` everywhere, `citext` for case-insensitive handles, slugs
(`text`) as PKs for code-defined catalogs.

## Phase 1 — accounts, history, leaderboards

```sql
create extension if not exists citext;

create table profiles (
  id            uuid primary key references auth.users on delete cascade,
  username      citext unique not null check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  display_name  text not null check (char_length(display_name) between 1 and 32),
  avatar_url    text,
  locale        text not null default 'en' check (locale in ('en','zh-Hans')),
  country       text check (country ~ '^[A-Z]{2}$'),
  role          text not null default 'player' check (role in ('player','moderator','admin')),
  created_at    timestamptz not null default now()
);
-- clients may update display_name, avatar_url, locale, country only
-- (column-level grant or a trigger rejecting changes to username/role).

create table seasons (
  id         text primary key,            -- '2027-s1'
  starts_at  timestamptz not null,
  ends_at    timestamptz
);

create table matches (
  id              uuid primary key default gen_random_uuid(),
  rule_set        text not null check (rule_set in ('mcr','hk')),
  ranked          boolean not null,
  season_id       text references seasons,
  status          text not null check (status in ('completed','abandoned')),
  engine_version  text not null,          -- git sha / semver of @mahjong/engine
  seed            bigint not null,
  started_at      timestamptz not null,
  ended_at        timestamptz
);

create table match_players (
  match_id        uuid references matches on delete cascade,
  player_index    smallint check (player_index between 0 and 3),  -- engine player id
  user_id         uuid references profiles on delete set null,     -- null = bot or deleted
  bot_difficulty  text check (bot_difficulty in ('beginner','easy','medium','hard')),
  final_score     integer not null,
  placement       smallint not null check (placement between 1 and 4),
  left_early      boolean not null default false,
  primary key (match_id, player_index)
);
create index on match_players (user_id, match_id);

create table match_hands (
  match_id     uuid references matches on delete cascade,
  hand_no      smallint check (hand_no between 0 and 15),
  seed         bigint not null,
  actions      jsonb not null,            -- Action[] for engine replay()
  winner_index smallint,                  -- null = drawn hand
  discarder_index smallint,               -- null = self-draw / drawn
  fans         jsonb,                     -- scoreHand() fans, for stats & achievements
  deltas       integer[] not null,        -- settle() result, length 4
  primary key (match_id, hand_no)
);

-- One row per (user, rule set, season). OpenSkill-style mu/sigma;
-- display rating = mu - 3*sigma (or an ELO-scaled equivalent).
create table ratings (
  user_id     uuid references profiles on delete cascade,
  rule_set    text check (rule_set in ('mcr','hk')),
  season_id   text references seasons,   -- 'all-time' row in seasons for lifetime ratings
  mu          double precision not null,
  sigma       double precision not null,
  rating      double precision generated always as (mu - 3 * sigma) stored,
  games       integer not null default 0,
  wins        integer not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (user_id, rule_set, season_id)
);
create index leaderboard_idx on ratings (rule_set, season_id, rating desc);

create table rating_history (
  match_id    uuid references matches on delete cascade,
  user_id     uuid references profiles on delete cascade,
  mu_before   double precision not null,
  sigma_before double precision not null,
  mu_after    double precision not null,
  sigma_after double precision not null,
  primary key (match_id, user_id)
);
```

RLS: all phase 1 tables are public-read (except `match_hands.actions`,
exposed only after the match ends — it's all-tiles-visible data) and
server-write, except the client-updatable `profiles` columns above.

Result write path: at match end Colyseus runs one transaction —
`matches` + `match_players` + `match_hands` + `ratings` upsert +
`rating_history`. Idempotent on `matches.id` so a retry can't double-rate.

## Phase 2 — safety: blocks, reports, bans

Ship with or right after phase 1: public multiplayer without moderation
tools is a liability, and matchmaking should respect blocks from day one.

```sql
create table user_blocks (
  blocker_id  uuid references profiles on delete cascade,
  blocked_id  uuid references profiles on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
-- effects: hides DMs & friend requests both ways; matchmaker avoids pairing.

create table reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid references profiles on delete set null,
  target_id    uuid references profiles on delete cascade,
  match_id     uuid references matches on delete set null,
  message_id   bigint,                    -- fk added in phase 4
  reason       text not null check (reason in ('cheating','abuse','spam','name','other')),
  details      text,
  status       text not null default 'open' check (status in ('open','actioned','dismissed')),
  created_at   timestamptz not null default now()
);

create table bans (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references profiles on delete cascade,
  scope       text not null check (scope in ('all','ranked','chat')),
  reason      text not null,
  issued_by   uuid references profiles on delete set null,
  report_id   uuid references reports on delete set null,
  starts_at   timestamptz not null default now(),
  expires_at  timestamptz,                -- null = permanent
  revoked_at  timestamptz
);
create index on bans (user_id) where revoked_at is null;
```

Enforcement: Colyseus checks `bans` (scope `all`/`ranked`) on room join;
RLS on `messages` insert checks scope `chat`. A `is_banned(uid, scope)`
SQL function keeps both call sites identical.

## Phase 3 — friends & clans

```sql
-- one row per unordered pair
create table friendships (
  user_low     uuid references profiles on delete cascade,
  user_high    uuid references profiles on delete cascade,
  requested_by uuid not null,
  status       text not null check (status in ('pending','accepted')),
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  primary key (user_low, user_high),
  check (user_low < user_high),
  check (requested_by in (user_low, user_high))
);
-- declining / unfriending = delete row. RLS: insert only if requested_by = auth.uid()
-- and no block either way; accept only by the non-requester.

create table clans (
  id          uuid primary key default gen_random_uuid(),
  tag         citext unique not null check (tag ~ '^[A-Za-z0-9]{2,5}$'),
  name        text not null check (char_length(name) between 3 and 32),
  description text,
  emblem      text,                       -- item slug or preset id
  join_policy text not null default 'invite' check (join_policy in ('open','request','invite')),
  created_by  uuid references profiles on delete set null,
  created_at  timestamptz not null default now()
);

create table clan_members (
  clan_id    uuid references clans on delete cascade,
  user_id    uuid references profiles on delete cascade unique,  -- one clan per user
  role       text not null check (role in ('owner','officer','member')),
  joined_at  timestamptz not null default now(),
  primary key (clan_id, user_id)
);
create unique index one_owner_per_clan on clan_members (clan_id) where role = 'owner';

create table clan_invites (          -- invites (from clan) and requests (from user)
  clan_id     uuid references clans on delete cascade,
  user_id     uuid references profiles on delete cascade,
  direction   text not null check (direction in ('invite','request')),
  created_by  uuid references profiles on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (clan_id, user_id)
);
```

Clan leaderboards are a view aggregating `ratings` over `clan_members`;
no stored clan rating until needed.

## Phase 4 — messaging

Out-of-game chat (DMs, clan chat). In-game table chat stays in Colyseus;
persist it here only if moderation needs it (`kind = 'match'`).
Delivered live via Supabase Realtime (Postgres changes on `messages`,
filtered by RLS).

```sql
create table conversations (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('dm','clan','match')),
  dm_key     text unique,               -- 'uuidLow:uuidHigh' for dm, else null
  clan_id    uuid unique references clans on delete cascade,
  match_id   uuid unique references matches on delete cascade,
  created_at timestamptz not null default now()
);

create table conversation_members (
  conversation_id uuid references conversations on delete cascade,
  user_id         uuid references profiles on delete cascade,
  last_read_id    bigint,               -- unread counts
  muted           boolean not null default false,
  primary key (conversation_id, user_id)
);

create table messages (
  id              bigint generated always as identity primary key,
  conversation_id uuid not null references conversations on delete cascade,
  sender_id       uuid references profiles on delete set null,
  body            text not null check (char_length(body) between 1 and 1000),
  created_at      timestamptz not null default now(),
  edited_at       timestamptz,
  deleted_at      timestamptz            -- soft delete; keep for reports
);
create index on messages (conversation_id, id desc);
```

RLS insert on `messages`: sender = `auth.uid()`, sender is a member, no
chat ban, and for DMs no block either way. Clan conversation membership is
synced from `clan_members` by trigger. Rate-limit inserts (trigger or
edge function) before launch.

## Phase 5 — economy: points, purchases, subscriptions

Store rules shape this: iOS/Android require Apple/Google in-app purchase
for digital goods; web can use Stripe. Recommended: put **RevenueCat** in
front of all three stores and treat its webhook as the single source of
purchase truth. Every provider event is stored raw and processed
idempotently.

```sql
create table wallets (                  -- cached balances
  user_id   uuid references profiles on delete cascade,
  currency  text check (currency in ('coins','gems')),   -- coins: earned; gems: paid
  balance   bigint not null default 0 check (balance >= 0),
  primary key (user_id, currency)
);

create table wallet_ledger (
  id               bigint generated always as identity primary key,
  user_id          uuid not null references profiles on delete cascade,
  currency         text not null,
  delta            bigint not null,
  reason           text not null check (reason in
                     ('match_reward','achievement','purchase','shop_spend','refund','admin','season_reward')),
  ref_id           text,                -- match id, purchase id, item slug…
  idempotency_key  text unique not null,
  created_at       timestamptz not null default now()
);

create table purchases (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid references profiles on delete set null,
  provider           text not null check (provider in ('apple','google','stripe')),
  provider_txn_id    text not null,
  product_id         text not null,     -- store SKU
  status             text not null check (status in ('completed','refunded','revoked')),
  amount_minor       integer,           -- cents, for reporting only
  currency_code      text,
  raw                jsonb not null,    -- webhook payload
  created_at         timestamptz not null default now(),
  unique (provider, provider_txn_id)
);

create table subscriptions (
  user_id              uuid references profiles on delete cascade,
  product_id           text not null,   -- e.g. 'premium_monthly'
  provider             text not null check (provider in ('apple','google','stripe')),
  provider_sub_id      text not null,
  status               text not null check (status in ('active','grace','paused','cancelled','expired')),
  current_period_end   timestamptz not null,
  will_renew           boolean not null,
  updated_at           timestamptz not null default now(),
  primary key (user_id, product_id),
  unique (provider, provider_sub_id)
);

-- what the client and server actually check
create view entitlements as
  select user_id, product_id as entitlement
  from subscriptions
  where status in ('active','grace') and current_period_end > now();
```

All phase 5 tables: owner-read, server-write only. Spending (buying an
item with coins) is an RPC (`security definer` function) that debits the
ledger and grants inventory in one transaction.

Fairness note: keep paid items cosmetic. Nothing in phase 5/6 may touch
ratings or game outcomes.

## Phase 6 — items & skins

```sql
create table item_defs (
  slug        text primary key,           -- 'tileback.jade', 'felt.midnight'
  slot        text not null check (slot in
                ('tile_back','tile_face','table_felt','avatar_frame','emote','sound_pack','title')),
  rarity      text not null check (rarity in ('common','rare','epic','legendary')),
  price_coins bigint,                     -- null = not sold for coins
  price_gems  bigint,
  store_sku   text,                       -- direct IAP, if any
  active      boolean not null default true,
  released_at timestamptz
);
-- names/art live in the web app keyed by slug.

create table inventory (
  user_id     uuid references profiles on delete cascade,
  item_slug   text references item_defs,
  source      text not null check (source in ('purchase','shop','achievement','season','gift','admin')),
  source_ref  text,
  acquired_at timestamptz not null default now(),
  primary key (user_id, item_slug)        -- cosmetics: own once; add qty column if consumables appear
);

create table loadouts (
  user_id    uuid references profiles on delete cascade,
  slot       text,
  item_slug  text not null,
  primary key (user_id, slot),
  foreign key (user_id, item_slug) references inventory (user_id, item_slug) on delete cascade
);
-- client-writable; the FK guarantees you can only equip what you own.
```

Colyseus reads opponents' loadouts at room join so everyone sees each
other's skins.

## Phase 7 — achievements

```sql
create table achievement_defs (
  slug         text primary key,          -- 'fan.thirteen_orphans', 'games.100'
  category     text not null check (category in ('fan','milestone','social','season','secret')),
  target       integer not null default 1,  -- progress needed
  reward_coins bigint,
  reward_item  text references item_defs,
  hidden       boolean not null default false,
  active       boolean not null default true
);

create table achievement_progress (
  user_id          uuid references profiles on delete cascade,
  achievement_slug text references achievement_defs,
  progress         integer not null default 0,
  unlocked_at      timestamptz,
  unlock_match_id  uuid references matches on delete set null,
  primary key (user_id, achievement_slug)
);
create index on achievement_progress (achievement_slug) where unlocked_at is not null;  -- "% of players"
```

Criteria are TypeScript evaluated server-side on match end (reads
`match_hands.fans`). New achievements can be back-filled by replaying
stored history. Unlock + reward is one transaction via the ledger.

## Build order

| Phase | Tables | Ships with |
|---|---|---|
| 1 | profiles, seasons, matches, match_players, match_hands, ratings, rating_history | accounts & leaderboards |
| 2 | user_blocks, reports, bans | same release or next |
| 3 | friendships, clans, clan_members, clan_invites | social |
| 4 | conversations, conversation_members, messages | social |
| 5 | wallets, wallet_ledger, purchases, subscriptions (+ entitlements view) | monetisation |
| 6 | item_defs, inventory, loadouts | monetisation |
| 7 | achievement_defs, achievement_progress | any time after 1 |

Only phase 1 (and ideally 2) should be migrated before it's used. The
other phases are cheap to add later because they only reference
`profiles.id` and `matches.id` — keeping those two stable is the actual
future-proofing.

## Open decisions

- Rating model: OpenSkill (mu/sigma, native 4-player) vs pairwise ELO.
  Schema above assumes OpenSkill; pairwise ELO would use a single `rating`
  column.
- Seasonal resets: soft reset (carry mu, inflate sigma) vs hard reset.
- Guest play: Supabase anonymous sign-in lets guests play unranked and
  upgrade to a full account without losing history.
- Username changes: allowed with cooldown? (would need `username_history`.)
- Unranked multiplayer results: stored in `matches` with `ranked = false`,
  never touching `ratings`.
