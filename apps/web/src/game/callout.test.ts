import { describe, expect, it } from 'vitest'
import { applyAction, legalActions, newHand, viewFor, type Action, type GameState, type Seat } from '@mahjong/engine'
import { calloutFor, tileCall } from './callout'

/** Play a hand, preferring claims, and collect every callout; also checks a seat's view calls the same. */
function playHand(seed: number): string[] {
  let s = newHand({ seed, dealer: 0, prevailingWind: 'E' })
  const calls: string[] = []
  for (let i = 0; i < 400 && s.phase.kind !== 'ended'; i++) {
    const seat = ([0, 1, 2, 3] as Seat[]).find((x) => legalActions(s, x).length > 0)!
    const legal = legalActions(s, seat)
    const pick = (t: Action['type']) => legal.find((a) => a.type === t)
    const action = pick('win') ?? pick('kong') ?? pick('pung') ?? pick('chow') ?? pick('draw') ?? pick('discard') ?? legal[0]!
    const next = applyAction(s, action)
    const call = calloutFor(s, next)
    // Online clients only see their own view; it must announce exactly the same calls.
    expect(calloutFor(viewFor(s, 0), viewFor(next, 0))).toEqual(call)
    if (call) calls.push(call.text)
    s = next
  }
  return calls
}

describe('calloutFor', () => {
  it('names tiles the way players say them', () => {
    expect(tileCall({ suit: 'characters', rank: 5 })).toBe('五万')
    expect(tileCall({ suit: 'dots', rank: 1 })).toBe('一饼')
    expect(tileCall({ suit: 'bamboo', rank: 9 })).toBe('九条')
    expect(tileCall({ suit: 'winds', wind: 'N' })).toBe('北风')
    expect(tileCall({ suit: 'dragons', dragon: 'red' })).toBe('红中')
  })

  it('stays silent without a change', () => {
    const s = newHand({ seed: 1, dealer: 0, prevailingWind: 'E' })
    expect(calloutFor(null, s)).toBeNull()
    expect(calloutFor(s, s)).toBeNull()
  })

  it('calls every discard by name and every claim by its word', () => {
    const all = [1, 2, 3, 4, 5, 6].flatMap(playHand)
    expect(all.some((c) => /^[一二三四五六七八九][万饼条]$|风$|^(红中|发财|白板)$/.test(c))).toBe(true)
    expect(all).toContain('碰')
    expect(all).toContain('吃')
    expect(all.every((c) => c !== '')).toBe(true)
  })

  it('announces who discarded', () => {
    const s = newHand({ seed: 7, dealer: 2, prevailingWind: 'E' })
    const discard = legalActions(s, 2).find((a) => a.type === 'discard')!
    const next = applyAction(s, discard)
    expect(calloutFor(s, next)?.seat).toBe(2)
  })

  it('says 自摸 for a self-drawn win and 胡 otherwise', () => {
    const s = newHand({ seed: 3, dealer: 0, prevailingWind: 'E' })
    const score = { fans: [], total: 8, flowerPoints: 0 }
    const win = (from: Seat | null): GameState => ({ ...s, phase: { kind: 'ended', result: { type: 'win', winner: 1, from, tileId: 0, score, deltas: [0, 0, 0, 0] } } })
    expect(calloutFor(s, win(null))).toEqual({ seat: 1, text: '自摸' })
    expect(calloutFor(s, win(2))).toEqual({ seat: 1, text: '胡' })
    expect(calloutFor(s, { ...s, phase: { kind: 'ended', result: { type: 'drawn' } } })).toBeNull()
  })
})
