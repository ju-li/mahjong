import type { ScoringMeld, WinContext } from './scoring'
import { countsOf, decomposeCounts, type Form } from './shapes'
import type { HandScore, Seat } from './state'
import type { Wind } from './tiles'

/**
 * Hong Kong (Cantonese) faan scoring, "3 faan to win, 13 faan limit" table style.
 * Faan values and payment table follow the common rules summarised at
 * https://en.wikipedia.org/wiki/Hong_Kong_mahjong_scoring_rules.
 *
 * Simplifications: the dealer does not repeat, there is no false-win penalty, and
 * Heavenly / Earthly hands are not scored.
 */

export type HkFanId =
  // Limit hands (13)
  | 'hk.thirteenOrphans'
  | 'hk.nineGates'
  | 'hk.allHonors'
  | 'hk.allTerminals'
  | 'hk.greatWinds'
  | 'hk.fourConcealedPungs'
  | 'hk.fourKongs'
  // Regular
  | 'hk.greatDragons'
  | 'hk.fullFlush'
  | 'hk.smallWinds'
  | 'hk.smallDragons'
  | 'hk.sevenPairs'
  | 'hk.allPungs'
  | 'hk.halfFlush'
  | 'hk.flowerSet'
  | 'hk.mixedOrphans'
  | 'hk.allChows'
  | 'hk.concealedHand'
  | 'hk.selfDrawn'
  | 'hk.dragonPung'
  | 'hk.seatWind'
  | 'hk.prevailingWind'
  | 'hk.lastTile'
  | 'hk.kongReplacement'
  | 'hk.robbingKong'
  | 'hk.ownFlower'
  | 'hk.noFlowers'

export type HkFanDef = {
  id: HkFanId
  name: string
  chinese: string
  points: number
  excludes: readonly HkFanId[]
  description: { en: string; zh: string }
}

/** Faan needed to win, flowers included. */
export const HK_MIN_FAAN = 3
/** Limit: no hand scores more than this. */
export const HK_MAX_FAAN = 13

const f = (id: HkFanId, points: number, name: string, chinese: string, en: string, zh: string, excludes: HkFanId[] = []): HkFanDef => ({
  id,
  points,
  name,
  chinese,
  excludes,
  description: { en, zh },
})

const WIND_PUNGS: HkFanId[] = ['hk.seatWind', 'hk.prevailingWind']

