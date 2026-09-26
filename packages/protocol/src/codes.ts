/** Room codes: four letters, no I or O so nobody mistakes them for 1 or 0. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
export const CODE_LENGTH = 4

/** Tidies what someone typed or pasted into a code: `" kj-xw "` → `"KJXW"`. Null if it can't be one. */
export function normalizeCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[^A-Z]/g, '')
  if (code.length !== CODE_LENGTH) return null
  return [...code].every((c) => CODE_ALPHABET.includes(c)) ? code : null
}

/** Codes that spell something rude are never handed out. */
const BLOCKED = new Set([
  'ANAL', 'ANUS', 'ARSE', 'BUTT', 'CLIT', 'COCK', 'COON', 'CRAP', 'CUNT', 'DAMN', 'DICK', 'DYKE', 'FAGS', 'FUCK',
  'GOOK', 'HELL', 'JERK', 'JIZZ', 'KIKE', 'KILL', 'NAZI', 'PAKI', 'PISS', 'POOP', 'PORN', 'PUSS', 'RAPE', 'SCUM', 'SHAT',
  'SHIT', 'SLUT', 'SPIC', 'SUCK', 'TITS', 'TURD', 'TWAT', 'WANK', 'DEAD', 'DIED', 'SEXY', 'NUDE',
])

export function isBlockedCode(code: string): boolean {
  return BLOCKED.has(code)
}

/**
 * A fresh code not in `taken`. `randomIndex(n)` must return an integer in [0, n); the server passes
 * a cryptographic source so codes can't be predicted.
 */
export function newRoomCode(taken: ReadonlySet<string>, randomIndex: (n: number) => number): string {
  for (let attempt = 0; attempt < 1000; attempt++) {
    let code = ''
    for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomIndex(CODE_ALPHABET.length)]
    if (!taken.has(code) && !isBlockedCode(code)) return code
  }
  throw new Error('no free room code')
}
