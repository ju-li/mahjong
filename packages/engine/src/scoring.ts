import { applyExclusions, FAN_BY_ID, type FanHit, type FanId } from './fans'
import { countsOf, decomposeCounts, knittedKinds, waitingKindsByShape, type Form } from './shapes'
import type { HandScore } from './state'
import { KIND_COUNT, type Wind } from './tiles'

/** A declared meld reduced to what scoring needs. `index` is the lowest kind index. */
export type ScoringMeld = { type: 'chow' | 'pung' | 'kong'; index: number; exposed: boolean }

/** Everything about a win that affects its value. Kinds are kind indices (see `kindIndex`). */
export type WinContext = {
  /** Concealed tiles including the winning tile. */
  concealed: number[]
  melds: ScoringMeld[]
  winTile: number
  selfDrawn: boolean
  seatWind: Wind
  prevailingWind: Wind
  flowers: number
  /** The wall was empty when the hand was won. */
  lastTileOfWall: boolean
  /** Self-drawn on a kong replacement tile. */
  replacement: boolean
  robbingKong: boolean
  /** Other copies of the winning kind already visible (discards and exposed melds), not counting the winning tile. */
  winTileVisible: number
}

export type ScoredFan = { id: FanId; name: string; points: number; count: number }

export type ScoreResult = HandScore & { fans: ScoredFan[] }

// ---------------------------------------------------------------------------
// Tile helpers over kind indices
// ---------------------------------------------------------------------------

const WIND_INDEX: Record<Wind, number> = { E: 27, S: 28, W: 29, N: 30 }
const suitOf = (k: number) => (k < 27 ? Math.floor(k / 9) : 3)
const rankOf = (k: number) => (k % 9) + 1
const isHonor = (k: number) => k >= 27
const isWind = (k: number) => k >= 27 && k <= 30
const isDragon = (k: number) => k >= 31
const isTerminal = (k: number) => k < 27 && (rankOf(k) === 1 || rankOf(k) === 9)
const isTH = (k: number) => isHonor(k) || isTerminal(k)

const GREEN = new Set([19, 20, 21, 23, 25, 32])
const REVERSIBLE = new Set([9, 10, 11, 12, 13, 16, 17, 19, 21, 22, 23, 25, 26, 33])

/** A set in a scored arrangement. `concealed` matters for concealed-pung counting only. */
type ASet = { type: 'chow' | 'pung' | 'kong'; index: number; concealed: boolean; declared: boolean; exposed: boolean }

type Arrangement =
  | { form: 'standard' | 'knittedStraight'; sets: ASet[]; pair: number; knitted: number[] | null; winIn: 'pair' | number | 'knitted' }
  | { form: 'sevenPairs'; pairs: number[] }
  | { form: 'thirteenOrphans' }
  | { form: 'honorsKnitted'; greater: boolean; knittedStraight: boolean }

const setKinds = (s: { type: string; index: number }): number[] =>
  s.type === 'chow' ? [s.index, s.index + 1, s.index + 2] : new Array<number>(s.type === 'kong' ? 4 : 3).fill(s.index)

// ---------------------------------------------------------------------------
// Set-group fans (chows and pungs), with the account-once principle
// ---------------------------------------------------------------------------

type Pick = { id: FanId; members: number[] }

/** Choose pair fans so no set joins more than two of them and they form no cycle. Maximises points. */
function bestPairFans(pairs: Pick[]): Pick[] {
  let best: Pick[] = []
  let bestValue = 0
  const n = pairs.length
  for (let mask = 1; mask < 1 << n; mask++) {
    const chosen = pairs.filter((_, i) => mask & (1 << i))
    const degree = new Map<number, number>()
    const parent = new Map<number, number>()
    const find = (x: number): number => {
      while (parent.has(x) && parent.get(x) !== x) x = parent.get(x)!
      return x
    }
    let ok = true
    for (const p of chosen) {
      const [a, b] = p.members as [number, number]
      degree.set(a, (degree.get(a) ?? 0) + 1)
      degree.set(b, (degree.get(b) ?? 0) + 1)
      if (degree.get(a)! > 2 || degree.get(b)! > 2) ok = false
      const ra = find(a)
      const rb = find(b)
      if (ra === rb) ok = false
      parent.set(ra, rb)
      if (!parent.has(rb)) parent.set(rb, rb)
    }
    if (!ok) continue
    const value = chosen.reduce((v, p) => v + FAN_BY_ID[p.id].points, 0)
    if (value > bestValue) {
      bestValue = value
      best = chosen
    }
  }
  return best
}

