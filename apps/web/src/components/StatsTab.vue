<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { LEADERBOARD_MIN_MATCHES, type PlayerStats } from '@mahjong/protocol'
import { percent } from '../game/stats'
import { useAccount } from '../game/useAccount'
import { useSocial } from '../game/useSocial'
import { useI18n } from '../i18n/useI18n'

/** Your ratings per rule set and your solo record per bot level. */
const { t, fanName, isZh } = useI18n()
const account = useAccount()
const social = useSocial()

const stats = ref<PlayerStats | null>(null)
const failed = ref(false)

async function load() {
  failed.value = false
  if (!social.connected.value) return
  const s = await social.stats()
  if (s) stats.value = s
  else failed.value = true
}
onMounted(load)
watch(social.connected, (on) => on && !stats.value && load())
</script>

<template>
  <div class="stats">
    <p v-if="!account.signedIn.value" class="result__note">{{ t('profile.signInForStats') }}</p>
    <template v-else-if="stats">
      <section v-for="o in stats.online" :key="o.rules" class="stats__card">
        <h3>{{ t('stats.online', { rules: t(`rules.${o.rules}`) }) }}</h3>
        <p v-if="o.matches === 0" class="result__note">{{ t('stats.noOnline') }}</p>
        <dl v-else class="stats__grid">
          <div><dt>{{ t('stats.rating') }}</dt><dd>{{ o.rating ?? '–' }}</dd></div>
          <div><dt>{{ t('stats.rank') }}</dt><dd>{{ o.rank ? t('stats.rankN', { n: o.rank }) : t('stats.unranked') }}</dd></div>
          <div><dt>{{ t('stats.matches') }}</dt><dd>{{ o.matches }}</dd></div>
          <div><dt>{{ t('stats.firstRate') }}</dt><dd>{{ percent(o.firsts, o.matches) }}</dd></div>
          <div><dt>{{ t('stats.avgPlace') }}</dt><dd>{{ o.avgPlacement?.toFixed(1) ?? '–' }}</dd></div>
        </dl>
        <p v-if="o.matches > 0 && !o.rank" class="result__note">{{ t('stats.rankHint', { n: LEADERBOARD_MIN_MATCHES }) }}</p>
      </section>
      <p v-if="stats.solo.length === 0" class="result__note">{{ t('stats.noSolo') }}</p>
      <section v-for="s in stats.solo" :key="s.difficulty" class="stats__card">
        <h3>{{ t('stats.solo', { level: t(`level.${s.difficulty}`) }) }}</h3>
        <dl class="stats__grid">
          <div><dt>{{ t('stats.matches') }}</dt><dd>{{ s.matches }}</dd></div>
          <div><dt>{{ t('stats.firstRate') }}</dt><dd>{{ percent(s.firsts, s.matches) }}</dd></div>
          <div><dt>{{ t('stats.avgScore') }}</dt><dd>{{ s.avgScore }}</dd></div>
          <div v-if="s.best" class="stats__best">
            <dt>{{ t('stats.best') }}</dt>
            <dd>{{ t('stats.bestHand', { total: s.best.total }) }} <small>{{ s.best.fans.map(fanName).join(isZh ? '、' : ', ') }}</small></dd>
          </div>
        </dl>
      </section>
    </template>
    <p v-else-if="failed" class="result__note">
      {{ t('profile.unavailable') }} <button class="action" @click="load">{{ t('profile.retry') }}</button>
    </p>
    <p v-else class="result__note">{{ t('profile.loading') }}</p>
  </div>
</template>
