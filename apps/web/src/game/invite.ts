import type { MessageKey } from '../i18n/messages'

/** Invite links point at the public domain (`PUBLIC_DOMAIN` at build time) so they work wherever the host is playing from. */
const PUBLIC_DOMAIN: string | undefined = import.meta.env.VITE_PUBLIC_DOMAIN
const SHARE_BASE = PUBLIC_DOMAIN
  ? /^https?:\/\//.test(PUBLIC_DOMAIN) ? PUBLIC_DOMAIN : `https://${PUBLIC_DOMAIN}`
  : `${location.origin}${location.pathname}`

type Translate = (key: MessageKey, params?: Record<string, string | number>) => string
export type ShareOutcome = 'shared' | 'copied' | 'prompted' | 'cancelled'

function shareUrl(param: string, value: string): string {
  const url = new URL(SHARE_BASE)
  url.searchParams.set(param, value)
  return url.href
}

export function inviteLink(code: string): string {
  return shareUrl('room', code)
}

/** Link that makes whoever opens it your friend (after they sign in). */
export function friendInviteLink(code: string): string {
  return shareUrl('friend', code)
}

/**
 * Opens the system share sheet for a table's invite link, falling back to the clipboard
 * (and then a prompt) where sharing isn't supported. Resolves `'copied'` when the link went to the clipboard.
 */
export function shareInvite(code: string, t: Translate): Promise<ShareOutcome> {
  return shareLink(inviteLink(code), t('lobby.shareText', { code }), t)
}

/** Shares your friend invite link the same way. */
export function shareFriendInvite(code: string, t: Translate): Promise<ShareOutcome> {
  return shareLink(friendInviteLink(code), t('friends.shareText'), t)
}

async function shareLink(link: string, text: string, t: Translate): Promise<ShareOutcome> {
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