type Group = { suit: number; rank: number }

function isPermOf(values: number[], expected: number[]): boolean {
  const a = [...values].sort((x, y) => x - y)
  const b = [...expected].sort((x, y) => x - y)
  return a.every((v, i) => v === b[i])
}

function shifted(ranks: number[], steps: number[]): boolean {
  const r = [...ranks].sort((a, b) => a - b)
  return steps.some((d) => r.every((v, i) => v === r[0]! + i * d))
}

function chowTriple(c: Group[]): FanId | null {
  const suits = c.map((x) => x.suit)
  const ranks = c.map((x) => x.rank)
  const sameSuit = suits.every((s) => s === suits[0])
  const allSuits = new Set(suits).size === 3
  if (sameSuit) {
    if (isPermOf(ranks, [1, 4, 7])) return 'pureStraight'
    if (ranks.every((r) => r === ranks[0])) return 'pureTripleChow'
    if (shifted(ranks, [1, 2])) return 'pureShiftedChows'
  }
  if (allSuits) {
    if (isPermOf(ranks, [1, 4, 7])) return 'mixedStraight'
    if (ranks.every((r) => r === ranks[0])) return 'mixedTripleChow'
    if (shifted(ranks, [1])) return 'mixedShiftedChows'
  }
  return null
}

function chowPair(a: Group, b: Group): FanId | null {
  if (a.suit === b.suit) {
    if (a.rank === b.rank) return 'pureDoubleChow'
    if (Math.abs(a.rank - b.rank) === 3) return 'shortStraight'
    if (Math.min(a.rank, b.rank) === 1 && Math.max(a.rank, b.rank) === 7) return 'twoTerminalChows'
    return null
  }
  return a.rank === b.rank ? 'mixedDoubleChow' : null
}

function chowQuad(c: Group[]): FanId | null {
  if (!c.every((x) => x.suit === c[0]!.suit)) return null
  const ranks = c.map((x) => x.rank)
  if (ranks.every((r) => r === ranks[0])) return 'quadrupleChow'
  if (shifted(ranks, [1, 2])) return 'fourPureShiftedChows'
  return null
}

function pungTriple(p: Group[]): FanId | null {
  const suits = p.map((x) => x.suit)
  const ranks = p.map((x) => x.rank)
  if (suits.every((s) => s === suits[0]) && shifted(ranks, [1])) return 'pureShiftedPungs'
  if (new Set(suits).size === 3) {
    if (ranks.every((r) => r === ranks[0])) return 'triplePung'
    if (shifted(ranks, [1])) return 'mixedShiftedPungs'
  }
  return null
}

const pungPair = (a: Group, b: Group): FanId | null => (a.suit !== b.suit && a.rank === b.rank ? 'doublePung' : null)

function pungQuad(p: Group[]): FanId | null {
  return p.every((x) => x.suit === p[0]!.suit) && shifted(p.map((x) => x.rank), [1]) ? 'fourPureShiftedPungs' : null
}

