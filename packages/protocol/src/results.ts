import type { Match, Player } from '@mahjong/engine'
import type { HandSummary } from './messages'

/** A finished match's hands by player, the form they are stored and shown in. */
export function handSummaries(match: Pick<Match, 'history'>): HandSummary[] {
  return match.history.map((h) => {
    const r = h.result
    return {
      handIndex: h.handIndex,
      ...(h.house ? { house: h.house } : {}),
      dealer: h.seating[h.dealer]!,
      prevailingWind: h.prevailingWind,
      outcome:
        r.type === 'drawn'
          ? { type: 'drawn' }
          : {
              type: 'win',
              winner: h.seating[r.winner]!,
              from: r.from === null ? null : (h.seating[r.from] as Player),
              fans: r.score.fans.map((f) => ({ id: f.id, points: f.points, count: f.count })),
              total: r.score.total,
              flowerPoints: r.score.flowerPoints,
            },
      deltas: [...h.playerDeltas],
    }
  })
}
