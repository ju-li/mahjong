import { computed, ref } from 'vue'
import { track } from './analytics'

/** Chromium's install prompt event (not in the DOM typings). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** The browser's deferred install prompt (Chrome, Edge, Android); null until it offers one. */
const deferred = ref<BeforeInstallPromptEvent | null>(null)
const installed = ref(
  typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true),
)

// Listen at module load: the event can fire before any component mounts.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred.value = e as BeforeInstallPromptEvent
  })
  window.addEventListener('appinstalled', () => {
    deferred.value = null
    installed.value = true
    track('app_installed')
  })
}

/** iPhone / iPad Safari: no install prompt, the player adds it from the Share menu. */
const isIos =
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

/**
 * Install as an app. `canInstall` is true when the browser offers a prompt, or on iOS where the
 * player adds it by hand; never once running as the installed app.
 */
export function useInstall() {
  const canInstall = computed(() => !installed.value && (deferred.value !== null || isIos))

  /** Show the browser's install prompt; returns false when the player must add it by hand (iOS). */
  async function install(): Promise<boolean> {
    const prompt = deferred.value
    if (!prompt) return false
    deferred.value = null // a prompt can only be shown once
    await prompt.prompt()
    if ((await prompt.userChoice).outcome === 'accepted') installed.value = true
    return true
  }

  return { canInstall, install }
}
