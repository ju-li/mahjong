<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { RuleSet } from '@mahjong/engine'
import { LEADERBOARD_MIN_MATCHES, type LeaderboardEntry } from '@mahjong/protocol'
import { avatarSvg } from '../game/avatar'
import { fetchLeaderboard } from '../game/leaderboard'
import { useAccount } from '../game/useAccount'
import { useSocial } from '../game/useSocial'
import { useI18n } from '../i18n/useI18n'

/** The top rated online players, one board per rule set. Open to guests too. */
const { t } = useI18n()
const account = useAccount()
const social = useSocial()

const RULES: RuleSet[] = ['mcr', 'hk']
const rules = ref<RuleSet>('mcr')
const entries = ref<LeaderboardEntry[] | null>(null)
const failed = ref(false)

async function load() {
  entries.value = null
  failed.value = false
  const got = await fetchLeaderboard(rules.value)
  if (got) entries.value = got
  else failed.value = true
}
onMounted(load)
watch(rules, load)

const me = computed(() => account.user.value?.userId ?? null)
const friendIds = computed(() => new Set(social.friends.value?.friends.filter((f) => f.state === 'friend').map((f) => f.userId) ?? []))
const myRank = computed(() => entries.value?.find((e) => e.userId === me.value)?.rank ?? null)
</script>

<template>
  <div class="board">
    <div class="board__rules" role="group" :aria-label="t('app.rules')">
      <button v-for="r in RULES" :key="r" class="action" :class="{ 'action--primary': rules === r }" :aria-pressed="rules === r" @click="rules = r">
        {{ t(`rules.${r}`) }}
      </button>
    </div>
    <p v-if="me && entries" class="result__note">
      {{ myRank ? t('board.yourRank', { n: myRank }) : t('board.notRanked', { n: LEADERBOARD_MIN_MATCHES }) }}
    </p>
    <table v-if="entries?.length" class="board__table">
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">{{ t('board.player') }}</th>
          <th scope="col" class="num">{{ t('board.rating') }}</th>
          <th scope="col" class="num">{{ t('board.matches') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="e in entries" :key="e.userId" :class="{ 'is-me': e.userId === me }">
          <td>{{ e.rank }}</td>
          <td class="board__player">
            <span class="board__face" v-html="avatarSvg(e.avatar ?? e.rank)" />
            <span class="board__name">{{ e.name }}</span>
            <span v-if="e.userId === me" class="lobby__tag lobby__tag--you">{{ t('board.you') }}</span>
            <span v-else-if="friendIds.has(e.userId)" class="lobby__tag">{{ t('board.friend') }}</span>
          </td>
          <td class="num">{{ e.rating }}</td>
          <td class="num">{{ e.matches }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else-if="entries" class="result__note">{{ t('board.empty') }}</p>
    <p v-else-if="failed" class="result__note">
      {{ t('profile.unavailable') }} <button class="action" @click="load">{{ t('profile.retry') }}</button>
    </p>
    <p v-else class="result__note">{{ t('profile.loading') }}</p>
  </div>
</template>
