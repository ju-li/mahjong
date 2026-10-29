import { houseOf, standardHouse, type SgHouseRules } from './house'
import { isDragon, isHonor, isNineGates, isTerminal, isWind, SEAT_NUMBER, setKinds, suitOf, WIND_INDEX, type HSet } from './kinds'
import type { ScoringMeld, WinContext } from './scoring'
import { countsOf, decomposeCounts, type Form } from './shapes'
import type { Bite, BiteKind, GameState, HandScore, Seat } from './state'

/**
 * Singapore tai scoring, "1 tai to win, 5 tai limit" home-table style, with 148 tiles (flowers, seasons and the
 * four animals) and instant bites (咬) for animal pairs, complete flower sets and kongs.
 * Tai values, bites and payments follow the common Singapore home-game tables (e.g.
 * https://en.wikipedia.org/wiki/Singaporean_mahjong); tables vary, so the house rules cover the usual choices.
 *
 * Simplifications: the dealer does not repeat, there is no false-win penalty, Heavenly / Earthly hands are not
 * scored, and self-draw adds no tai (everyone pays instead).
 *
 * House rules (`SgHouseRules`) change the minimum, the limit, who pays on a discard, seven pairs, bites and
 * whether animals are played. Every function defaults to the standard table.
 */

export type SgFanId =
  // Limit hands
  | 'sg.thirteenOrphans'
  | 'sg.nineGates'
  | 'sg.allHonors'
  | 'sg.allTerminals'
  | 'sg.greatWinds'
  | 'sg.smallWinds'
  | 'sg.greatDragons'
  | 'sg.fourConcealedPungs'
  // Regular
  | 'sg.fullFlush'
  | 'sg.smallDragons'
  | 'sg.allChows'
  | 'sg.sevenPairs'
  | 'sg.allPungs'
  | 'sg.halfFlush'
  | 'sg.dragonPung'
  | 'sg.seatWind'
  | 'sg.prevailingWind'
  | 'sg.animal'
  | 'sg.ownFlower'
  | 'sg.lastTile'
  | 'sg.kongReplacement'
  | 'sg.robbingKong'
  | 'sg.chickenHand'

export type SgFanDef = {
  id: SgFanId
  name: string
  chinese: string
  points: number
  excludes: readonly SgFanId[]
  description: { en: string; zh: string }
}

/** Tai needed to win on the standard table, bonus tiles included. */
export const SG_MIN_TAI = 1
/** Standard limit: no hand scores more than this. */
export const SG_MAX_TAI = 5

const STANDARD: Readonly<SgHouseRules> = standardHouse('sg')

const f = (id: SgFanId, points: number, name: string, chinese: string, en: string, zh: string, excludes: SgFanId[] = []): SgFanDef => ({
  id,
  points,
  name,
  chinese,
  excludes,
  description: { en, zh },
})

