import { tileKey, type Rank, type TileKind } from '@mahjong/engine'

/**
 * Traditional tile faces as inline SVG: circles for dots, sticks (and the bird on 1) for bamboo,
 * Chinese numerals over 萬 for characters. Drawn on a 60×80 face; pure, so results are cached.
 */

const RED = '#c0282d'
const GREEN = '#17804a'
const BLUE = '#1d4f9e'
const INK = '#16213a'
const SERIF = "'Noto Serif CJK SC','Source Han Serif SC','Songti SC','STSong','SimSun','Noto Sans CJK SC','PingFang SC','WenQuanYi Zen Hei',serif"

const NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九']
const WINDS = { E: '東', S: '南', W: '西', N: '北' } as const
const FLOWERS = ['梅', '蘭', '菊', '竹', '春', '夏', '秋', '冬']
const FLOWER_COLORS = [RED, BLUE, '#c07a12', GREEN, GREEN, RED, '#c07a12', BLUE]

const f = (n: number) => +n.toFixed(2)

function text(x: number, y: number, size: number, color: string, s: string, weight = 700): string {
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${color}" font-family="${SERIF}" text-anchor="middle" dominant-baseline="central">${s}</text>`
}

// ---- Dots ----

function dot(cx: number, cy: number, r: number, color: string): string {
  return (
    `<g transform="translate(${f(cx)} ${f(cy)})">` +
    `<circle r="${r}" fill="${color}"/>` +
    `<circle r="${f(r * 0.74)}" fill="#fffdf6"/>` +
    `<circle r="${f(r * 0.56)}" fill="none" stroke="${color}" stroke-width="${f(r * 0.14)}" stroke-dasharray="${f(r * 0.3)} ${f(r * 0.16)}"/>` +
    `<circle r="${f(r * 0.28)}" fill="${color}"/>` +
    `<circle r="${f(r * 0.1)}" fill="#fffdf6"/>` +
    `</g>`
  )
}

function bigDot(): string {
  const petals = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2
    return `<circle cx="${f(30 + Math.cos(a) * 15)}" cy="${f(40 + Math.sin(a) * 15)}" r="3.2" fill="${i % 2 ? RED : BLUE}"/>`
  }).join('')
  return (
    `<circle cx="30" cy="40" r="22" fill="${GREEN}"/>` +
    `<circle cx="30" cy="40" r="19.5" fill="#fffdf6"/>` +
    petals +
    `<circle cx="30" cy="40" r="10" fill="${RED}"/>` +
    `<circle cx="30" cy="40" r="7" fill="#fffdf6"/>` +
    `<circle cx="30" cy="40" r="4.5" fill="${GREEN}"/>`
  )
}

const DOT_LAYOUTS: Record<Rank, [number, number, string][]> = {
  1: [],
  2: [[30, 22, GREEN], [30, 58, BLUE]],
  3: [[14, 16, BLUE], [30, 40, RED], [46, 64, GREEN]],
  4: [[17, 22, BLUE], [43, 22, GREEN], [17, 58, GREEN], [43, 58, BLUE]],
  5: [[16, 18, BLUE], [44, 18, GREEN], [30, 40, RED], [16, 62, GREEN], [44, 62, BLUE]],
  6: [[18, 14, GREEN], [42, 14, GREEN], [18, 44, RED], [42, 44, RED], [18, 66, RED], [42, 66, RED]],
  7: [[13, 11, GREEN], [30, 18, GREEN], [47, 25, GREEN], [18, 46, RED], [42, 46, RED], [18, 67, RED], [42, 67, RED]],
  8: [[18, 11, BLUE], [42, 11, BLUE], [18, 30, BLUE], [42, 30, BLUE], [18, 50, BLUE], [42, 50, BLUE], [18, 69, BLUE], [42, 69, BLUE]],
  9: [[13, 14, BLUE], [30, 14, BLUE], [47, 14, BLUE], [13, 40, RED], [30, 40, RED], [47, 40, RED], [13, 66, GREEN], [30, 66, GREEN], [47, 66, GREEN]],
}

const DOT_RADIUS: Record<Rank, number> = { 1: 0, 2: 13, 3: 10.5, 4: 11, 5: 10, 6: 9.5, 7: 8, 8: 8.5, 9: 8 }

function dots(rank: Rank): string {
  if (rank === 1) return bigDot()
  return DOT_LAYOUTS[rank].map(([x, y, c]) => dot(x, y, DOT_RADIUS[rank], c)).join('')
}

// ---- Bamboo ----

function stick(cx: number, cy: number, h: number, color: string, angle = 0): string {
  const w = 7
  const top = -h / 2
  return (
    `<g transform="translate(${cx} ${cy})${angle ? ` rotate(${angle})` : ''}">` +
    `<rect x="${-w / 2}" y="${f(top)}" width="${w}" height="${h}" rx="3.2" fill="${color}"/>` +
    `<rect x="-1" y="${f(top + 2.5)}" width="2" height="${f(h - 5)}" rx="1" fill="#fff" opacity=".45"/>` +
    `<rect x="${-w / 2 - 0.6}" y="-1" width="${w + 1.2}" height="2" rx="1" fill="${color}" stroke="#fffdf6" stroke-width=".7"/>` +
    `<rect x="${-w / 2 - 0.6}" y="${f(top - 0.6)}" width="${w + 1.2}" height="2" rx="1" fill="${color}"/>` +
    `<rect x="${-w / 2 - 0.6}" y="${f(-top - 1.4)}" width="${w + 1.2}" height="2" rx="1" fill="${color}"/>` +
    `</g>`
  )
}

