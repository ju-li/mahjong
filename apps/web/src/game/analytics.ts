import { event, trackPageviews } from 'liwan-tracker'

/**
 * Privacy-friendly usage counts through Liwan: pageviews plus a named event for each thing worth
 * counting. Liwan events carry a name only, so variants go in the name (`solo_…` / `online_…`).
 * Production builds only; the tracker itself also ignores localhost.
 */
const ENDPOINT: string = import.meta.env.VITE_LIWAN_ENDPOINT || 'https://a.mommymahjong.com/api/event'
const ENTITY = 'mahjong'
const enabled = import.meta.env.PROD

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
  | 'onboarding_finished'
  | 'feedback_sent'
  | 'app_installed'

export function startPageviews(): void {
  if (enabled) trackPageviews({ endpoint: ENDPOINT, entity: ENTITY })
}

/** Fire and forget: analytics never gets in the way of playing. */
export function track(name: AnalyticsEvent): void {
  if (!enabled) return
  event(name, { endpoint: ENDPOINT, entity: ENTITY }).catch(() => {
    // Blocked or offline: the count is simply missed.
  })
}
