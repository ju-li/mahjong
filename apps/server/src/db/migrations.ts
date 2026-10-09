import { sql, type Kysely } from 'kysely'
import { Migrator, type Migration, type MigrationProvider } from 'kysely/migration'

/**
 * Every schema change, in order. Listed in code rather than read from a folder so the whole
 * server, migrations included, bundles into one file. Never edit a migration that has shipped;
 * add a new one.
 */
export const migrations: Record<string, Migration> = {
  '0001_accounts_friends': {
    async up(db: Kysely<unknown>) {
      await db.schema
        .createTable('profiles')
        .addColumn('user_id', 'text', (c) => c.primaryKey())
        .addColumn('display_name', 'text', (c) => c.notNull().check(sql`char_length(display_name) between 1 and 16`))
        .addColumn('avatar', 'bigint', (c) => c.check(sql`avatar >= 0 and avatar < 4294967296`))
        .addColumn('friend_code', 'text', (c) => c.notNull().unique())
        .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
        .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
        .execute()
      await db.schema
        .createTable('friendships')
        .addColumn('user_low', 'text', (c) => c.notNull().references('profiles.user_id').onDelete('cascade'))
        .addColumn('user_high', 'text', (c) => c.notNull().references('profiles.user_id').onDelete('cascade'))
        .addColumn('requested_by', 'text', (c) => c.notNull())
        .addColumn('status', 'text', (c) => c.notNull().check(sql`status in ('pending', 'accepted')`))
        .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
        .addColumn('accepted_at', 'timestamptz')
        .addPrimaryKeyConstraint('friendships_pkey', ['user_low', 'user_high'])
        .addCheckConstraint('friendships_ordered', sql`user_low < user_high`)
        .addCheckConstraint('friendships_requester', sql`requested_by in (user_low, user_high)`)
        .execute()
      await db.schema.createIndex('friendships_user_high').on('friendships').column('user_high').execute()
    },
    async down(db: Kysely<unknown>) {
      await db.schema.dropTable('friendships').execute()
      await db.schema.dropTable('profiles').execute()
    },
  },
  '0002_matches_ratings': {
    async up(db: Kysely<unknown>) {
      for (const statement of [
        sql`create table matches (
          id uuid primary key,
          kind text not null check (kind in ('online', 'solo')),
          rule_set text not null check (rule_set in ('mcr', 'hk')),
          difficulty text,
          rated boolean not null default false,
          client_key text unique,
          started_at timestamptz not null,
          ended_at timestamptz not null
        )`,
        sql`create table match_players (
          match_id uuid not null references matches on delete cascade,
          player smallint not null check (player between 0 and 3),
          user_id text references profiles on delete set null,
          name text not null,
          avatar bigint,
          bot boolean not null,
          final_score integer not null,
          placement smallint not null check (placement between 1 and 4),
          full_match boolean not null,
          primary key (match_id, player)
        )`,
        sql`create index match_players_user on match_players (user_id, match_id)`,
        sql`create table match_hands (
          match_id uuid not null references matches on delete cascade,
          hand_index smallint not null check (hand_index between 0 and 15),
          dealer smallint not null,
          prevailing_wind text not null,
          seed bigint not null,
          result jsonb not null,
          player_deltas integer[] not null,
          actions jsonb,
          primary key (match_id, hand_index)
        )`,
        sql`create table ratings (
          user_id text not null references profiles on delete cascade,
          rule_set text not null check (rule_set in ('mcr', 'hk')),
          mu double precision not null,
          sigma double precision not null,
          matches integer not null default 0,
          firsts integer not null default 0,
          updated_at timestamptz not null default now(),
          primary key (user_id, rule_set)
        )`,
        sql`create index ratings_board on ratings (rule_set, (mu - 3 * sigma) desc)`,
        sql`create table rating_history (
          match_id uuid not null references matches on delete cascade,
          user_id text not null references profiles on delete cascade,
          rule_set text not null,
          mu_before double precision not null,
          sigma_before double precision not null,
          mu_after double precision not null,
          sigma_after double precision not null,
          primary key (match_id, user_id)
        )`,
      ])
        await statement.execute(db)
    },
    async down(db: Kysely<unknown>) {
      for (const t of ['rating_history', 'ratings', 'match_hands', 'match_players', 'matches']) await db.schema.dropTable(t).execute()
    },
  },
  '0003_house_rules': {
    async up(db: Kysely<unknown>) {
      for (const statement of [
        // A player's synced preferences: default rules, house rules, terminology, game settings.
        sql`alter table profiles add column preferences jsonb`,
        sql`alter table profiles add column preferences_updated_at timestamptz`,
        // House rules a match started with ('{}' = standard, as every earlier match was played).
        sql`alter table matches add column house_rules jsonb not null default '{}'`,
        // House rules each hand was played with; the host may change them between hands. Null = standard.
        sql`alter table match_hands add column house_rules jsonb`,
      ])
        await statement.execute(db)
    },
    async down(db: Kysely<unknown>) {
      for (const statement of [
        sql`alter table match_hands drop column house_rules`,
        sql`alter table matches drop column house_rules`,
        sql`alter table profiles drop column preferences_updated_at`,
        sql`alter table profiles drop column preferences`,
      ])
        await statement.execute(db)
    },
  },
}

const provider: MigrationProvider = { getMigrations: async () => migrations }

/** Bring the database up to the latest schema. Throws if any migration fails. */
// The migrator works on any schema.
export async function migrateToLatest(db: Kysely<any>): Promise<string[]> {
  const { error, results } = await new Migrator({ db, provider }).migrateToLatest()
  if (error) throw error
  return (results ?? []).filter((r) => r.status === 'Success').map((r) => r.migrationName)
}
