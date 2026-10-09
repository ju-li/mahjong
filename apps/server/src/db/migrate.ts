/**
 * Pre-deploy step: `node migrate.mjs` moves any game table left in `public` into the `mahjong`
 * schema, then brings the database named by `DATABASE_URL` up to date before the new server
 * starts. Exits non-zero on failure so Railway keeps the old deploy.
 */
import { createDb } from './db'
import { migrateToLatest } from './migrations'

const url = process.env.DATABASE_URL
if (!url) {
  console.log('DATABASE_URL unset: nothing to migrate')
} else {
  const db = createDb(url)
  try {
    const { moved, applied } = await migrateToLatest(db)
    if (moved.length) console.log(`moved from public to mahjong: ${moved.join(', ')}`)
    console.log(applied.length ? `applied: ${applied.join(', ')}` : 'database already up to date')
  } catch (error) {
    console.error('migration failed', error)
    process.exitCode = 1
  } finally {
    await db.destroy()
  }
}
