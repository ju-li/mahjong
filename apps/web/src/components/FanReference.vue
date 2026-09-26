<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { fanDef, fansFor, type RuleFanDef, type RuleSet } from '@mahjong/engine'
import { useI18n } from '../i18n/useI18n'

const props = defineProps<{ focus?: string | null; rules: RuleSet }>()

const { t, fanName, fanDescription, isZh } = useI18n()
const query = ref('')

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

onMounted(async () => {
  await nextTick()
  if (props.focus) document.getElementById(`fan-${props.focus}`)?.scrollIntoView({ block: 'center' })
})
</script>

<template>
  <div class="tabs__body">
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
</template>