/** Fans among a group of sets: a 4-set fan, else the best 3-set fan (+ one pairing for the leftover), else pair fans. */
function groupFans(
  groups: Group[],
  quad: (g: Group[]) => FanId | null,
  triple: (g: Group[]) => FanId | null,
  pair: (a: Group, b: Group) => FanId | null,
): FanId[] {
  const n = groups.length
  if (n === 4) {
    const q = quad(groups)
    if (q) return [q]
  }
  const pairPicks: Pick[] = []
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const id = pair(groups[i]!, groups[j]!)
      if (id) pairPicks.push({ id, members: [i, j] })
    }
  }
  let best: FanId[] = bestPairFans(pairPicks).map((p) => p.id)
  let bestValue = best.reduce((v, id) => v + FAN_BY_ID[id].points, 0)
  // Each trio of sets (with the leftover set, if any).
  const trios: { trio: number[]; rest: number | null }[] =
    n === 3 ? [{ trio: [0, 1, 2], rest: null }] : n === 4 ? [0, 1, 2, 3].map((r) => ({ trio: [0, 1, 2, 3].filter((i) => i !== r), rest: r })) : []
  for (const { trio, rest } of trios) {
    const id = triple(trio.map((i) => groups[i]!))
    if (!id) continue
    const fans: FanId[] = [id]
    if (rest !== null) {
      // The leftover set may combine once with one set of the trio.
      // Skip pairings the trio fan cancels (e.g. a straight cancels short straight).
      const extra = trio
        .map((i) => pair(groups[rest]!, groups[i]!))
        .filter((x): x is FanId => x !== null && !FAN_BY_ID[id].excludes.includes(x))
        .sort((a, b) => FAN_BY_ID[b].points - FAN_BY_ID[a].points)[0]
      if (extra) fans.push(extra)
    }
    const value = fans.reduce((v, x) => v + FAN_BY_ID[x].points, 0)
    if (value > bestValue) {
      best = fans
      bestValue = value
    }
  }
  return best
}

// ---------------------------------------------------------------------------
// Fan detection
// ---------------------------------------------------------------------------

function counted(ids: FanId[]): FanHit[] {
  const map = new Map<FanId, number>()
  for (const id of ids) map.set(id, (map.get(id) ?? 0) + 1)
  return [...map].map(([id, count]) => ({ id, count }))
}

/** Fans that depend only on which tiles are in the hand. */
function tileFans(all: number[], out: FanId[]): void {
  const suits = new Set(all.filter((k) => !isHonor(k)).map(suitOf))
  const honors = all.some(isHonor)
  const suited = all.filter((k) => !isHonor(k))
  const ranks = suited.map(rankOf)

  if (all.every((k) => GREEN.has(k))) out.push('allGreen')
  if (all.every(isHonor)) out.push('allHonors')
  else if (all.every(isTerminal)) out.push('allTerminals')
  else if (all.every(isTH) && honors) out.push('allTerminalsAndHonors')

  if (!honors && suits.size === 1) out.push('fullFlush')
  if (honors && suits.size === 1) out.push('halfFlush')
  if (suits.size === 2) out.push('oneVoidedSuit')
  if (!honors) out.push('noHonors')
  if (suits.size === 3 && all.some(isWind) && all.some(isDragon)) out.push('allTypes')
  if (all.every((k) => REVERSIBLE.has(k))) out.push('reversibleTiles')

  if (!honors) {
    if (ranks.every((r) => r >= 7)) out.push('upperTiles')
    else if (ranks.every((r) => r >= 4 && r <= 6)) out.push('middleTiles')
    else if (ranks.every((r) => r <= 3)) out.push('lowerTiles')
    if (ranks.every((r) => r >= 6)) out.push('upperFour')
    if (ranks.every((r) => r <= 4)) out.push('lowerFour')
  }
  if (all.every((k) => !isTH(k))) out.push('allSimples')
}

function tileHogs(all: number[], kongKinds: Set<number>): number {
  const counts = countsOf(all)
  let hogs = 0
  for (let k = 0; k < KIND_COUNT; k++) if (counts[k] === 4 && !kongKinds.has(k)) hogs++
  return hogs
}

