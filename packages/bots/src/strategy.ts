import {
  kindIndex,
  meetsMinimumFor,
  mulberry32,
  scoreFor,
  shantenOfCounts,
  waitingKinds,
  type Action,
  type PlayerView,
  type ScoringMeld,
  type Seat,
  type Tile,
  type ViewMeld,
} from '@mahjong/engine'
import type { BotRequest, Difficulty } from './protocol'

/**
 * Bot decisions. Bots see only their `PlayerView` and the engine's legal actions, and every
 * rule question (shanten, waits, scoring) is answered by the engine.
 */

const KINDS = 34
const isHonor = (k: number) => k >= 27
const isTerminal = (k: number) => k < 27 && (k % 9 === 0 || k % 9 === 8)
const WIND_INDEX = { E: 27, S: 28, W: 29, N: 30 } as const

type Ctx = {
  view: PlayerView
  seat: Seat
  difficulty: Difficulty
  rand: () => number
  /** Copies of each kind this seat cannot see (still in the wall or other hands). */
  unseen: number[]
  meldCount: number
  ownMelds: ScoringMeld[]
}

function countsOf(tiles: readonly Tile[]): number[] {
  const c = new Array<number>(KINDS).fill(0)
  for (const t of tiles) c[kindIndex(t.kind)]!++
  return c
}

function meldIndex(m: ViewMeld): number {
  return Math.min(...m.tiles!.map((t) => kindIndex(t.kind)))
}

function makeCtx(req: Pick<BotRequest, 'view' | 'difficulty' | 'seed'>): Ctx {
  const { view } = req
  const seat = view.seat
  const visible = countsOf(view.hand)
  for (const pond of view.discards) for (const t of pond) visible[kindIndex(t.kind)]!++
  for (const melds of view.melds) for (const m of melds) for (const t of m.tiles ?? []) visible[kindIndex(t.kind)]!++
  const ownMelds = view.melds[seat]!.map((m) => ({ type: m.type, index: meldIndex(m), exposed: m.exposed }))
  return {
    view,
    seat,
    difficulty: req.difficulty,
    rand: mulberry32(req.seed),
    unseen: visible.map((v) => Math.max(0, 4 - v)),
    meldCount: ownMelds.length,
    ownMelds,
  }
}

// ---------------------------------------------------------------------------
// Hand evaluation
// ---------------------------------------------------------------------------

function ukeire(ctx: Ctx, counts: number[], meldCount: number, base: number): number {
  let total = 0
  for (let k = 0; k < KINDS; k++) {
    if (ctx.unseen[k] === 0 || counts[k]! >= 4) continue
    counts[k]!++
    if (shantenOfCounts(counts, meldCount) < base) total += ctx.unseen[k]!
    counts[k]!--
  }
  return total
}

/** Unseen tiles that would complete this ready hand for the rule set's minimum (self-draw or discard). */
function validWaits(ctx: Ctx, counts: number[], melds: ScoringMeld[]): number {
  let total = 0
  const seatWind = ctx.view.seatWinds[ctx.seat]!
  for (const k of waitingKinds(counts, melds.length)) {
    if (ctx.unseen[k] === 0) continue
    const concealed: number[] = []
    counts.forEach((c, i) => {
      for (let j = 0; j < c; j++) concealed.push(i)
    })
    concealed.push(k)
    const base = {
      concealed,
      melds,
      winTile: k,
      seatWind,
      prevailingWind: ctx.view.prevailingWind,
      flowers: ctx.view.flowers[ctx.seat]!.length,
      flowerNumbers: ctx.view.flowers[ctx.seat]!.map((t) => (t.kind.suit === 'flowers' ? t.kind.flower : 0)),
      lastTileOfWall: false,
      replacement: false,
      robbingKong: false,
      winTileVisible: 4 - ctx.unseen[k]! - counts[k]!,
    }
    const rules = ctx.view.rules
    const byDiscard = scoreFor(rules, { ...base, selfDrawn: false })
    const bySelf = scoreFor(rules, { ...base, selfDrawn: true })
    if (byDiscard && meetsMinimumFor(rules, byDiscard)) total += ctx.unseen[k]!
    else if (bySelf && meetsMinimumFor(rules, bySelf)) total += ctx.unseen[k]! / 3 // only a third of draws are ours
  }
  return total
}

