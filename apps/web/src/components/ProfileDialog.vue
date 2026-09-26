<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { MAX_NAME_LENGTH } from '@mahjong/protocol'
import { avatarSvg } from '../game/avatar'
import { randomAvatarSeed, tidyName, useProfile } from '../game/profile'
import { useI18n } from '../i18n/useI18n'

/** Your name and face, for solo and online play alike. Changes apply on Save. */
const emit = defineEmits<{ save: []; close: [] }>()

const { t } = useI18n()
const profile = useProfile()

const FACES = 11
const draftName = ref(profile.name.value)
const picked = ref(profile.avatar.value)
/** Your current face first, then fresh ones to choose from. */
const choices = ref<number[]>([profile.avatar.value, ...Array.from({ length: FACES }, randomAvatarSeed)])
const faces = computed(() => choices.value.map((seed) => ({ seed, svg: avatarSvg(seed) })))

function shuffle() {
  // Keep the face you picked; deal new ones around it.
  choices.value = [picked.value, ...Array.from({ length: FACES }, randomAvatarSeed)]
}

function save() {
  profile.name.value = tidyName(draftName.value)
  profile.avatar.value = picked.value
  emit('save')
  emit('close')
}

const nameInput = ref<HTMLInputElement | null>(null)
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => {
  window.addEventListener('keydown', onKey)
  nameInput.value?.focus()
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="result" role="dialog" aria-modal="true" aria-labelledby="profile-title" @click.self="emit('close')">
    <form class="result__card profile" @submit.prevent="save">
      <h2 id="profile-title">{{ t('profile.title') }}</h2>

      <div class="profile__current">
        <span class="profile__preview" v-html="avatarSvg(picked)" />
        <label class="online__field">
          <span>{{ t('online.name') }}</span>
          <input
            ref="nameInput"
            v-model="draftName"
            type="text"
            autocomplete="nickname"
            :maxlength="MAX_NAME_LENGTH"
            :placeholder="t('online.namePlaceholder')"
          />
        </label>
      </div>

      <fieldset class="profile__faces">
        <legend>{{ t('profile.pickAvatar') }}</legend>
        <button
          v-for="(f, i) in faces"
          :key="f.seed"
          type="button"
          class="profile__face"
          :class="{ 'is-picked': f.seed === picked }"
          :aria-pressed="f.seed === picked"
          :aria-label="t('profile.avatarN', { n: i + 1 })"
          @click="picked = f.seed"
          v-html="f.svg"
        />
      </fieldset>

      <div class="profile__buttons">
        <button type="button" class="action profile__shuffle" @click="shuffle">{{ t('profile.shuffle') }}</button>
        <button type="button" class="action" @click="emit('close')">{{ t('online.cancel') }}</button>
        <button type="submit" class="action action--primary">{{ t('profile.save') }}</button>
      </div>
    </form>
  </div>
</template>
