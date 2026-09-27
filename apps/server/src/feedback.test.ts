import { describe, expect, it } from 'vitest'
import { MAX_FEEDBACK_ATTACHMENT_BYTES } from '@mahjong/protocol'
import { createFeedbackHandler, FEEDBACK_PER_WINDOW, FEEDBACK_WINDOW_MS, smtpSender, type FeedbackMail } from './feedback'

function setup(table: unknown = null) {
  const sent: FeedbackMail[] = []
  let now = 1_700_000_000_000
  const handle = createFeedbackHandler({
    send: async (mail) => void sent.push(mail),
    now: () => now,
    table: (code) => (code === 'KJXW' ? table : null),
  })
  return { sent, handle, later: (ms: number) => (now += ms) }
}

const report = { name: 'Ann', email: 'ann@example.com', message: 'The bot discarded twice', diagnostics: { userAgent: 'test' }, game: { seed: 7 } }

describe('feedback', () => {
  it('mails the message with diagnostics and game attached, replying to the player', async () => {
    const { sent, handle } = setup()
    expect(await handle(report, '1.2.3.4')).toEqual({ ok: true })
    expect(sent).toHaveLength(1)
    const mail = sent[0]!
    expect(mail.replyTo).toBe('ann@example.com')
    expect(mail.subject).toContain('Ann')
    expect(mail.text).toContain('The bot discarded twice')
    expect(mail.attachments.map((a) => a.filename)).toEqual(['diagnostics.json', 'game.json'])
    expect(JSON.parse(mail.attachments[0]!.content)).toEqual({ userAgent: 'test' })
    expect(JSON.parse(mail.attachments[1]!.content)).toEqual({ seed: 7 })
  })

  it("adds the server's copy of an online table", async () => {
    const { sent, handle } = setup({ code: 'KJXW', match: { seed: 9 } })
    await handle({ ...report, tableCode: 'KJXW' }, 'a')
    expect(sent[0]!.subject).toContain('KJXW')
    expect(JSON.parse(sent[0]!.attachments[1]!.content)).toEqual({ client: { seed: 7 }, server: { code: 'KJXW', match: { seed: 9 } } })
  })

  it('needs a message and accepts only a plausible email, which is optional', async () => {
    const { sent, handle } = setup()
    expect(await handle({ ...report, message: '  ' }, 'a')).toMatchObject({ ok: false, status: 400 })
    expect(await handle({ ...report, email: 'nope' }, 'a')).toMatchObject({ ok: false, status: 400 })
    expect(await handle({ message: 'hi' }, 'a')).toEqual({ ok: true })
    expect(sent[0]!.replyTo).toBeUndefined()
    expect(sent[0]!.subject).toContain('Anonymous')
  })

  it('keeps header fields on one line', async () => {
    const { sent, handle } = setup()
    await handle({ ...report, name: 'Ann\r\nBcc: x@evil.test' }, 'a')
    expect(sent[0]!.subject).not.toMatch(/[\r\n]/)
  })

  it('truncates oversized attachments', async () => {
    const { sent, handle } = setup()
    await handle({ ...report, diagnostics: { logs: 'x'.repeat(MAX_FEEDBACK_ATTACHMENT_BYTES * 2) } }, 'a')
    const parsed = JSON.parse(sent[0]!.attachments[0]!.content)
    expect(parsed.truncated).toBe(true)
  })

  it('limits how often one sender can report', async () => {
    const { handle, later } = setup()
    for (let i = 0; i < FEEDBACK_PER_WINDOW; i++) expect(await handle(report, 'a')).toEqual({ ok: true })
    expect(await handle(report, 'a')).toMatchObject({ ok: false, status: 429 })
    expect(await handle(report, 'b')).toEqual({ ok: true })
    later(FEEDBACK_WINDOW_MS)
    expect(await handle(report, 'a')).toEqual({ ok: true })
  })

  it('reports a failed send, and is unavailable without SMTP', async () => {
    const failing = createFeedbackHandler({ send: async () => Promise.reject(new Error('down')), now: () => 0, table: () => null })
    expect(await failing(report, 'a')).toMatchObject({ ok: false, status: 502 })
    const off = createFeedbackHandler({ send: smtpSender({}), now: () => 0, table: () => null })
    expect(await off(report, 'a')).toMatchObject({ ok: false, status: 503 })
  })
})