/**
 * How promising the hand is for reaching 8 fan, 0..1. Looks at the routes bots can plan for:
 * flushes, all pungs, dragon/wind pungs and fully concealed hands.
 */
function fanPotential(ctx: Ctx, counts: number[], melds: ScoringMeld[]): number {
  const all = [...counts]
  for (const m of melds) {
    if (m.type === 'chow') for (let i = 0; i < 3; i++) all[m.index + i]!++
    else all[m.index]! += m.type === 'kong' ? 4 : 3
  }
  const total = all.reduce((a, b) => a + b, 0)
  const honors = all.slice(27).reduce((a, b) => a + b, 0)
  let bestSuit = 0
  for (let s = 0; s < 3; s++) bestSuit = Math.max(bestSuit, all.slice(s * 9, s * 9 + 9).reduce((a, b) => a + b, 0))
  const flush = (bestSuit + honors) / total

  const pairsOrBetter = all.filter((c) => c >= 2).length
  const chowMelds = melds.filter((m) => m.type === 'chow').length
  const pungRoute = chowMelds > 0 ? 0 : Math.min(1, pairsOrBetter / 5)

  const seatWind = WIND_INDEX[ctx.view.seatWinds[ctx.seat]!]
  const prevailing = WIND_INDEX[ctx.view.prevailingWind]
  let valuable = 0
  for (const k of [31, 32, 33, seatWind, prevailing]) if (all[k]! >= 2) valuable += all[k]! >= 3 ? 0.5 : 0.25
  const concealedRoute = melds.every((m) => !m.exposed) ? 0.5 : 0

  return Math.max(flush >= 0.7 ? flush : 0, pungRoute, Math.min(1, valuable), concealedRoute)
}

/** Lower = better tile to throw away when efficiency ties: isolated honors and terminals first. */
function tileKeepValue(counts: number[], k: number): number {
  if (isHonor(k)) return counts[k]! >= 2 ? 3 : 0
  let v = isTerminal(k) ? 1 : 2
  const r = k % 9
  for (const d of [-2, -1, 1, 2]) {
    const n = k + d
    if (r + d >= 0 && r + d <= 8 && counts[n]! > 0) v += d === -1 || d === 1 ? 2 : 1
  }
  return v + (counts[k]! >= 2 ? 2 : 0)
}

type DiscardEval = { action: Action & { type: 'discard' }; kind: number; shanten: number; ukeire: number; valid: number; potential: number; danger: number; keep: number }

function evaluateDiscards(ctx: Ctx, discards: (Action & { type: 'discard' })[], counts: number[]): DiscardEval[] {
  const byKind = new Map<number, Action & { type: 'discard' }>()
  const tileKind = new Map(ctx.view.hand.map((t) => [t.id, kindIndex(t.kind)]))
  for (const a of discards) {
    const k = tileKind.get(a.tileId)!
    if (!byKind.has(k)) byKind.set(k, a)
  }
  const evals: DiscardEval[] = []
  for (const [k, action] of byKind) {
    counts[k]!--
    const sh = shantenOfCounts(counts, ctx.meldCount)
    evals.push({
      action,
      kind: k,
      shanten: sh,
      ukeire: 0,
      valid: 0,
      potential: ctx.difficulty === 'hard' ? fanPotential(ctx, counts, ctx.ownMelds) : 0,
      danger: 0,
      keep: tileKeepValue(counts, k),
    })
    counts[k]!++
  }
  const best = Math.min(...evals.map((e) => e.shanten))
  for (const e of evals) {
    if (e.shanten > best + (ctx.difficulty === 'hard' ? 1 : 0)) continue
    counts[e.kind]!--
    e.ukeire = ukeire(ctx, counts, ctx.meldCount, e.shanten)
    if (e.shanten === 0) e.valid = validWaits(ctx, counts, ctx.ownMelds)
    counts[e.kind]!++
  }
  return evals
}

