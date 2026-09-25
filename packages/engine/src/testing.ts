import type { Action, GameState, Meld, Seat } from './state'
import { createWall, isFlower, kindIndex, type Tile } from './tiles'
import { mulberry32 } from './rng'
import { applyAction, legalActions } from './rules'
import { newHand } from './deal'
import { scoreFor, type RuleSet } from './ruleset'
import { scoreHand, type ScoringMeld, type WinContext } from './scoring'

/** Every tile id 0..143 appears exactly once across wall, hands, melds, discards, flowers and any pending claim tile. */
export function tileIdsInPlay(state: GameState): number[] {
  const ids: number[] = []
  ids.push(...state.wall.map((t) => t.id))
  for (let s = 0; s < 4; s++) {
    ids.push(...state.hands[s]!.map((t) => t.id))
    for (const m of state.melds[s]!) ids.push(...m.tiles.map((t) => t.id))
    ids.push(...state.discards[s]!.map((t) => t.id))
    ids.push(...state.flowers[s]!.map((t) => t.id))
  }
  return ids
}

export function expectConservation(state: GameState): void {
  const ids = tileIdsInPlay(state).sort((a, b) => a - b)
  if (ids.length !== 144 || ids.some((id, i) => id !== i)) {
    throw new Error(`tile conservation broken: ${ids.length} ids`)
  }
}

/** Concealed tiles + melded tiles, each kong counted as 3. */
export function effectiveSize(state: GameState, seat: number): number {
  return state.hands[seat]!.length + state.melds[seat]!.length * 3
}

export function expectNoFlowersInHands(state: GameState): void {
  for (const hand of state.hands) {
    if (hand.some((t) => isFlower(t.kind))) throw new Error('flower left in hand')
  }
}

/** Seats that currently have at least one legal action, lowest first. */
export function actingSeats(state: GameState): Seat[] {
  return ([0, 1, 2, 3] as Seat[]).filter((seat) => legalActions(state, seat).length > 0)
}

export type RandomPlayOptions = {
  /** Called after every transition with the new state. */
  onState?: (state: GameState, action: Action) => void
  /** Probability of choosing a non-pass, non-discard action when one exists. */
  claimBias?: number
}

/** Play one hand with seeded random legal actions. Returns final state and the action log. */
export function playRandomHand(seed: number, options: RandomPlayOptions = {}): { state: GameState; actions: Action[] } {
  const rand = mulberry32(seed ^ 0x5eed)
  let state = newHand({ seed, dealer: (seed & 3) as Seat, prevailingWind: 'E' })
  const actions: Action[] = []
  for (let step = 0; state.phase.kind !== 'ended'; step++) {
    if (step > 2000) throw new Error('hand did not terminate')
    const seat = actingSeats(state)[0]!
    const legal = legalActions(state, seat)
    const special = legal.filter((a) => a.type !== 'pass' && a.type !== 'discard' && a.type !== 'draw')
    const pool = special.length > 0 && rand() < (options.claimBias ?? 0.5) ? special : legal
    const action = pool[Math.floor(rand() * pool.length)]!
    state = applyAction(state, action)
    actions.push(action)
    options.onState?.(state, action)
  }
  return { state, actions }
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value)
    for (const v of Object.values(value)) deepFreeze(v)
  }
  return value
}

/**
 * Parse compact tile notation into kind indices: `123m 456p 789s` (characters/dots/bamboo),
 * winds `E S W N`, dragons `C` (red) `F` (green) `P` (white). Whitespace ignored.
 */
export function parseKinds(notation: string): number[] {
  const out: number[] = []
  let digits: number[] = []
  const honors: Record<string, number> = { E: 27, S: 28, W: 29, N: 30, C: 31, F: 32, P: 33 }
  for (const ch of notation.replace(/\s+/g, '')) {
    if (ch >= '1' && ch <= '9') digits.push(Number(ch))
    else if (ch === 'm' || ch === 'p' || ch === 's') {
      const base = ch === 'm' ? 0 : ch === 'p' ? 9 : 18
      out.push(...digits.map((d) => base + d - 1))
      digits = []
    } else if (ch in honors) out.push(honors[ch]!)
    else throw new Error(`bad tile notation: ${ch}`)
  }
  if (digits.length) throw new Error('digits without suit')
  return out
}

