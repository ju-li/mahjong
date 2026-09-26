<script setup lang="ts">
import { computed, ref } from 'vue'
import { DIFFICULTIES, type Difficulty } from '@mahjong/bots'
import { isRuleSet } from '@mahjong/engine'
import { ONLINE_CLAIM_SECONDS, type Snapshot, type TableSettings } from '@mahjong/protocol'
import { avatarSvg } from '../game/avatar'
import { shareInvite } from '../game/invite'
import { RULE_OPTIONS } from '../game/settings'
import { useI18n } from '../i18n/useI18n'

/** The waiting room: the code to share, who has sat down, and the host's match settings. */
const props = defineProps<{ snapshot: Snapshot; isHost: boolean }>()
const emit = defineEmits<{ configure: [settings: Partial<TableSettings>]; start: []; editProfile: []; leave: [] }>()

const { t } = useI18n()

const hostName = computed(() => props.snapshot.players[props.snapshot.host]?.name ?? '')
const copied = ref(false)

async function share() {
  if ((await shareInvite(props.snapshot.code, t)) !== 'copied') return
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}

function onRules(e: Event) {
  const value = (e.target as HTMLSelectElement).value
  if (isRuleSet(value)) emit('configure', { rules: value })
}
</script>

<template>
  <section class="result__card result__card--inline lobby" aria-labelledby="lobby-code">
    <p class="lobby__label">{{ t('lobby.table') }}</p>
    <h2 id="lobby-code" class="lobby__code" :aria-label="snapshot.code.split('').join(' ')">{{ snapshot.code }}</h2>
    <p class="result__note">{{ t('lobby.shareHint') }}</p>
    <button class="action action--primary lobby__share" @click="share">{{ copied ? t('lobby.copied') : t('lobby.share') }}</button>

    <h3>{{ t('lobby.players') }}</h3>
    <ol class="lobby__seats">
      <li v-for="(p, i) in snapshot.players" :key="i" :class="{ 'is-empty': p.name === null, 'is-me': i === snapshot.you }">
        <button v-if="i === snapshot.you" type="button" class="lobby__me" :title="t('profile.edit')" @click="emit('editProfile')">
          <span v-if="p.avatar !== null" class="lobby__face" v-html="avatarSvg(p.avatar)" />
          <span class="lobby__name">{{ p.name }}</span>
          <span class="lobby__edit">{{ t('lobby.edit') }}</span>
        </button>
        <template v-else>
          <span v-if="p.avatar !== null" class="lobby__face" v-html="avatarSvg(p.avatar)" />
          <span class="lobby__name">{{ p.name ?? t('lobby.emptySeat') }}</span>
        </template>
        <span v-if="i === snapshot.host" class="lobby__tag">{{ t('lobby.host') }}</span>
        <span v-if="i === snapshot.you" class="lobby__tag lobby__tag--you">{{ t('lobby.you') }}</span>
      </li>
    </ol>

    <div class="lobby__settings">
      <label class="select">
        <span>{{ t('app.rules') }}</span>
        <select :value="snapshot.settings.rules" :disabled="!isHost" :aria-label="t('app.rules')" @change="onRules">
          <option v-for="r in RULE_OPTIONS" :key="r.id" :value="r.id" :disabled="!r.playable">
            {{ r.playable ? t(`rules.${r.id}`) : t('rules.comingSoon', { name: t(`rules.${r.id}`) }) }}
          </option>
        </select>
      </label>
      <label class="select">
        <span>{{ t('app.bots') }}</span>
        <select
          :value="snapshot.settings.difficulty"
          :disabled="!isHost"
          :aria-label="t('app.botDifficulty')"
          @change="emit('configure', { difficulty: ($event.target as HTMLSelectElement).value as Difficulty })"
        >
          <option v-for="l in DIFFICULTIES" :key="l" :value="l">{{ t(`level.${l}`) }}</option>
        </select>
      </label>
      <label class="select">
        <span>{{ t('app.claimTimer') }}</span>
        <select
          :value="snapshot.settings.claimSeconds"
          :disabled="!isHost"
          :aria-label="t('app.claimTimer')"
          @change="emit('configure', { claimSeconds: Number(($event.target as HTMLSelectElement).value) as TableSettings['claimSeconds'] })"
        >
          <option v-for="s in ONLINE_CLAIM_SECONDS" :key="s" :value="s">{{ t('timer.seconds', { n: s }) }}</option>
        </select>
      </label>
    </div>

    <button v-if="isHost" class="action action--primary lobby__start" @click="emit('start')">{{ t('lobby.start') }}</button>
    <p v-else class="result__note lobby__waiting">{{ t('lobby.waitingHost', { name: hostName }) }}</p>
    <button class="action" @click="emit('leave')">{{ t('lobby.leave') }}</button>
  </section>
</template>
