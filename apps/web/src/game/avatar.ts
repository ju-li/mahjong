/**
 * Random cartoon avatars, built from a seed so a player keeps the same face for a whole match
 * (and across reloads) while every new match deals new faces.
 */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const BACKGROUNDS = ['#f6d7a7', '#bfe3f2', '#d9c8f0', '#c9ebc3', '#f7c6c7', '#f3e7b0', '#c7d7f5', '#e8d3c0']
const SKINS = ['#ffe0c7', '#f7cfa8', '#eab98f', '#d19a6c', '#a86f47', '#7a4c2e']
const HAIR = ['#1c1a1a', '#3b2616', '#6b4423', '#a0672c', '#d8b25a', '#8f8f8f', '#b8452a', '#2c3e66']
const SHIRTS = ['#e0503c', '#2f6fb0', '#2b8a57', '#6e44a8', '#e2a126', '#303845', '#d6567f', '#1f8a8a']

type Rng = () => number
const pick = <T>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length)]!

function hairBack(style: number, color: string): string {
  switch (style) {
    case 3: // long
      return `<path d="M22 46 Q20 20 50 18 Q80 20 78 46 L82 86 Q66 92 60 80 L40 80 Q34 92 18 86Z" fill="${color}"/>`
    case 4: // bun
      return `<circle cx="50" cy="15" r="11" fill="${color}"/>`
    default:
      return ''
  }
}

function hairFront(style: number, color: string): string {
  switch (style) {
    case 0: // short crop
      return `<path d="M26 44 Q24 18 50 17 Q76 18 74 44 Q70 30 58 28 Q48 34 34 30 Q28 36 26 44Z" fill="${color}"/>`
    case 1: // side part
      return `<path d="M25 46 Q22 16 52 16 Q78 18 75 42 Q72 30 64 27 Q46 36 30 30 Q26 38 25 46Z" fill="${color}"/><path d="M50 18 Q44 26 30 30" stroke="#0003" stroke-width="1.5" fill="none"/>`
    case 2: // spiky
      return `<path d="M25 44 L24 26 L32 30 L34 16 L42 26 L50 12 L57 26 L66 16 L68 30 L76 26 L75 44 Q70 30 50 30 Q30 30 25 44Z" fill="${color}"/>`
    case 3: // long, fringe
      return `<path d="M26 46 Q24 18 50 18 Q76 18 74 46 Q68 30 50 31 Q34 30 26 46Z" fill="${color}"/>`
    case 4: // bun, pulled back
      return `<path d="M26 42 Q26 20 50 20 Q74 20 74 42 Q66 28 50 28 Q34 28 26 42Z" fill="${color}"/>`
    case 5: // curly
      return [30, 40, 50, 60, 70, 26, 74]
        .map((x, i) => `<circle cx="${x}" cy="${i < 5 ? 24 + (i % 2) * 2 : 36}" r="${i < 5 ? 9 : 7}" fill="${color}"/>`)
        .join('')
    default: // receding
      return `<path d="M26 40 Q24 30 30 28 Q28 36 28 44Z M74 40 Q76 30 70 28 Q72 36 72 44Z" fill="${color}"/>`
  }
}

function eyes(style: number): string {
  switch (style) {
    case 0:
      return `<circle cx="41" cy="48" r="2.8" fill="#1c1a1a"/><circle cx="59" cy="48" r="2.8" fill="#1c1a1a"/>`
    case 1: // happy arcs
      return `<path d="M36 49 q5 -6 10 0 M54 49 q5 -6 10 0" stroke="#1c1a1a" stroke-width="2.4" fill="none" stroke-linecap="round"/>`
    default:
      return (
        `<ellipse cx="41" cy="48" rx="4.5" ry="5" fill="#fff"/><ellipse cx="59" cy="48" rx="4.5" ry="5" fill="#fff"/>` +
        `<circle cx="42" cy="49" r="2.6" fill="#2a1d14"/><circle cx="60" cy="49" r="2.6" fill="#2a1d14"/>` +
        `<circle cx="43" cy="48" r=".9" fill="#fff"/><circle cx="61" cy="48" r=".9" fill="#fff"/>`
      )
  }
}

