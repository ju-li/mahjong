<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { fanDef, fansFor, type RuleFanDef, type RuleSet } from '@mahjong/engine'
import { useI18n } from '../i18n/useI18n'

const props = defineProps<{ focus?: string | null; rules: RuleSet }>()
const emit = defineEmits<{ close: [] }>()

const { t, fanName, fanDescription, isZh } = useI18n()
const query = ref('')
const closeButton = ref<HTMLButtonElement | null>(null)

const groups = computed(() => {
  const q = query.value.trim().toLowerCase()
  const match = (f: RuleFanDef) =>
    !q ||
    [f.name, f.chinese, f.description.en, f.description.zh].some((text) => text.toLowerCase().includes(q)) ||
    String(f.points) === q
  const byPoints = new Map<number, RuleFanDef[]>()
  for (const f of fansFor(props.rules).filter(match)) byPoints.set(f.points, [...(byPoints.get(f.points) ?? []), f])
  return [...byPoints].sort((a, b) => b[0] - a[0])
})

const otherName = (id: string) => {
  const f = fanDef(id)!
  return isZh.value ? f.name : f.chinese
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

onMounted(async () => {
  window.addEventListener('keydown', onKey)
  await nextTick()
  if (props.focus) document.getElementById(`fan-${props.focus}`)?.scrollIntoView({ block: 'center' })
  closeButton.value?.focus()
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="result fans" role="dialog" aria-modal="true" aria-labelledby="fans-title" @click.self="emit('close')">
    <div class="result__card fans__card">
      <header class="fans__head">
        <h2 id="fans-title">{{ rules === 'hk' ? t('fans.titleHk') : t('fans.title') }}</h2>
        <button ref="closeButton" class="action" @click="emit('close')">{{ t('fans.close') }}</button>
      </header>
      <p class="result__note">{{ rules === 'hk' ? t('fans.minimumHk') : t('fans.minimum') }}</p>
      <input v-model="query" class="fans__search" type="search" :placeholder="t('fans.search')" :aria-label="t('fans.search')" />
      <p v-if="groups.length === 0" class="result__note">{{ t('fans.noMatch') }}</p>
      <section v-for="[points, fans] in groups" :key="points" class="fans__group">
        <h3>{{ t(rules === 'hk' ? 'fans.pointsHk' : 'fans.points', { n: points }) }}</h3>
        <dl>
          <div v-for="f in fans" :id="`fan-${f.id}`" :key="f.id" class="fans__item" :class="{ 'is-focus': f.id === focus }">
            <dt>
              {{ fanName(f.id) }} <small>{{ otherName(f.id) }}</small>
            </dt>
            <dd>
              {{ fanDescription(f.id) }}
              <span v-if="f.id === 'concealedKongAndMeldedKong'" class="fans__extra">{{ t('fans.extra') }}</span>
              <span v-if="f.excludes.length" class="fans__excludes">
                {{ t('fans.excludes', { list: f.excludes.map((x) => fanName(x)).join(isZh ? '、' : ', ') }) }}
              </span>
            </dd>
          </div>
        </dl>
      </section>
    </div>
  </div>
</template>
