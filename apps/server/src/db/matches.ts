import { randomUUID } from 'node:crypto'
import { sql, type Transaction } from 'kysely'
import { DIFFICULTIES, type Difficulty } from '@mahjong/bots'
import { handSeed, HANDS_PER_MATCH, isRuleSet, placements, type Action, type Player, type RuleSet } from '@mahjong/engine'
import {
  LEADERBOARD_MIN_MATCHES,
  type HandSummary,
  type HistoryPage,
  type LeaderboardEntry,
  type MatchDetail,
  type MatchSummary,
  type PlayerStats,
  type RatingChange,
  type RuleStats,
  type SoloResult,
  type SoloStats,
} from '@mahjong/protocol'
import type { Db } from './db'
import type { Database } from './schema'
import { displayRating, initialSkill, rateMatch, type Skill } from './rating'

const RULE_SETS: RuleSet[] = ['mcr', 'hk']

/** Everything the server knows about an online match that just ended. */
export type OnlineMatchRecord = {
  id: string
  rules: RuleSet
  seed: number
  startedAt: Date
  endedAt: Date
  hands: HandSummary[]
  /** Every action of each hand, in order. */
  actions: Action[][]
  scores: number[]
  /** Per player: who held the seat at the end, and whether they held it, signed in, all match. */
  players: { userId: string | null; name: string; avatar: number | null; bot: boolean; fullMatch: boolean }[]
}

type Tx = Transaction<Database>

/** Who among a match's players gets rated: signed in for the whole match, each account once. */
export function ratedPlayers(players: OnlineMatchRecord['players']): number[] {
  const ids = players.map((p) => (p.fullMatch && !p.bot ? p.userId : null))
  const seats = ids.flatMap((id, p) => (id !== null && ids.indexOf(id) === ids.lastIndexOf(id) ? [p] : []))
  return seats.length >= 2 ? seats : []
}

async function insertHands(trx: Tx, matchId: string, seed: number, hands: HandSummary[], actions: Action[][] | null) {
  if (hands.length === 0) return
  await trx
    .insertInto('match_hands')
    .values(
      hands.map((h) => ({
        match_id: matchId,
        hand_index: h.handIndex,
        dealer: h.dealer,
        prevailing_wind: h.prevailingWind,
        seed: handSeed(seed, h.handIndex),
        result: JSON.stringify(h.outcome),
        player_deltas: h.deltas,
        actions: actions ? JSON.stringify(actions[h.handIndex] ?? []) : null,
      })),
    )
    .execute()
}

/**
 * Store a finished online match and, if at least two signed-in players played all of it, update
 * their ratings. Safe to call again for the same match (retries): nothing is stored or rated twice.
 * Returns each rated account's rating change.
 */
export async function recordOnlineMatch(db: Db, rec: OnlineMatchRecord): Promise<Map<string, RatingChange>> {
  return db.transaction().execute(async (trx) => {
    const rated = ratedPlayers(rec.players)
    const inserted = await trx
      .insertInto('matches')
      .values({ id: rec.id, kind: 'online', rule_set: rec.rules, difficulty: null, rated: rated.length > 0, client_key: null, started_at: rec.startedAt, ended_at: rec.endedAt })
      .onConflict((oc) => oc.column('id').doNothing())
      .returning('id')
      .executeTakeFirst()
    if (!inserted) return ratingChanges(trx, rec.id, rec.rules)

    const places = placements(rec.scores)
    // Accounts that no longer exist (deleted meanwhile) are kept as names only.
    const accounts = [...new Set(rec.players.flatMap((p) => (p.userId ? [p.userId] : [])))]
    const known = new Set(
      accounts.length ? (await trx.selectFrom('profiles').select('user_id').where('user_id', 'in', accounts).execute()).map((r) => r.user_id) : [],
    )
    await trx
      .insertInto('match_players')
      .values(
        rec.players.map((p, i) => ({
          match_id: rec.id,
          player: i,
          user_id: p.userId && known.has(p.userId) ? p.userId : null,
          name: p.name,
          avatar: p.avatar,
          bot: p.bot,
          final_score: rec.scores[i]!,
          placement: places[i]!,
          full_match: p.fullMatch,
        })),
      )
      .execute()
    await insertHands(trx, rec.id, rec.seed, rec.hands, rec.actions)

    const ratedIds = rated.map((p) => rec.players[p]!.userId!).filter((id) => known.has(id))
    if (ratedIds.length < 2) return new Map()
    const ratedSeats = rated.filter((p) => known.has(rec.players[p]!.userId!))
    const rows = await trx.selectFrom('ratings').selectAll().where('rule_set', '=', rec.rules).where('user_id', 'in', ratedIds).forUpdate().execute()
    const current = new Map(rows.map((r) => [r.user_id, { mu: r.mu, sigma: r.sigma } as Skill]))
    const before = ratedIds.map((id) => current.get(id) ?? initialSkill())
    const after = rateMatch(before, placements(ratedSeats.map((p) => rec.scores[p]!)))
    for (const [i, userId] of ratedIds.entries()) {
      const first = places[ratedSeats[i]!] === 1 ? 1 : 0
      await trx
        .insertInto('ratings')
        .values({ user_id: userId, rule_set: rec.rules, mu: after[i]!.mu, sigma: after[i]!.sigma, matches: 1, firsts: first, updated_at: rec.endedAt })
        .onConflict((oc) =>
          oc.columns(['user_id', 'rule_set']).doUpdateSet({
            mu: after[i]!.mu,
            sigma: after[i]!.sigma,
            matches: sql`ratings.matches + 1`,
            firsts: sql`ratings.firsts + ${first}`,
            updated_at: rec.endedAt,
          }),
        )
        .execute()
      await trx
        .insertInto('rating_history')
        .values({ match_id: rec.id, user_id: userId, rule_set: rec.rules, mu_before: before[i]!.mu, sigma_before: before[i]!.sigma, mu_after: after[i]!.mu, sigma_after: after[i]!.sigma })
        .execute()
    }
    return ratingChanges(trx, rec.id, rec.rules)
  })
}

