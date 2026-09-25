import { describe, expect, it } from 'vitest'
import { countsOf, createWall, decompose, isFlower, kindIndex, mulberry32, shanten, shuffle, standardShanten, waitingKinds } from './index'
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

/** The original whole-hand search, kept as an oracle for the per-suit implementation. */
function referenceStandardShanten(counts: readonly number[], need: number): number {
  const work = [...counts]
  let best = 2 * need
  const search = (i: number, sets: number, partials: number, pair: number): void => {
    while (i < 34 && work[i] === 0) i++
    if (i >= 34) {
      best = Math.min(best, 2 * (need - sets) - Math.min(partials, need - sets) - pair)
      return
    }
    if (sets < need) {
      if (work[i]! >= 3) {
        work[i]! -= 3
        search(i, sets + 1, partials, pair)
        work[i]! += 3
      }
      if (i < 27 && i % 9 <= 6 && work[i + 1]! > 0 && work[i + 2]! > 0) {
        work[i]!--, work[i + 1]!--, work[i + 2]!--
        search(i, sets + 1, partials, pair)
        work[i]!++, work[i + 1]!++, work[i + 2]!++
      }
    }
    if (work[i]! >= 2) {
      work[i]! -= 2
      if (!pair) search(i, sets, partials, 1)
      if (sets + partials < need) search(i, sets, partials + 1, pair)
      work[i]! += 2
    }
    if (sets + partials < need && i < 27) {
      if (i % 9 <= 7 && work[i + 1]! > 0) {
        work[i]!--, work[i + 1]!--
        search(i, sets, partials + 1, pair)
        work[i]!++, work[i + 1]!++
      }
      if (i % 9 <= 6 && work[i + 2]! > 0) {
        work[i]!--, work[i + 2]!--
        search(i, sets, partials + 1, pair)
        work[i]!++, work[i + 2]!++
      }
    }
    work[i]!--
    search(i, sets, partials, pair)
    work[i]!++
  }
  search(0, 0, 0, 0)
  return best
}

describe('standardShanten (per-suit) matches the whole-hand search', () => {
  it('agrees on random hands of every legal size', () => {
    const deck = createWall().filter((t) => !isFlower(t.kind)).map((t) => kindIndex(t.kind))
    for (let i = 0; i < 1500; i++) {
      const melds = i % 5 === 4 ? 0 : i % 4
      const size = (4 - melds) * 3 + 1 + (i % 2)
      const counts = countsOf(shuffle(deck, 5000 + i).slice(0, size))
      expect(standardShanten(counts, 4 - melds), `hand ${i}`).toBe(referenceStandardShanten(counts, 4 - melds))
    }
    // Suit-heavy hands stress the per-suit search.
    for (let i = 0; i < 300; i++) {
      const suit = deck.filter((k) => k < 9 || k >= 27)
      const counts = countsOf(shuffle(suit, 9000 + i).slice(0, 14))
      expect(standardShanten(counts, 4)).toBe(referenceStandardShanten(counts, 4))
    }
  })
})
