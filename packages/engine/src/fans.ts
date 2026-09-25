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
  /** What the fan requires, in English and Simplified Chinese. */
  description: { en: string; zh: string }
}

const DESCRIPTIONS: Record<FanId, { en: string; zh: string }> = {
  bigFourWinds: { en: 'Pungs or kongs of all four winds.', zh: '东南西北四副风刻（杠）。' },
  bigThreeDragons: { en: 'Pungs or kongs of all three dragons.', zh: '中发白三副箭刻（杠）。' },
  allGreen: { en: 'Only green tiles: 2, 3, 4, 6, 8 bamboo and the green dragon.', zh: '只由23468条及发字组成的和牌。' },
  nineGates: { en: '1112345678999 of one suit, concealed, waiting on any tile of that suit.', zh: '同一花色门清 1112345678999，听该花色任意一张。' },
  fourKongs: { en: 'Four kongs, melded or concealed.', zh: '四副杠（明杠或暗杠）。' },
  sevenShiftedPairs: { en: 'Seven consecutive pairs of one suit, e.g. 11223344556677.', zh: '同一花色序数相连的七个对子。' },
  thirteenOrphans: { en: 'One of each terminal and honor, plus one duplicate.', zh: '幺九牌与字牌各一张，其中一种成对。' },
  allTerminals: { en: 'Only 1s and 9s.', zh: '全部由序数牌 1、9 组成。' },
  littleFourWinds: { en: 'Three wind pungs and a wind pair.', zh: '三副风刻加风牌将。' },
  littleThreeDragons: { en: 'Two dragon pungs and a dragon pair.', zh: '两副箭刻加箭牌将。' },
  allHonors: { en: 'Only wind and dragon tiles.', zh: '全部由字牌组成。' },
  fourConcealedPungs: { en: 'Four pungs or kongs, all made without claiming.', zh: '四副暗刻（含暗杠）。' },
  pureTerminalChows: { en: '123, 123, 789, 789 and a 55 pair, all one suit.', zh: '同一花色 123、123、789、789 加 55 将。' },
  quadrupleChow: { en: 'Four identical chows of one suit.', zh: '同一花色四副相同的顺子。' },
  fourPureShiftedPungs: { en: 'Four pungs of one suit in consecutive ranks.', zh: '同一花色四副依次递增一位的刻子。' },
  fourPureShiftedChows: { en: 'Four chows of one suit each shifted up by one (or each by two).', zh: '同一花色四副依次递增一位或两位的顺子。' },
  threeKongs: { en: 'Three kongs.', zh: '三副杠。' },
  allTerminalsAndHonors: { en: 'Only terminals (1, 9) and honors, with both present.', zh: '全部由幺九牌和字牌组成（两者皆有）。' },
  sevenPairs: { en: 'Seven pairs (four of a kind counts as two pairs).', zh: '七个对子（四张相同可算两对）。' },
  greaterHonorsAndKnittedTiles: { en: 'All seven honors plus seven knitted tiles (147/258/369 in different suits), all single.', zh: '七种字牌各一张，加七张组合龙牌型的序数牌，不成对。' },
  allEvenPungs: { en: 'Four pungs and a pair of even-ranked suited tiles only.', zh: '全部由 2、4、6、8 组成的刻子和将。' },
  fullFlush: { en: 'One suit only, no honors.', zh: '只由一种花色的序数牌组成。' },
  pureTripleChow: { en: 'Three identical chows of one suit.', zh: '同一花色三副相同的顺子。' },
  pureShiftedPungs: { en: 'Three pungs of one suit in consecutive ranks.', zh: '同一花色三副依次递增一位的刻子。' },
  upperTiles: { en: 'Only suited tiles 7, 8 and 9.', zh: '只由序数牌 7、8、9 组成。' },
  middleTiles: { en: 'Only suited tiles 4, 5 and 6.', zh: '只由序数牌 4、5、6 组成。' },
  lowerTiles: { en: 'Only suited tiles 1, 2 and 3.', zh: '只由序数牌 1、2、3 组成。' },
  pureStraight: { en: '123, 456 and 789 of one suit.', zh: '同一花色 123、456、789 三副顺子。' },
  threeSuitedTerminalChows: { en: '123 and 789 in two suits, plus a 55 pair in the third.', zh: '两种花色各有 123、789，第三种花色 55 作将。' },
  pureShiftedChows: { en: 'Three chows of one suit each shifted up by one (or each by two).', zh: '同一花色三副依次递增一位或两位的顺子。' },
  allFives: { en: 'Every set and the pair contain a 5.', zh: '每副牌和将都含有 5。' },
  triplePung: { en: 'Pungs of the same rank in all three suits.', zh: '三种花色同一点数的刻子。' },
  threeConcealedPungs: { en: 'Three pungs or kongs made without claiming.', zh: '三副暗刻（含暗杠）。' },
  lesserHonorsAndKnittedTiles: { en: 'Fourteen single tiles: honors plus knitted tiles (147/258/369 in different suits).', zh: '十四张互不成对的字牌与组合龙牌型序数牌。' },
  knittedStraight: { en: '147, 258 and 369, each in a different suit.', zh: '三种花色分别为 147、258、369 的组合龙。' },
  upperFour: { en: 'Only suited tiles 6 to 9.', zh: '只由序数牌 6、7、8、9 组成。' },
  lowerFour: { en: 'Only suited tiles 1 to 4.', zh: '只由序数牌 1、2、3、4 组成。' },
  bigThreeWinds: { en: 'Pungs of three different winds.', zh: '三副风刻。' },
  mixedStraight: { en: '123, 456 and 789, each in a different suit.', zh: '三种花色分别组成 123、456、789 的顺子。' },
  reversibleTiles: { en: 'Only tiles that look the same upside down: 1234589 dots, 245689 bamboo, white dragon.', zh: '只由 1234589 饼、245689 条和白板组成。' },
  mixedTripleChow: { en: 'The same chow in all three suits.', zh: '三种花色相同点数的顺子。' },
  mixedShiftedPungs: { en: 'Pungs in three suits with consecutive ranks.', zh: '三种花色依次递增一位的刻子。' },
  chickenHand: { en: 'A winning hand with no other fan (flowers aside).', zh: '除花牌外没有任何番种的和牌。' },
  lastTileDraw: { en: 'Win by drawing the last tile of the wall.', zh: '摸牌墙最后一张牌自摸和牌。' },
  lastTileClaim: { en: 'Win on the discard after the last tile of the wall.', zh: '和牌墙最后一张牌打出的牌。' },
  outWithReplacementTile: { en: 'Win on the replacement tile drawn after a kong.', zh: '开杠后摸的补牌自摸和牌。' },
  robbingTheKong: { en: 'Win on the tile another player adds to a pung to make a kong.', zh: '和别人加杠的那张牌。' },
  allPungs: { en: 'Four pungs or kongs and a pair.', zh: '由四副刻子（杠）和将组成。' },
  halfFlush: { en: 'One suit plus honors.', zh: '由一种花色的序数牌和字牌组成。' },
  mixedShiftedChows: { en: 'Chows in three suits each shifted up by one.', zh: '三种花色依次递增一位的顺子。' },
  allTypes: { en: 'Tiles of all three suits, winds and dragons.', zh: '万、饼、条、风、箭五门俱全。' },
  meldedHand: { en: 'All four sets claimed, won on a discard with a single wait for the pair.', zh: '四副牌均吃碰明杠，和别人打出的单钓将。' },
  twoConcealedKongs: { en: 'Two concealed kongs.', zh: '两副暗杠。' },
  twoDragonPungs: { en: 'Two dragon pungs.', zh: '两副箭刻。' },
  concealedKongAndMeldedKong: { en: 'One concealed kong and one melded kong.', zh: '一副暗杠加一副明杠。' },
  outsideHand: { en: 'Every set and the pair contain a terminal or honor.', zh: '每副牌和将都含有幺九牌或字牌。' },
  fullyConcealedHand: { en: 'No claimed sets, won by self-draw.', zh: '没有吃碰明杠，自摸和牌。' },
  twoMeldedKongs: { en: 'Two melded kongs.', zh: '两副明杠。' },
  lastTile: { en: 'Win on the last copy of a tile when the other three are already visible.', zh: '和桌面已亮明三张后的第四张牌。' },
  dragonPung: { en: 'A pung or kong of a dragon.', zh: '中、发、白的刻子（杠）。' },
  prevalentWind: { en: 'A pung or kong of the prevailing wind.', zh: '与圈风相同的风刻（杠）。' },
  seatWind: { en: 'A pung or kong of your seat wind.', zh: '与门风相同的风刻（杠）。' },
  concealedHand: { en: 'No claimed sets, won on a discard.', zh: '没有吃碰明杠，和别人打出的牌。' },
  allChows: { en: 'Four chows and a suited pair.', zh: '由四副顺子和序数牌作将组成。' },
  tileHog: { en: 'All four copies of a tile used without forming a kong.', zh: '和牌中包含四张相同的牌但不成杠。' },
  doublePung: { en: 'Pungs of the same rank in two suits.', zh: '两种花色同一点数的刻子。' },
  twoConcealedPungs: { en: 'Two pungs or kongs made without claiming.', zh: '两副暗刻（含暗杠）。' },
  concealedKong: { en: 'One concealed kong.', zh: '一副暗杠。' },
  allSimples: { en: 'No terminals or honors.', zh: '没有幺九牌和字牌。' },
  pureDoubleChow: { en: 'Two identical chows of one suit.', zh: '同一花色两副相同的顺子。' },
  mixedDoubleChow: { en: 'The same chow in two suits.', zh: '两种花色相同点数的顺子。' },
  shortStraight: { en: 'Two chows of one suit forming six in a row, e.g. 123 and 456.', zh: '同一花色相连的六张牌组成的两副顺子。' },
  twoTerminalChows: { en: '123 and 789 of the same suit.', zh: '同一花色的 123 与 789。' },
  pungOfTerminalsOrHonors: { en: 'A pung of 1s or 9s, or of a wind that is not your seat or prevailing wind.', zh: '1、9 的刻子，或非门风、圈风的风刻。' },
  meldedKong: { en: 'One melded kong.', zh: '一副明杠。' },
  oneVoidedSuit: { en: 'Exactly two of the three suits used.', zh: '缺少三种花色中的一种。' },
  noHonors: { en: 'No wind or dragon tiles.', zh: '没有字牌。' },
  edgeWait: { en: 'Win on 3 with 12, or on 7 with 89, as the only wait.', zh: '只听 12 的 3 或 89 的 7。' },
  closedWait: { en: 'Win on the middle tile of a chow as the only wait.', zh: '只听顺子中间的一张。' },
  singleWait: { en: 'Win on the pair tile as the only wait.', zh: '只听将牌的一张。' },
  selfDrawn: { en: 'Win on a tile you drew.', zh: '自己摸到和牌。' },
  flowerTiles: { en: 'One point per flower or season (does not count towards the 8-point minimum).', zh: '每张花牌 1 番（不计入起和 8 番）。' },
}

const f = (id: FanId, points: number, name: string, chinese: string, excludes: FanId[] = []): FanDef => ({
  id,
  name,
  chinese,
  points,
  excludes,
  description: DESCRIPTIONS[id],
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
