import { ref, watch } from 'vue'
import { MAX_NAME_LENGTH } from '@mahjong/protocol'

/** Shared with the online dialog from before profiles existed, so earlier names carry over. */
const NAME_KEY = 'mahjong.name'
const AVATAR_KEY = 'mahjong.avatar'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Storage unavailable: the profile lasts for this visit only.
  }
}

export function randomAvatarSeed(): number {
  return Math.floor(Math.random() * 2 ** 32)
}

/** A stored seed, if it is a 32-bit unsigned integer. */
export function parseAvatarSeed(raw: string | null): number | null {
  if (raw === null || !/^\d+$/.test(raw)) return null
  const n = Number(raw)
  return n < 2 ** 32 ? n : null
}

/** Tidies a typed name the way the server will: one line, trimmed, bounded. */
export function tidyName(raw: string): string {
  return raw.replace(/[\p{C}]/gu, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH)
}

/** Your name ('' = none chosen yet); used at solo and online tables alike. */
const name = ref(read(NAME_KEY) ?? '')
/** Seed of your avatar. The first visit deals one, kept from then on. */
const avatar = ref(parseAvatarSeed(read(AVATAR_KEY)) ?? randomAvatarSeed())

watch(name, (value) => write(NAME_KEY, value.trim() || null))
watch(avatar, (seed) => write(AVATAR_KEY, String(seed)), { immediate: true })

/** The player's own name and face, persisted per browser. */
export function useProfile() {
  return { name, avatar }
}
