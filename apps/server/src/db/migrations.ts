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
}

const provider: MigrationProvider = { getMigrations: async () => migrations }

/** Bring the database up to the latest schema. Throws if any migration fails. */
// The migrator works on any schema.
export async function migrateToLatest(db: Kysely<any>): Promise<string[]> {
  const { error, results } = await new Migrator({ db, provider }).migrateToLatest()
  if (error) throw error
  return (results ?? []).filter((r) => r.status === 'Success').map((r) => r.migrationName)
}