async function ratingChanges(db: Db | Tx, matchId: string, rules: RuleSet): Promise<Map<string, RatingChange>> {
  const rows = await db.selectFrom('rating_history').selectAll().where('match_id', '=', matchId).execute()
  return new Map(
    rows.map((r) => [r.user_id, { rules, before: displayRating({ mu: r.mu_before, sigma: r.sigma_before }), after: displayRating({ mu: r.mu_after, sigma: r.sigma_after }) }]),
  )
}

// ---------------------------------------------------------------------------
// Solo matches

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n)
const isPlayer = (n: unknown): n is Player => isInt(n) && n >= 0 && n <= 3

function validHand(h: unknown, index: number): h is HandSummary {
  if (typeof h !== 'object' || h === null) return false
  const hand = h as Partial<HandSummary>
  const d = hand.deltas
  if (hand.handIndex !== index || !isPlayer(hand.dealer) || !['E', 'S', 'W', 'N'].includes(hand.prevailingWind as string)) return false
  if (!Array.isArray(d) || d.length !== 4 || !d.every(isInt) || d.reduce((a, b) => a + b, 0) !== 0) return false
  const o = hand.outcome as Record<string, unknown> | undefined
  if (o?.type === 'drawn') return d.every((x) => x === 0)
  if (o?.type !== 'win' || !isPlayer(o.winner) || !(o.from === null || isPlayer(o.from)) || !isInt(o.total) || !isInt(o.flowerPoints)) return false
  const fans = o.fans
  return Array.isArray(fans) && fans.length <= 40 && fans.every((f) => typeof f?.id === 'string' && f.id.length <= 64 && isInt(f.points) && isInt(f.count))
}

/** Whether an uploaded solo match is well-formed and self-consistent. Its hands can't be checked against a wall the server never saw. */
export function validSoloResult(r: unknown, now = Date.now()): r is SoloResult {
  if (typeof r !== 'object' || r === null) return false
  const s = r as Partial<SoloResult>
  if (!isRuleSet(s.rules) || !DIFFICULTIES.includes(s.difficulty as Difficulty)) return false
  if (!isInt(s.seed) || s.seed < 0 || s.seed >= 2 ** 32) return false
  if (!isInt(s.startedAt) || !isInt(s.endedAt) || s.startedAt > s.endedAt || s.endedAt > now + 86_400_000 || s.startedAt < Date.UTC(2025, 0, 1)) return false
  if (!Array.isArray(s.hands) || s.hands.length !== HANDS_PER_MATCH || !s.hands.every((h, i) => validHand(h, i))) return false
  if (!Array.isArray(s.scores) || s.scores.length !== 4) return false
  return s.scores.every((score, p) => score === s.hands!.reduce((sum, h) => sum + h.deltas[p]!, 0))
}

/**
 * Store a solo match for the player who played it (always player 0). Uploading the same match
 * again changes nothing. Never touches ratings.
 */
