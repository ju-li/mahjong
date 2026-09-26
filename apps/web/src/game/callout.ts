import type { GameState, MeldType, PlayerView, Seat, TileKind } from '@mahjong/engine'

/** Something a player says out loud, as at a real table. */
export type Callout = { seat: Seat; text: string }

const NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九']
const SUITS = { characters: '万', dots: '饼', bamboo: '条' } as const
const WINDS = { E: '东风', S: '南风', W: '西风', N: '北风' } as const
const DRAGONS = { red: '红中', green: '发财', white: '白板' } as const
const FLOWERS = ['梅', '兰', '菊', '竹', '春', '夏', '秋', '冬']

/** Spoken Mandarin name of a tile, e.g. 五万, 北风, 红中. */
export function tileCall(kind: TileKind): string {
  switch (kind.suit) {
    case 'winds':
      return WINDS[kind.wind]
    case 'dragons':
      return DRAGONS[kind.dragon]
    case 'flowers':
      return FLOWERS[kind.flower - 1]!
    default:
      return NUMERALS[kind.rank - 1]! + SUITS[kind.suit]
  }
}

const MELD_CALLS = { chow: '吃', pung: '碰', kong: '杠' } as const

/** The meld a seat just declared, if its meld list grew. */
function newMeld(prev: readonly { type: MeldType }[], next: readonly { type: MeldType }[]): { type: MeldType } | undefined {
  return next.length > prev.length ? next[next.length - 1] : undefined
}

/**
 * What a player would call out for a state transition: 吃 / 碰 / 杠 on a claim or kong,
 * 胡 / 自摸 on a win, and the tile's name on a discard. Takes full states or one seat's views.
 * Pure, so it can be tested without audio.
 */
export function calloutFor(prev: GameState | PlayerView | null, next: GameState | PlayerView | null): Callout | null {
  if (!prev || !next || prev === next) return null
  const phase = next.phase
  if (phase.kind === 'ended' && prev.phase.kind !== 'ended' && phase.result.type === 'win') {
    return { seat: phase.result.winner, text: phase.result.from === null ? '自摸' : '胡' }
  }
  // A promoted kong is announced when declared; the meld only changes once nobody robs it.
  if (phase.kind === 'robKong' && prev.phase.kind !== 'robKong') return { seat: phase.from, text: MELD_CALLS.kong }
  for (const seat of [0, 1, 2, 3] as Seat[]) {
    const meld = newMeld(prev.melds[seat]!, next.melds[seat]!)
    if (meld) return { seat, text: MELD_CALLS[meld.type] }
  }
  // A claim takes the tile back out of the pond, so a growing pond is always a fresh discard.
  for (const seat of [0, 1, 2, 3] as Seat[]) {
    const pond = next.discards[seat]!
    if (pond.length > prev.discards[seat]!.length) return { seat, text: tileCall(pond[pond.length - 1]!.kind) }
  }
  return null
}

let voice: SpeechSynthesisVoice | null | undefined

/** A Mandarin voice, preferring mainland Chinese. `null` if the system has none. */
function chineseVoice(synth: SpeechSynthesis): SpeechSynthesisVoice | null | undefined {
  if (voice !== undefined) return voice
  const voices = synth.getVoices()
  if (voices.length === 0) return undefined // not loaded yet
  const zh = voices.filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith('zh'))
  voice = zh.find((v) => /zh-cn/i.test(v.lang.replace('_', '-'))) ?? zh.find((v) => !/hk|yue/i.test(v.lang)) ?? zh[0] ?? null
  return voice
}

if (typeof speechSynthesis !== 'undefined') {
  speechSynthesis.addEventListener?.('voiceschanged', () => {
    voice = undefined
  })
}

/** Each seat gets a slightly different voice so you can tell the players apart by ear. */
const PITCH = [1, 0.8, 1.2, 0.95] as const
const RATE = [1.1, 1.05, 1.15, 1] as const
/** Upper bound on waiting for one call, in case the browser never reports the end of speech. */
const MAX_CALL_MS = 2500

let lastCall: Promise<void> = Promise.resolve()
/**
 * Utterances not yet finished. Chrome garbage-collects an utterance nothing else references, and
 * then never reports its end (and can stop speaking altogether).
 */
const inFlight = new Set<SpeechSynthesisUtterance>()
/** When the latest call should have finished by, even if the browser never said so. */
let quietBy = 0

/** Resolves once every callout spoken so far has finished. */
export function calloutsDone(): Promise<void> {
  return lastCall
}

/**
 * Browsers only let a page start speaking from a tap or key press (iOS Safari especially), and
 * callouts come from timers and server messages. Speaking nothing on the first gesture unlocks it.
 */
function unlockOnGesture(synth: SpeechSynthesis): void {
  if (typeof window === 'undefined') return
  const unlock = () => {
    window.removeEventListener('pointerdown', unlock, true)
    window.removeEventListener('keydown', unlock, true)
    try {
      if (!synth.speaking && !synth.pending) synth.speak(new SpeechSynthesisUtterance(''))
    } catch {
      // Nothing to unlock.
    }
  }
  window.addEventListener('pointerdown', unlock, true)
  window.addEventListener('keydown', unlock, true)
}

if (typeof speechSynthesis !== 'undefined') unlockOnGesture(speechSynthesis)

/** Speak a callout. Silently does nothing where speech synthesis or a Chinese voice is unavailable. */
export function speakCallout({ seat, text }: Callout): void {
  if (typeof speechSynthesis === 'undefined') return
  try {
    const v = chineseVoice(speechSynthesis)
    if (v === null) return // no Chinese voice: English voices would mangle the characters
    // A synth still busy long after the last call should have ended is stuck (Chrome, and after the
    // tab was in the background): everything queued behind it would stay silent until a reload.
    if ((speechSynthesis.speaking || speechSynthesis.pending) && performance.now() > quietBy) {
      speechSynthesis.cancel()
      inFlight.clear()
    }
    if (speechSynthesis.paused) speechSynthesis.resume()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = v?.lang ?? 'zh-CN'
    if (v) u.voice = v
    u.pitch = PITCH[seat]
    u.rate = RATE[seat]
    inFlight.add(u)
    quietBy = Math.max(quietBy, performance.now()) + MAX_CALL_MS
    // Utterances play in order, so the latest one ending means the table has gone quiet.
    lastCall = new Promise((resolve) => {
      u.onend = u.onerror = () => {
        inFlight.delete(u)
        resolve()
      }
      setTimeout(resolve, MAX_CALL_MS)
    })
    speechSynthesis.speak(u)
  } catch {
    // Speech is decoration; never let it break play.
  }
}
