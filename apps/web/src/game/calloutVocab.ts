/**
 * Everything a player can call out, as plain data. Imports nothing, so the clip generator
 * (`scripts/gen-callouts.ts`) can load it straight into Node.
 */

export const NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'] as const
/** Every word for each numbered suit; the first is the default. Dots and bamboo follow the player's terms (i18n/terms.ts). */
export const SUIT_WORDS = { characters: ['万'], dots: ['饼', '筒'], bamboo: ['条', '索'] } as const
export const WINDS = { E: '东风', S: '南风', W: '西风', N: '北风' } as const
export const DRAGONS = { red: '红中', green: '发财', white: '白板' } as const
export const FLOWERS = ['梅', '兰', '菊', '竹', '春', '夏', '秋', '冬'] as const
export const MELD_CALLS = { chow: '吃', pung: '碰', kong: '杠' } as const
/** Always 胡: speech reads a bare 和 as hé. */
export const WIN_CALLS = { hu: '胡', zimo: '自摸' } as const

const SUIT_IDS: Record<string, string> = { 万: 'wan', 饼: 'bing', 筒: 'tong', 条: 'tiao', 索: 'suo' }
const WIND_IDS = { E: 'east', S: 'south', W: 'west', N: 'north' } as const

/** One phrase and the filename-safe id of its recording. */
export type CalloutPhrase = { id: string; text: string }

/**
 * Every phrase a callout can say, each recorded once per seat. Flowers are left out: they are
 * never discarded, so never called.
 */
export const CALLOUT_PHRASES: readonly CalloutPhrase[] = [
  ...Object.entries(MELD_CALLS).map(([id, text]) => ({ id, text })),
  ...Object.entries(WIN_CALLS).map(([id, text]) => ({ id, text })),
  ...Object.values(SUIT_WORDS).flatMap((words) =>
    words.flatMap((word) => NUMERALS.map((n, i) => ({ id: `${i + 1}${SUIT_IDS[word]}`, text: n + word }))),
  ),
  ...Object.entries(WINDS).map(([w, text]) => ({ id: WIND_IDS[w as keyof typeof WIND_IDS], text })),
  ...Object.entries(DRAGONS).map(([id, text]) => ({ id, text })),
]