export const HK_FANS: readonly HkFanDef[] = [
  f('hk.thirteenOrphans', 13, 'Thirteen Orphans', '十三幺', 'One of each terminal and honor, plus one duplicate. Limit hand.', '幺九牌与字牌各一张，其中一种成对。满贯。'),
  f('hk.nineGates', 13, 'Nine Gates', '九子连环', '1112345678999 of one suit, concealed, plus any tile of that suit. Limit hand.', '同一花色门清 1112345678999 加该花色任意一张。满贯。'),
  f('hk.allHonors', 13, 'All Honors', '字一色', 'Only wind and dragon tiles. Limit hand.', '全部由字牌组成。满贯。'),
  f('hk.allTerminals', 13, 'All Terminals', '清幺九', 'Only 1s and 9s. Limit hand.', '全部由序数牌 1、9 组成。满贯。'),
  f('hk.greatWinds', 13, 'Great Winds', '大四喜', 'Pungs or kongs of all four winds. Limit hand.', '东南西北四副风刻（杠）。满贯。'),
  f('hk.fourConcealedPungs', 13, 'Four Concealed Pungs', '坎坎胡', 'Four pungs or kongs, all made without claiming. Limit hand.', '四副暗刻（含暗杠）。满贯。'),
  f('hk.fourKongs', 13, 'Four Kongs', '十八罗汉', 'Four kongs, melded or concealed. Limit hand.', '四副杠。满贯。'),
  f('hk.greatDragons', 8, 'Great Dragons', '大三元', 'Pungs or kongs of all three dragons.', '中发白三副箭刻（杠）。', ['hk.dragonPung', 'hk.smallDragons']),
  f('hk.fullFlush', 7, 'All One Suit', '清一色', 'One suit only, no honors.', '只由一种花色的序数牌组成。', ['hk.halfFlush']),
  f('hk.smallWinds', 6, 'Small Winds', '小四喜', 'Three wind pungs and a wind pair.', '三副风刻加风牌将。', WIND_PUNGS),
  f('hk.smallDragons', 5, 'Small Dragons', '小三元', 'Two dragon pungs and a dragon pair.', '两副箭刻加箭牌将。', ['hk.dragonPung']),
  f('hk.sevenPairs', 4, 'Seven Pairs', '七对子', 'Seven pairs, concealed.', '七个对子，门清。', ['hk.concealedHand']),
  f('hk.allPungs', 3, 'All Pungs', '对对胡', 'Four pungs or kongs and a pair.', '四副刻子（杠）加一对将。'),
  f('hk.halfFlush', 3, 'Mixed One Suit', '混一色', 'One suit plus honors.', '一种花色的序数牌加字牌。'),
  f('hk.flowerSet', 2, 'Complete Flower Set', '一台花', 'All four flowers or all four seasons (each set).', '集齐四季或四花（每套计）。'),
  f('hk.mixedOrphans', 1, 'Mixed Orphans', '混幺九', 'Only terminals (1, 9) and honors, with both present.', '全部由幺九牌和字牌组成（两者皆有）。'),
  f('hk.allChows', 1, 'Common Hand', '平胡', 'Four chows and a pair.', '四副顺子加一对将。'),
  f('hk.concealedHand', 1, 'Concealed Hand', '门前清', 'No claimed melds (concealed kongs allowed).', '没有吃、碰、明杠（暗杠可）。'),
  f('hk.selfDrawn', 1, 'Self-Drawn', '自摸', 'Win on a tile you drew.', '自己摸到和牌张。'),
  f('hk.dragonPung', 1, 'Dragon Pung', '箭刻', 'A pung or kong of a dragon (each).', '中、发、白的刻子（杠），每副计。'),
  f('hk.seatWind', 1, 'Seat Wind', '门风', 'A pung or kong of your seat wind.', '与本门风相同的风刻（杠）。'),
  f('hk.prevailingWind', 1, 'Prevailing Wind', '圈风', 'A pung or kong of the prevailing wind.', '与圈风相同的风刻（杠）。'),
  f('hk.lastTile', 1, 'Win on Last Tile', '海底捞月', 'Win on the last tile of the wall, or its discard.', '和牌张是牌墙最后一张或其打出的牌。'),
  f('hk.kongReplacement', 1, 'Win on Kong', '杠上开花', 'Win on the replacement tile after a kong.', '开杠后补牌自摸和牌。'),
  f('hk.robbingKong', 1, 'Robbing the Kong', '抢杠', 'Win on a tile another player adds to a pung.', '和别人加杠的牌。'),
  f('hk.ownFlower', 1, 'Own Flower', '正花', 'A flower or season matching your seat (East 1, South 2, West 3, North 4), each.', '与本门位对应的花或季（东1、南2、西3、北4），每张计。'),
  f('hk.noFlowers', 1, 'No Flowers', '无花', 'No flowers or seasons.', '没有花牌。'),
]

export const HK_FAN_BY_ID: Readonly<Record<HkFanId, HkFanDef>> = Object.fromEntries(HK_FANS.map((d) => [d.id, d])) as Record<HkFanId, HkFanDef>

const LIMITS = new Set<HkFanId>(HK_FANS.filter((d) => d.points === HK_MAX_FAAN).map((d) => d.id))

const WIND_INDEX: Record<Wind, number> = { E: 27, S: 28, W: 29, N: 30 }
const SEAT_NUMBER: Record<Wind, number> = { E: 1, S: 2, W: 3, N: 4 }
const isHonor = (k: number) => k >= 27
const isWind = (k: number) => k >= 27 && k <= 30
const isDragon = (k: number) => k >= 31
const isTerminal = (k: number) => k < 27 && (k % 9 === 0 || k % 9 === 8)
const suitOf = (k: number) => (k < 27 ? Math.floor(k / 9) : 3)