function mouth(style: number): string {
  switch (style) {
    case 0:
      return `<path d="M43 63 q7 6 14 0" stroke="#7a2e22" stroke-width="2.2" fill="none" stroke-linecap="round"/>`
    case 1: // grin
      return `<path d="M40 61 q10 12 20 0z" fill="#7a2e22"/><path d="M42 62 h16 q-1 3 -8 3 q-7 0 -8 -3z" fill="#fff"/>`
    case 2: // o
      return `<ellipse cx="50" cy="64" rx="3.5" ry="4" fill="#7a2e22"/>`
    default: // smirk
      return `<path d="M44 64 q8 2 13 -3" stroke="#7a2e22" stroke-width="2.2" fill="none" stroke-linecap="round"/>`
  }
}

/** Complete `<svg>` markup for a random face. */
export function avatarSvg(seed: number): string {
  const rng = mulberry32(seed)
  const bg = pick(rng, BACKGROUNDS)
  const skin = pick(rng, SKINS)
  const hair = pick(rng, HAIR)
  const shirt = pick(rng, SHIRTS)
  const hairStyle = Math.floor(rng() * 7)
  const eyeStyle = Math.floor(rng() * 3)
  const mouthStyle = Math.floor(rng() * 4)
  const glasses = rng() < 0.25
  const beard = hairStyle !== 3 && hairStyle !== 4 && rng() < 0.2
  const blush = rng() < 0.5

  return (
    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">` +
    `<rect width="100" height="100" fill="${bg}"/>` +
    hairBack(hairStyle, hair) +
    `<path d="M14 100 Q16 78 50 76 Q84 78 86 100Z" fill="${shirt}"/>` +
    `<path d="M42 70 h16 v10 q-8 6 -16 0z" fill="${skin}"/>` +
    `<ellipse cx="26" cy="52" rx="5" ry="7" fill="${skin}"/><ellipse cx="74" cy="52" rx="5" ry="7" fill="${skin}"/>` +
    `<ellipse cx="50" cy="50" rx="24" ry="27" fill="${skin}"/>` +
    (beard ? `<path d="M28 56 Q30 80 50 80 Q70 80 72 56 Q64 70 50 70 Q36 70 28 56Z" fill="${hair}"/>` : '') +
    hairFront(hairStyle, hair) +
    `<path d="M36 41 q5 -3 10 0 M54 41 q5 -3 10 0" stroke="${hair}" stroke-width="2.4" fill="none" stroke-linecap="round"/>` +
    eyes(eyeStyle) +
    (blush ? `<ellipse cx="35" cy="58" rx="4.5" ry="2.6" fill="#f08a7a" opacity=".45"/><ellipse cx="65" cy="58" rx="4.5" ry="2.6" fill="#f08a7a" opacity=".45"/>` : '') +
    `<path d="M50 50 q-3 7 1 8" stroke="#0003" stroke-width="1.8" fill="none" stroke-linecap="round"/>` +
    mouth(mouthStyle) +
    (glasses
      ? `<g fill="none" stroke="#1c1a1a" stroke-width="2"><rect x="33" y="42" width="15" height="12" rx="4"/><rect x="52" y="42" width="15" height="12" rx="4"/><path d="M48 47 h4"/></g>`
      : '') +
    `</svg>`
  )
}

/** Per-player avatar seeds for a match, derived from the match seed. */
export function avatarSeeds(matchSeed: number, players = 4): number[] {
  const rng = mulberry32(matchSeed ^ 0x5bd1e995)
  return Array.from({ length: players }, () => Math.floor(rng() * 2 ** 32))
}