export const SG_FANS: readonly SgFanDef[] = [
  f('sg.thirteenOrphans', SG_MAX_TAI, 'Thirteen Wonders', '十三幺', 'One of each terminal and honor, plus one duplicate. Limit hand.', '幺九牌与字牌各一张，其中一种成对。满贯。'),
  f('sg.nineGates', SG_MAX_TAI, 'Nine Gates', '九莲宝灯', '1112345678999 of one suit, concealed, plus any tile of that suit. Limit hand.', '同一花色门清 1112345678999 加该花色任意一张。满贯。'),
  f('sg.allHonors', SG_MAX_TAI, 'All Honors', '字一色', 'Only wind and dragon tiles. Limit hand.', '全部由字牌组成。满贯。'),
  f('sg.allTerminals', SG_MAX_TAI, 'All Terminals', '清幺九', 'Only 1s and 9s. Limit hand.', '全部由序数牌 1、9 组成。满贯。'),
  f('sg.greatWinds', SG_MAX_TAI, 'Big Four Winds', '大四喜', 'Pungs or kongs of all four winds. Limit hand.', '东南西北四副风刻（杠）。满贯。'),
  f('sg.smallWinds', SG_MAX_TAI, 'Small Four Winds', '小四喜', 'Three wind pungs and a wind pair. Limit hand.', '三副风刻加风牌{t:pair}。满贯。'),
  f('sg.greatDragons', SG_MAX_TAI, 'Big Three Dragons', '大三元', 'Pungs or kongs of all three dragons. Limit hand.', '中发白三副箭刻（杠）。满贯。'),
  f('sg.fourConcealedPungs', SG_MAX_TAI, 'Four Concealed Pungs', '四暗刻', 'Four pungs or kongs, all made without claiming. Limit hand.', '四副暗刻（含暗杠）。满贯。'),
  f('sg.fullFlush', 4, 'Full Flush', '清一色', 'One suit only, no honors.', '只由一种花色的序数牌组成。', ['sg.halfFlush']),
  f('sg.smallDragons', 4, 'Small Three Dragons', '小三元', 'Two dragon pungs and a dragon pair.', '两副箭刻加箭牌{t:pair}。', ['sg.dragonPung']),
  f(
    'sg.allChows',
    4,
    'Ping Hu',
    '平{t:win}',
    'Four chows and a pair that scores nothing, won on a two-sided wait, with no flowers or animals.',
    '四副顺子加一对不计台的{t:pair}，两面听牌{t:win}牌，且没有花牌和动物牌。',
  ),
  f('sg.sevenPairs', 4, 'Seven Pairs', '七对', 'Seven pairs, concealed.', '七个对子，门清。'),
  f('sg.allPungs', 2, 'All Pungs', '碰碰{t:win}', 'Four pungs or kongs and a pair.', '四副刻子（杠）加一对{t:pair}。'),
  f('sg.halfFlush', 2, 'Half Flush', '混一色', 'One suit plus honors.', '一种花色的序数牌加字牌。'),
  f('sg.dragonPung', 1, 'Dragon Pung', '箭刻', 'A pung or kong of a dragon (each).', '中、发、白的刻子（杠），每副计。'),
  f('sg.seatWind', 1, 'Seat Wind', '门风', 'A pung or kong of your seat wind.', '与本门风相同的风刻（杠）。'),
  f('sg.prevailingWind', 1, 'Prevailing Wind', '圈风', 'A pung or kong of the prevailing wind.', '与圈风相同的风刻（杠）。'),
  f('sg.animal', 1, 'Animal', '动物', 'Each animal tile: cat, mouse, rooster or centipede.', '每张动物牌（猫、老鼠、公鸡、蜈蚣）计。'),
  f('sg.ownFlower', 1, 'Own Flower', '正花', 'A flower or season matching your seat (East 1, South 2, West 3, North 4), each.', '与本门位对应的花或季（东1、南2、西3、北4），每张计。'),
  f('sg.lastTile', 1, 'Win on Last Tile', '海底捞月', 'Win on the last tile of the wall, or its discard.', '{t:win}牌张是牌墙最后一张或其打出的牌。'),
  f('sg.kongReplacement', 1, 'Win on Kong', '杠上开花', 'Win on the replacement tile after a kong.', '开杠后补牌自摸{t:win}牌。'),
  f('sg.robbingKong', 1, 'Robbing the Kong', '抢杠', 'Win on a tile another player adds to a pung.', '{t:win}别人加杠的牌。'),
  f('sg.chickenHand', 0, 'Chicken Hand', '鸡{t:win}', 'A winning hand with no tai. Wins only on tables with no minimum, paid as 1 tai.', '没有任何台的{t:win}牌。只有不设起{t:win}台数时才能{t:win}，按 1 台付。'),
]

export const SG_FAN_BY_ID: Readonly<Record<SgFanId, SgFanDef>> = Object.fromEntries(SG_FANS.map((d) => [d.id, d])) as Record<SgFanId, SgFanDef>

const LIMITS = new Set<SgFanId>(SG_FANS.filter((d) => d.points === SG_MAX_TAI).map((d) => d.id))
const BONUS_FANS = new Set<SgFanId>(['sg.animal', 'sg.ownFlower'])

