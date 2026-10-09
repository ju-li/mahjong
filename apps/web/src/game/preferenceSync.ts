import { computed, ref, watch } from 'vue'
import type { PreferencesSync } from '@mahjong/protocol'
import { LOCALES, type Locale } from '../i18n/messages'
import { useI18n } from '../i18n/useI18n'
import { normalizeSettings, useSettings } from './settings'

/**
 * Keeps a signed-in player's preferences (settings and language) the same on every device:
 * whichever copy changed last wins. Before onboarding is finished nothing is uploaded; a player
 * whose account already has preferences skips the rest of onboarding.
 */

/** When this device's preferences last changed (ms), so the newer copy wins. */
const AT_KEY = 'mahjong.settings.changedAt'
/** Changes are sent once they settle. */
const UPLOAD_DELAY_MS = 1500

function readAt(): number {
  try {
    const n = Number(localStorage.getItem(AT_KEY))
    return Number.isFinite(n) ? n : 0
  } catch {
    return 0
  }
}
function writeAt(at: number): void {
  try {
    localStorage.setItem(AT_KEY, String(at))
  } catch {
    // Without storage, this visit's changes still sync.
  }
}

const settings = useSettings()
const { locale } = useI18n()
let localAt = readAt()
/** The preferences just taken from the account: their echo in the watcher is not a local change. */
let incoming: string | null = null
let sender: ((p: PreferencesSync) => void) | null = null
let uploadTimer: ReturnType<typeof setTimeout> | undefined

/** Bumped when onboarding is skipped because the account already had preferences. */
export const restoredFromAccount = ref(0)

const payload = (): Record<string, unknown> => ({ ...settings.current(), locale: locale.value })
const serialized = computed(() => JSON.stringify(payload()))

function upload(): void {
  clearTimeout(uploadTimer)
  if (sender && !settings.needsOnboarding.value) sender({ settings: payload(), updatedAt: localAt })
}
function uploadSoon(): void {
  clearTimeout(uploadTimer)
  uploadTimer = setTimeout(upload, UPLOAD_DELAY_MS)
}

watch(serialized, (now) => {
  if (settings.needsOnboarding.value) return
  if (now === incoming) return void (incoming = null)
  localAt = Date.now()
  writeAt(localAt)
  uploadSoon()
})
// Finishing onboarding is the newest change of all.
watch(settings.needsOnboarding, (waiting) => {
  if (waiting) return
  incoming = null
  localAt = Date.now()
  writeAt(localAt)
  uploadSoon()
})

/** The social connection is up: send through it. */
export function connectPreferences(send: (p: PreferencesSync) => void): void {
  sender = send
}
export function disconnectPreferences(): void {
  sender = null
  clearTimeout(uploadTimer)
}

/** The account's copy arrived: take it if it is newer (or this device is still onboarding), else send ours. */
export function receivePreferences(p: PreferencesSync): void {
  const serverAt = p.updatedAt ?? 0
  const onboarding = settings.needsOnboarding.value
  if (p.settings && (onboarding || serverAt >= localAt)) {
    const next = normalizeSettings(p.settings)
    const lang = LOCALES.includes(p.settings.locale as Locale) ? (p.settings.locale as Locale) : locale.value
    const json = JSON.stringify({ ...next, locale: lang })
    incoming = json === serialized.value ? null : json
    settings.apply(next)
    locale.value = lang
    localAt = serverAt
    writeAt(localAt)
    if (onboarding) restoredFromAccount.value++
  } else if (!onboarding) upload()
}
