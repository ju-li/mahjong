import { replaceFlowers } from './deal'
import type { Action, ClaimWindow, GameState, HandScore, Seat } from './state'
import { nextSeat } from './state'
import { kindIndex, sameKind, type Tile } from './tiles'

/** Deep copy of a JSON-only state. Portable (no structuredClone). */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function sameIds(a: readonly number[] | undefined, b: readonly number[] | undefined): boolean {
  if (a === undefined || b === undefined) return a === b
  return a.length === b.length && a.every((id, i) => id === b[i])
}

export function sameAction(a: Action, b: Action): boolean {
  if (a.type !== b.type || a.seat !== b.seat) return false
  switch (a.type) {
    case 'discard':
      return a.tileId === (b as typeof a).tileId
    case 'chow':
      return sameIds(a.tileIds, (b as typeof a).tileIds)
    case 'kong':
      return sameIds(a.tileIds, (b as typeof a).tileIds)
    default:
      return true
  }
}

// ---------------------------------------------------------------------------
// Win evaluation hook. Scoring is wired in later; until then no hand can win.
// ---------------------------------------------------------------------------

export type WinSource = 'selfDraw' | 'discard' | 'robKong'

function evaluateWin(_state: GameState, _seat: Seat, _tile: Tile, _source: WinSource): HandScore | null {
  return null
}

// ---------------------------------------------------------------------------
// Legal actions
// ---------------------------------------------------------------------------

/** Tiles in `hand` of the same kind as `tile`, lowest id first. */
function matching(hand: readonly Tile[], tile: Tile): Tile[] {
  return hand.filter((t) => sameKind(t.kind, tile.kind)).sort((a, b) => a.id - b.id)
}

/** Lowest-id tile in `hand` with kind index `index`. */
function firstOfIndex(hand: readonly Tile[], index: number): Tile | undefined {
  return hand.filter((t) => kindIndex(t.kind) === index).sort((a, b) => a.id - b.id)[0]
}

/** Chow options on `tile`: each pair of hand tiles that completes a run, one option per shape. */
function chowOptions(hand: readonly Tile[], tile: Tile): [number, number][] {
  const k = tile.kind
  if (k.suit !== 'characters' && k.suit !== 'dots' && k.suit !== 'bamboo') return []
  const base = kindIndex(k) - (k.rank - 1)
  const shapes: [number, number][] = [
    [k.rank - 2, k.rank - 1],
    [k.rank - 1, k.rank + 1],
    [k.rank + 1, k.rank + 2],
  ]
  const options: [number, number][] = []
  for (const [a, b] of shapes) {
    if (a < 1 || b > 9) continue
    const ta = firstOfIndex(hand, base + a - 1)
    const tb = firstOfIndex(hand, base + b - 1)
    if (ta && tb) options.push([ta.id, tb.id])
  }
  return options
}

function claimOptions(state: GameState, seat: Seat, window: ClaimWindow, robbing: boolean): Action[] {
  const options: Action[] = []
  if (seat === window.from) return options
  if (evaluateWin(state, seat, window.tile, robbing ? 'robKong' : 'discard')) options.push({ type: 'win', seat })
  // Robbing a kong allows only a win; the final discard of the hand can only be claimed for a win.
  if (robbing || state.wall.length === 0) return options
  const hand = state.hands[seat]!
  const same = matching(hand, window.tile).length
  if (same >= 2) options.push({ type: 'pung', seat })
  if (same >= 3) options.push({ type: 'kong', seat })
  if (seat === nextSeat(window.from)) {
    for (const tileIds of chowOptions(hand, window.tile)) options.push({ type: 'chow', seat, tileIds })
  }
  return options
}

/** Concealed kongs (4 in hand) and promotions of an exposed pung, if a replacement tile is available. */
function kongOptions(state: GameState, seat: Seat): Action[] {
  if (state.wall.length === 0) return []
  const hand = state.hands[seat]!
  const options: Action[] = []
  const seen = new Set<number>()
  for (const t of hand) {
    const index = kindIndex(t.kind)
    if (seen.has(index)) continue
    seen.add(index)
    const same = matching(hand, t)
    if (same.length === 4) options.push({ type: 'kong', seat, tileIds: same.map((x) => x.id) })
  }
  for (const meld of state.melds[seat]!) {
    if (meld.type !== 'pung') continue
    const extra = matching(hand, meld.tiles[0]!)[0]
    if (extra) options.push({ type: 'kong', seat, tileIds: [extra.id] })
  }
  return options
}