/** 0 = safe, larger = more likely to feed a threatening opponent. */
function dangerOf(ctx: Ctx, k: number, threats: Seat[]): number {
  let danger = 0
  for (const s of threats) {
    if (ctx.view.discards[s]!.some((t) => kindIndex(t.kind) === k)) continue // already thrown by them: safe
    const seenOut = 4 - ctx.unseen[k]!
    if (isHonor(k)) danger += seenOut >= 3 ? 0 : seenOut === 2 ? 1 : 3
    else if (isTerminal(k)) danger += 3
    else danger += 5
  }
  return danger
}

function threateningSeats(ctx: Ctx): Seat[] {
  const out: Seat[] = []
  for (let s = 0; s < 4; s++) {
    if (s === ctx.seat) continue
    const exposed = ctx.view.melds[s]!.filter((m) => m.exposed).length
    if (exposed >= 3 || (exposed >= 2 && ctx.view.wallCount < 30)) out.push(s as Seat)
  }
  return out
}

function pick<T>(ctx: Ctx, items: T[]): T {
  return items[Math.floor(ctx.rand() * items.length)]!
}

function chooseDiscard(ctx: Ctx, discards: (Action & { type: 'discard' })[]): Action {
  const counts = countsOf(ctx.view.hand)

  const evals = evaluateDiscards(ctx, discards, counts)
  const bestShanten = Math.min(...evals.map((e) => e.shanten))

  // Easy bots play like medium ones but often make a merely reasonable discard instead of the best.
  if (ctx.difficulty === 'easy' && ctx.rand() < 0.25) {
    return pick(ctx, evals.filter((e) => e.shanten <= bestShanten + 1)).action
  }

  const threats = ctx.difficulty === 'hard' ? threateningSeats(ctx) : []
  if (threats.length > 0 && bestShanten >= 2) {
    for (const e of evals) e.danger = dangerOf(ctx, e.kind, threats)
    const safest = Math.min(...evals.map((e) => e.danger))
    const safe = evals.filter((e) => e.danger === safest).sort((a, b) => a.shanten - b.shanten || b.ukeire - a.ukeire)
    return safe[0]!.action
  }

  const score = (e: DiscardEval) => {
    // Ready hands that can actually score 8 fan dominate; then speed, then fan potential.
    let v = -e.shanten * 100 + e.ukeire
    if (e.shanten === 0) v += e.valid > 0 ? 200 + e.valid * 4 : -60
    if (ctx.difficulty === 'hard') v += e.potential * 25
    return v - e.keep * 0.1
  }
  const ranked = evals.filter((e) => e.shanten <= bestShanten + 1).sort((a, b) => score(b) - score(a))
  const top = ranked.filter((e) => score(e) === score(ranked[0]!))
  return pick(ctx, top).action
}

// ---------------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------------

/**
 * Best shanten after taking `used` from hand into a new meld: a pung or chow is followed by a
 * discard, an exposed kong by a replacement draw (so it is evaluated as it stands).
 */
function shantenAfterClaim(ctx: Ctx, used: number[], meld: ScoringMeld): { shanten: number; potential: number } {
  const counts = countsOf(ctx.view.hand)
  for (const k of used) counts[k]!--
  const melds = [...ctx.ownMelds, meld]
  if (meld.type === 'kong') return { shanten: shantenOfCounts(counts, melds.length), potential: fanPotential(ctx, counts, melds) }
  let best = Infinity
  let potential = 0
  for (let k = 0; k < KINDS; k++) {
    if (counts[k] === 0) continue
    counts[k]!--
    const sh = shantenOfCounts(counts, melds.length)
    if (sh < best) {
      best = sh
      potential = fanPotential(ctx, counts, melds)
    }
    counts[k]!++
  }
  return { shanten: best, potential }
}

