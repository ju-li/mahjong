export type Suit = 'characters' | 'dots' | 'bamboo' | 'winds' | 'dragons' | 'flowers'

export type SuitedSuit = 'characters' | 'dots' | 'bamboo'
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
export type Wind = 'E' | 'S' | 'W' | 'N'
export type Dragon = 'red' | 'green' | 'white'
/** 1–4 = flowers (plum, orchid, chrysanthemum, bamboo), 5–8 = seasons (spring, summer, autumn, winter). */
export type FlowerNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

export type SuitedKind = { suit: SuitedSuit; rank: Rank }
export type WindKind = { suit: 'winds'; wind: Wind }
export type DragonKind = { suit: 'dragons'; dragon: Dragon }
export type FlowerKind = { suit: 'flowers'; flower: FlowerNumber }

export type TileKind = SuitedKind | WindKind | DragonKind | FlowerKind

/** One physical tile. `id` is unique within a wall (0..143). */
export type Tile = { readonly id: number; readonly kind: TileKind }

export const SUITED_SUITS: readonly SuitedSuit[] = ['characters', 'dots', 'bamboo']
export const RANKS: readonly Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9]
export const WINDS: readonly Wind[] = ['E', 'S', 'W', 'N']
export const DRAGONS: readonly Dragon[] = ['red', 'green', 'white']
export const FLOWER_NUMBERS: readonly FlowerNumber[] = [1, 2, 3, 4, 5, 6, 7, 8]

export const COPIES_PER_PLAYABLE_KIND = 4

/** The 34 distinct playable tile kinds: 27 suited + 4 winds + 3 dragons. */
export const PLAYABLE_KINDS: readonly TileKind[] = [
  ...SUITED_SUITS.flatMap((suit) => RANKS.map((rank): SuitedKind => ({ suit, rank }))),
  ...WINDS.map((wind): WindKind => ({ suit: 'winds', wind })),
  ...DRAGONS.map((dragon): DragonKind => ({ suit: 'dragons', dragon })),
]

/** The 8 bonus tiles, one copy each. */
export const FLOWER_KINDS: readonly FlowerKind[] = FLOWER_NUMBERS.map(
  (flower): FlowerKind => ({ suit: 'flowers', flower }),
)

export function isFlower(kind: TileKind): kind is FlowerKind {
  return kind.suit === 'flowers'
}

/** Stable string key for a tile kind, e.g. `characters-5`, `winds-E`, `dragons-red`, `flowers-3`. */
export function tileKey(kind: TileKind): string {
  switch (kind.suit) {
    case 'winds':
      return `winds-${kind.wind}`
    case 'dragons':
      return `dragons-${kind.dragon}`
    case 'flowers':
      return `flowers-${kind.flower}`
    default:
      return `${kind.suit}-${kind.rank}`
  }
}

/** Full 144-tile MCR set in canonical (unshuffled) order: 4 × 34 playable kinds, then 8 flowers. */
export function createWall(): Tile[] {
  const tiles: Tile[] = []
  for (const kind of PLAYABLE_KINDS) {
    for (let i = 0; i < COPIES_PER_PLAYABLE_KIND; i++) {
      tiles.push({ id: tiles.length, kind })
    }
  }
  for (const kind of FLOWER_KINDS) {
    tiles.push({ id: tiles.length, kind })
  }
  return tiles
}