function situationalFans(ctx: WinContext, out: FanId[]): void {
  const exposedMelds = ctx.melds.filter((m) => m.exposed).length
  if (ctx.selfDrawn) out.push('selfDrawn')
  if (ctx.lastTileOfWall) out.push(ctx.selfDrawn ? 'lastTileDraw' : 'lastTileClaim')
  if (ctx.replacement && ctx.selfDrawn) out.push('outWithReplacementTile')
  if (ctx.robbingKong) out.push('robbingTheKong')
  if (ctx.winTileVisible >= 3) out.push('lastTile')
  if (exposedMelds === 0) out.push(ctx.selfDrawn ? 'fullyConcealedHand' : 'concealedHand')
}

function arrangementFans(a: Arrangement, ctx: WinContext, all: number[], singleWaitKind: boolean): FanId[] {
  const out: FanId[] = []
  situationalFans(ctx, out)

  if (a.form === 'thirteenOrphans') {
    out.push('thirteenOrphans')
    return out
  }
  if (a.form === 'honorsKnitted') {
    out.push(a.greater ? 'greaterHonorsAndKnittedTiles' : 'lesserHonorsAndKnittedTiles')
    if (a.knittedStraight) out.push('knittedStraight')
    return out
  }

  tileFans(all, out)

  if (a.form === 'sevenPairs') {
    const p = [...a.pairs].sort((x, y) => x - y)
    const shiftedPairs = p.every((k, i) => !isHonor(k) && suitOf(k) === suitOf(p[0]!) && k === p[0]! + i)
    out.push(shiftedPairs ? 'sevenShiftedPairs' : 'sevenPairs')
    for (let i = 0; i < tileHogs(all, new Set()); i++) out.push('tileHog')
    return out
  }

  // Standard or knitted-straight arrangement.
  const sets = a.sets
  const pair = a.pair
  if (a.form === 'knittedStraight') {
    out.push('knittedStraight')
    // The knitted straight counts as three chows (V37).
    if (sets.every((s) => s.type === 'chow') && !isHonor(pair)) out.push('allChows')
  }

  const pungs = sets.filter((s) => s.type !== 'chow')
  const chows = sets.filter((s) => s.type === 'chow')
  const windPungs = pungs.filter((s) => isWind(s.index))
  const dragonPungs = pungs.filter((s) => isDragon(s.index))

  // Winds and dragons.
  if (windPungs.length === 4) out.push('bigFourWinds')
  else if (windPungs.length === 3 && isWind(pair)) out.push('littleFourWinds')
  else if (windPungs.length === 3) out.push('bigThreeWinds')
  if (dragonPungs.length === 3) out.push('bigThreeDragons')
  else if (dragonPungs.length === 2 && isDragon(pair)) out.push('littleThreeDragons')
  else if (dragonPungs.length === 2) out.push('twoDragonPungs')
  dragonPungs.forEach(() => out.push('dragonPung'))
  if (pungs.some((s) => s.index === WIND_INDEX[ctx.prevailingWind])) out.push('prevalentWind')
  if (pungs.some((s) => s.index === WIND_INDEX[ctx.seatWind])) out.push('seatWind')
  for (const s of pungs) {
    const k = s.index
    const special = k === WIND_INDEX[ctx.prevailingWind] || k === WIND_INDEX[ctx.seatWind]
    if (isTerminal(k) || (isWind(k) && !special && windPungs.length < 3)) out.push('pungOfTerminalsOrHonors')
  }

  // Kongs and concealed pungs.
  const melded = sets.filter((s) => s.type === 'kong' && s.exposed).length
  const concealedKongs = sets.filter((s) => s.type === 'kong' && !s.exposed).length
  const kongs = melded + concealedKongs
  if (kongs === 4) out.push('fourKongs')
  else if (kongs === 3) out.push('threeKongs')
  else if (concealedKongs === 2) out.push('twoConcealedKongs')
  else if (melded === 2) out.push('twoMeldedKongs')
  else if (melded === 1 && concealedKongs === 1) out.push('concealedKongAndMeldedKong')
  else {
    if (melded === 1) out.push('meldedKong')
    if (concealedKongs === 1) out.push('concealedKong')
  }
  const concealedPungs = pungs.filter((s) => s.concealed).length
  if (concealedPungs === 4) out.push('fourConcealedPungs')
  else if (concealedPungs === 3) out.push('threeConcealedPungs')
  else if (concealedPungs === 2) out.push('twoConcealedPungs')

  if (pungs.length === 4) out.push('allPungs')
  for (let i = 0; i < tileHogs(all, new Set(sets.filter((s) => s.type === 'kong').map((s) => s.index))); i++) out.push('tileHog')

  // Set groups.
  const chowGroups = chows.map((s) => ({ suit: suitOf(s.index), rank: rankOf(s.index) }))
  const suitedPungs = pungs.filter((s) => !isHonor(s.index)).map((s) => ({ suit: suitOf(s.index), rank: rankOf(s.index) }))
  out.push(...groupFans(chowGroups, chowQuad, chowTriple, chowPair))
  out.push(...groupFans(suitedPungs, pungQuad, pungTriple, pungPair))

  // Whole-hand shapes needing sets.
  if (a.form === 'standard') {
    const members = [...sets.map(setKinds), [pair, pair]]
    if (members.every((m) => m.some(isTH))) out.push('outsideHand')
    if (members.every((m) => m.some((k) => !isHonor(k) && rankOf(k) === 5))) out.push('allFives')
    if (pungs.length === 4 && !isHonor(pair) && [...pungs.map((s) => s.index), pair].every((k) => !isHonor(k) && rankOf(k) % 2 === 0)) {
      out.push('allEvenPungs')
    }
    if (chows.length === 4 && !isHonor(pair)) out.push('allChows')

    if (chows.length === 4) {
      const g = chowGroups
      const bySuit = (s: number) => g.filter((x) => x.suit === s).map((x) => x.rank).sort()
      if (g.every((x) => x.suit === g[0]!.suit) && suitOf(pair) === g[0]!.suit && rankOf(pair) === 5 && bySuit(g[0]!.suit).join() === '1,1,7,7') {
        out.push('pureTerminalChows')
      }
      const suitsUsed = [...new Set(g.map((x) => x.suit))]
      if (
        suitsUsed.length === 2 &&
        suitsUsed.every((s) => bySuit(s).join() === '1,7') &&
        !isHonor(pair) &&
        rankOf(pair) === 5 &&
        !suitsUsed.includes(suitOf(pair))
      ) {
        out.push('threeSuitedTerminalChows')
      }
    }

    // Nine Gates: concealed 1112345678999 in one suit before the winning tile.
    if (ctx.melds.length === 0) {
      const before = countsOf(ctx.concealed)
      before[ctx.winTile]!--
      const suit = suitOf(ctx.winTile)
      if (suit < 3) {
        const pattern = [3, 1, 1, 1, 1, 1, 1, 1, 3]
        if (before.every((c, k) => (suitOf(k) === suit ? c === pattern[rankOf(k) - 1] : c === 0))) {
          out.push('nineGates')
          // Nine Gates cancels one terminal pung (the 111 or 999 of the pattern), not both (V38).
          const at = out.indexOf('pungOfTerminalsOrHonors')
          if (at >= 0) out.splice(at, 1)
        }
      }
    }

    // Melded hand: four exposed melds, won on a discard.
    if (ctx.melds.length === 4 && ctx.melds.every((m) => m.exposed) && !ctx.selfDrawn) out.push('meldedHand')
  }

  // Wait fans count only when the hand had exactly one winning kind.
  if (singleWaitKind && a.winIn !== 'knitted') {
    if (a.winIn === 'pair') out.push('singleWait')
    else {
      const s = sets[a.winIn]!
      if (s.type === 'chow') {
        const offset = ctx.winTile - s.index
        if (offset === 1) out.push('closedWait')
        else if ((offset === 2 && rankOf(s.index) === 1) || (offset === 0 && rankOf(s.index) === 7)) out.push('edgeWait')
      }
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Arrangements and the best score
// ---------------------------------------------------------------------------

function arrangements(form: Form, ctx: WinContext): Arrangement[] {
  switch (form.form) {
    case 'sevenPairs':
    case 'thirteenOrphans':
    case 'honorsKnitted':
      return [form]
    case 'standard':
    case 'knittedStraight': {
      const declared: ASet[] = ctx.melds.map((m) => ({ type: m.type, index: m.index, concealed: !m.exposed, declared: true, exposed: m.exposed }))
      const own: ASet[] = form.sets.map((s) => ({ type: s.type, index: s.index, concealed: true, declared: false, exposed: false }))
      const knitted = form.form === 'knittedStraight' ? knittedKinds(form.suits) : null
      // The winning tile may complete any concealed set that contains it, the pair, or a knitted slot.
      const places: ('pair' | number | 'knitted')[] = []
      if (form.pair === ctx.winTile) places.push('pair')
      own.forEach((s, i) => setKinds(s).includes(ctx.winTile) && places.push(declared.length + i))
      if (knitted?.includes(ctx.winTile)) places.push('knitted')
      return places.map((winIn) => {
        const sets = [...declared, ...own].map((s) => ({ ...s }))
        // A pung completed by a claimed tile is not concealed.
        if (typeof winIn === 'number' && !ctx.selfDrawn && sets[winIn]!.type === 'pung') sets[winIn]!.concealed = false
        return { form: form.form, sets, pair: form.pair, knitted, winIn }
      })
    }
  }
}

function meldTiles(melds: readonly ScoringMeld[]): number[] {
  return melds.flatMap(setKinds)
}

/** Total of a scored fan list, flowers included. */
const pointsOf = (hits: FanHit[]) => hits.reduce((v, h) => v + FAN_BY_ID[h.id].points * h.count, 0)

/**
 * Best score for a winning hand, or null if the tiles are not a complete MCR shape.
 * `total` includes flower points; the 8-point minimum applies to `total - flowerPoints`.
 */
export function scoreHand(ctx: WinContext): ScoreResult | null {
  const counts = countsOf(ctx.concealed)
  const forms = decomposeCounts(counts, ctx.melds.length)
  if (forms.length === 0) return null

  const all = [...ctx.concealed, ...meldTiles(ctx.melds)]
  const before = [...counts]
  before[ctx.winTile]!--
  // Wait fans need a single completing kind by shape, even if some other kind is fully held (V36).
  const singleWaitKind = waitingKindsByShape(before, ctx.melds.length).length === 1

  let best: FanHit[] | null = null
  let bestPoints = -1
  for (const form of forms) {
    for (const a of arrangements(form, ctx)) {
      let hits = applyExclusions(counted(arrangementFans(a, ctx, all, singleWaitKind)))
      if (pointsOf(hits) === 0) hits = [{ id: 'chickenHand', count: 1 }]
      const points = pointsOf(hits)
      if (points > bestPoints) {
        best = hits
        bestPoints = points
      }
    }
  }

  const fans: ScoredFan[] = best!
    .map((h) => ({ id: h.id, name: FAN_BY_ID[h.id].name, points: FAN_BY_ID[h.id].points, count: h.count }))
    .sort((x, y) => y.points - x.points || x.name.localeCompare(y.name))
  if (ctx.flowers > 0) fans.push({ id: 'flowerTiles', name: FAN_BY_ID.flowerTiles.name, points: 1, count: ctx.flowers })
  return { fans, total: bestPoints + ctx.flowers, flowerPoints: ctx.flowers }
}

/** The 8-point minimum: flowers never count towards it. */
export const MIN_FAN = 8

export function meetsMinimum(score: HandScore): boolean {
  return score.total - score.flowerPoints >= MIN_FAN
}
