<script setup lang="ts">
import { computed } from 'vue'
import { HANDS_PER_MATCH } from '@mahjong/engine'
import GameTable from './GameTable.vue'
import HandResult from './HandResult.vue'
import { avatarSeeds, avatarSvg } from '../game/avatar'
import type { MatchSource } from '../game/source'
import { useI18n } from '../i18n/useI18n'

/** The table and the end-of-hand dialog for one match, local or online. */
const props = defineProps<{ source: MatchSource }>()
defineEmits<{ newMatch: []; explain: [fanId: string] }>()

const { t } = useI18n()

const view = computed(() => props.source.view.value)
const result = computed(() => (view.value?.phase.kind === 'ended' ? view.value.phase.result : null))
const seatPlayers = computed(() => props.source.seatPlayers.value)
/** Names in table-seat order for this round. */
const seatNames = computed(() => seatPlayers.value.map((p) => props.source.playerNames.value[p]!))
/** Match totals in seat order, before the hand in play. */
const seatScores = computed(() => seatPlayers.value.map((p) => props.source.scores.value[p]!))
/** Match totals in seat order, including the hand just finished. */
const seatTotals = computed(() =>
  seatPlayers.value.map((p, seat) => props.source.scores.value[p]! + (result.value?.type === 'win' ? result.value.deltas[seat]! : 0)),
)
/** A random face per player, fixed for the whole match. */
const playerAvatars = computed(() => avatarSeeds(props.source.matchSeed.value).map(avatarSvg))
const seatAvatars = computed(() => seatPlayers.value.map((p) => playerAvatars.value[p]!))
const handIndex = computed(() => props.source.handIndex.value)
const handLabel = computed(() => t('score.hand', { n: Math.min(handIndex.value + 1, HANDS_PER_MATCH), total: HANDS_PER_MATCH }))
</script>

<template>
  <GameTable
    v-if="view"
    :key="`${source.matchSeed.value}:${handIndex}`"
    :view="view"
    :actions="source.actions.value"
    :names="seatNames"
    :scores="seatScores"
    :avatars="seatAvatars"
    :hand-label="handLabel"
    :claim-remaining="source.claimRemaining.value"
    @act="source.act"
  />
  <p v-if="view" class="keys-help">{{ t('keys.help') }}</p>

  <HandResult
    v-if="view && result"
    :result="result"
    :view="view"
    :names="seatNames"
    :avatars="seatAvatars"
    :match-over="source.matchOver.value || handIndex === HANDS_PER_MATCH - 1"
    :final-scores="seatTotals"
    @next="source.continueToNextHand()"
    @new-match="$emit('newMatch')"
    @explain="(id: string) => $emit('explain', id)"
  />
</template>
