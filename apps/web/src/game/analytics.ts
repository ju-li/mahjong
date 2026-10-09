/**
 * Usage counts through Matomo: pageviews plus an event for each thing worth counting, tagged with the
 * player's account id once signed in. Events keep the names used before (`solo_…` / `online_…`) as
 * the action, grouped into a category. Production builds only.
 */
const MATOMO_URL = 'https://a.mommymahjong.com/'
const SITE_ID = '8'
const enabled = import.meta.env.PROD

declare global {
  interface Window {
    _paq?: unknown[][]
  }
}

export type AnalyticsEvent =
  | 'signed_in'
  | 'signed_out'
  | 'friend_request_sent'
  | 'friend_request_accepted'
  | 'friend_added_by_link'
  | 'friend_invited_to_table'
  | 'table_hosted'
  | 'table_joined'
  | 'online_match_started'
  | 'online_match_finished'
  | 'solo_match_started'
  | 'solo_match_finished'
  | 'onboarding_step'
  | 'onboarding_finished'
  | 'feedback_sent'
  | 'app_installed'

const CATEGORY: Record<AnalyticsEvent, string> = {
  signed_in: 'account',
  signed_out: 'account',
  friend_request_sent: 'social',
  friend_request_accepted: 'social',
  friend_added_by_link: 'social',
  friend_invited_to_table: 'social',
  table_hosted: 'table',
  table_joined: 'table',
  online_match_started: 'match',
  online_match_finished: 'match',
  solo_match_started: 'match',
  solo_match_finished: 'match',
  onboarding_step: 'app',
  onboarding_finished: 'app',
  feedback_sent: 'app',
  app_installed: 'app',
}

/** Matomo reads this queue once its script loads, so commands can be pushed before then. */
function push(...command: unknown[]): void {
  if (!enabled) return
  ;(window._paq ??= []).push(command)
}

export function startPageviews(): void {
  if (!enabled) return
  push('setCookieDomain', '*.mommymahjong.com')
  push('trackPageView')
  push('enableLinkTracking')
  push('setTrackerUrl', `${MATOMO_URL}matomo.php`)
  push('setSiteId', SITE_ID)
  const script = document.createElement('script')
  script.async = true
  script.src = `${MATOMO_URL}matomo.js`
  // Blocked or offline: the counts are simply missed.
  document.head.appendChild(script)
}

/** Fire and forget: analytics never gets in the way of playing. `label` and `value` are Matomo's event name and value. */
export function track(name: AnalyticsEvent, label?: string, value?: number): void {
  const extra = value === undefined ? (label === undefined ? [] : [label]) : [label, value]
  push('trackEvent', CATEGORY[name], name, ...extra)
}

/** Tag later hits with the signed-in player's account id, or stop tagging them. */
export function identify(userId: string | null): void {
  if (userId) push('setUserId', userId)
  else push('resetUserId')
}