export function legalActions(state: GameState, seat: Seat): Action[] {
  const phase = state.phase
  switch (phase.kind) {
    case 'ended':
      return []
    case 'draw':
      return seat === state.turn ? [{ type: 'draw', seat }] : []
    case 'discard': {
      if (seat !== state.turn) return []
      const hand = state.hands[seat]!
      const actions: Action[] = []
      const drawn = hand.find((t) => t.id === phase.drawnTileId)
      if (drawn && evaluateWin(state, seat, drawn, 'selfDraw')) actions.push({ type: 'win', seat })
      actions.push(...kongOptions(state, seat))
      for (const t of hand) actions.push({ type: 'discard', seat, tileId: t.id })
      return actions
    }
    case 'claim':
    case 'robKong': {
      if (phase.responses[seat] !== null) return []
      return [...claimOptions(state, seat, phase, phase.kind === 'robKong'), { type: 'pass', seat }]
    }
  }
}

// ---------------------------------------------------------------------------
// Transitions (operate on a private clone)
// ---------------------------------------------------------------------------

function endDrawn(s: GameState): void {
  s.phase = { kind: 'ended', result: { type: 'drawn' } }
}

function openWindow(s: GameState, tile: Tile, from: Seat, robKongMeld: number | null): void {
  const robbing = robKongMeld !== null
  const window: ClaimWindow = { tile, from, responses: [null, null, null, null] }
  for (let i = 0; i < 4; i++) {
    const seat = i as Seat
    const auto = claimOptions(s, seat, window, robbing).length === 0
    window.responses[seat] = auto ? { type: 'pass', seat } : null
  }
  s.phase = robbing ? { kind: 'robKong', meldIndex: robKongMeld, ...window } : { kind: 'claim', ...window }
  maybeResolveClaims(s)
}

/** Seats in priority order after `from`: the nearest seat in turn order wins ties (head bump). */
function seatsAfter(from: Seat): Seat[] {
  const a = nextSeat(from)
  const b = nextSeat(a)
  return [a, b, nextSeat(b)]
}

function maybeResolveClaims(s: GameState): void {
  const phase = s.phase
  if (phase.kind !== 'claim' && phase.kind !== 'robKong') return
  if (phase.responses.some((r) => r === null)) return

  const pick = (type: Action['type']): Action | undefined =>
    seatsAfter(phase.from)
      .map((seat) => phase.responses[seat]!)
      .find((r) => r.type === type)

  if (phase.kind === 'robKong') {
    const win = pick('win')
    if (win) return winOnTile(s, win.seat, phase.tile, phase.from)
    return completePromotedKong(s, phase.from, phase.meldIndex, phase.tile)
  }

  const claim = pick('win') ?? pick('pung') ?? pick('kong') ?? pick('chow')
  if (!claim) {
    if (s.wall.length === 0) return endDrawn(s)
    s.turn = nextSeat(phase.from)
    s.phase = { kind: 'draw' }
    return
  }
  applyClaim(s, claim, phase)
}

function takeFromHand(s: GameState, seat: Seat, ids: readonly number[]): Tile[] {
  const hand = s.hands[seat]!
  return ids.map((id) => hand.splice(hand.findIndex((t) => t.id === id), 1)[0]!)
}

/** Remove a discard that is being claimed from its owner's pond. */
function takeDiscard(s: GameState, from: Seat, tile: Tile): Tile {
  const pond = s.discards[from]!
  return pond.splice(pond.findIndex((t) => t.id === tile.id), 1)[0]!
}

/** Replacement draw after a kong: from the back of the wall, with flower replacement. */
function kongReplacement(s: GameState, seat: Seat): void {
  const tile = s.wall.pop()
  if (!tile) return endDrawn(s)
  const hand = s.hands[seat]!
  hand.push(tile)
  replaceFlowers(s, seat)
  if (hand.length + s.melds[seat]!.length * 3 < 14) return endDrawn(s)
  s.turn = seat
  s.phase = { kind: 'discard', drawnTileId: hand[hand.length - 1]!.id, afterKong: true }
}

/** Scored win on another seat's tile (discard or robbed kong). Scoring is wired in later. */
function winOnTile(s: GameState, seat: Seat, tile: Tile, from: Seat): void {
  const score = evaluateWin(s, seat, tile, s.phase.kind === 'robKong' ? 'robKong' : 'discard')
  if (!score) throw new Error('win accepted without a valid score')
  if (s.phase.kind === 'robKong') takeFromHand(s, from, [tile.id])
  else takeDiscard(s, from, tile)
  s.hands[seat]!.push(tile)
  s.turn = seat
  s.phase = { kind: 'ended', result: { type: 'win', winner: seat, from, tileId: tile.id, score, deltas: [0, 0, 0, 0] } }
}

