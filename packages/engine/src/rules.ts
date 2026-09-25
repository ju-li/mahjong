import { replaceFlowers } from './deal'
import type { Action, ClaimWindow, GameState, HandScore, Seat } from './state'
import { nextSeat } from './state'
import type { Tile } from './tiles'

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

function claimOptions(state: GameState, seat: Seat, window: ClaimWindow, robbing: boolean): Action[] {
  const options: Action[] = []
  if (evaluateWin(state, seat, window.tile, robbing ? 'robKong' : 'discard')) options.push({ type: 'win', seat })
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

function openClaimWindow(s: GameState, tile: Tile, from: Seat): void {
  const window: ClaimWindow = { tile, from, responses: [null, null, null, null] }
  for (let i = 0; i < 4; i++) {
    const seat = i as Seat
    const auto = seat === from || claimOptions(s, seat, window, false).length === 0
    window.responses[seat] = auto ? { type: 'pass', seat } : null
  }
  s.phase = { kind: 'claim', ...window }
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
  if (phase.kind !== 'claim') return
  if (phase.responses.some((r) => r === null)) return

  const pick = (type: Action['type']): Action | undefined =>
    seatsAfter(phase.from)
      .map((seat) => phase.responses[seat]!)
      .find((r) => r.type === type)

  const claim = pick('win') ?? pick('pung') ?? pick('kong') ?? pick('chow')
  if (!claim) {
    if (s.wall.length === 0) return endDrawn(s)
    s.turn = nextSeat(phase.from)
    s.phase = { kind: 'draw' }
    return
  }
  applyClaim(s, claim, phase)
}

function applyClaim(_s: GameState, claim: Action, _window: ClaimWindow): void {
  throw new Error(`claim ${claim.type} not supported yet`)
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
  openClaimWindow(s, tile!, seat)
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
    case 'pass':
    case 'win':
    case 'pung':
    case 'kong':
    case 'chow':
      if (s.phase.kind === 'claim' || s.phase.kind === 'robKong') {
        s.phase.responses[action.seat] = action
        maybeResolveClaims(s)
      } else {
        throw new Error(`${action.type} outside a claim window is not supported yet`)
      }
      break
  }
  return s
}