/** Tai of one element under `house`: limit hands score the limit. */
export function sgFanPoints(id: SgFanId, house: SgHouseRules = STANDARD): number {
  return LIMITS.has(id) ? house.maxTai : SG_FAN_BY_ID[id].points
}

/** The tai elements a table with `house` can score, with their values on that table. */
export function sgFansFor(house: SgHouseRules = STANDARD): SgFanDef[] {
  return SG_FANS.filter((d) => {
    if (d.id === 'sg.animal') return house.animals
    if (d.id === 'sg.sevenPairs') return house.sevenPairs
    if (d.id === 'sg.chickenHand') return house.minTai === 0
    return true
  }).map((d) => ({ ...d, points: sgFanPoints(d.id, house) }))
}

function tileFans(all: number[], out: SgFanId[]): void {
  const suits = new Set(all.filter((k) => !isHonor(k)).map(suitOf))
  const honors = all.some(isHonor)
  if (all.every(isHonor)) out.push('sg.allHonors')
  else if (all.every(isTerminal)) out.push('sg.allTerminals')
  if (suits.size === 1) out.push(honors ? 'sg.halfFlush' : 'sg.fullFlush')
}

function situationalFans(ctx: WinContext, out: SgFanId[]): void {
  if (ctx.lastTileOfWall) out.push('sg.lastTile')
  if (ctx.replacement && ctx.selfDrawn) out.push('sg.kongReplacement')
  if (ctx.robbingKong) out.push('sg.robbingKong')
}

function bonusFans(ctx: WinContext, out: SgFanId[]): void {
  const own = SEAT_NUMBER[ctx.seatWind]
  for (const n of ctx.flowerNumbers ?? []) {
    if (n >= 9) out.push('sg.animal')
    else if (n === own || n === own + 4) out.push('sg.ownFlower')
  }
}

/** A pair that would score in a pung: a dragon, the seat wind or the prevailing wind. */
function scoringPair(pair: number, ctx: WinContext): boolean {
  return isDragon(pair) || pair === WIND_INDEX[ctx.seatWind] || pair === WIND_INDEX[ctx.prevailingWind]
}

/** The winning tile finished a chow from a two-sided wait (e.g. 45 waiting on 3 or 6), not an edge or closed wait. */
function twoSided(chow: HSet, winTile: number): boolean {
  const rank = chow.index % 9
  return (winTile === chow.index && rank !== 6) || (winTile === chow.index + 2 && rank !== 0)
}

function setFans(sets: HSet[], pair: number, ctx: WinContext, out: SgFanId[]): void {
  const pungs = sets.filter((s) => s.type !== 'chow')
  const windPungs = pungs.filter((s) => isWind(s.index)).length
  const dragonPungs = pungs.filter((s) => isDragon(s.index))
  if (windPungs === 4) out.push('sg.greatWinds')
  else if (windPungs === 3 && isWind(pair)) out.push('sg.smallWinds')
  if (dragonPungs.length === 3) out.push('sg.greatDragons')
  else if (dragonPungs.length === 2 && isDragon(pair)) out.push('sg.smallDragons')
  dragonPungs.forEach(() => out.push('sg.dragonPung'))
  if (pungs.some((s) => s.index === WIND_INDEX[ctx.seatWind])) out.push('sg.seatWind')
  if (pungs.some((s) => s.index === WIND_INDEX[ctx.prevailingWind])) out.push('sg.prevailingWind')
  if (pungs.length === 4) out.push('sg.allPungs')
  if (pungs.length === 4 && pungs.every((s) => s.concealed)) out.push('sg.fourConcealedPungs')
}