function applyClaim(s: GameState, claim: Action, window: ClaimWindow): void {
  const seat = claim.seat
  const hand = s.hands[seat]!
  switch (claim.type) {
    case 'win':
      return winOnTile(s, seat, window.tile, window.from)
    case 'pung':
    case 'kong': {
      const own = matching(hand, window.tile).slice(0, claim.type === 'pung' ? 2 : 3)
      takeFromHand(s, seat, own.map((t) => t.id))
      const tile = takeDiscard(s, window.from, window.tile)
      s.melds[seat]!.push({ type: claim.type, tiles: [...own, tile], exposed: true, from: window.from, claimedTileId: tile.id })
      if (claim.type === 'kong') return kongReplacement(s, seat)
      break
    }
    case 'chow': {
      const own = takeFromHand(s, seat, claim.tileIds)
      const tile = takeDiscard(s, window.from, window.tile)
      const tiles = [...own, tile].sort((a, b) => kindIndex(a.kind) - kindIndex(b.kind))
      s.melds[seat]!.push({ type: 'chow', tiles, exposed: true, from: window.from, claimedTileId: tile.id })
      break
    }
    default:
      throw new Error(`cannot claim with ${claim.type}`)
  }
  s.turn = seat
  s.phase = { kind: 'discard', drawnTileId: null, afterKong: false }
}

function completePromotedKong(s: GameState, seat: Seat, meldIndex: number, tile: Tile): void {
  takeFromHand(s, seat, [tile.id])
  const meld = s.melds[seat]![meldIndex]!
  meld.type = 'kong'
  meld.tiles.push(tile)
  kongReplacement(s, seat)
}

function doKong(s: GameState, seat: Seat, tileIds: readonly number[]): void {
  if (tileIds.length === 4) {
    const tiles = takeFromHand(s, seat, tileIds)
    s.melds[seat]!.push({ type: 'kong', tiles, exposed: false })
    return kongReplacement(s, seat)
  }
  // Promotion: others may rob the kong before it completes.
  const tile = s.hands[seat]!.find((t) => t.id === tileIds[0])!
  const meldIndex = s.melds[seat]!.findIndex((m) => m.type === 'pung' && sameKind(m.tiles[0]!.kind, tile.kind))
  openWindow(s, tile, seat, meldIndex)
}

function selfDrawWin(s: GameState, seat: Seat): void {
  const phase = s.phase
  if (phase.kind !== 'discard') throw new Error('self-draw win outside discard phase')
  const tile = s.hands[seat]!.find((t) => t.id === phase.drawnTileId)!
  const score = evaluateWin(s, seat, tile, 'selfDraw')
  if (!score) throw new Error('win accepted without a valid score')
  s.phase = { kind: 'ended', result: { type: 'win', winner: seat, from: null, tileId: tile.id, score, deltas: [0, 0, 0, 0] } }
}

function doDraw(s: GameState, seat: Seat): void {
  const tile = s.wall.shift()
  if (!tile) return endDrawn(s)
  const hand = s.hands[seat]!
  hand.push(tile)
  replaceFlowers(s, seat)
  if (hand.length + s.melds[seat]!.length * 3 < 14) return endDrawn(s) // wall ran out mid flower replacement
  s.phase = { kind: 'discard', drawnTileId: hand[hand.length - 1]!.id, afterKong: false }
}

function doDiscard(s: GameState, seat: Seat, tileId: number): void {
  const hand = s.hands[seat]!
  const index = hand.findIndex((t) => t.id === tileId)
  const [tile] = hand.splice(index, 1)
  hand.sort((a, b) => a.id - b.id)
  s.discards[seat]!.push(tile!)
  openWindow(s, tile!, seat, null)
}

/**
 * Apply a legal action and return the next state. Throws on an illegal action.
 * The input state is never modified.
 */
export function applyAction(state: GameState, action: Action): GameState {
  if (!legalActions(state, action.seat).some((a) => sameAction(a, action))) {
    throw new Error(`illegal action ${JSON.stringify(action)} in phase ${state.phase.kind}`)
  }
  const s = clone(state)
  switch (action.type) {
    case 'draw':
      doDraw(s, action.seat)
      break
    case 'discard':
      doDiscard(s, action.seat, action.tileId)
      break
    default:
      if (s.phase.kind === 'claim' || s.phase.kind === 'robKong') {
        s.phase.responses[action.seat] = action
        maybeResolveClaims(s)
      } else if (action.type === 'kong') {
        doKong(s, action.seat, action.tileIds!)
      } else if (action.type === 'win') {
        selfDrawWin(s, action.seat)
      }
      break
  }
  return s
}
