import { describe, expect, it } from 'vitest'
import type { Action } from '@mahjong/engine'
import { actionForKey, shortcutFor, timeoutAction } from './keyboard'

const claims: Action[] = [
  { type: 'win', seat: 1 },
  { type: 'pung', seat: 1 },
  { type: 'chow', seat: 1, tileIds: [3, 7] },
  { type: 'chow', seat: 1, tileIds: [7, 11] },
  { type: 'pass', seat: 1 },
]

describe('claim timer (V31)', () => {
  it('passes only when pass is legal', () => {
    expect(timeoutAction(claims)).toEqual({ type: 'pass', seat: 1 })
    expect(timeoutAction([{ type: 'discard', seat: 1, tileId: 4 }])).toBeNull()
    expect(timeoutAction([])).toBeNull()
  })
})

describe('keyboard shortcuts (V32)', () => {
  it('maps every claim action to a key', () => {
    for (const a of claims) expect(actionForKey(shortcutFor(a)!, claims)).toMatchObject({ type: a.type })
  })

  it('cycles through options of the same type', () => {
    expect(actionForKey('c', claims, 0)).toEqual(claims[2])
    expect(actionForKey('C', claims, 1)).toEqual(claims[3])
    expect(actionForKey('c', claims, 2)).toEqual(claims[2])
  })

  it('ignores keys without a legal action', () => {
    expect(actionForKey('k', claims)).toBeNull()
    expect(actionForKey('z', claims)).toBeNull()
  })

  it('covers kong actions in the discard phase', () => {
    const turn: Action[] = [{ type: 'kong', seat: 0, tileIds: [1, 2, 3, 4] }, { type: 'discard', seat: 0, tileId: 9 }]
    expect(actionForKey('k', turn)).toEqual(turn[0])
  })
})
