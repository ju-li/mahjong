/**
 * The 81 fan of Mahjong Competition Rules (Chinese Official), with the exclusions each fan
 * imposes. Exclusions follow the rulebook's "does not combine with" notes plus the
 * non-identical principle (a fan implied by a bigger one is not counted again).
 *
 * One extra combination, Concealed Kong and Melded Kong (明暗杠, 5), follows the reference
 * calculator used in competition (ChineseOfficialMahjongHelper / PyMahjongGB).
 */

export type FanId =
  // 88
  | 'bigFourWinds'
  | 'bigThreeDragons'
  | 'allGreen'
  | 'nineGates'
  | 'fourKongs'
  | 'sevenShiftedPairs'
  | 'thirteenOrphans'
  // 64
  | 'allTerminals'
  | 'littleFourWinds'
  | 'littleThreeDragons'
  | 'allHonors'
  | 'fourConcealedPungs'
  | 'pureTerminalChows'
  // 48
  | 'quadrupleChow'
  | 'fourPureShiftedPungs'
  // 32
  | 'fourPureShiftedChows'
  | 'threeKongs'
  | 'allTerminalsAndHonors'
  // 24
  | 'sevenPairs'
  | 'greaterHonorsAndKnittedTiles'
  | 'allEvenPungs'
  | 'fullFlush'
  | 'pureTripleChow'
  | 'pureShiftedPungs'
  | 'upperTiles'
  | 'middleTiles'
  | 'lowerTiles'
  // 16
  | 'pureStraight'
  | 'threeSuitedTerminalChows'
  | 'pureShiftedChows'
  | 'allFives'
  | 'triplePung'
  | 'threeConcealedPungs'
  // 12
  | 'lesserHonorsAndKnittedTiles'
  | 'knittedStraight'
  | 'upperFour'
  | 'lowerFour'
  | 'bigThreeWinds'
  // 8
  | 'mixedStraight'
  | 'reversibleTiles'
  | 'mixedTripleChow'
  | 'mixedShiftedPungs'
  | 'chickenHand'
  | 'lastTileDraw'
  | 'lastTileClaim'
  | 'outWithReplacementTile'
  | 'robbingTheKong'
  // 6
  | 'allPungs'
  | 'halfFlush'
  | 'mixedShiftedChows'
  | 'allTypes'
  | 'meldedHand'
  | 'twoConcealedKongs'
  | 'twoDragonPungs'
  // 4
  | 'outsideHand'
  | 'fullyConcealedHand'
  | 'twoMeldedKongs'
  | 'lastTile'
  // 2
  | 'dragonPung'
  | 'prevalentWind'
  | 'seatWind'
  | 'concealedHand'
  | 'allChows'
  | 'tileHog'
  | 'doublePung'
  | 'twoConcealedPungs'
  | 'concealedKong'
  | 'allSimples'
  // Combination scored by the reference calculator (not one of the 81)
  | 'concealedKongAndMeldedKong'
  // 1
  | 'pureDoubleChow'
  | 'mixedDoubleChow'
  | 'shortStraight'
  | 'twoTerminalChows'
  | 'pungOfTerminalsOrHonors'
  | 'meldedKong'
  | 'oneVoidedSuit'
  | 'noHonors'
  | 'edgeWait'
  | 'closedWait'
  | 'singleWait'
  | 'selfDrawn'
  | 'flowerTiles'

export type FanDef = {
  id: FanId
  name: string
  chinese: string
  points: number
  excludes: readonly FanId[]
}

const f = (id: FanId, points: number, name: string, chinese: string, excludes: FanId[] = []): FanDef => ({
  id,
  name,
  chinese,
  points,
  excludes,
})

