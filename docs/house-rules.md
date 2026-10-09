# House rules: research and plan

Status: phase 1 is built (see SPEC T49), with these decisions:
- House rules are part of a **mandatory full-screen onboarding** (settings v2), one question per page, each skippable, with a payout preview.
- **Terminology** (和/胡, 点和/点炮/放炮/放铳, 荒庄/流局, 饼/筒, 条/索, 将/眼) is a personal display choice.
- Preferences sync to the account.
- Hosts' tables start with their defaults; joiners get a notice and can review; the host can change house rules mid-match, applying from the next hand, optionally saving them as their default.
- MCR gets a casual minimum (8/4/0) and flowers on/off.
- **Custom-rule matches are rated** on their rule set's ladder. This supersedes the "unrated" proposal below.

Research catalog with sources: [`house-rules-research.md`](house-rules-research.md).

## Why

Family feedback: "杠（明杠，暗杠），应该加一番", meaning every kong should add 1 faan. Our Hong Kong (HK) table follows the standard HK faan list, which gives nothing for a kong itself. The feedback is still a real and very common house rule: Guangdong tables give +1 for any kong, Wuhan gives 明 1 / 暗 2, and Sichuan gives +1 番 per four-of-a-kind (根). Every family plays a slightly different table. Sources almost always end with "以牌局约定为准" ("go by what your table agreed"). One toggle would fix this report, but the next report would need another. The fix is a general way to say "our table plays X".

## What varies in practice

From the research, house rules fall into four classes. They are listed here in order of how much engine work they need.

| Class | Examples | Engine impact |
|---|---|---|
| 1. Scoring table | kong +1 (or 明 +1 / 暗 +2); 无花 / 正花 on/off; 清一色 6 vs 7; 字一色 limit vs 10; 天胡 / 地胡 | data: which fans exist and their values |
| 2. Settlement | min faan 0/1/3; cap 8/10/13; payout curve 半辣上 vs 辣辣上 (knee at 4 or 5); 半銃 vs 全銃; 包自摸 / 包十二張 / 包大三元; immediate kong money (杠钱 / 刮风下雨) | formulas; liability and kong money need event history |
| 3. Legality / flow | flowers in the wall; chow allowed; 一炮多响 vs 截胡; dealer repeat (连庄); 十三幺 may rob a concealed kong; wildcards; 定缺; continue after a win (血战) | claim and win validation, wall builder, turn loop, match length |
| 4. Different game | Taiwanese 16-tile, Riichi, Shanghai 花/勒子, Changsha 起手胡/扎鸟, Sichuan 血战 | its own rule set (SPEC T34/T35), not an option |

HK house rules are almost entirely classes 1 and 2, plus a few class 3 toggles. That is the right place to start: it is what our HK players argue about, and it needs no new game flow.

Facts that affect the design:
- Our current HK payment (discarder pays 2b, others pay b, self-draw 2b each) is **半銃**. Many HK tables play **全銃** (discarder pays all 4b), so this is the first payment option to offer.
- Sources disagree on the numbers (kong-money amounts, 半辣 knee, 字一色 value). Families argue about payouts before anything else. The lobby should therefore **show the computed payout table** instead of hiding it behind option names.
- Every popular room-based app uses the same UX: **pick a preset, then adjust a short list of toggles and number pickers** (底分, 封顶, 自摸加番/加底, 一炮多响, …). Nobody exposes a free-form fan editor in v1.

## Design

### One config object, owned by the engine

```ts
// packages/engine/src/house.ts
export type HkHouseRules = {
  minFaan: 0 | 1 | 3            // 3
  maxFaan: 8 | 10 | 13          // 13; limit hands pay the cap
  curve: 'half4' | 'half5' | 'full'   // 'half4' = today's 半辣上 table
  payment: 'half' | 'full'      // 'half' = 半銃 (today), 'full' = 全銃
  kongFaan: 'none' | 'each1' | 'melded1concealed2'  // 'none'
  flowers: boolean              // true; false = 136-tile wall, no flower fans
}
export type HouseRules = { hk: HkHouseRules; mcr: McrHouseRules /* {} in v1 */ }
export type RuleConfig = { rules: RuleSet; house: HouseRules[RuleSet] }
```

- `normalizeHouseRules(rules, input: unknown)` is the **only** validator. It fills defaults, drops unknown keys and rejects out-of-range values. The server `configure`, web `settings.load()` and the DB layer all call it, so we don't get a fourth copy of the rule list.
- Options are closed enums, not free numbers. That keeps validation, bots, tests and the UI finite. "Custom fan values" can come later as a typed `fanOverrides: Partial<Record<HkFanId, number>>` if people ask.
- `isDefault(config)` / `houseRulesKey(config)` gives a stable canonical string ('' for standard). It is used for stats grouping and the rated/unrated decision.
- **Presets** live in the engine next to the fans and have bilingual names: `hk.standard` (today), `hk.fullShoot` (全銃), `hk.kongBonus` (杠加番), `hk.8cap` (8 番封顶)… A config that matches no preset shows as "Custom" / "自定义". Presets are shortcuts only; the options object is the truth.

### Thread it through the five functions we already have

