import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'kysely'
import {
  applyAction,
  dealerFor,
  handSeed,
  isMatchOver,
  legalActions,
  mulberry32,
  newHand,
  newMatch,
  nextHand,
  prevailingWindFor,
  replay,
  STANDARD_HOUSE,
  withHouse,
  type Action,
  type RuleConfig,
  type Match,
  type Seat,
} from '@mahjong/engine'
import { handSummaries, LEADERBOARD_MIN_MATCHES, type SoloResult } from '@mahjong/protocol'
import type { Db } from './db'
import { ensureProfile } from './friends'
import { history, leaderboard, matchDetail, rankOf, ratedPlayers, recordOnlineMatch, recordSoloMatch, stats, validSoloResult, type OnlineMatchRecord } from './matches'
import { startTestDb } from './testDb'

let db: Db
let stop: () => Promise<void>

beforeAll(async () => {
  ;({ db, stop } = await startTestDb())
})
afterAll(async () => {
  await stop()
})
beforeEach(async () => {
  await sql`truncate rating_history, ratings, match_hands, match_players, matches, friendships, profiles`.execute(db)
  for (const [id, name] of [['a', 'Ann'], ['b', 'Bo'], ['c', 'Cy'], ['d', 'Di']]) await ensureProfile(db, id!, { name: name!, avatar: 1 })
})

/** A whole match played with seeded random legal actions, plus every hand's actions. */
function playMatch(seed: number, config: RuleConfig = { rules: 'mcr' }, changeAt?: { hand: number; house: unknown }): { match: Match; actions: Action[][] } {
  const rand = mulberry32(seed)
  let match = newMatch(seed, config)
  const actions: Action[][] = []
  while (!isMatchOver(match)) {
    if (changeAt && match.handIndex === changeAt.hand) match = withHouse(match, changeAt.house)
    let state = match.current!
    const log: Action[] = []
    while (state.phase.kind !== 'ended') {
      const seat = ([0, 1, 2, 3] as Seat[]).find((s) => legalActions(state, s).length > 0)!
      const legal = legalActions(state, seat)
      const win = legal.find((a) => a.type === 'win')
      const claims = legal.filter((a) => a.type !== 'pass' && a.type !== 'discard' && a.type !== 'draw')
      const pool = win ? [win] : claims.length > 0 ? claims : legal
      const action = pool[Math.floor(rand() * pool.length)]!
      log.push(action)
      state = applyAction(state, action)
    }
    actions.push(log)
    match = nextHand(match, state.phase.result)
  }
  return { match, actions }
}

const played = playMatch(7)

function online(players: OnlineMatchRecord['players'], opts: { id?: string; scores?: number[]; ended?: number } = {}): OnlineMatchRecord {
  return {
    id: opts.id ?? randomUUID(),
    rules: 'mcr',
    house: STANDARD_HOUSE.mcr,
    seed: played.match.seed,
    startedAt: new Date((opts.ended ?? Date.now()) - 3_600_000),
    endedAt: new Date(opts.ended ?? Date.now()),
    hands: handSummaries(played.match),
    actions: played.actions,
    scores: opts.scores ?? played.match.scores,
    players,
  }
}

const human = (userId: string | null, name: string, fullMatch = true) => ({ userId, name, avatar: 3, bot: false, fullMatch })
const bot = { userId: null, name: '', avatar: null, bot: true, fullMatch: false }

function solo(seed = 42, overrides: Partial<SoloResult> = {}): SoloResult {
  const { match } = playMatch(seed)
  return { rules: 'mcr', difficulty: 'hard', seed, startedAt: Date.now() - 3_600_000, endedAt: Date.now(), hands: handSummaries(match), scores: match.scores, ...overrides }
}

describe('ratedPlayers', () => {
  it('needs two signed-in players who played the whole match, each account once', () => {
    expect(ratedPlayers([human('a', 'Ann'), human('b', 'Bo'), bot, bot])).toEqual([0, 1])
    expect(ratedPlayers([human('a', 'Ann'), human(null, 'Guest'), bot, bot])).toEqual([])
    expect(ratedPlayers([human('a', 'Ann'), human('b', 'Bo', false), human('c', 'Cy'), bot])).toEqual([0, 2])
    expect(ratedPlayers([human('a', 'Ann'), human('a', 'Ann again'), human('b', 'Bo'), bot])).toEqual([])
  })
})

