import { describe, expect, it } from 'vitest'
import { countsOf, createWall, decompose, isFlower, kindIndex, mulberry32, shanten, shuffle, waitingKinds } from './index'
import { parseKinds } from './testing'

const sh = (n: string, melds = 0) => shanten(parseKinds(n), melds)
const forms = (n: string, melds = 0) => decompose(parseKinds(n), melds).map((f) => f.form)

/** Random complete standard hand: `4 - melds` sets + pair, respecting 4 copies per kind. */
function randomStandard(rand: () => number, melds = 0): number[] {
  for (;;) {
    const counts = new Array<number>(34).fill(0)
    const out: number[] = []
    const add = (k: number, n = 1) => {
      counts[k]! += n
      for (let i = 0; i < n; i++) out.push(k)
    }
    for (let i = 0; i < 4 - melds; i++) {
      if (rand() < 0.5) {
        const suit = Math.floor(rand() * 3)
        const start = suit * 9 + Math.floor(rand() * 7)
        add(start), add(start + 1), add(start + 2)
      } else add(Math.floor(rand() * 34), 3)
    }
    add(Math.floor(rand() * 34), 2)
    if (counts.every((c) => c <= 4)) return out
  }
}

describe('decompose', () => {
  it('recognises every complete form', () => {
    expect(forms('123m 456m 789m 123p 44p')).toContain('standard')
    expect(forms('11m 22m 33p 44p 55s EE CC')).toEqual(['sevenPairs'])
    expect(forms('19m 19p 19s ESWN CFP 1m')).toEqual(['thirteenOrphans'])
    expect(forms('147m 258p 369s ESWNC')).toEqual([expect.stringMatching(/honorsKnitted/)])
    expect(decompose(parseKinds('147m 258p 3s ESWNCFP'))).toEqual([{ form: 'honorsKnitted', greater: true, knittedStraight: false }])
    expect(decompose(parseKinds('147m 258p 369s ESWNC'))[0]).toMatchObject({ knittedStraight: true, greater: false })
    expect(forms('147m 258p 369s 234s EE')).toEqual(['knittedStraight'])
    expect(forms('147m 258p 369s EE', 1)).toEqual(['knittedStraight'])
  })

  it('lists every standard arrangement (111222333m can be pungs or chows)', () => {
    const standard = decompose(parseKinds('111222333m 789p 55s')).filter((f) => f.form === 'standard')
    expect(standard).toHaveLength(2)
  })

  it('counts four of a kind as two pairs in seven pairs', () => {
    expect(forms('1111m 22m 33p 44p 55s EE')).toContain('sevenPairs')
  })

  it('rejects incomplete hands', () => {
    expect(decompose(parseKinds('123m 456m 789m 123p 45p'))).toEqual([])
    expect(decompose(parseKinds('11m 22m 33p 44p 55s EE C F'))).toEqual([])
  })
})

describe('shanten', () => {
  it('matches known values', () => {
    expect(sh('123m 456m 789m 123p 4p')).toBe(0)
    expect(sh('123m 456m 789m 123p 44p')).toBe(-1)
    expect(sh('19m 19p 19s ESWN CFP')).toBe(0)
    expect(sh('1112345678999m')).toBe(0)
    expect(sh('11m 22m 33p 44p 55s EE C')).toBe(0)
    expect(sh('147m 258p 369s ESWN')).toBe(0)
    expect(sh('147m 258p 369s 23s EE')).toBe(0)
    expect(sh('123m 44p', 3)).toBe(-1)
    expect(sh('13579m 13579p 135s')).toBeGreaterThan(1)
  })

  it('finds waits', () => {
    const waits = (n: string, melds = 0) => waitingKinds(countsOf(parseKinds(n)), melds)
    expect(waits('1112345678999m')).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
    expect(waits('19m 19p 19s ESWN CFP')).toHaveLength(13)
    expect(waits('123m 456m 789m 123p 4p')).toEqual([9, 12])
    expect(waits('123m 456m 789m 13p EE')).toEqual([10])
  })

  it('is −1 exactly when decompose finds a form (V24)', () => {
    const rand = mulberry32(2024)
    const special = [
      '11m 22m 33p 44p 55s EE CC',
      '19m 19p 19s ESWN CFP 9s',
      '147m 258p 369s ESWNC',
      '147p 258s 3m ESWNCFP',
      '147s 258m 369p 111p EE',
    ].map(parseKinds)
    const hands: number[][] = [...special]
    for (let i = 0; i < 300; i++) hands.push(randomStandard(rand))
    for (let i = 0; i < 300; i++) {
      const melds = 1 + Math.floor(rand() * 3)
      const h = randomStandard(rand, melds)
      expect(shanten(h, melds)).toBe(-1)
      expect(decompose(h, melds).length).toBeGreaterThan(0)
    }
    const deck = createWall().filter((t) => !isFlower(t.kind)).map((t) => kindIndex(t.kind))
    for (let i = 0; i < 1500; i++) hands.push(shuffle(deck, i + 1).slice(0, 14))
    // Near-complete hands: swap one tile of a complete hand.
    for (let i = 0; i < 300; i++) {
      const h = randomStandard(rand)
      h[Math.floor(rand() * 14)] = Math.floor(rand() * 34)
      if (countsOf(h).every((c) => c <= 4)) hands.push(h)
    }
    let complete = 0
    for (const h of hands) {
      const s = shanten(h)
      const d = decompose(h)
      if ((s === -1) !== d.length > 0) expect.fail(`shanten ${s} vs ${d.length} forms for ${h.join(',')}`)
      if (s === -1) complete++
    }
    expect(complete).toBeGreaterThan(300)
  })
})

describe('shanten input checks', () => {
  it('rejects impossible tile counts', () => {
    expect(() => sh('147p 258s 36m ESWNCFP')).toThrow(RangeError)
    expect(() => sh('123m 456m 789m 123p')).toThrow(RangeError)
  })
})