function claimWorthIt(ctx: Ctx, action: Action, claimed: number): boolean {
  const current = shantenOfCounts(countsOf(ctx.view.hand), ctx.meldCount)

  let used: number[]
  let meld: ScoringMeld
  if (action.type === 'pung') {
    used = [claimed, claimed]
    meld = { type: 'pung', index: claimed, exposed: true }
  } else if (action.type === 'kong') {
    used = [claimed, claimed, claimed]
    meld = { type: 'kong', index: claimed, exposed: true }
  } else if (action.type === 'chow') {
    const kinds = action.tileIds.map((id) => kindIndex(ctx.view.hand.find((t) => t.id === id)!.kind))
    used = kinds
    meld = { type: 'chow', index: Math.min(claimed, ...kinds), exposed: true }
  } else return false

  const valuable = [31, 32, 33, WIND_INDEX[ctx.view.seatWinds[ctx.seat]!], WIND_INDEX[ctx.view.prevailingWind]]

  const after = shantenAfterClaim(ctx, used, meld)
  if (after.shanten >= current) return false
  // Opening the hand loses concealed-hand fan: only do it with a route to 8 fan.
  if (valuable.includes(claimed) && action.type !== 'chow') return true
  return after.potential >= (ctx.difficulty === 'medium' ? 0.7 : 0.8)
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Pick an action for a bot seat. Only `legal` actions are ever returned, and the choice depends
 * only on the request, so the same request always gives the same action.
 */
export function chooseAction(req: Pick<BotRequest, 'view' | 'legal' | 'difficulty' | 'seed'>): Action {
  const { legal } = req
  if (legal.length === 0) throw new Error('bot asked to act with no legal actions')
  const win = legal.find((a) => a.type === 'win')
  if (win) return win
  const draw = legal.find((a) => a.type === 'draw')
  if (draw) return draw

  const ctx = makeCtx(req)
  const phase = req.view.phase

  if (phase.kind === 'claim' || phase.kind === 'robKong') {
    const claimed = kindIndex(phase.tile.kind)
    const options = legal.filter((a) => a.type === 'pung' || a.type === 'kong' || a.type === 'chow')
    const worth = options.filter((a) => claimWorthIt(ctx, a, claimed))
    const pass = legal.find((a) => a.type === 'pass')!
    if (worth.length === 0) return pass
    // Prefer kong > pung > chow among worthwhile claims.
    const rank = { kong: 0, pung: 1, chow: 2 } as Record<string, number>
    worth.sort((a, b) => rank[a.type]! - rank[b.type]!)
    return worth[0]!
  }

  // Discard phase: take a concealed/promoted kong when it does not slow the hand.
  const kongs = legal.filter((a) => a.type === 'kong')
  if (kongs.length > 0) {
    const counts = countsOf(req.view.hand)
    const before = shantenOfCounts(counts, ctx.meldCount)
    for (const k of kongs) {
      const ids = k.type === 'kong' ? (k.tileIds ?? []) : []
      // Promoting a pung never changes the concealed shape.
      if (ids.length === 1) return k
      const kind = kindIndex(req.view.hand.find((t) => t.id === ids[0])!.kind)
      const after = [...counts]
      after[kind]! -= 4
      // The hand before the replacement draw, as a 13-tile equivalent.
      if (shantenOfCounts(after, ctx.meldCount + 1) <= before) return k
    }
  }

  const discards = legal.filter((a): a is Action & { type: 'discard' } => a.type === 'discard')
  return discards.length > 0 ? chooseDiscard(ctx, discards) : legal[legal.length - 1]!
}