describe('online matches', () => {
  it('are stored hand by hand, replayable from their seeds and actions', async () => {
    const rec = online([human('a', 'Ann'), human('b', 'Bo'), bot, bot])
    await recordOnlineMatch(db, rec)
    const hands = await db.selectFrom('match_hands').selectAll().where('match_id', '=', rec.id).orderBy('hand_index').execute()
    expect(hands).toHaveLength(16)
    for (const h of hands) {
      const init = newHand({ seed: handSeed(rec.seed, h.hand_index), dealer: dealerFor(h.hand_index), prevailingWind: prevailingWindFor(h.hand_index), rules: 'mcr' })
      expect(Number(h.seed)).toBe(init.seed)
      const end = replay(init, h.actions as Action[])
      expect(end.phase.kind).toBe('ended')
      expect(h.result).toEqual(rec.hands[h.hand_index]!.outcome)
    }
  })

  it('rate signed-in full-match players once, even if saved twice', async () => {
    const rec = online([human('a', 'Ann'), human('b', 'Bo'), human(null, 'Guest'), bot], { scores: [30, -10, 0, -20] })
    const changes = await recordOnlineMatch(db, rec)
    expect([...changes.keys()].sort()).toEqual(['a', 'b'])
    expect(changes.get('a')!.after).toBeGreaterThan(changes.get('b')!.after)
    expect(changes.get('a')!.before).toBe(1000)
    const again = await recordOnlineMatch(db, rec)
    expect(again).toEqual(changes)
    const ratings = await db.selectFrom('ratings').selectAll().orderBy('user_id').execute()
    expect(ratings.map((r) => [r.user_id, r.matches, r.firsts])).toEqual([
      ['a', 1, 1],
      ['b', 1, 0],
    ])
    expect(await db.selectFrom('matches').select('rated').executeTakeFirstOrThrow()).toEqual({ rated: true })
  })

  it('with house rules are rated too, and keep each hand\'s rules for replays', async () => {
    const start = { ...STANDARD_HOUSE.hk, kongFaan: 'each1' as const, payment: 'full' as const }
    const later = { ...start, maxFaan: 8 as const }
    const custom = playMatch(11, { rules: 'hk', house: start }, { hand: 5, house: later })
    const rec: OnlineMatchRecord = {
      ...online([human('a', 'Ann'), human('b', 'Bo'), bot, bot]),
      rules: 'hk',
      house: start,
      seed: custom.match.seed,
      hands: handSummaries(custom.match),
      actions: custom.actions,
      scores: custom.match.scores,
    }
    const changes = await recordOnlineMatch(db, rec)
    expect(changes.size).toBe(2)
    const stored = await db.selectFrom('matches').select(['rule_set', 'house_rules', 'rated']).where('id', '=', rec.id).executeTakeFirstOrThrow()
    expect(stored).toEqual({ rule_set: 'hk', house_rules: start, rated: true })
    const hands = await db.selectFrom('match_hands').selectAll().where('match_id', '=', rec.id).orderBy('hand_index').execute()
    for (const h of hands) {
      expect(h.house_rules).toEqual(h.hand_index <= 5 ? start : later) // changed during hand 5: from hand 6
      const init = newHand({ seed: handSeed(rec.seed, h.hand_index), dealer: dealerFor(h.hand_index), prevailingWind: prevailingWindFor(h.hand_index), rules: 'hk', house: h.house_rules as never })
      const end = replay(init, h.actions as Action[])
      expect(end.phase.kind === 'ended' && end.phase.result).toEqual(custom.match.history[h.hand_index]!.result)
    }
    const detail = await matchDetail(db, 'a', rec.id)
    expect(detail!.house).toEqual(start)
    expect(detail!.hands[7]!.house).toEqual(later)
    expect((await history(db, 'a')).matches[0]!.house).toEqual(start)
  })

  it('leave ratings alone with fewer than two rated players', async () => {
    const changes = await recordOnlineMatch(db, online([human('a', 'Ann'), human('b', 'Bo', false), bot, bot]))
    expect(changes.size).toBe(0)
    expect(await db.selectFrom('ratings').selectAll().execute()).toEqual([])
  })
})

