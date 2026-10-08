# Mahjong house-rule axes: a catalog for designing customization

**Method note:** This research used web search only. Direct page fetches (Wikipedia and most other sites) were blocked by the sandbox, so every claim rests on search-result excerpts from the URLs cited. Items marked **[unverified]** come from general knowledge or from a single weak source. Regional rules disagree a lot, and the sources themselves say "check your table's agreement" (以牌局约定为准) almost everywhere. That is a reason to build settings, not hard-code one ruleset.

---

## A. Hong Kong (Cantonese) house-rule axes

### A1. Win threshold and cap

| Axis | Common values | Notes / sources |
|---|---|---|
| Minimum faan (起糊) | **3** (most common), 1, 0 (雞糊起糊), sometimes 6 or 8 | 3 is the default. "Some places use 1 faan" ([ulifestyle](https://hk.ulifestyle.com.hk/topic/detail/206748/), [zh.wikipedia 香港麻雀常用番種](https://zh.wikipedia.org/zh-hk/%E9%A6%99%E6%B8%AF%E9%BA%BB%E9%9B%80%E5%B8%B8%E7%94%A8%E7%95%AA%E7%A8%AE)). One app offers 0/1/3/6 ([Hong Kong Style Mahjong](https://apps.apple.com/us/app/hong-kong-style-mahjong/id916388468)). i.Game 13 offers 3 or 8 ([i.Game](https://apps.apple.com/us/app/i-game-13-mahjong-%E9%A6%99%E6%B8%AF%E9%BA%BB%E9%9B%80lite/id847281000)). One game lists 雞糊起糊 and 三番起糊 as separate modes ([九龍麻雀](https://apps.apple.com/py/app/id1043503026)). |
| Faan cap (爆棚/滿糊) | **13** (theoretical max), **10**, **8**, sometimes "無限番" | 13 is the "absolute limit", and groups often lower it to 8 ([en.wikipedia HK scoring](https://en.wikipedia.org/wiki/Hong_Kong_mahjong_scoring_rules)). A Melbourne club plays min 3 / max 10 ([meetup](https://www.meetup.com/melbourne-mahjong-meetup/events/315810135/)). A credit-union tournament played "三番起糊, 五番後半辣上, 最大打至八番" ([CULHK 2016 regulation PDF](https://home.culhk.org/files/ICUD/2016ICUD-Mahjong_Comp-Regulation.pdf)). An "unlimited faan" table scores limit hands (例牌) as ordinary faan ([zh.wikipedia](https://zh.wikipedia.org/zh-hk/%E9%A6%99%E6%B8%AF%E9%BA%BB%E9%9B%80%E5%B8%B8%E7%94%A8%E7%95%AA%E7%A8%AE)). A Reddit user reports caps of up to 30 in "Let's Mahjong" **[unverified]**. |
| Limit hands (例牌) value | = cap (8/10/13) | Limit hands (天糊, 地糊, 十三幺, 大四喜, 十八羅漢, etc.) are paid at the table cap ([zh.wikipedia](https://zh.wikipedia.org/zh-hk/%E9%A6%99%E6%B8%AF%E9%BA%BB%E9%9B%80%E5%B8%B8%E7%94%A8%E7%95%AA%E7%A8%AE)). |

### A2. Converting faan to points (曲線)

Payout doubles per faan up to a knee. Beyond the knee, tables use one of three curves:

- **辣辣上 ("full spicy")**: keeps doubling every faan.
- **半辣上 ("half spicy")**: after the knee (4 faan, sometimes 5), the payout alternates ×1.5 and ×1.33, so it **doubles every 2 faan**. Using the "一二蚊" stake (discard win): 4番=16, 5=24, 6=32, 7=48, 8=64, 9=96, 10=128 ([zh-yue.wikipedia 香港蔴雀食糊牌型](https://zh-yue.wikipedia.org/wiki/%E9%A6%99%E6%B8%AF%E8%94%B4%E9%9B%80%E9%A3%9F%E7%B3%8A%E7%89%8C%E5%9E%8B), [zh.wikipedia 廣東麻雀籌碼計法](https://zh.wikipedia.org/zh-hk/%E5%BB%A3%E6%9D%B1%E9%BA%BB%E9%9B%80%E7%B1%8C%E7%A2%BC%E8%A8%88%E6%B3%95)). The Melbourne meetup's "Half Spicy" gives 3 faan = 8 and 10 faan = 128, which matches.
- **雙辣 / 三辣**: multiplies the whole table by 2 or 3 based on the 4-faan price ([zh-yue.wikipedia](https://zh-yue.wikipedia.org/wiki/%E9%A6%99%E6%B8%AF%E8%94%B4%E9%9B%80%E9%A3%9F%E7%B3%8A%E7%89%8C%E5%9E%8B)) **[exact semantics unclear]**.

The stake labels **二五雞 / 五一 / 一二蚊** name the base unit and the chicken-hand price ([zh.wikipedia 籌碼計法](https://zh.wikipedia.org/zh-hk/%E5%BB%A3%E6%9D%B1%E9%BA%BB%E9%9B%80%E7%B1%8C%E7%A2%BC%E8%A8%88%E6%B3%95)). For implementation, this is just a lookup table `faan → base units`, and some apps let users edit it directly ("Customize Faan-Score table, Self-drawn multiple, Min & Max Faan": [Mahjong la](https://apps.apple.com/sg/app/app/id1568116468)).

### A3. Payment scheme (who pays)

| Scheme | Discard win | Self-draw | Source |
|---|---|---|---|
| **半銃** (half-shoot) | Discarder pays 2 units, the other two pay 1 each | All three pay 2 | [zh.wikipedia 籌碼計法](https://zh.wikipedia.org/zh-hk/%E5%BB%A3%E6%9D%B1%E9%BA%BB%E9%9B%80%E7%B1%8C%E7%A2%BC%E8%A8%88%E6%B3%95) |
| **全銃** (full-shoot, the HK norm) | Discarder pays all 4 units alone | All three pay 2 | same |

Under both schemes, a self-draw win collects 1.5× the total of a discard win at the same faan (same source). The 一二蚊 1-faan example: 半銃 → discarder 4, the others 2+2. 全銃 → discarder pays 8. Self-draw → 4 from each player. Popular articles quote numbers that do not match these tables ([Cosmopolitan HK](https://www.cosmopolitan.com.hk/lifestyle/how-to-play-mahjong)), so the app should show the computed table to users.

**Liability (包) rules**, all optional:

- **包自摸**: if the liable player's feed leads to a self-draw win, that player pays the other two players' shares as well.
- **包十二張** (full-shoot tables): if your discard lets someone expose a 4th meld (12 tiles down), you pay for their self-draw, whatever the hand.
- **包出銃** variants: on some tables the feeder splits a discard loss with the discarder. Other tables have no liability on discard wins ([zh.wikipedia 籌碼計法](https://zh.wikipedia.org/zh-hk/%E5%BB%A3%E6%9D%B1%E9%BA%BB%E9%9B%80%E7%B1%8C%E7%A2%BC%E8%A8%88%E6%B3%95), [zh.wikipedia 包牌](https://zh.wikipedia.org/zh-hk/%E5%8C%85%E7%89%8C)).
- **清一色 九章落地包** (full-shoot): if someone already has 3 exposed melds of one suit, the player who feeds them a 4th meld is liable ([uptogo](https://uptogo.com.tw/?p=965958)).
- **大三元 / 大四喜 包**: the player who feeds the final dragon or wind meld is liable. This is standard in riichi as pao ([moegirl 包牌](https://zh.moegirl.org.cn/%E5%8C%85%E7%89%8C)). I could not confirm the exact HK trigger (3rd vs 4th meld) **[unverified]**.
- **槓上開花 off a melded kong**: on some tables the player who discarded the kong tile pays for the win ([zh.wikipedia](https://zh.wikipedia.org/zh-hk/%E9%A6%99%E6%B8%AF%E9%BA%BB%E9%9B%80%E5%B8%B8%E7%94%A8%E7%95%AA%E7%A8%AE), [baby-kingdom thread](https://www.baby-kingdom.com/forum.php?mod=viewthread&tid=3009397)).

### A4. Multiple winners

- **截糊 (head bump)**: only the first claimant in turn order wins.
- **無截糊 / 一炮多響 / 炮炮響**: every claimant wins. This is mostly used with 全銃, and the discarder pays everyone. Several players robbing the same kong counts as 一炮多響 too ([zh.wikipedia 籌碼計法](https://zh.wikipedia.org/zh-hk/%E5%BB%A3%E6%9D%B1%E9%BA%BB%E9%9B%80%E7%B1%8C%E7%A2%BC%E8%A8%88%E6%B3%95)).
- Some tournaments require "一炮三響, 沒有截糊" ([CULHK](https://home.culhk.org/files/ICUD/2016ICUD-Mahjong_Comp-Regulation.pdf)).

### A5. Flowers (花)

| Item | Common faan | Variation |
|---|---|---|
| 無花 (no flowers drawn) | +1 | Optional. Tables without flowers (清章 "無花") skip all flower items |
| 正花 (own-seat flower) | +1 each | One HK-Taiwanese table gives 2 ([twmahjong](https://twmahjong.com/)) |
| 一台花 (full set of 4: 梅蘭菊竹 or 春夏秋冬) | +2, replaces 正花 | |
| 花糊 (7 flowers) | 3 in one source | Robbing the 8th, as in Taiwan's 七搶一, varies |
| 大花糊 / 八仙過海 (all 8) | Instant win. Paid as 4, 8 or the limit, as a self-draw | |
| Flowers present at all | on/off | Apps expose this toggle ([HK Style Mahjong](https://apps.apple.com/us/app/hong-kong-style-mahjong/id916388468), [i.Game](https://apps.apple.com/us/app/i-game-13-mahjong-%E9%A6%99%E6%B8%AF%E9%BA%BB%E9%9B%80lite/id847281000)) |

Main source: [zh.wikipedia 香港麻雀常用番種](https://zh.wikipedia.org/zh-hk/%E9%A6%99%E6%B8%AF%E9%BA%BB%E9%9B%80%E5%B8%B8%E7%94%A8%E7%95%AA%E7%A8%AE), cross-checked with [ulifestyle](https://hk.ulifestyle.com.hk/topic/detail/206748/) and [ezone](https://ezone.hk/article/20030540/).

### A6. Kong rules in HK (relevant to the "杠应该加一番" request)

- **Standard HK faan tables give no faan for a kong itself.** Only kong-linked events score:
  - 槓上自摸 / 槓上開花: +1 on top of 自摸's +1, so 2 total.
  - 槓上槓自摸: 8.
  - 搶槓: +1.
  - 十八羅漢 (4 kongs): limit.
  - Sources: [zh.wikipedia](https://zh.wikipedia.org/zh-hk/%E9%A6%99%E6%B8%AF%E9%BA%BB%E9%9B%80%E5%B8%B8%E7%94%A8%E7%95%AA%E7%A8%AE), [holidaysmart](https://holidaysmart.io/hk/article/105699/).
- **"Kong = +1 faan" is a real house variant.** Search results describe a Guangdong-style rule where any kong (明, 暗 or 加) adds 1 faan. A forum thread says HK tables usually do *not* give faan for a concealed kong, while 廣東牌 does, which is why a concealed kong must be shown under 廣東牌 rules ([baby-kingdom](https://www.baby-kingdom.com/forum.php?mod=viewthread&tid=3009397)). Some sources list 暗槓 as 3 faan **[outlier]**.
- **Immediate kong payment (槓錢, 開槓即收錢)** is common in 碰槓牌 / 跑馬仔 style games and parlours, and is not refunded on a draw.
  - At a 10/20 stake: an exposed kong from a discard (大明槓) earns 30, paid by the discarder. A promoted kong (加槓) earns 20 from each player. A concealed kong earns 10 from each player.
  - A 200/400 example uses different numbers.
  - Robbing an exposed kong is allowed. A concealed kong cannot be robbed, except by **十三幺** ([kaikeemahjong](https://www.kaikeemahjong.com/introduction.php), [agames 碰槓牌](https://play.agames.hk/index_2/game/bump/index02.php)).
  - The two sources disagree on which kong type pays more, so treat kong-payment amounts as configurable **[values vary]**.

### A7. Dealer, draws, special hands

- **連莊 / 拉莊**: in HK faan play, the dealer usually keeps the seat after winning and often after a draw. The faan bonus for consecutive dealer wins mostly appears in Taiwanese-influenced play. Score-keeping apps list "連莊拉莊" as a supported case ([Mahjong counter app](https://apps.apple.com/hk/app/id1350174034)). Exact HK values: **[unverified]**.
- **Exhaustive draw (流局 / 和局)**: no payment in classic HK. Whether the dealer keeps the seat is a house option **[unverified]**.
- **Last tile**: the CULHK rules require the last tile to be drawn and discarded ([CULHK](https://home.culhk.org/files/ICUD/2016ICUD-Mahjong_Comp-Regulation.pdf)).
- **Special hands**:
  - 天糊 and 地糊 pay the limit. 地糊 means winning on the dealer's first discard.
  - 人糊 has no consistent HK value **[unverified]**.
  - 十三幺 is the only hand that may rob a concealed kong.
  - 詐糊 (false win) pays the max to everyone.
  - Source: [zh.wikipedia](https://zh.wikipedia.org/zh-hk/%E9%A6%99%E6%B8%AF%E9%BA%BB%E9%9B%80%E5%B8%B8%E7%94%A8%E7%95%AA%E7%A8%AE).

### A8. Common HK faan values, and where tables differ

| Hand | Typical | Seen variation |
|---|---|---|
| 雞糊 | 0 | Allowed only if min = 0 |
| 平糊 | 1 | |
| 自摸, 門前清, 無花, 正花, 搶槓, 海底 | 1 each | 海底撈月 sometimes counts 2 if self-drawn |
| 番子 (dragon / seat-wind / prevalent-wind pung) | 1 each | |
| 對對糊 | 3 | |
| 混一色 | 3 | |
| 小三元 | 5 | |
| 清一色 | 7 | 6 on some Guangdong tables |
| 大三元 | 8 | |
| 小四喜, 大四喜, 字一色, 十三幺, 九子連環, 十八羅漢, 天/地糊 | limit | 字一色 is 10 on some tables |

Sources: [zh.wikipedia](https://zh.wikipedia.org/zh-hk/%E9%A6%99%E6%B8%AF%E9%BA%BB%E9%9B%80%E5%B8%B8%E7%94%A8%E7%95%AA%E7%A8%AE), [hk01](https://www.hk01.com/%E9%A3%9F%E7%8E%A9%E8%B2%B7/859107/), [Yahoo HK 2026](https://hk.news.yahoo.com/%E8%BE%B2%E6%9B%86%E6%96%B0%E5%B9%B4-%E9%BA%BB%E5%B0%87-%E8%A8%88%E7%95%AA-%E5%BB%A3%E6%9D%B1%E9%BA%BB%E9%9B%80-223046022.html). 舊章 / 清章 (older, fewer hands) and 新章 (more hands) are two named families, but no source detailed how they differ ([九龍麻雀 listing](https://apps.apple.com/py/app/id1043503026)).

---

## B. Mainland variants, with a focus on kong rules

| Variant | Tiles / structure | Kong-related rules | Other notable axes |
|---|---|---|---|
| **国标 MCR** | 144 tiles, 8-point minimum | 明杠 1 point, 暗杠 2, 双明杠 4, 明暗杠 5 (added later in the 98 rules), 双暗杠 6 (the source table also shows 8), 三杠 32, 四杠 88. Only one kong fan type counts per hand ([moegirl 杠牌](https://zh.moegirl.org.cn/%E9%BA%BB%E5%B0%86/%E6%9D%A0%E7%89%8C), [bilibili 番种图解](https://www.bilibili.com/opus/888598475540791367)). No immediate kong payment. | No 一炮多响: only the first player counter-clockwise from the discarder wins ([moegirl 截胡](https://zh.moegirl.org.cn/%E6%88%AA%E8%83%A1)). Payment: discarder pays base+8, others pay 8 **[from memory, standard]**. |
| **广东 鸡平胡** (Pearl River Delta) | 136 or 144 tiles | Kong +1 faan on many tables. 杠上开花 adds faan. | 爆胡 cap is usually **3 faan**, with limit hands (十三幺 etc.) exceeding it. 鸡胡 = 0. Sources conflict on whether 鸡胡 may win. Chow allowed ([18183](https://www.18183.com/xxpd/yxzx/8841961.html), [maigoo](https://www.maigoo.com/goomai/171623.html)). |
| **广东 推倒胡** (Shenzhen / Dongguan) | 136 tiles, **no chow**, mostly self-draw only | Kongs pay immediately. Robbing a kong is allowed, and the konger pays everything (抢杠全包). Sources mention 杠爆全包 but don't define it. | **鬼牌** wildcards (白板 or flipped indicator +1). **买马** (bonus "horses" drawn after a win; the dealer must buy 1, more while continuing as dealer up to 4). 无鬼加倍 and 跟庄 are named options I could not source ([xiaomi](https://game.xiaomi.com/viewpoint/100639154_1530070417162_13), [18183](https://www.18183.com/xxpd/yxzx/8788857.html)). |
| **四川 血战到底** | 108 tiles (no honors or flowers), pung and kong only, **no chow** | **刮风下雨**: kongs pay immediately. One table: exposed kong from a discard → the discarder pays 2. Promoted kong → each player pays 1. Concealed kong → each pays 2. Players who have already won don't pay. **根**: each four-of-a-kind in the hand, kong or not, adds **+1 番** (×2). 杠上开花 +1 番. 杠上炮 +1 番, and the kong money may pass to the winner (呼叫转移). **退税**: at a draw, players who are not ready refund their kong income ([bilibili rules](https://www.bilibili.com/opus/781492105988014102), [moegirl 四川麻将](https://zh.moegirl.org.cn/%E5%9B%9B%E5%B7%9D%E9%BA%BB%E5%B0%86)). | 定缺: each player must void one suit. Game continues until 3 players have won. **查花猪** at a draw: anyone still holding 3 suits pays a large penalty, e.g. 16× base. **查大叫**: players who are not ready pay ready players their maximum possible hand. Common cap is 3 番 (8×), sometimes 4, or none online ([sohu](https://www.sohu.com/a/459159080_121073676), [zhihu](https://zhuanlan.zhihu.com/p/22612168)). |
| **四川 血流成河** | Same tiles | Same as 血战; you may still kong after winning if it doesn't change the wait | A player may **win repeatedly** and play continues ([moegirl 血流成河](https://zh.moegirl.org.cn/%E8%A1%80%E6%B5%81%E6%88%90%E6%B2%B3)). |
| **上海 敲麻** | 144 tiles with flowers | Kongs add **花** (points): suited exposed kong 1, concealed 2. Wind pung 1, exposed kong 2, concealed 3. Dragon pung 2, exposed kong 3, concealed 4 ([百度经验](https://jingyan.baidu.com/article/851fbc379d3c103e1f15ab09.html), [sohu](https://www.sohu.com/a/492530617_120376913)). After declaring 敲, a 4th tile matching a pung must be konged, and others may rob it. 杠开 pays a full 勒子. | You must **敲** (declare ready) before winning. No 七对. **勒子 / 辣子** = cap, typically 10 花; some hands pay 2 or 4 勒子. A 底 of 1-3 花 is the minimum to win. 百搭 (wildcard) and 清混碰 are separate sister modes ([app listing](https://apps.apple.com/cn/app/id1501625781)). |
| **长沙** | 108 tiles, no honors | 补 vs 杠 distinction **[unverified details]** | **起手胡** bonuses at the deal: 四喜 (4 of a kind), 板板胡 (no 2/5/8), 缺一色 (missing a suit), 六六顺 (2 pungs). These are scored as a small self-draw win and play continues. The pair must be 2/5/8 for small hands. **扎鸟**: draw "bird" tiles after a win, and payment doubles for the seats they point at ([xiaomi](https://game.xiaomi.com/viewpoint/1325360211_1607073438661_11), [3dm](https://shouyou.3dmgame.com/gl/202269.html)). |
| **武汉 红中赖子杠** | 136 tiles; a flipped tile sets the 赖子 (wildcard) | Kongs are fan multipliers. 明杠 and 红中杠 = 1 番 (×2). **暗杠 and 赖子杠 = 2 番 (×4)**. Discarding 红中 counts as a "kong". A concealed kong doesn't count as 开口. | Must **开口** (have a chow, pung or exposed kong) to win. 2/5/8 pair. 开口翻 vs 口口翻 (each meld ×2). Example thresholds: start at 4 番 / cap 7, or 6 / 10, then 金顶 (all three losers capped) ([163.com](https://www.163.com/dy/article/DESIG76D0518V153.html), [tcy365](https://m.tcy365.com/news/d30713.html), [baijiahao](https://baijiahao.baidu.com/s?id=1635041620536555921)). |
| **东北 (哈尔滨 etc.)** | 112 tiles (suits + 红中) | 宝牌 indicator mechanics | Hand-shape legality rules. An old Harbin ruleset requires at least one pung, a kanchan wait, no 七对, no 平和 or 对对 shapes ([Aono paper, nii.ac.jp](https://ouc.repo.nii.ac.jp/record/1002/files/Aono.22.pdf)). Claiming a meld to go ready (吃听 / 碰听) ([app](https://apps.apple.com/app/id1546689312)). "Must have 幺九 / must open / 三门齐" are widely reported but **not confirmed by a source**. |

**Takeaway for the kong request.** Nearly every Chinese family will recognise one of three kong rules:

- **(a)** Kong adds fan: Guangdong +1, Wuhan 明 1 / 暗 2, Sichuan 根 +1.
- **(b)** Kong pays immediately (刮风下雨 / 杠钱): Sichuan, 推倒胡, HK parlours.
- **(c)** Kong earns fan points: MCR's 明杠 1 / 暗杠 2.

Classic HK faan tables have none of these, so the request is reasonable and should be a toggle.

---

## C. Taiwanese 16-tile and Japanese riichi (brief)

- **Taiwanese 16-tile (台)**: hands have 16 tiles (5 melds + pair), with 8 flowers.
  - Scoring is additive: payout = 底 + 台 × per-台 (e.g. "30/10").
  - The dealer earns +1 台, and continuing as dealer adds 連n拉n = 2n+1 台.
  - 七搶一 is 8 台, or 16 on some platforms. 八仙過海 is an instant win.
  - The north and south styles differ in how they score honours and flowers ([uptogo](https://uptogo.com.tw/?p=1754096), [kikinote](https://kikinote.net/107381)).
  - **Out of scope for parameterization**: hand size, wall size, hand decomposition and the additive point model all differ. A separate rules engine would share only the tile and turn primitives.
- **Japanese riichi**: 136 tiles plus red fives, riichi, furiten, dora, yaku with fu/han tables, a point stick economy and an honba/riichi-stick carry-over.
  - Its house rules are already a well-known toggle set: open tanyao (食断), red fives 0/3/4, bust (飛び), double/triple ron vs head-bump (頭ハネ), and the Tenhou room tiers "喰断 on/off × 赤 on/off" ([reachmahjong forum](https://reachmahjong.com/en/forum/viewtopic.php?p=55616), [Tenhou instructions](https://saki.fandom.com/wiki/Tenhou_game_instructions)).
  - **Out of scope as a parameter**: it needs its own engine (furiten, riichi, fu).

---

## D. Structural observations

### D1. Classifying the axes

| Class | Examples | Engine impact |
|---|---|---|
| **1. Scoring-table tweaks** | Fan value changes (清一色 6 vs 7, 字一色 10 vs limit); adding fans (kong +1, 无花 +1, 正花, 门清中张, 幺九将对, 天地胡 values); self-draw +1 fan vs +1 base (自摸加番 / 自摸加底); 点杠花 scored as self-draw or as discard | Data only: a fan list with values and enable flags |
| **2. Settlement / payment** | 全銃 / 半銃 / 点炮包三家; 包自摸, 包十二張, 包大三元; faan→points curve (doubling, 半辣上, 辣辣上, knee at 4 or 5, custom table); cap; immediate kong payments (刮风下雨), 退税, 呼叫转移; 查大叫 / 查花猪; 扎鸟 / 买马 multipliers; dealer bonuses (连庄) | A settlement module with pluggable formulas. Mostly data plus a few strategies |
| **3. Gameplay / legality** | Minimum faan (incl. 鸡糊 allowed); chow allowed (推倒胡, 川麻: no); 一炮多响 vs 截糊; must 开口 / 敲 / 定缺; 2-5-8 pair requirement; flowers in the wall; tile set (108 / 112 / 136 / 144); wildcards (鬼牌, 赖子, 百搭); 十三幺 robbing a concealed kong; 换三张; continue after a win (血战 / 血流); 起手胡 | Rule-engine hooks: claim validation, win validation, wall builder, turn loop |
| **4. Different game** | Taiwanese 16-tile; Japanese riichi; Shanghai 花 / 勒子 economy; Changsha 起手胡 + 扎鸟; Sichuan 血战 (structurally close, but needs multi-winner and continue-after-win plus 定缺) | Separate preset, or a separate engine |

A realistic order of difficulty: HK house rules are almost entirely classes 1-2 plus a few class-3 toggles (min faan, flowers, multiple winners). Sichuan is the most-requested mainland variant and needs class-3 work (108 tiles, no chow, 定缺, continue after win), so it is effectively a new preset built on shared settlement code.

### D2. How popular apps expose house rules

The universal pattern is **preset (region / 玩法) first, then a short list of toggles and number pickers in the 创建房间 / 开房 screen.**

- **Chinese 房卡 apps** (欢乐麻将, 微乐, 闲来, 途游, etc.):
  - The room creator picks a region preset, then sets 局数 (games or rounds), 底分 (base), 封顶番数 (cap), and that preset's toggles.
  - Typical Sichuan toggles: **换三张**, **自摸加底 / 自摸加番** (加底 is reportedly used by >60% of tables, 加番 is popular around Chengdu), **点杠花 当自摸 / 当点炮**, **幺九将对**, **门清中张**, **天地胡**, 呼叫转移, 查花猪, and **封顶 2/3/4 番** ([zhihu 四川麻将技术论](https://zhuanlan.zhihu.com/p/22612168), [sohu](https://www.sohu.com/a/459159080_121073676), [百度经验 玖玖游](https://jingyan.baidu.com/article/ed2a5d1f822a8609f7be175e.html), [18183 微乐](https://www.18183.com/zhxz/9036807.html)).
  - A deposit check (balance ≥ 40× base) gates entry on one platform.
  - I could not find official option lists for 欢乐麻将, 闲来 or 微乐; the toggles above come from third-party guides **[partially unverified]**.
- **HK apps**: a minimum-faan picker (0/1/3/6 or 3/8), flowers on/off, a faan→score table (sometimes editable), 半銃 / 全銃, a self-draw multiplier, and min/max faan ([Mahjong la](https://apps.apple.com/sg/app/app/id1568116468), [HK Style Mahjong](https://apps.apple.com/us/app/hong-kong-style-mahjong/id916388468)). Score-keeping apps add 包自摸, 一炮多響 and 連莊拉莊 handling ([app id1350174034](https://apps.apple.com/hk/app/id1350174034)).
- **雀魂 / Mahjong Soul friend rooms**: game length (东风 / 半庄), starting points, think time, red dora, 食断, bust, plus advanced toggles **[from general knowledge; no source retrieved]**.

### D3. Design implications

1. Model each ruleset as **preset + overrides**: `{tileSet, allowChow, minFaan, maxFaan, fanOverrides{}, extraFans{kong: 1, concealedKong: 2, …}, paymentScheme, curve{type, knee}, liability{…}, multiWin, kongPayments{exposed, promoted, concealed}, flowers{…}}`.
2. Always show a **computed payout preview** (faan → what each seat pays) in the room-creation UI. The sources themselves contradict each other on numbers, and families will argue about this before anything else.
3. Ship a "kong bonus" control with values {off, +1 any kong, 明 +1 / 暗 +2}, separate from a "kong immediate payment" control. Together they cover the 明杠 / 暗杠 加一番 request and its common neighbours.
