import type { MessageKey } from '../i18n/messages'

/** Invite links point at the public domain (`PUBLIC_DOMAIN` at build time) so they work wherever the host is playing from. */
const PUBLIC_DOMAIN: string | undefined = import.meta.env.VITE_PUBLIC_DOMAIN
const SHARE_BASE = PUBLIC_DOMAIN
  ? /^https?:\/\//.test(PUBLIC_DOMAIN) ? PUBLIC_DOMAIN : `https://${PUBLIC_DOMAIN}`
  : `${location.origin}${location.pathname}`

export function inviteLink(code: string): string {
  const url = new URL(SHARE_BASE)
  url.searchParams.set('room', code)
  return url.href
}

/**
 * Opens the system share sheet for a table's invite link, falling back to the clipboard
 * (and then a prompt) where sharing isn't supported. Resolves `'copied'` when the link went to the clipboard.
 */
export async function shareInvite(
  code: string,
  t: (key: MessageKey, params?: Record<string, string | number>) => string,
): Promise<'shared' | 'copied' | 'prompted' | 'cancelled'> {
  const link = inviteLink(code)
  const text = t('lobby.shareText', { code })
  if (navigator.share) {
    try {
      await navigator.share({ title: t('app.title'), text, url: link })
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled'
    }
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${link}`)
    return 'copied'
  } catch {
    window.prompt(t('lobby.copy'), link)
    return 'prompted'
  }
}
