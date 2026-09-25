import { KIND_COUNT, kindIndex, type Tile } from './tiles'

/**
 * Hand shapes over kind counts (`counts[k]` = copies of kind index k, see `kindIndex`).
 * Suited kinds are 0..26 (three suits of 9), honors 27..33.
 */

export type ShapeSet = { type: 'chow' | 'pung'; /** Lowest kind index of the set. */ index: number }

export type Form =
  | { form: 'standard'; sets: ShapeSet[]; pair: number }
  | { form: 'sevenPairs'; pairs: number[] }
  | { form: 'thirteenOrphans' }
  /** Lesser (greater = false) or Greater Honors and Knitted Tiles. `knittedStraight`: all nine knitted tiles present. */
  | { form: 'honorsKnitted'; greater: boolean; knittedStraight: boolean }
  /** Knitted straight (147/258/369 in `suits` order) + remaining sets + pair. */
  | { form: 'knittedStraight'; suits: [number, number, number]; sets: ShapeSet[]; pair: number }

export const TERMINALS_AND_HONORS: readonly number[] = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33]

/** The six assignments of rank groups 147 / 258 / 369 to suits. */
export const KNITTED_PERMUTATIONS: readonly [number, number, number][] = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
]

/** The nine kind indices of a knitted straight for a suit permutation. */
export function knittedKinds(suits: readonly [number, number, number]): number[] {
  const out: number[] = []
  suits.forEach((suit, group) => {
    for (const rank of [1, 4, 7]) out.push(suit * 9 + rank + group - 1)
  })
  return out
}

export function isHonorIndex(k: number): boolean {
  return k >= 27
}

export function countsOf(tiles: readonly (Tile | number)[]): number[] {
  const counts = new Array<number>(KIND_COUNT).fill(0)
  for (const t of tiles) {
    const k = typeof t === 'number' ? t : kindIndex(t.kind)
    if (k < 0) throw new Error('flowers have no shape')
    counts[k]!++
  }
  return counts
}

const total = (counts: readonly number[]) => counts.reduce((a, b) => a + b, 0)

// ---------------------------------------------------------------------------
// Standard form (n sets + pair)
// ---------------------------------------------------------------------------

function extractSets(counts: number[], need: number, from: number, acc: ShapeSet[], out: ShapeSet[][]): void {
  if (need === 0) {
    if (counts.every((c) => c === 0)) out.push([...acc])
    return
  }
  let i = from
  while (i < KIND_COUNT && counts[i] === 0) i++
  if (i >= KIND_COUNT) return
  if (counts[i]! >= 3) {
    counts[i]! -= 3
    acc.push({ type: 'pung', index: i })
    extractSets(counts, need - 1, i, acc, out)
    acc.pop()
    counts[i]! += 3
  }
  if (i < 27 && i % 9 <= 6 && counts[i + 1]! > 0 && counts[i + 2]! > 0) {
    counts[i]!--
    counts[i + 1]!--
    counts[i + 2]!--
    acc.push({ type: 'chow', index: i })
    extractSets(counts, need - 1, i, acc, out)
    acc.pop()
    counts[i]!++
    counts[i + 1]!++
    counts[i + 2]!++
  }
}