export async function recordSoloMatch(db: Db, userId: string, r: unknown): Promise<boolean> {
  if (!validSoloResult(r)) return false
  const profile = await db.selectFrom('profiles').select(['display_name', 'avatar']).where('user_id', '=', userId).executeTakeFirst()
  if (!profile) return false
  await db.transaction().execute(async (trx) => {
    const id = randomUUID()
    const inserted = await trx
      .insertInto('matches')
      .values({ id, kind: 'solo', rule_set: r.rules, difficulty: r.difficulty, rated: false, client_key: `${userId}:${r.seed}`, started_at: new Date(r.startedAt), ended_at: new Date(r.endedAt) })
      .onConflict((oc) => oc.column('client_key').doNothing())
      .returning('id')
      .executeTakeFirst()
    if (!inserted) return
    const places = placements(r.scores)
    await trx
      .insertInto('match_players')
      .values(
        r.scores.map((score, p) => ({
          match_id: id,
          player: p,
          user_id: p === 0 ? userId : null,
          name: p === 0 ? profile.display_name : '',
          avatar: p === 0 ? profile.avatar : null,
          bot: p !== 0,
          final_score: score,
          placement: places[p]!,
          full_match: p === 0,
        })),
      )
      .execute()
    await insertHands(trx, id, r.seed, r.hands, null)
  })
  return true
}

// ---------------------------------------------------------------------------
// Reading history, stats and rankings

type MatchRow = { id: string; kind: 'online' | 'solo'; rule_set: RuleSet; difficulty: string | null; rated: boolean; ended_at: Date; player: number }

async function summaries(db: Db, userId: string, rows: MatchRow[]): Promise<MatchSummary[]> {
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)
  const players = await db.selectFrom('match_players').selectAll().where('match_id', 'in', ids).orderBy('player').execute()
  const history = await db.selectFrom('rating_history').selectAll().where('match_id', 'in', ids).where('user_id', '=', userId).execute()
  return rows.map((m) => {
    const change = history.find((h) => h.match_id === m.id)
    return {
      id: m.id,
      kind: m.kind,
      rules: m.rule_set,
      difficulty: (m.difficulty as Difficulty | null) ?? null,
      rated: m.rated,
      endedAt: m.ended_at.getTime(),
      you: m.player as Player,
      players: players
        .filter((p) => p.match_id === m.id)
        .map((p) => ({ name: p.name, avatar: p.avatar, bot: p.bot, userId: p.user_id, score: p.final_score, placement: p.placement })),
      ratingChange: change
        ? displayRating({ mu: change.mu_after, sigma: change.sigma_after }) - displayRating({ mu: change.mu_before, sigma: change.sigma_before })
        : null,
    }
  })
}

function yourMatches(db: Db, userId: string) {
  return db
    .selectFrom('matches as m')
    .innerJoin('match_players as mp', 'mp.match_id', 'm.id')
    .select(['m.id', 'm.kind', 'm.rule_set', 'm.difficulty', 'm.rated', 'm.ended_at', 'mp.player'])
    .where('mp.user_id', '=', userId)
}

/** Your matches, newest first, `limit` at a time. */
export async function history(db: Db, userId: string, opts: { before?: number; limit?: number } = {}): Promise<HistoryPage> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50)
  let q = yourMatches(db, userId)
  if (typeof opts.before === 'number' && Number.isFinite(opts.before)) q = q.where('m.ended_at', '<', new Date(opts.before))
  const rows = await q.orderBy('m.ended_at', 'desc').orderBy('m.id').limit(limit + 1).execute()
  return { matches: await summaries(db, userId, rows.slice(0, limit)), more: rows.length > limit }
}

/** One of your matches, hand by hand; null if it isn't yours (or doesn't exist). */
export async function matchDetail(db: Db, userId: string, matchId: string): Promise<MatchDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(matchId)) return null
  const row = await yourMatches(db, userId).where('m.id', '=', matchId).executeTakeFirst()
  if (!row) return null
  const [summary] = await summaries(db, userId, [row])
  const hands = await db.selectFrom('match_hands').selectAll().where('match_id', '=', matchId).orderBy('hand_index').execute()
  return {
    ...summary!,
    hands: hands.map((h) => ({
      handIndex: h.hand_index,
      dealer: h.dealer as Player,
      prevailingWind: h.prevailing_wind as HandSummary['prevailingWind'],
      outcome: h.result as HandSummary['outcome'],
      deltas: h.player_deltas,
    })),
  }
}