type HSet = { type: 'chow' | 'pung' | 'kong'; index: number; concealed: boolean }

const setKinds = (s: { type: string; index: number }): number[] =>
  s.type === 'chow' ? [s.index, s.index + 1, s.index + 2] : new Array<number>(s.type === 'kong' ? 4 : 3).fill(s.index)

function tileFans(all: number[], out: HkFanId[]): void {
  const suits = new Set(all.filter((k) => !isHonor(k)).map(suitOf))
  const honors = all.some(isHonor)
  if (all.every(isHonor)) out.push('hk.allHonors')
  else if (all.every(isTerminal)) out.push('hk.allTerminals')
  else if (all.every((k) => isHonor(k) || isTerminal(k))) out.push('hk.mixedOrphans')
  if (suits.size === 1) out.push(honors ? 'hk.halfFlush' : 'hk.fullFlush')
}

function situationalFans(ctx: WinContext, out: HkFanId[]): void {
  if (ctx.selfDrawn) out.push('hk.selfDrawn')
  if (ctx.melds.every((m) => !m.exposed)) out.push('hk.concealedHand')
  if (ctx.lastTileOfWall) out.push('hk.lastTile')
  if (ctx.replacement && ctx.selfDrawn) out.push('hk.kongReplacement')
  if (ctx.robbingKong) out.push('hk.robbingKong')
}

function flowerFans(ctx: WinContext, out: HkFanId[]): void {
  const numbers = ctx.flowerNumbers ?? []
  if (numbers.length === 0) {
    out.push('hk.noFlowers')
    return
  }
  const own = SEAT_NUMBER[ctx.seatWind]
  for (const n of numbers) if (n === own || n === own + 4) out.push('hk.ownFlower')
  if ([1, 2, 3, 4].every((n) => numbers.includes(n))) out.push('hk.flowerSet')
  if ([5, 6, 7, 8].every((n) => numbers.includes(n))) out.push('hk.flowerSet')
}

function setFans(sets: HSet[], pair: number, ctx: WinContext, out: HkFanId[]): void {
  const pungs = sets.filter((s) => s.type !== 'chow')
  const windPungs = pungs.filter((s) => isWind(s.index)).length
  const dragonPungs = pungs.filter((s) => isDragon(s.index))
  if (windPungs === 4) out.push('hk.greatWinds')
  else if (windPungs === 3 && isWind(pair)) out.push('hk.smallWinds')
  if (dragonPungs.length === 3) out.push('hk.greatDragons')
  else if (dragonPungs.length === 2 && isDragon(pair)) out.push('hk.smallDragons')
  dragonPungs.forEach(() => out.push('hk.dragonPung'))
  if (pungs.some((s) => s.index === WIND_INDEX[ctx.seatWind])) out.push('hk.seatWind')
  if (pungs.some((s) => s.index === WIND_INDEX[ctx.prevailingWind])) out.push('hk.prevailingWind')
  if (pungs.length === 4) out.push('hk.allPungs')
  if (pungs.length === 0) out.push('hk.allChows')
  if (pungs.filter((s) => s.type === 'kong').length === 4) out.push('hk.fourKongs')
  if (pungs.length === 4 && pungs.every((s) => s.concealed)) out.push('hk.fourConcealedPungs')
}

function isNineGates(ctx: WinContext): boolean {
  if (ctx.melds.length > 0) return false
  const before = countsOf(ctx.concealed)
  before[ctx.winTile]!--
  const suit = suitOf(ctx.winTile)
  if (suit > 2) return false
  const pattern = [3, 1, 1, 1, 1, 1, 1, 1, 3]
  return before.every((c, k) => (suitOf(k) === suit ? c === pattern[k % 9] : c === 0))
}

