<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Difficulty } from '@mahjong/bots'
import { isRuleSet } from '@mahjong/engine'
import { MAX_NAME_LENGTH, ONLINE_CLAIM_SECONDS, type Snapshot, type TableSettings } from '@mahjong/protocol'
import { RULE_OPTIONS } from '../game/settings'
import { useI18n } from '../i18n/useI18n'

/** The waiting room: the code to share, who has sat down, and the host's match settings. */
const props = defineProps<{ snapshot: Snapshot; isHost: boolean }>()
const name = defineModel<string>('name', { required: true })
const emit = defineEmits<{ configure: [settings: Partial<TableSettings>]; start: []; rename: []; leave: [] }>()

const { t } = useI18n()
const LEVELS: Difficulty[] = ['easy', 'medium', 'hard']

const link = computed(() => `${location.origin}${location.pathname}?room=${props.snapshot.code}`)
const hostName = computed(() => props.snapshot.players[props.snapshot.host]?.name ?? '')
const copied = ref(false)

async function share() {
  const text = t('lobby.shareText', { code: props.snapshot.code })
  if (navigator.share) {
    try {
      await navigator.share({ title: t('app.title'), text, url: link.value })
      return
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
    }
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${link.value}`)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    window.prompt(t('lobby.copy'), link.value)
  }
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
        <span class="lobby__name">{{ p.name ?? t('lobby.emptySeat') }}</span>
        <span v-if="i === snapshot.host" class="lobby__tag">{{ t('lobby.host') }}</span>
        <span v-if="i === snapshot.you" class="lobby__tag lobby__tag--you">{{ t('lobby.you') }}</span>
      </li>
    </ol>

    <form class="lobby__rename" @submit.prevent="emit('rename')">
      <label class="online__field">
        <span>{{ t('online.name') }}</span>
        <input v-model="name" type="text" autocomplete="nickname" :maxlength="MAX_NAME_LENGTH" @blur="emit('rename')" />
      </label>
      <button class="action" type="submit">{{ t('lobby.rename') }}</button>
    </form>

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
          <option v-for="l in LEVELS" :key="l" :value="l">{{ t(`level.${l}`) }}</option>
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
