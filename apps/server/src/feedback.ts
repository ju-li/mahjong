import { createTransport } from 'nodemailer'
import { MAX_FEEDBACK_ATTACHMENT_BYTES, MAX_FEEDBACK_MESSAGE, MAX_NAME_LENGTH } from '@mahjong/protocol'

/** Where feedback goes unless `FEEDBACK_TO` says otherwise. */
export const FEEDBACK_RECIPIENTS = ['yuanmingongling@gmail.com', 'juli@opsinsight.ai']

/** Per sender address: at most this many reports... */
export const FEEDBACK_PER_WINDOW = 5
/** ...in this long. */
export const FEEDBACK_WINDOW_MS = 10 * 60_000
/** And from everyone together, so a flood can't turn the server into a spam relay. */
export const FEEDBACK_TOTAL_PER_WINDOW = 50

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type FeedbackMail = {
  replyTo?: string
  subject: string
  text: string
  attachments: { filename: string; content: string; contentType: string }[]
}

export type FeedbackResult = { ok: true } | { ok: false; status: number; error: string }

export type FeedbackEnv = {
  /** Sends the mail; throws if it could not. Null when SMTP isn't configured. */
  send: ((mail: FeedbackMail) => Promise<void>) | null
  now(): number
  /** The server's full copy of an online table, if one is open under that code. */
  table(code: string): unknown
}

const text = (raw: unknown, max: number) => (typeof raw === 'string' ? raw.replace(/\r\n?/g, '\n').trim().slice(0, max) : '')
/** One line for headers: no control characters, so nothing can be smuggled into the mail. */
const line = (raw: string) => raw.replace(/[\p{C}]/gu, ' ').replace(/\s+/g, ' ').trim()

function attachment(filename: string, data: unknown) {
  let content = JSON.stringify(data ?? null, null, 2)
  if (Buffer.byteLength(content) > MAX_FEEDBACK_ATTACHMENT_BYTES) {
    content = JSON.stringify({ truncated: true, head: content.slice(0, MAX_FEEDBACK_ATTACHMENT_BYTES) })
  }
  return { filename, content, contentType: 'application/json' }
}

/**
 * Turns a player's feedback into an email to the developers, with two JSON attachments:
 * the device diagnostics and the game (plus, at an online table, the server's full copy of it).
 */
export function createFeedbackHandler(env: FeedbackEnv) {
  const recent = new Map<string, number[]>()

  return async function handle(body: unknown, sender: string): Promise<FeedbackResult> {
    if (!env.send) return { ok: false, status: 503, error: 'feedback email is not configured' }
    const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
    const name = line(text(b.name, MAX_NAME_LENGTH * 4))
    const email = line(text(b.email, 254))
    const message = text(b.message, MAX_FEEDBACK_MESSAGE)
    if (!message) return { ok: false, status: 400, error: 'message is required' }
    if (email && !EMAIL.test(email)) return { ok: false, status: 400, error: 'invalid email' }

    const now = env.now()
    const within = (key: string) => (recent.get(key) ?? []).filter((t) => now - t < FEEDBACK_WINDOW_MS)
    const mine = within(sender)
    const all = within('*')
    if (mine.length >= FEEDBACK_PER_WINDOW || all.length >= FEEDBACK_TOTAL_PER_WINDOW) {
      return { ok: false, status: 429, error: 'too many reports; try again later' }
    }
    for (const key of recent.keys()) if (within(key).length === 0) recent.delete(key)
    recent.set(sender, [...mine, now])
    recent.set('*', [...all, now])

    const code = typeof b.tableCode === 'string' && /^[A-Z]{4}$/.test(b.tableCode) ? b.tableCode : null
    const game = code ? { client: b.game ?? null, server: env.table(code) } : (b.game ?? null)
    const stamp = new Date(now).toISOString()
    const from = name || 'Anonymous'

    try {
      await env.send({
        replyTo: email || undefined,
        subject: `Mahjong feedback from ${from}${code ? ` (table ${code})` : ''}`,
        text: [`From: ${from}${email ? ` <${email}>` : ''}`, `Sent: ${stamp}`, code ? `Online table: ${code}` : 'Solo match', '', message].join('\n'),
        attachments: [attachment('diagnostics.json', b.diagnostics), attachment('game.json', game)],
      })
    } catch (e) {
      console.error('feedback email failed', e)
      return { ok: false, status: 502, error: 'could not send the email' }
    }
    return { ok: true }
  }
}

/**
 * SMTP from the environment: `SMTP_HOST`, `SMTP_PORT` (default 587; 465 = TLS from the start),
 * `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (default `SMTP_USER`) and `FEEDBACK_TO` (comma-separated).
 * Null when `SMTP_HOST` is unset.
 */
export function smtpSender(env: NodeJS.ProcessEnv = process.env): FeedbackEnv['send'] {
  if (!env.SMTP_HOST) return null
  const port = Number(env.SMTP_PORT ?? 587)
  const transport = createTransport({
    host: env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? '' } : undefined,
  })
  const from = env.SMTP_FROM || env.SMTP_USER
  const to = env.FEEDBACK_TO?.split(',').map((s) => s.trim()).filter(Boolean) ?? FEEDBACK_RECIPIENTS
  return async (mail) => {
    await transport.sendMail({ from, to, ...mail })
  }
}