export type BuildOptions = {
  hands: string[]
  melds?: { seat: Seat; type: 'chow' | 'pung' | 'kong'; tiles: string; exposed?: boolean }[]
  discards?: string[]
  /** Tiles at the front of the wall, drawn first. */
  wallFront?: string
  /** Tiles at the back of the wall, used for replacement draws (last listed = first drawn). */
  wallBack?: string
  /** Leave only this many tiles in the wall (front + back kept). */
  wallSize?: number
  dealer?: Seat
  turn?: Seat
  phase?: GameState['phase']
  rules?: RuleSet
}

/** Build an arbitrary but conserving state: listed tiles are taken from the 144-tile set, the rest fill the wall. */
export function buildState(o: BuildOptions): GameState {
  const pool = createWall()
  const take = (index: number) => {
    const at = pool.findIndex((t) => kindIndex(t.kind) === index)
    if (at < 0) throw new Error(`no tile left for kind ${index}`)
    return pool.splice(at, 1)[0]!
  }
  const takeAll = (notation: string) => parseKinds(notation).map(take)
  const hands = o.hands.map(takeAll)
  const melds: Meld[][] = [[], [], [], []]
  for (const m of o.melds ?? []) {
    melds[m.seat]!.push({ type: m.type, tiles: takeAll(m.tiles), exposed: m.exposed ?? true })
  }
  const discards = (o.discards ?? ['', '', '', '']).map(takeAll)
  const front = takeAll(o.wallFront ?? '')
  const back = takeAll(o.wallBack ?? '')
  const flowers = pool.filter((t) => isFlower(t.kind))
  const rest = pool.filter((t) => !isFlower(t.kind))
  const flowerSink: Tile[][] = [[], [], [], []]
  let middle = [...rest, ...flowers]
  if (o.wallSize !== undefined) {
    const keep = Math.max(0, o.wallSize - front.length - back.length)
    // Move surplus tiles into seat 3's discards so every tile stays accounted for.
    const surplus = middle.slice(keep)
    middle = middle.slice(0, keep)
    for (const t of surplus) (isFlower(t.kind) ? flowerSink[3]! : discards[3]!).push(t)
  }
  while (hands.length < 4) hands.push([])
  return {
    rules: o.rules ?? 'mcr',
    seed: 0,
    dealer: o.dealer ?? 0,
    prevailingWind: 'E',
    wall: [...front, ...middle, ...back],
    hands,
    melds,
    discards,
    flowers: flowerSink,
    turn: o.turn ?? 0,
    phase: o.phase ?? { kind: 'discard', drawnTileId: null, afterKong: false },
  }
}

export type ScoreOptions = Partial<Omit<WinContext, 'concealed' | 'melds' | 'winTile'>> & {
  /** Declared melds, e.g. `['pung 555m', 'chow 123p', 'kong 9s', 'ckong EEEE']` (`ckong` = concealed kong). */
  melds?: string[]
}

/** Score a hand from notation. `hand` is the concealed part including the winning tile `win`. */
export function scoreNotation(hand: string, win: string, o: ScoreOptions = {}) {
  return scoreHand(notationContext(hand, win, o))
}

/** `scoreNotation` under any rule set. */
export function scoreNotationFor(rules: RuleSet, hand: string, win: string, o: ScoreOptions = {}) {
  return scoreFor(rules, notationContext(hand, win, o))
}

function notationContext(hand: string, win: string, o: ScoreOptions): WinContext {
  const melds: ScoringMeld[] = (o.melds ?? []).map((m) => {
    const [type, tiles] = m.split(' ') as [string, string]
    const kinds = parseKinds(tiles)
    return {
      type: type === 'ckong' ? 'kong' : (type as ScoringMeld['type']),
      index: Math.min(...kinds),
      exposed: type !== 'ckong',
    }
  })
  return {
    concealed: parseKinds(hand),
    melds,
    winTile: parseKinds(win)[0]!,
    selfDrawn: o.selfDrawn ?? false,
    seatWind: o.seatWind ?? 'S',
    prevailingWind: o.prevailingWind ?? 'E',
    flowers: o.flowers ?? o.flowerNumbers?.length ?? 0,
    flowerNumbers: o.flowerNumbers ?? [],
    lastTileOfWall: o.lastTileOfWall ?? false,
    replacement: o.replacement ?? false,
    robbingKong: o.robbingKong ?? false,
    winTileVisible: o.winTileVisible ?? 0,
  }
}

/** Fan ids with counts, e.g. `{ fullFlush: 1, pureStraight: 1 }`. */
export function fanMap(score: { fans: { id: string; count: number }[] } | null | undefined): Record<string, number> {
  return Object.fromEntries((score?.fans ?? []).map((f) => [f.id, f.count]))
}