/** Fan lists for each way of reading the hand. */
function candidates(form: Form, ctx: WinContext): HkFanId[][] {
  const all = [...ctx.concealed, ...ctx.melds.flatMap(setKinds)]
  const base = (): HkFanId[] => {
    const out: HkFanId[] = []
    situationalFans(ctx, out)
    return out
  }
  switch (form.form) {
    case 'thirteenOrphans':
      return [['hk.thirteenOrphans']]
    case 'sevenPairs': {
      const out = base()
      out.push('hk.sevenPairs')
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
        if (isNineGates(ctx)) out.push('hk.nineGates')
        return out
      })
    }
    default:
      // Knitted forms are MCR only.
      return []
  }
}

function withExclusions(ids: HkFanId[]): HkFanId[] {
  const limit = ids.find((id) => LIMITS.has(id))
  if (limit) return [limit]
  const excluded = new Set(ids.flatMap((id) => HK_FAN_BY_ID[id].excludes))
  return ids.filter((id) => !excluded.has(id))
}

/**
 * Best Hong Kong score for a winning hand, or null if the tiles are not a complete shape.
 * `total` includes flower faan and is capped at the limit.
 */
export function scoreHandHK(ctx: WinContext): HandScore | null {
  const forms = decomposeCounts(countsOf(ctx.concealed), ctx.melds.length)
  let best: HkFanId[] | null = null
  let bestPoints = -1
  const flowers: HkFanId[] = []
  flowerFans(ctx, flowers)
  for (const form of forms) {
    for (const fans of candidates(form, ctx)) {
      const kept = withExclusions([...fans, ...flowers])
      const points = kept.reduce((v, id) => v + HK_FAN_BY_ID[id].points, 0)
      if (points > bestPoints) {
        best = kept
        bestPoints = points
      }
    }
  }
  if (!best) return null
  const counts = new Map<HkFanId, number>()
  for (const id of best) counts.set(id, (counts.get(id) ?? 0) + 1)
  const fans = [...counts]
    .map(([id, count]) => ({ id: id as string, name: HK_FAN_BY_ID[id].name, points: HK_FAN_BY_ID[id].points, count }))
    .sort((x, y) => y.points - x.points || x.name.localeCompare(y.name))
  const flowerPoints = best.filter((id) => id === 'hk.ownFlower' || id === 'hk.flowerSet' || id === 'hk.noFlowers').reduce((v, id) => v + HK_FAN_BY_ID[id].points, 0)
  return { fans, total: Math.min(HK_MAX_FAAN, bestPoints), flowerPoints }
}

/** Flowers count towards the Hong Kong minimum. */
export function meetsMinimumHK(score: HandScore): boolean {
  return score.total >= HK_MIN_FAAN
}

/**
 * Base points for a faan total ("half-spicy" table): doubling up to 4 faan, then
 * alternately ×1.5 and ×4/3: 3→8, 4→16, 5→24, 6→32, 7→48, 8→64 … 13→384.
 */
export function hkBasePoints(faan: number): number {
  const f = Math.min(HK_MAX_FAAN, Math.max(0, faan))
  if (f <= 4) return 2 ** f
  const step = 2 ** (Math.floor((f - 4) / 2) + 4)
  return (f - 4) % 2 === 1 ? step * 1.5 : step
}

/**
 * Point transfers for a Hong Kong win, with base b = `hkBasePoints(total)`:
 * - Discard win: the discarder pays 2b, each other loser pays b.
 * - Self-draw: each of the three others pays 2b.
 * The result always sums to zero.
 */
export function settleHK(result: { winner: Seat; from: Seat | null }, score: HandScore): number[] {
  const b = hkBasePoints(score.total)
  const deltas = [0, 0, 0, 0]
  for (let seat = 0; seat < 4; seat++) {
    if (seat === result.winner) continue
    const pay = result.from === null || result.from === seat ? 2 * b : b
    deltas[seat] = -pay
    deltas[result.winner] += pay
  }
  return deltas
}
