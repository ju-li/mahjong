import { describe, expect, it } from 'vitest'
import { applyAction, legalActions, type Seat } from './index'
import { buildState, playRandomHand } from './testing'
import { kindIndex } from './tiles'

describe('final discard (V28)', () => {
  it('a seat that could pung or win the final discard may only win or pass', () => {
    let s = buildState({
      hands: ['5m 123s 456s 789s 11m EE', 'EE SSS WWW NNN CC', '55m 123p 456p 789p 99s', '19m 19p 19s FFF PPP C'],
      wallSize: 0,
    })
    const tile = s.hands[0]!.find((t) => kindIndex(t.kind) === 4)!
    s = applyAction(s, { type: 'discard', seat: 0, tileId: tile.id })
    expect(s.phase.kind).toBe('claim')
    expect(legalActions(s, 2).map((a) => a.type)).toEqual(['win', 'pass'])
  })

  it('random play never offers pung, kong or chow when the wall is empty', () => {
    for (let seed = 1; seed <= 150; seed++) {
      playRandomHand(seed, {
        claimBias: 1,
        onState: (s) => {
          if (s.phase.kind !== 'claim' || s.wall.length > 0) return
          for (const seat of [0, 1, 2, 3] as Seat[]) {
            const bad = legalActions(s, seat).filter((a) => a.type !== 'win' && a.type !== 'pass')
            if (bad.length) expect.fail(`seed ${seed}: seat ${seat} offered ${bad.map((a) => a.type).join(',')} on the final discard`)
          }
        },
      })
    }
  })
})
