import { createEndpoint, createRouter, defineRoom, defineServer } from '@colyseus/core'
import { WebSocketTransport } from '@colyseus/ws-transport'
import { isRuleSet } from '@mahjong/engine'
import { FEEDBACK_PATH, LEADERBOARD_PATH, ROOM_NAME, SOCIAL_ROOM } from '@mahjong/protocol'
import { leaderboard } from './db/matches'
import { createFeedbackHandler, smtpSender, type FeedbackEnv } from './feedback'
import { TableRoom, tableDiagnostics } from './room'
import { configureServicesFromEnv, services } from './services'
import { SocialRoom } from './social'

/** How feedback is mailed; tests swap in their own sender. */
export const feedbackEnv: FeedbackEnv = { send: smtpSender(), now: () => Date.now(), table: tableDiagnostics }
const feedback = createFeedbackHandler(feedbackEnv)

/** The player's address as the proxy in front of us saw it (Railway sets X-Real-IP). */
function senderOf(headers: Headers): string {
  return headers.get('x-real-ip') ?? headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() ?? 'unknown'
}

export const server = defineServer({
  greet: false,
  // Above the transport's default 4 KB message cap, so a long access token on join or identify still fits.
  transport: new WebSocketTransport({ maxPayload: 64 * 1024 }),
  rooms: { [ROOM_NAME]: defineRoom(TableRoom), [SOCIAL_ROOM]: defineRoom(SocialRoom) },
  routes: createRouter({
    health: createEndpoint('/health', { method: 'GET' }, async () => ({ ok: true })),
    // Public: guests can look at the rankings too.
    leaderboard: createEndpoint(LEADERBOARD_PATH, { method: 'GET' }, async (ctx) => {
      const rules = new URL(ctx.request?.url ?? LEADERBOARD_PATH, 'http://local').searchParams.get('rules')
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=30' } })
      if (!isRuleSet(rules)) return json({ error: 'unknown rules' }, 400)
      if (!services.db) return json({ entries: [] })
      try {
        return json({ entries: await leaderboard(services.db, rules) })
      } catch (error) {
        console.error('leaderboard:', error)
        return json({ error: 'unavailable' }, 503)
      }
    }),
    feedback: createEndpoint(FEEDBACK_PATH, { method: 'POST' }, async (ctx) => {
      const result = await feedback(ctx.body, senderOf(ctx.request?.headers ?? new Headers()))
      return new Response(JSON.stringify(result.ok ? { ok: true } : { error: result.error }), {
        status: result.ok ? 200 : result.status,
        headers: { 'content-type': 'application/json' },
      })
    }),
  }),
})

// Railway injects PORT; 2567 is Colyseus' usual port for local development.
if (process.env.NODE_ENV !== 'test') {
  configureServicesFromEnv()
  const port = Number(process.env.PORT ?? 2567)
  await server.listen(port)
  console.log(`mahjong server listening on ${port}; accounts ${process.env.DATABASE_URL && process.env.LOGTO_ENDPOINT ? 'on' : 'off'}`)
}