/** Your place on a rule set's leaderboard, or null until you have enough rated matches. */
export async function rankOf(db: Db, userId: string, rules: RuleSet): Promise<number | null> {
  const mine = await db.selectFrom('ratings').selectAll().where('user_id', '=', userId).where('rule_set', '=', rules).executeTakeFirst()
  if (!mine || mine.matches < LEADERBOARD_MIN_MATCHES) return null
  const ahead = await db
    .selectFrom('ratings')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('rule_set', '=', rules)
    .where('matches', '>=', LEADERBOARD_MIN_MATCHES)
    .where(sql<boolean>`mu - 3 * sigma > ${mine.mu - 3 * mine.sigma}`)
    .executeTakeFirstOrThrow()
  return Number(ahead.n) + 1
}

export async function stats(db: Db, userId: string): Promise<PlayerStats> {
  const online: RuleStats[] = []
  for (const rules of RULE_SETS) {
    const agg = await db
      .selectFrom('matches as m')
      .innerJoin('match_players as mp', 'mp.match_id', 'm.id')
      .select((eb) => [
        eb.fn.countAll<number>().as('n'),
        sql<number>`count(*) filter (where mp.placement = 1)`.as('firsts'),
        sql<number | null>`avg(mp.placement)`.as('avg'),
      ])
      .where('mp.user_id', '=', userId)
      .where('m.kind', '=', 'online')
      .where('m.rule_set', '=', rules)
      .executeTakeFirstOrThrow()
    const r = await db.selectFrom('ratings').selectAll().where('user_id', '=', userId).where('rule_set', '=', rules).executeTakeFirst()
    online.push({
      rules,
      rating: r ? displayRating(r) : null,
      rank: await rankOf(db, userId, rules),
      ratedMatches: r?.matches ?? 0,
      matches: Number(agg.n),
      firsts: Number(agg.firsts),
      avgPlacement: agg.avg === null ? null : Number(agg.avg),
    })
  }

  const soloAgg = await db
    .selectFrom('matches as m')
    .innerJoin('match_players as mp', 'mp.match_id', 'm.id')
    .select((eb) => [
      'm.difficulty',
      eb.fn.countAll<number>().as('n'),
      sql<number>`count(*) filter (where mp.placement = 1)`.as('firsts'),
      sql<number>`avg(mp.final_score)`.as('avg'),
    ])
    .where('mp.user_id', '=', userId)
    .where('m.kind', '=', 'solo')
    .groupBy('m.difficulty')
    .execute()
  const best = await sql<{ difficulty: string; result: { total: number; fans: { id: string }[] } }>`
    select distinct on (m.difficulty) m.difficulty, h.result
    from matches m
    join match_players mp on mp.match_id = m.id and mp.user_id = ${userId}
    join match_hands h on h.match_id = m.id
    where m.kind = 'solo' and h.result->>'type' = 'win' and (h.result->>'winner')::int = mp.player
    order by m.difficulty, (h.result->>'total')::int desc`.execute(db)
  const solo: SoloStats[] = DIFFICULTIES.flatMap((difficulty) => {
    const a = soloAgg.find((x) => x.difficulty === difficulty)
    if (!a) return []
    const b = best.rows.find((x) => x.difficulty === difficulty)
    return [{ difficulty, matches: Number(a.n), firsts: Number(a.firsts), avgScore: Math.round(Number(a.avg)), best: b ? { total: b.result.total, fans: b.result.fans.map((f) => f.id) } : null }]
  })
  return { online, solo }
}

/** Top players of a rule set with enough rated matches, best first. */
export async function leaderboard(db: Db, rules: RuleSet, limit = 100): Promise<LeaderboardEntry[]> {
  const rows = await db
    .selectFrom('ratings as r')
    .innerJoin('profiles as p', 'p.user_id', 'r.user_id')
    .select(['r.user_id', 'r.mu', 'r.sigma', 'r.matches', 'p.display_name', 'p.avatar'])
    .where('r.rule_set', '=', rules)
    .where('r.matches', '>=', LEADERBOARD_MIN_MATCHES)
    .orderBy(sql`r.mu - 3 * r.sigma`, 'desc')
    .orderBy('r.matches', 'desc')
    .orderBy('r.user_id')
    .limit(Math.min(Math.max(limit, 1), 100))
    .execute()
  return rows.map((r, i) => ({ rank: i + 1, userId: r.user_id, name: r.display_name, avatar: r.avatar, rating: displayRating(r), matches: r.matches }))
}
