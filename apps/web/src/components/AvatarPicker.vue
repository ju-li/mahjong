<script setup lang="ts">
import { computed, ref } from 'vue'
import { avatarSvg } from '../game/avatar'
import { randomAvatarSeed } from '../game/profile'
import { useI18n } from '../i18n/useI18n'

/** Pick a face: the current one first, then fresh ones; "More faces" deals new ones around your pick. */
const props = defineProps<{ modelValue: number }>()
const emit = defineEmits<{ 'update:modelValue': [seed: number] }>()

const FACES = 11
const { t } = useI18n()
const choices = ref<number[]>([props.modelValue, ...Array.from({ length: FACES }, randomAvatarSeed)])
const faces = computed(() => choices.value.map((seed) => ({ seed, svg: avatarSvg(seed) })))

function shuffle() {
  choices.value = [props.modelValue, ...Array.from({ length: FACES }, randomAvatarSeed)]
}
</script>

<template>
  <fieldset class="profile__faces">
    <legend>{{ t('profile.pickAvatar') }}</legend>
    <button
      v-for="(f, i) in faces"
      :key="f.seed"
      type="button"
      class="profile__face"
      :class="{ 'is-picked': f.seed === modelValue }"
      :aria-pressed="f.seed === modelValue"
      :aria-label="t('profile.avatarN', { n: i + 1 })"
      @click="emit('update:modelValue', f.seed)"
      v-html="f.svg"
    />
  </fieldset>
  <button type="button" class="action avatar-picker__more" @click="shuffle">{{ t('profile.shuffle') }}</button>
</template>
