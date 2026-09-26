<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { CODE_LENGTH, MAX_NAME_LENGTH, normalizeCode } from '@mahjong/protocol'
import type { OnlineError } from '../game/useOnline'
import { useI18n } from '../i18n/useI18n'

/** Host a table, or join one by its code. */
const props = defineProps<{ busy: boolean; error: OnlineError | null; initialCode?: string }>()
const name = defineModel<string>('name', { required: true })
const emit = defineEmits<{ host: []; join: [code: string]; close: [] }>()

const { t } = useI18n()

const code = ref(props.initialCode ?? '')
const cleanCode = computed(() => normalizeCode(code.value))

const online = ref(typeof navigator === 'undefined' || navigator.onLine)
const updateOnline = () => (online.value = navigator.onLine)
onMounted(() => {
  window.addEventListener('online', updateOnline)
  window.addEventListener('offline', updateOnline)
})
onBeforeUnmount(() => {
  window.removeEventListener('online', updateOnline)
  window.removeEventListener('offline', updateOnline)
})

/** Letters only, upper case: people read codes aloud and type them on phones. */
function onCodeInput(e: Event) {
  const input = e.target as HTMLInputElement
  code.value = input.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, CODE_LENGTH)
  input.value = code.value
}

function join() {
  if (cleanCode.value) emit('join', cleanCode.value)
}
</script>

<template>
  <div class="result online" role="dialog" aria-modal="true" aria-labelledby="online-title" @keydown.esc="emit('close')">
    <div class="result__card online__card">
      <h2 id="online-title">{{ t('online.title') }}</h2>
      <p class="result__note">{{ t('online.intro') }}</p>

      <label class="online__field">
        <span>{{ t('online.name') }}</span>
        <input v-model="name" type="text" autocomplete="nickname" :maxlength="MAX_NAME_LENGTH" :placeholder="t('online.namePlaceholder')" />
      </label>

      <p v-if="!online" class="online__error" role="alert">{{ t('online.offline') }}</p>
      <p v-else-if="error" class="online__error" role="alert">{{ t(`online.error.${error}`) }}</p>

      <button class="action action--primary online__host" :disabled="busy || !online" @click="emit('host')">
        {{ busy ? t('online.connecting') : t('online.host') }}
      </button>

      <p class="online__or"><span>{{ t('online.or') }}</span></p>

      <form class="online__join" @submit.prevent="join">
        <label class="online__field">
          <span>{{ t('online.code') }}</span>
          <input
            class="online__code"
            :value="code"
            type="text"
            inputmode="text"
            autocapitalize="characters"
            autocomplete="off"
            spellcheck="false"
            :maxlength="CODE_LENGTH"
            placeholder="ABCD"
            :aria-label="t('online.code')"
            @input="onCodeInput"
          />
        </label>
        <button class="action action--primary" type="submit" :disabled="busy || !online || !cleanCode">{{ t('online.join') }}</button>
      </form>

      <button class="action online__cancel" @click="emit('close')">{{ t('online.cancel') }}</button>
    </div>
  </div>
</template>