/** The 1 of bamboo is traditionally a bird (sparrow / peacock) standing on a stalk. */
function bird(): string {
  const tail = [-38, -18, 2, 22]
    .map((a, i) => `<ellipse cx="0" cy="-14" rx="4.2" ry="14" fill="${i % 2 ? BLUE : GREEN}" transform="translate(24 52) rotate(${a - 30})"/>`)
    .join('')
  const eyes = [-38, -18, 2, 22]
    .map((a) => `<circle cx="0" cy="-24" r="2.2" fill="${RED}" transform="translate(24 52) rotate(${a - 30})"/>`)
    .join('')
  return (
    tail +
    eyes +
    `<ellipse cx="33" cy="46" rx="10" ry="13" fill="${GREEN}"/>` +
    `<path d="M27 42 q8 -4 13 6 q-6 6 -13 2z" fill="${BLUE}"/>` +
    `<circle cx="39" cy="28" r="6.5" fill="${GREEN}"/>` +
    `<path d="M37 22 l2 -6 l2 6z" fill="${RED}"/>` +
    `<circle cx="41" cy="27" r="1.4" fill="#fffdf6"/>` +
    `<path d="M45 28 l6 1.5 l-6 1.5z" fill="#d9a01c"/>` +
    `<path d="M30 58 l-2 10 M36 58 l2 10" stroke="${RED}" stroke-width="2" stroke-linecap="round"/>` +
    `<path d="M20 69 h26" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>`
  )
}

function bamboo(rank: Rank): string {
  const G = GREEN
  switch (rank) {
    case 1:
      return bird()
    case 2:
      return stick(30, 22, 28, G) + stick(30, 58, 28, BLUE)
    case 3:
      return stick(30, 22, 28, BLUE) + stick(18, 58, 28, G) + stick(42, 58, 28, G)
    case 4:
      return stick(19, 22, 28, BLUE) + stick(41, 22, 28, G) + stick(19, 58, 28, G) + stick(41, 58, 28, BLUE)
    case 5:
      return stick(15, 22, 28, G) + stick(45, 22, 28, BLUE) + stick(30, 40, 26, RED) + stick(15, 58, 28, BLUE) + stick(45, 58, 28, G)
    case 6:
      return [15, 30, 45].map((x) => stick(x, 22, 28, G) + stick(x, 58, 28, BLUE)).join('')
    case 7:
      return stick(30, 14, 18, RED) + [15, 30, 45].map((x) => stick(x, 40, 20, G) + stick(x, 64, 20, G)).join('')
    case 8:
      return (
        [12, 24, 36, 48].map((x, i) => stick(x, 22, 28, G, i % 2 ? -18 : 18)).join('') +
        [12, 24, 36, 48].map((x, i) => stick(x, 58, 28, G, i % 2 ? 18 : -18)).join('')
      )
    case 9:
      return [15, 30, 45].map((x) => [16, 40, 64].map((y) => stick(x, y, 20, x === 30 ? RED : x === 15 ? G : BLUE)).join('')).join('')
  }
}

// ---- Faces ----

function draw(kind: TileKind): string {
  switch (kind.suit) {
    case 'characters':
      return text(30, 23, 26, INK, NUMERALS[kind.rank - 1]!, 800) + text(30, 57, 32, RED, '萬', 800)
    case 'dots':
      return dots(kind.rank)
    case 'bamboo':
      return bamboo(kind.rank)
    case 'winds':
      return text(30, 41, 44, INK, WINDS[kind.wind], 800)
    case 'dragons':
      if (kind.dragon === 'red') return text(30, 41, 46, RED, '中', 800)
      if (kind.dragon === 'green') return text(30, 41, 44, GREEN, '發', 800)
      return (
        `<rect x="9" y="10" width="42" height="60" rx="3" fill="none" stroke="${BLUE}" stroke-width="4"/>` +
        `<rect x="15" y="16" width="30" height="48" rx="2" fill="none" stroke="${BLUE}" stroke-width="1.5"/>`
      )
    case 'flowers': {
      const i = kind.flower - 1
      const color = FLOWER_COLORS[i]!
      return (
        text(30, 42, 36, color, FLOWERS[i]!, 800) +
        `<circle cx="47" cy="12" r="7" fill="${color}"/>` +
        text(47, 12.5, 10, '#fffdf6', String((i % 4) + 1), 800)
      )
    }
  }
}

const cache = new Map<string, string>()

/** Complete `<svg>` markup for a tile face. */
export function tileSvg(kind: TileKind): string {
  const key = tileKey(kind)
  let svg = cache.get(key)
  if (!svg) {
    svg = `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${draw(kind)}</svg>`
    cache.set(key, svg)
  }
  return svg
}