/** Fan lists for each way of reading the hand. */
function candidates(form: Form, ctx: WinContext, house: SgHouseRules): SgFanId[][] {
  const all = [...ctx.concealed, ...ctx.melds.flatMap(setKinds)]
  const base = (): SgFanId[] => {
    const out: SgFanId[] = []
    situationalFans(ctx, out)
    return out
  }
  switch (form.form) {
    case 'thirteenOrphans':
      return [['sg.thirteenOrphans']]
    case 'sevenPairs': {
      if (!house.sevenPairs) return []
      const out = base()
      out.push('sg.sevenPairs')
      tileFans(all, out)
      return [out]
    }
    case 'standard': {
      const declared: HSet[] = ctx.melds.map((m: ScoringMeld) => ({ type: m.type, index: m.index, concealed: !m.exposed }))
      const own: HSet[] = form.sets.map((s) => ({ type: s.type, index: s.index, concealed: true }))
      // The winning tile may complete the pair or any concealed set containing it.
      const places: ('pair' | number)[] = []
      if (form.pair === ctx.winTile) places.push('pair')
      own.forEach((s, i) => setKinds(s).includes(ctx.winTile) && places.push(i))
      return places.map((winIn) => {
        const sets = [...declared, ...own.map((s) => ({ ...s }))]
        // A pung completed by a claimed tile is not concealed.
        if (typeof winIn === 'number' && !ctx.selfDrawn) sets[declared.length + winIn]!.concealed = false
        const out = base()
        tileFans(all, out)
        setFans(sets, form.pair, ctx, out)
        const pingHu =
          sets.every((s) => s.type === 'chow') &&
          (ctx.flowerNumbers ?? []).length === 0 &&
          !scoringPair(form.pair, ctx) &&
          typeof winIn === 'number' &&
          twoSided(sets[declared.length + winIn]!, ctx.winTile)
        if (pingHu) out.push('sg.allChows')
        if (isNineGates(ctx)) out.push('sg.nineGates')
        return out
      })
    }
    default:
      // Knitted forms are MCR only.
      return []
  }
}

function withExclusions(ids: SgFanId[]): SgFanId[] {
  const limit = ids.find((id) => LIMITS.has(id))
  if (limit) return [limit]
  const excluded = new Set(ids.flatMap((id) => SG_FAN_BY_ID[id].excludes))
  return ids.filter((id) => !excluded.has(id))
}

/**
 * Best Singapore score for a winning hand, or null if the tiles are not a complete shape.
 * `total` includes animal and own-flower tai and is capped at the limit.
 */
export function scoreHandSG(ctx: WinContext, house: SgHouseRules = STANDARD): HandScore | null {
  const forms = decomposeCounts(countsOf(ctx.concealed), ctx.melds.length)
  let best: SgFanId[] | null = null
  let bestPoints = -1
  const extras: SgFanId[] = []
  bonusFans(ctx, extras)
  for (const form of forms) {
    for (const fans of candidates(form, ctx, house)) {
      let kept = withExclusions([...fans, ...extras])
      if (kept.length === 0) kept = ['sg.chickenHand']
      const points = kept.reduce((v, id) => v + sgFanPoints(id, house), 0)
      if (points > bestPoints) {
        best = kept
        bestPoints = points
      }
    }
  }
  if (!best) return null
  const counts = new Map<SgFanId, number>()
  for (const id of best) counts.set(id, (counts.get(id) ?? 0) + 1)
  const fans = [...counts]
    .map(([id, count]) => ({ id: id as string, name: SG_FAN_BY_ID[id].name, points: sgFanPoints(id, house), count }))
    .sort((x, y) => y.points - x.points || x.name.localeCompare(y.name))
  const flowerPoints = best.filter((id) => BONUS_FANS.has(id)).reduce((v, id) => v + sgFanPoints(id, house), 0)
  return { fans, total: Math.min(house.maxTai, bestPoints), flowerPoints }
}

/** Animals and own flowers count towards the Singapore minimum. */
export function meetsMinimumSG(score: HandScore, house: SgHouseRules = STANDARD): boolean {
  return score.total >= house.minTai
}

/** Base points for a tai total: doubling from 1 at 1 tai (1, 2, 4, 8, 16…), capped at the limit. 0 tai pays as 1. */
export function sgBasePoints(tai: number, house: SgHouseRules = STANDARD): number {
  return 2 ** (Math.min(house.maxTai, Math.max(1, tai)) - 1)
}

