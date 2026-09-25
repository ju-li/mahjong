import { describe, expect, it } from 'vitest'
import { newHand, replay, viewFor, type GameState, type Seat } from './index'
import { effectiveSize, expectConservation, expectNoFlowersInHands, playRandomHand } from './testing'

/** All tile ids that appear anywhere in a JSON value. */
function idsIn(value: unknown, out = new Set<number>()): Set<number> {
  if (Array.isArray(value)) value.forEach((v) => idsIn(v, out))
  else if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>
    if (typeof o.id === 'number' && 'kind' in o) out.add(o.id)
    for (const v of Object.values(o)) idsIn(v, out)
  }
  return out
}

function hiddenFrom(state: GameState, seat: Seat): Set<number> {
  const hidden = new Set<number>(state.wall.map((t) => t.id))
  state.hands.forEach((h, s) => s !== seat && h.forEach((t) => hidden.add(t.id)))
  state.melds.forEach((ms, s) => s !== seat && ms.filter((m) => !m.exposed).forEach((m) => m.tiles.forEach((t) => hidden.add(t.id))))
  return hidden
}

describe('viewFor', () => {
  it('never exposes other hands, concealed kongs, wall order or the seed', () => {
    for (let seed = 1; seed <= 30; seed++) {
      playRandomHand(seed, {
        claimBias: 0.8,
        onState: (state) => {
          if (state.phase.kind === 'ended') return
          for (const seat of [0, 1, 2, 3] as Seat[]) {
            const view = viewFor(state, seat)
            const seen = idsIn(view)
            const leaked = [...hiddenFrom(state, seat)].filter((id) => seen.has(id))
            if (leaked.length) expect.fail(`seat ${seat} sees hidden tiles ${leaked.join(',')}`)
            if ('seed' in view || view.wallCount !== state.wall.length) expect.fail('view leaks seed or wrong wall count')
          }
        },
      })
    }
  })

  it('shows the drawn tile only to the seat that drew it', () => {
    let s = newHand({ seed: 4, dealer: 0, prevailingWind: 'E' })
    s = { ...s, phase: { kind: 'discard', drawnTileId: s.hands[0]![0]!.id, afterKong: false } }
    expect(viewFor(s, 0).phase).toMatchObject({ drawnTileId: s.hands[0]![0]!.id })
    expect(viewFor(s, 1).phase).toMatchObject({ drawnTileId: null })
  })
})

describe('replay', () => {
  it('rebuilds the same state from seed + actions (200 seeds, invariants checked)', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { state, actions } = playRandomHand(seed, {
        claimBias: 0.6,
        onState: (s) => {
          expectConservation(s)
          expectNoFlowersInHands(s)
          if (s.phase.kind === 'discard') expect(effectiveSize(s, s.turn)).toBe(14)
        },
      })
      expect(replay({ seed, dealer: (seed & 3) as Seat, prevailingWind: 'E' }, actions)).toEqual(state)
    }
  })
})