describe('solo matches', () => {
  it('are validated', () => {
    expect(validSoloResult(solo())).toBe(true)
    const r = solo()
    expect(validSoloResult({ ...r, scores: [1, 2, 3, 4] })).toBe(false)
    expect(validSoloResult({ ...r, hands: r.hands.slice(1) })).toBe(false)
    expect(validSoloResult({ ...r, difficulty: 'godlike' })).toBe(false)
    const bent = structuredClone(r)
    bent.hands[3]!.deltas = [100, 0, 0, 0]
    expect(validSoloResult(bent)).toBe(false)
    expect(validSoloResult(null)).toBe(false)
  })

  it('are stored once for the uploader and never rated', async () => {
    const r = solo()
    expect(await recordSoloMatch(db, 'a', r)).toBe(true)
    expect(await recordSoloMatch(db, 'a', r)).toBe(true)
    expect(await recordSoloMatch(db, 'a', { ...r, scores: [0, 0, 0, 1] })).toBe(false)
    const page = await history(db, 'a')
    expect(page.matches).toHaveLength(1)
    expect(page.matches[0]).toMatchObject({ kind: 'solo', difficulty: 'hard', rated: false, you: 0, ratingChange: null })
    expect(page.matches[0]!.players.map((p) => p.bot)).toEqual([false, true, true, true])
    expect(await db.selectFrom('ratings').selectAll().execute()).toEqual([])
    // Someone else uploading the same seed is their own match.
    expect(await recordSoloMatch(db, 'b', r)).toBe(true)
    expect((await history(db, 'b')).matches).toHaveLength(1)
  })

  it('keep their house rules, cleaned of anything unknown', async () => {
    const r = solo(43, { house: { minFan: 4, flowers: 'maybe', extra: 1 } as never })
    r.hands[0]!.house = { minFan: 0, junk: true } as never
    expect(await recordSoloMatch(db, 'a', r)).toBe(true)
    const [m] = (await history(db, 'a')).matches
    expect(m!.house).toEqual({ minFan: 4, flowers: true })
    const detail = await matchDetail(db, 'a', m!.id)
    expect(detail!.hands[0]!.house).toEqual({ minFan: 0, flowers: true })
    expect(detail!.hands[1]!.house).toEqual(STANDARD_HOUSE.mcr)
  })
})

describe('reading', () => {
  it('pages history newest first and only shows your own matches in detail', async () => {
    const now = Date.now()
    const ids: string[] = []
    for (let i = 0; i < 5; i++) {
      const rec = online([human('a', 'Ann'), human('b', 'Bo'), bot, bot], { ended: now - i * 60_000 })
      ids.push(rec.id)
      await recordOnlineMatch(db, rec)
    }
    const first = await history(db, 'a', { limit: 3 })
    expect(first.matches.map((m) => m.id)).toEqual(ids.slice(0, 3))
    expect(first.more).toBe(true)
    const rest = await history(db, 'a', { limit: 3, before: first.matches.at(-1)!.endedAt })
    expect(rest.matches.map((m) => m.id)).toEqual(ids.slice(3))
    expect(rest.more).toBe(false)
    expect(first.matches[0]!.ratingChange).not.toBeNull()

    const detail = await matchDetail(db, 'a', ids[0]!)
    expect(detail!.hands).toHaveLength(16)
    expect(await matchDetail(db, 'c', ids[0]!)).toBeNull()
    expect(await matchDetail(db, 'a', 'not-a-uuid')).toBeNull()
  })

  it('reports stats and ranks players once they have enough rated matches', async () => {
    for (let i = 0; i < LEADERBOARD_MIN_MATCHES; i++) {
      await recordOnlineMatch(db, online([human('a', 'Ann'), human('b', 'Bo'), human('c', 'Cy'), bot], { scores: [40, 0, -20, -20] }))
    }
    await recordOnlineMatch(db, online([human('d', 'Di'), human('a', 'Ann'), bot, bot], { scores: [10, -10, 0, 0] }))
    await recordSoloMatch(db, 'a', solo(42))

    const board = await leaderboard(db, 'mcr')
    expect(board.map((e) => e.userId)).toEqual(['a', 'b', 'c'])
    expect(board[0]).toMatchObject({ rank: 1, name: 'Ann', matches: LEADERBOARD_MIN_MATCHES + 1 })
    expect(board[0]!.rating).toBeGreaterThan(board[2]!.rating)
    expect(await rankOf(db, 'c', 'mcr')).toBe(3)
    expect(await rankOf(db, 'd', 'mcr')).toBeNull() // one rated match only
    expect(await leaderboard(db, 'hk')).toEqual([])

    const s = await stats(db, 'a')
    const mcr = s.online.find((o) => o.rules === 'mcr')!
    expect(mcr).toMatchObject({ rank: 1, ratedMatches: LEADERBOARD_MIN_MATCHES + 1, matches: LEADERBOARD_MIN_MATCHES + 1, firsts: LEADERBOARD_MIN_MATCHES })
    expect(mcr.rating).toBe(board[0]!.rating)
    expect(s.online.find((o) => o.rules === 'hk')).toMatchObject({ rating: null, rank: null, matches: 0, avgPlacement: null })
    expect(s.solo).toHaveLength(1)
    expect(s.solo[0]).toMatchObject({ difficulty: 'hard', matches: 1 })
  })
})
