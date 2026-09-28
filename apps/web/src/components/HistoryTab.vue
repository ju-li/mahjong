<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { HandSummary, MatchDetail, MatchSummary } from '@mahjong/protocol'
import { avatarSvg } from '../game/avatar'
import { signed } from '../game/stats'
import { useAccount } from '../game/useAccount'
import { useSocial } from '../game/useSocial'
import { useI18n } from '../i18n/useI18n'

/** Your matches, newest first; pick one to see it hand by hand. */
const { t, fanName, isZh, locale } = useI18n()
const account = useAccount()
const social = useSocial()

const matches = ref<MatchSummary[]>([])
const more = ref(false)
const loading = ref(false)
const failed = ref(false)
const loaded = ref(false)
const detail = ref<MatchDetail | null>(null)

async function loadMore() {
  if (loading.value || !social.connected.value) return
  loading.value = true
  failed.value = false
  const page = await social.history(matches.value.at(-1)?.endedAt)
  loading.value = false
  if (!page) return void (failed.value = true)
  matches.value = [...matches.value, ...page.matches]
  more.value = page.more
  loaded.value = true
}
onMounted(loadMore)
watch(social.connected, (on) => on && !loaded.value && loadMore())

async function open(m: MatchSummary) {
  const reply = await social.matchDetail(m.id)
  if (reply?.match) detail.value = reply.match
  else failed.value = true
}

/** "1st"…"4th". */
const place = (n: number) => t(`place.${Math.min(Math.max(n, 1), 4) as 1 | 2 | 3 | 4}`)

const when = (ms: number) => new Date(ms).toLocaleString(locale.value, { dateStyle: 'medium', timeStyle: 'short' })

/** Players by display name: you, other people, and bots numbered in seat order. */
function names(m: MatchSummary): string[] {
  let bots = 0
  return m.players.map((p) => (p.bot ? t('player.bot', { n: ++bots }) : p.name || t('player.you')))
}
const detailNames = computed(() => (detail.value ? names(detail.value) : []))

function handLine(h: HandSummary): string {
  const o = h.outcome
  if (o.type === 'drawn') return t('history.drawn')
  const name = detailNames.value[o.winner] ?? ''
  return o.from === null ? t('history.selfDrawn', { name }) : t('history.wonFrom', { name, from: detailNames.value[o.from] ?? '' })
}
</script>

<template>
  <div class="history">
    <p v-if="!account.signedIn.value" class="result__note">{{ t('profile.signInForStats') }}</p>

    <template v-else-if="detail">
      <button class="action" @click="detail = null">← {{ t('history.back') }}</button>
      <h3>
        {{ detail.kind === 'online' ? t('history.online', { rules: t(`rules.${detail.rules}`) }) : t('history.solo', { rules: t(`rules.${detail.rules}`), level: t(`level.${detail.difficulty ?? 'medium'}`) }) }}
        <small>{{ when(detail.endedAt) }}</small>
      </h3>
      <ol class="history__standings">
        <li v-for="(p, i) in detail.players" :key="i" :class="{ 'is-me': i === detail.you }">
          <span class="history__place">{{ place(p.placement) }}</span>
          <span class="history__name">{{ detailNames[i] }}</span>
          <strong :class="{ pos: p.score > 0, neg: p.score < 0 }">{{ p.score }}</strong>
        </li>
      </ol>
      <ol class="history__hands">
        <li v-for="h in detail.hands" :key="h.handIndex">
          <div class="history__hand-head">
            <span class="history__hand-n">{{ t('history.hand', { n: h.handIndex + 1 }) }}</span>
            <span>{{ handLine(h) }}</span>
            <strong v-if="h.outcome.type === 'win'">{{ t('history.total', { n: h.outcome.total }) }}</strong>
          </div>
          <p v-if="h.outcome.type === 'win'" class="history__fans">
            {{ h.outcome.fans.map((f) => (f.count > 1 ? `${fanName(f.id)} ×${f.count}` : fanName(f.id))).join(isZh ? '、' : ', ') }}
          </p>
          <p class="history__deltas">
            <span v-for="(d, p) in h.deltas" :key="p" :class="{ pos: d > 0, neg: d < 0 }">{{ detailNames[p] }} {{ signed(d) }}</span>
          </p>
        </li>
      </ol>
    </template>

    <template v-else>
      <p v-if="loaded && matches.length === 0" class="result__note">{{ t('history.empty') }}</p>
      <ul class="history__list">
        <li v-for="m in matches" :key="m.id">
          <button class="history__row" @click="open(m)">
            <span class="history__place">{{ place(m.players[m.you]!.placement) }}</span>
            <span class="history__what">
              <span>{{ m.kind === 'online' ? t('history.online', { rules: t(`rules.short.${m.rules}`) }) : t('history.solo', { rules: t(`rules.short.${m.rules}`), level: t(`level.${m.difficulty ?? 'medium'}`) }) }}</span>
              <small>{{ when(m.endedAt) }}</small>
            </span>
            <span class="history__faces">
              <span v-for="(p, i) in m.players" :key="i" class="history__face" :title="names(m)[i]" v-html="avatarSvg(p.avatar ?? i + 1)" />
            </span>
            <span class="history__score">
              <strong :class="{ pos: m.players[m.you]!.score > 0, neg: m.players[m.you]!.score < 0 }">{{ t('history.points', { n: m.players[m.you]!.score }) }}</strong>
              <small v-if="m.ratingChange !== null">{{ t('history.rating', { change: signed(m.ratingChange) }) }}</small>
            </span>
          </button>
        </li>
      </ul>
      <button v-if="more" class="action" :disabled="loading" @click="loadMore">{{ t('history.more') }}</button>
      <p v-if="failed" class="result__note">
        {{ t('profile.unavailable') }} <button class="action" @click="loadMore">{{ t('profile.retry') }}</button>
      </p>
      <p v-else-if="!loaded" class="result__note">{{ t('profile.loading') }}</p>
    </template>
  </div>
</template>
