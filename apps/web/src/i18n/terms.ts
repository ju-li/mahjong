/**
 * Chinese terminology choices. Families say 和牌 or 胡牌, 点炮 or 放铳…; the zh-Hans dictionary
 * and the engine's Chinese fan names carry `{t:<term>}` tokens that resolve to the player's choice.
 * This is a personal display preference: it never changes rules and is never shared with a table.
 */

/** Each term with its variants; the first is the default (what the app said before terms existed). */
export const TERM_OPTIONS = {
  /** To win: 和牌 / 胡牌, 自摸和 / 自摸胡, 起和 / 起胡… */
  win: ['和', '胡'],
  /** Discarding the winning tile. */
  discarder: ['点和', '点炮', '放炮', '放铳'],
  /** Nobody won before the wall ran out. */
  drawn: ['荒庄', '流局'],
  /** The circles suit. */
  dots: ['饼', '筒'],
  /** The bamboo suit. */
  bamboo: ['条', '索'],
  /** The pair in a winning hand. */
  pair: ['将', '眼'],
} as const

export type TermId = keyof typeof TERM_OPTIONS
export type Terms = { [K in TermId]: (typeof TERM_OPTIONS)[K][number] }
export const TERM_IDS = Object.keys(TERM_OPTIONS) as TermId[]

export const DEFAULT_TERMS: Terms = Object.fromEntries(TERM_IDS.map((id) => [id, TERM_OPTIONS[id][0]])) as Terms

/** Valid terms from storage or the network; unknown ids are dropped, bad values fall back to the default. */
export function normalizeTerms(input: unknown): Terms {
  const raw = input !== null && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  const out = { ...DEFAULT_TERMS } as Record<TermId, string>
  for (const id of TERM_IDS) if ((TERM_OPTIONS[id] as readonly unknown[]).includes(raw[id])) out[id] = raw[id] as string
  return out as Terms
}

const TOKEN = /\{t:(\w+)\}/g

/** Replace every `{t:<term>}` token with the chosen word; unknown tokens are left as they are. */
export function resolveTerms(text: string, terms: Terms): string {
  return text.replace(TOKEN, (token, id: string) => (id in terms ? terms[id as TermId] : token))
}

/** Term ids used in a text, for tests. */
export function termTokens(text: string): string[] {
  return [...text.matchAll(TOKEN)].map((m) => m[1]!)
}