/** Every way to split `counts` into `need` sets + one pair. */
export function standardForms(counts: readonly number[], need: number): { sets: ShapeSet[]; pair: number }[] {
  if (total(counts) !== need * 3 + 2) return []
  const out: { sets: ShapeSet[]; pair: number }[] = []
  const seen = new Set<string>()
  const work = [...counts]
  for (let p = 0; p < KIND_COUNT; p++) {
    if (work[p]! < 2) continue
    work[p]! -= 2
    const splits: ShapeSet[][] = []
    extractSets(work, need, 0, [], splits)
    work[p]! += 2
    for (const sets of splits) {
      const key = `${p}:${sets.map((s) => s.type[0] + s.index).join(',')}`
      if (!seen.has(key)) {
        seen.add(key)
        out.push({ sets, pair: p })
      }
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Special forms
// ---------------------------------------------------------------------------

function sevenPairs(counts: readonly number[]): number[] | null {
  if (total(counts) !== 14) return null
  const pairs: number[] = []
  for (let k = 0; k < KIND_COUNT; k++) {
    const c = counts[k]!
    if (c % 2 !== 0) return null
    for (let i = 0; i < c / 2; i++) pairs.push(k)
  }
  return pairs
}

function thirteenOrphans(counts: readonly number[]): boolean {
  if (total(counts) !== 14) return false
  return TERMINALS_AND_HONORS.every((k) => counts[k]! >= 1) && TERMINALS_AND_HONORS.reduce((n, k) => n + counts[k]!, 0) === 14
}

function honorsKnitted(counts: readonly number[]): { greater: boolean; knittedStraight: boolean } | null {
  if (total(counts) !== 14 || counts.some((c) => c > 1)) return null
  for (const suits of KNITTED_PERMUTATIONS) {
    const allowed = new Set([...knittedKinds(suits), 27, 28, 29, 30, 31, 32, 33])
    if (counts.every((c, k) => c === 0 || allowed.has(k))) {
      const honors = counts.slice(27).reduce((a, b) => a + b, 0)
      return { greater: honors === 7, knittedStraight: knittedKinds(suits).every((k) => counts[k] === 1) }
    }
  }
  return null
}

/**
 * All complete forms of a concealed part, given how many sets are already declared as melds.
 * Returns [] when the tiles are not a winning shape.
 */
export function decompose(tiles: readonly (Tile | number)[], meldCount = 0): Form[] {
  return decomposeCounts(countsOf(tiles), meldCount)
}

/** `decompose` over kind counts. */
export function decomposeCounts(counts: readonly number[], meldCount = 0): Form[] {
  const need = 4 - meldCount
  const forms: Form[] = standardForms(counts, need).map((f) => ({ form: 'standard', ...f }))
  if (meldCount === 0) {
    const pairs = sevenPairs(counts)
    if (pairs) forms.push({ form: 'sevenPairs', pairs })
    if (thirteenOrphans(counts)) forms.push({ form: 'thirteenOrphans' })
    const hk = honorsKnitted(counts)
    if (hk) forms.push({ form: 'honorsKnitted', ...hk })
  }
  if (meldCount <= 1) {
    for (const suits of KNITTED_PERMUTATIONS) {
      const ks = knittedKinds(suits)
      if (!ks.every((k) => counts[k]! >= 1)) continue
      const rest = [...counts]
      for (const k of ks) rest[k]!--
      for (const f of standardForms(rest, 1 - meldCount)) forms.push({ form: 'knittedStraight', suits, ...f })
    }
  }
  return forms
}

export function isComplete(counts: readonly number[], meldCount = 0): boolean {
  return decomposeCounts(counts, meldCount).length > 0
}

// ---------------------------------------------------------------------------
// Shanten
// ---------------------------------------------------------------------------

/** Standard-form shanten for `need` sets + pair. −1 = complete. */
function standardShanten(counts: readonly number[], need: number): number {
  const work = [...counts]
  let best = 2 * need

  const search = (i: number, sets: number, partials: number, pair: number): void => {
    while (i < KIND_COUNT && work[i] === 0) i++
    if (i >= KIND_COUNT) {
      const usable = Math.min(partials, need - sets)
      best = Math.min(best, 2 * (need - sets) - usable - pair)
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
    // Treat one copy as an isolated tile.
    work[i]!--
    search(i, sets, partials, pair)
    work[i]!++
  }

  search(0, 0, 0, 0)
  return best
}

function sevenPairsShanten(counts: readonly number[]): number {
  let pairs = 0
  let kinds = 0
  for (const c of counts) {
    if (c > 0) kinds++
    if (c >= 2) pairs++
  }
  return 6 - pairs + Math.max(0, 7 - kinds)
}

function thirteenOrphansShanten(counts: readonly number[]): number {
  let kinds = 0
  let pair = 0
  for (const k of TERMINALS_AND_HONORS) {
    if (counts[k]! > 0) kinds++
    if (counts[k]! >= 2) pair = 1
  }
  return 13 - kinds - pair
}

function honorsKnittedShanten(counts: readonly number[]): number {
  let best = 13
  const honors = counts.slice(27).filter((c) => c > 0).length
  for (const suits of KNITTED_PERMUTATIONS) {
    const knitted = knittedKinds(suits).filter((k) => counts[k]! > 0).length
    best = Math.min(best, 13 - Math.min(14, honors + knitted))
  }
  return best
}

function knittedStraightShanten(counts: readonly number[], meldCount: number): number {
  if (meldCount > 1) return Infinity
  let best = Infinity
  for (const suits of KNITTED_PERMUTATIONS) {
    const rest = [...counts]
    let missing = 0
    for (const k of knittedKinds(suits)) {
      if (rest[k]! > 0) rest[k]!--
      else missing++
    }
    best = Math.min(best, missing + standardShanten(rest, 1 - meldCount))
  }
  return best
}

/**
 * Tiles away from a complete hand across every MCR form (standard, seven pairs, thirteen orphans,
 * honors-and-knitted, knitted straight). −1 = complete. Pass the concealed tiles (13 or 14 minus
 * 3 per declared meld) and how many melds are declared.
 */
export function shanten(tiles: readonly (Tile | number)[], meldCount = 0): number {
  return shantenOfCounts(countsOf(tiles), meldCount)
}

export function shantenOfCounts(counts: readonly number[], meldCount = 0): number {
  const n = total(counts)
  if (n > 14 - 3 * meldCount || n % 3 === 0) {
    throw new RangeError(`shanten needs 3n+1 or 3n+2 concealed tiles, got ${n} with ${meldCount} melds`)
  }
  let best = standardShanten(counts, 4 - meldCount)
  if (meldCount === 0) {
    best = Math.min(best, sevenPairsShanten(counts), thirteenOrphansShanten(counts), honorsKnittedShanten(counts))
  }
  return Math.min(best, knittedStraightShanten(counts, meldCount))
}

/**
 * Kinds that would complete a hand of 3n+1 concealed tiles. A kind already held four times
 * (in `counts` plus `alsoHeld`) cannot be waited on.
 */
export function waitingKinds(counts: readonly number[], meldCount = 0, alsoHeld?: readonly number[]): number[] {
  const waits: number[] = []
  const work = [...counts]
  for (let k = 0; k < KIND_COUNT; k++) {
    if (work[k]! + (alsoHeld?.[k] ?? 0) >= 4) continue
    work[k]!++
    if (isComplete(work, meldCount)) waits.push(k)
    work[k]!--
  }
  return waits
}
