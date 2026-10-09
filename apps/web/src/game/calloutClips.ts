import type { Seat } from '@mahjong/engine'
import { CALLOUT_PHRASES } from './calloutVocab'

/**
 * Recorded callouts, one voice per seat, made by `pnpm --filter web gen:callouts`. Vite gives each
 * a content-hashed /assets URL, so browsers and the offline service worker fetch each one once.
 */
const URLS = import.meta.glob<string>('../assets/callouts/seat*/*.mp3', { query: '?url', import: 'default', eager: true })
const IDS = new Map(CALLOUT_PHRASES.map((p) => [p.text, p.id]))

/** URL of a seat's recording of a phrase, if there is one. */
export function clipUrl(seat: Seat, text: string): string | undefined {
  const id = IDS.get(text)
  return id === undefined ? undefined : URLS[`../assets/callouts/seat${seat}/${id}.mp3`]
}