/** What each loser pays for a Singapore win of `tai`, with base b = `sgBasePoints(tai)`. */
export function sgPayments(tai: number, house: SgHouseRules = STANDARD): { discarder: number; other: number; selfDraw: number } {
  const b = sgBasePoints(tai, house)
  return house.payment === 'shooter' ? { discarder: 4 * b, other: 0, selfDraw: 2 * b } : { discarder: 2 * b, other: b, selfDraw: 2 * b }
}

/**
 * Point transfers for a Singapore win, with base b = `sgBasePoints(total)`:
 * - Discard win, shooter pays (standard): the discarder pays all 4b.
 * - Discard win, split: the discarder pays 2b, each other loser pays b.
 * - Self-draw: each of the three others pays 2b.
 * The result always sums to zero. Bites are separate (see `HandResult.bonus`).
 */
export function settleSG(result: { winner: Seat; from: Seat | null }, score: HandScore, house: SgHouseRules = STANDARD): number[] {
  const pays = sgPayments(score.total, house)
  const deltas = [0, 0, 0, 0]
  for (let seat = 0; seat < 4; seat++) {
    if (seat === result.winner) continue
    const pay = result.from === null ? pays.selfDraw : result.from === seat ? pays.discarder : pays.other
    deltas[seat]! -= pay
    deltas[result.winner] += pay
  }
  return deltas
}

// ---------------------------------------------------------------------------
// Bites (咬): instant payouts during the hand
// ---------------------------------------------------------------------------

/** What each other seat pays for a bite, in 1-tai base points. */
export const SG_BITE_UNITS: Readonly<Record<BiteKind, number>> = {
  catMouse: 1,
  roosterCentipede: 1,
  allAnimals: 1,
  flowerSet: 2,
  seasonSet: 2,
  meldedKong: 1,
  concealedKong: 2,
}

/** Bonus-tile bites and the flower numbers each needs. All four animals pays on top of both pairs. */
const BONUS_BITES: readonly [BiteKind, readonly number[]][] = [
  ['catMouse', [9, 10]],
  ['roosterCentipede', [11, 12]],
  ['allAnimals', [9, 10, 11, 12]],
  ['flowerSet', [1, 2, 3, 4]],
  ['seasonSet', [5, 6, 7, 8]],
]

function bitesOn(state: GameState): boolean {
  return state.rules === 'sg' && houseOf({ rules: 'sg', house: state.house }).bites
}

/** Each other seat pays `kind`'s units to `seat`, recorded in `state.bites`. Mutates `state`. */
function payBite(state: GameState, seat: Seat, kind: BiteKind): void {
  const units = SG_BITE_UNITS[kind]
  const deltas = [0, 1, 2, 3].map((s) => (s === seat ? 3 * units : -units))
  ;(state.bites ??= []).push({ seat, kind, units, deltas })
}

/** Pay any bonus-tile bite `seat` has just completed (each at most once per hand). Mutates `state`. */
export function bonusTileBites(state: GameState, seat: Seat): void {
  if (!bitesOn(state)) return
  const held = new Set<number>(state.flowers[seat]!.map((t) => (t.kind.suit === 'flowers' ? t.kind.flower : 0)))
  for (const [kind, needs] of BONUS_BITES) {
    if (!needs.every((n) => held.has(n))) continue
    if (state.bites?.some((b) => b.seat === seat && b.kind === kind)) continue
    payBite(state, seat, kind)
  }
}

/** Pay the bite for a kong `seat` has just completed. Mutates `state`. */
export function kongBite(state: GameState, seat: Seat, concealed: boolean): void {
  if (bitesOn(state)) payBite(state, seat, concealed ? 'concealedKong' : 'meldedKong')
}

/** Per-seat sum of `bites`, or undefined when there are none. */
export function biteTotals(bites: readonly Bite[] | undefined): number[] | undefined {
  if (!bites?.length) return undefined
  return [0, 1, 2, 3].map((seat) => bites.reduce((sum, b) => sum + b.deltas[seat]!, 0))
}