`ruleset.ts` already funnels almost everything through `fansFor`, `minimumFor`, `scoreFor`, `meetsMinimumFor` and `settleFor`. Change their argument from `RuleSet` to `RuleConfig`:

- `scoreHandHK(ctx, house)`:
  - add `hk.meldedKong` / `hk.concealedKong` (count per kong) when `kongFaan` is on;
  - drop the flower fans when `flowers` is off;
  - cap at `maxFaan`, and limit hands score `maxFaan`.
- `meetsMinimumHK(score, house)` uses `minFaan`.
- `hkBasePoints(faan, house)` uses `curve`; `settleHK` uses `payment`.
- `fansFor(config)` returns the **effective** fan table, with kong fans present, flower fans removed and the limit equal to the cap. `FanReference`, `i18n.fanName` and the result screen then show the right thing with no extra code.
- `newHand({ config })`: the wall builder skips flowers when they are off.
- `GameState.rules: RuleSet` becomes `GameState.config: RuleConfig`. `PlayerView` carries it, so bots (`validWaits`) and the UI see the same rules.

New engine helper: `paymentTable(config)` returns the per-faan payouts for a discard win and a self-draw (who pays what). `ScoreExplain.vue` today re-implements the HK and MCR payment formulas in the UI (`ScoreExplain.vue:101-110`), which goes against SPEC V26. It should render `paymentTable` / `settleFor` output instead. The lobby payout preview uses the same helper.

### Server, protocol, DB

- `TableSettings` gains `house`. `configure({ house })` is lobby-only like `rules` and is validated with `normalizeHouseRules`. Changing `rules` resets `house` to that rule set's default (or the host's saved rules).
- `Snapshot.settings.house` reaches every client, so players who join mid-match see the rules too.
- Migration `0003`: `matches.house_rules jsonb not null default '{}'`. Existing rows read as standard, and replays (`matches.test.ts`) rebuild hands with the stored config.
- **Ratings:** house rules change payouts, so points are not comparable across configs. Proposal: only matches with standard rules are rated and on leaderboards. House-rule matches still count in history and personal stats, with a "custom rules" tag. (The alternative, a leaderboard per preset, splits small player pools.)

### Web

- **Solo:** `settings.ts` stores `house` per rule set (`{ hk: {...}, mcr: {} }`), so switching rule sets keeps each one's choices. Changing house rules mid-match asks for confirmation and starts a new match, the same as changing rules today.
- **Lobby (host):** under the rules `<select>`, add:
  1. a preset picker;
  2. a "Customize" / "自定义" disclosure with one control per option (segmented buttons, each with a one-line bilingual hint);
  3. a live **payout preview**: rows at 3, 5, 8 faan and the cap, columns for discard win and self-draw. This is where the 全銃 vs 半銃 difference becomes obvious.
  Non-hosts see the same panel read-only.
- **At the table:** the header label becomes `HK · 杠加番` / `HK · Custom`. Tapping it opens `RulesDialog`, whose text is generated from the config (`messages.ts` strings get `{min}` / `{cap}` placeholders instead of hard-coded 3 and 13).
- **Remember my table:** the host's last custom HK rules are saved locally (and on the account later), so a family sets it once.

## Phasing

| Phase | Scope | Notes |
|---|---|---|
| **1. Framework + HK scoring options** | `RuleConfig`, `normalizeHouseRules`, presets, engine `paymentTable`; HK `minFaan`, `maxFaan`, `curve`, `payment`, `kongFaan`, `flowers`; solo settings, lobby panel with preview, rules dialog text; migration 0003, unrated when not standard | Answers the feedback and every other "our table pays differently" report. Mostly classes 1 and 2 plus the wall builder. |
| **2. Liability + kong money** | 包自摸, 包十二張, 包大三元/大四喜 (melds already record `from`); immediate kong payments (明 / 加 / 暗 amounts, kept on a draw or refunded) | Needs a per-hand ledger: `HandResult` gains `kongPayments`, and a drawn hand can have non-zero deltas. Result screen and ScoreExplain show the ledger. |
| **3. Flow options** | 一炮多响 vs 截胡 (`win` result becomes `winners[]`, which touches protocol, UI and the DB `result` JSON); dealer repeat (连庄), which breaks the fixed 16-hand match and the `hand_index` 0..15 CHECK; 十三幺 robbing a concealed kong; 天胡 / 地胡 | Each one is a real game-flow change. Do one at a time, and only when asked for. |
| **4. New rule sets** | Sichuan 血战到底 (108 tiles, no chow, 定缺, play continues after a win, 根 / 刮风下雨) as its own `RuleSet`, reusing phase 2's ledger; Riichi / Taiwanese stay T34/T35 | Not house rules; listed so the phase 1 types leave room for them. |

MCR stays fixed in phase 1. It is a competition standard and players pick it for that. The `McrHouseRules` slot exists so a later "casual MCR" (for example a lower minimum) does not need another migration.

## Open questions

1. Ratings: unrated when not standard (proposed), or one leaderboard per preset?
2. When kong faan is on, does it count toward the 3-faan minimum? Proposal: yes, because faan are faan and that is how families play it. The catch is that a bare kong plus 2 faan then wins.
3. Should phase 1 include `fanOverrides` (editing any fan's value), or wait until someone asks?
4. Which preset names would our players recognise? This needs a quick check with the family testers.
