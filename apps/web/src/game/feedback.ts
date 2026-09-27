import { FEEDBACK_PATH, type FeedbackRequest } from '@mahjong/protocol'
import { recentLogs } from './consoleLog'
import { SERVER_HTTP_URL } from './serverUrl'

export type FeedbackError = 'network' | 'rejected' | 'busy'

/** Which deploy this is: the offline cache is named after a hash of the build's files. */
async function buildVersion(): Promise<string | null> {
  try {
    const keys = typeof caches === 'undefined' ? [] : await caches.keys()
    return keys.filter((k) => k.startsWith('mahjong-')).join(', ') || null
  } catch {
    return null
  }
}

/** A value from a browser API that might not exist or might throw. */
function safely<T>(read: () => T): T | null {
  try {
    return read() ?? null
  } catch {
    return null
  }
}

/**
 * About the device and app, for diagnosing a bug: browser, screen, the player's settings (`app`),
 * and the recent console output and uncaught errors.
 */
export async function deviceDiagnostics(app: Record<string, unknown>): Promise<Record<string, unknown>> {
  return {
    reportedAt: new Date().toISOString(),
    build: { mode: import.meta.env.MODE, version: await buildVersion(), serviceWorker: safely(() => navigator.serviceWorker?.controller?.scriptURL) },
    page: { url: location.href, referrer: document.referrer || null, visibility: document.visibilityState },
    browser: {
      userAgent: navigator.userAgent,
      userAgentData: safely(() => (navigator as Navigator & { userAgentData?: unknown }).userAgentData),
      languages: navigator.languages,
      platform: navigator.platform,
      online: navigator.onLine,
      cookieEnabled: navigator.cookieEnabled,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: safely(() => (navigator as Navigator & { deviceMemory?: number }).deviceMemory),
      maxTouchPoints: navigator.maxTouchPoints,
      timeZone: safely(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
      speechSynthesis: typeof speechSynthesis !== 'undefined',
    },
    display: {
      screen: { width: screen.width, height: screen.height, orientation: safely(() => screen.orientation?.type) },
      viewport: { width: innerWidth, height: innerHeight },
      devicePixelRatio,
      standalone: matchMedia('(display-mode: standalone)').matches,
      pointer: matchMedia('(pointer: coarse)').matches ? 'coarse' : 'fine',
      darkMode: matchMedia('(prefers-color-scheme: dark)').matches,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    },
    app,
    console: recentLogs(),
  }
}

/** Mails the report to the developers through the game server. */
export async function sendFeedback(request: FeedbackRequest): Promise<FeedbackError | null> {
  try {
    const res = await fetch(`${SERVER_HTTP_URL}${FEEDBACK_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    })
    if (res.ok) return null
    return res.status === 429 ? 'busy' : 'rejected'
  } catch {
    return 'network'
  }
}
