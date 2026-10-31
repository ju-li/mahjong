import { describe, expect, it } from 'vitest'
import { MAX_FEEDBACK_ATTACHMENT_BYTES, MAX_FEEDBACK_SCREENSHOT_BYTES, MAX_FEEDBACK_SCREENSHOTS } from '@mahjong/protocol'
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

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]).toString('base64')
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 4, 5, 6]).toString('base64')

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

  it('attaches screenshots as images after the JSON files', async () => {
    const { sent, handle } = setup()
    const screenshots = [
      { type: 'image/png', data: PNG },
      { type: 'image/jpeg', data: JPEG },
    ]
    expect(await handle({ ...report, screenshots }, 'a')).toEqual({ ok: true })
    const mail = sent[0]!
    expect(mail.text).toContain('Screenshots: 2')
    expect(mail.attachments.slice(2)).toEqual([
      { filename: 'screenshot-1.png', content: PNG, contentType: 'image/png', encoding: 'base64' },
      { filename: 'screenshot-2.jpg', content: JPEG, contentType: 'image/jpeg', encoding: 'base64' },
    ])
  })

  it('refuses screenshots that are too many, too big or not really images', async () => {
    const { sent, handle } = setup()
    const shot = { type: 'image/png', data: PNG }
    const tooBig = Buffer.alloc(MAX_FEEDBACK_SCREENSHOT_BYTES + 1, 0x89)
    Buffer.from(PNG, 'base64').copy(tooBig)
    for (const screenshots of [
      Array(MAX_FEEDBACK_SCREENSHOTS + 1).fill(shot),
      [{ type: 'image/png', data: tooBig.toString('base64') }],
      [{ type: 'image/png', data: JPEG }],
      [{ type: 'image/svg+xml', data: Buffer.from('<svg/>').toString('base64') }],
      [{ type: 'image/png', data: '' }],
      'nope',
    ]) {
      expect(await handle({ ...report, screenshots }, 'a')).toMatchObject({ ok: false, status: 400 })
    }
    expect(sent).toHaveLength(0)
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