export const FANS: readonly FanDef[] = [
  f('bigFourWinds', 88, 'Big Four Winds', '大四喜', ['bigThreeWinds', 'littleFourWinds', 'allPungs', 'prevalentWind', 'seatWind', 'pungOfTerminalsOrHonors']),
  f('bigThreeDragons', 88, 'Big Three Dragons', '大三元', ['littleThreeDragons', 'twoDragonPungs', 'dragonPung']),
  f('allGreen', 88, 'All Green', '绿一色', ['halfFlush', 'oneVoidedSuit']),
  f('nineGates', 88, 'Nine Gates', '九莲宝灯', ['fullFlush', 'concealedHand', 'fullyConcealedHand', 'noHonors', 'oneVoidedSuit']),
  f('fourKongs', 88, 'Four Kongs', '四杠', ['threeKongs', 'twoConcealedKongs', 'twoMeldedKongs', 'meldedKong', 'concealedKong', 'allPungs', 'singleWait']),
  f('sevenShiftedPairs', 88, 'Seven Shifted Pairs', '连七对', ['sevenPairs', 'fullFlush', 'concealedHand', 'fullyConcealedHand', 'singleWait', 'noHonors', 'oneVoidedSuit']),
  f('thirteenOrphans', 88, 'Thirteen Orphans', '十三幺', ['allTypes', 'concealedHand', 'fullyConcealedHand', 'singleWait', 'allTerminalsAndHonors']),

  f('allTerminals', 64, 'All Terminals', '清幺九', ['allTerminalsAndHonors', 'allPungs', 'outsideHand', 'pungOfTerminalsOrHonors', 'noHonors', 'doublePung']),
  f('littleFourWinds', 64, 'Little Four Winds', '小四喜', ['bigThreeWinds']),
  f('littleThreeDragons', 64, 'Little Three Dragons', '小三元', ['twoDragonPungs', 'dragonPung']),
  f('allHonors', 64, 'All Honors', '字一色', ['allTerminalsAndHonors', 'allPungs', 'outsideHand', 'pungOfTerminalsOrHonors']),
  f('fourConcealedPungs', 64, 'Four Concealed Pungs', '四暗刻', ['allPungs', 'concealedHand', 'fullyConcealedHand', 'threeConcealedPungs', 'twoConcealedPungs']),
  f('pureTerminalChows', 64, 'Pure Terminal Chows', '一色双龙会', ['allChows', 'sevenPairs', 'fullFlush', 'pureDoubleChow', 'twoTerminalChows', 'noHonors', 'oneVoidedSuit']),

  f('quadrupleChow', 48, 'Quadruple Chow', '一色四同顺', ['pureShiftedPungs', 'pureTripleChow', 'tileHog', 'pureDoubleChow']),
  f('fourPureShiftedPungs', 48, 'Four Pure Shifted Pungs', '一色四节高', ['pureTripleChow', 'pureShiftedPungs', 'allPungs']),

  f('fourPureShiftedChows', 32, 'Four Pure Shifted Chows', '一色四步高', ['pureShiftedChows', 'shortStraight', 'twoTerminalChows']),
  f('threeKongs', 32, 'Three Kongs', '三杠', ['twoConcealedKongs', 'twoMeldedKongs', 'meldedKong', 'concealedKong']),
  f('allTerminalsAndHonors', 32, 'All Terminals and Honors', '混幺九', ['allPungs', 'outsideHand', 'pungOfTerminalsOrHonors']),

  f('sevenPairs', 24, 'Seven Pairs', '七对', ['concealedHand', 'fullyConcealedHand', 'singleWait']),
  f('greaterHonorsAndKnittedTiles', 24, 'Greater Honors and Knitted Tiles', '七星不靠', ['lesserHonorsAndKnittedTiles', 'allTypes', 'concealedHand', 'fullyConcealedHand', 'singleWait']),
  f('allEvenPungs', 24, 'All Even Pungs', '全双刻', ['allPungs', 'allSimples', 'noHonors']),
  f('fullFlush', 24, 'Full Flush', '清一色', ['noHonors', 'oneVoidedSuit']),
  f('pureTripleChow', 24, 'Pure Triple Chow', '一色三同顺', ['pureShiftedPungs', 'pureDoubleChow']),
  f('pureShiftedPungs', 24, 'Pure Shifted Pungs', '一色三节高', ['pureTripleChow']),
  f('upperTiles', 24, 'Upper Tiles', '全大', ['upperFour', 'noHonors']),
  f('middleTiles', 24, 'Middle Tiles', '全中', ['allSimples', 'noHonors']),
  f('lowerTiles', 24, 'Lower Tiles', '全小', ['lowerFour', 'noHonors']),

  f('pureStraight', 16, 'Pure Straight', '清龙', ['shortStraight', 'twoTerminalChows']),
  f('threeSuitedTerminalChows', 16, 'Three-Suited Terminal Chows', '三色双龙会', ['allChows', 'mixedDoubleChow', 'twoTerminalChows', 'noHonors']),
  f('pureShiftedChows', 16, 'Pure Shifted Chows', '一色三步高'),
  f('allFives', 16, 'All Fives', '全带五', ['allSimples', 'noHonors']),
  f('triplePung', 16, 'Triple Pung', '三同刻', ['doublePung']),
  f('threeConcealedPungs', 16, 'Three Concealed Pungs', '三暗刻', ['twoConcealedPungs']),

  f('lesserHonorsAndKnittedTiles', 12, 'Lesser Honors and Knitted Tiles', '全不靠', ['allTypes', 'concealedHand', 'fullyConcealedHand', 'singleWait']),
  f('knittedStraight', 12, 'Knitted Straight', '组合龙'),
  f('upperFour', 12, 'Upper Four', '大于五', ['noHonors']),
  f('lowerFour', 12, 'Lower Four', '小于五', ['noHonors']),
  f('bigThreeWinds', 12, 'Big Three Winds', '三风刻'),

  f('mixedStraight', 8, 'Mixed Straight', '花龙'),
  f('reversibleTiles', 8, 'Reversible Tiles', '推不倒', ['oneVoidedSuit']),
  f('mixedTripleChow', 8, 'Mixed Triple Chow', '三色三同顺', ['mixedDoubleChow']),
  f('mixedShiftedPungs', 8, 'Mixed Shifted Pungs', '三色三节高'),
  f('chickenHand', 8, 'Chicken Hand', '无番和'),
  f('lastTileDraw', 8, 'Last Tile Draw', '妙手回春', ['selfDrawn']),
  f('lastTileClaim', 8, 'Last Tile Claim', '海底捞月'),
  f('outWithReplacementTile', 8, 'Out with Replacement Tile', '杠上开花', ['selfDrawn']),
  f('robbingTheKong', 8, 'Robbing the Kong', '抢杠和', ['lastTile']),

  f('allPungs', 6, 'All Pungs', '碰碰和'),
  f('halfFlush', 6, 'Half Flush', '混一色'),
  f('mixedShiftedChows', 6, 'Mixed Shifted Chows', '三色三步高'),
  f('allTypes', 6, 'All Types', '五门齐'),
  f('meldedHand', 6, 'Melded Hand', '全求人', ['singleWait']),
  f('twoConcealedKongs', 6, 'Two Concealed Kongs', '双暗杠', ['concealedKong', 'twoConcealedPungs']),
  f('twoDragonPungs', 6, 'Two Dragon Pungs', '双箭刻', ['dragonPung']),

  f('concealedKongAndMeldedKong', 5, 'Concealed Kong and Melded Kong', '明暗杠', ['concealedKong', 'meldedKong']),

  f('outsideHand', 4, 'Outside Hand', '全带幺'),
  f('fullyConcealedHand', 4, 'Fully Concealed Hand', '不求人', ['concealedHand', 'selfDrawn']),
  f('twoMeldedKongs', 4, 'Two Melded Kongs', '双明杠', ['meldedKong']),
  f('lastTile', 4, 'Last Tile', '和绝张'),

  f('dragonPung', 2, 'Dragon Pung', '箭刻'),
  f('prevalentWind', 2, 'Prevalent Wind', '圈风刻'),
  f('seatWind', 2, 'Seat Wind', '门风刻'),
  f('concealedHand', 2, 'Concealed Hand', '门前清'),
  f('allChows', 2, 'All Chows', '平和', ['noHonors']),
  f('tileHog', 2, 'Tile Hog', '四归一'),
  f('doublePung', 2, 'Double Pung', '双同刻'),
  f('twoConcealedPungs', 2, 'Two Concealed Pungs', '双暗刻'),
  f('concealedKong', 2, 'Concealed Kong', '暗杠'),
  f('allSimples', 2, 'All Simples', '断幺', ['noHonors']),

  f('pureDoubleChow', 1, 'Pure Double Chow', '一般高'),
  f('mixedDoubleChow', 1, 'Mixed Double Chow', '喜相逢'),
  f('shortStraight', 1, 'Short Straight', '连六'),
  f('twoTerminalChows', 1, 'Two Terminal Chows', '老少副'),
  f('pungOfTerminalsOrHonors', 1, 'Pung of Terminals or Honors', '幺九刻'),
  f('meldedKong', 1, 'Melded Kong', '明杠'),
  f('oneVoidedSuit', 1, 'One Voided Suit', '缺一门'),
  f('noHonors', 1, 'No Honors', '无字'),
  f('edgeWait', 1, 'Edge Wait', '边张'),
  f('closedWait', 1, 'Closed Wait', '嵌张'),
  f('singleWait', 1, 'Single Wait', '单钓将'),
  f('selfDrawn', 1, 'Self-Drawn', '自摸'),
  f('flowerTiles', 1, 'Flower Tiles', '花牌'),
]

export const FAN_BY_ID: Readonly<Record<FanId, FanDef>> = Object.fromEntries(FANS.map((d) => [d.id, d])) as Record<FanId, FanDef>

export type FanHit = { id: FanId; count: number }

/**
 * Drop fans excluded by higher fans. Fans are processed from the highest value down, and only
 * fans that survive impose their own exclusions.
 */
export function applyExclusions(hits: readonly FanHit[]): FanHit[] {
  const order = [...hits].sort((a, b) => FAN_BY_ID[b.id].points - FAN_BY_ID[a.id].points)
  const excluded = new Set<FanId>()
  const kept: FanHit[] = []
  for (const hit of order) {
    if (excluded.has(hit.id) || hit.count <= 0) continue
    kept.push(hit)
    for (const x of FAN_BY_ID[hit.id].excludes) excluded.add(x)
  }
  return kept
}
