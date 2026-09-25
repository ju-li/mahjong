<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { HK_MAX_FAAN, HK_MIN_FAAN, hkBasePoints, MIN_FAN, type HandResult, type RuleSet, type Seat } from '@mahjong/engine'
import { useI18n } from '../i18n/useI18n'

const props = defineProps<{
  result: Extract<HandResult, { type: 'win' }>
  rules: RuleSet
  names: string[]
  /** Your seat, to mark your row. */
  seat: Seat
}>()
const emit = defineEmits<{ close: [] }>()

const { t, fanName } = useI18n()
const closeButton = ref<HTMLButtonElement | null>(null)

const fan = computed(() => props.result.score.total)
const listed = computed(() => props.result.score.fans.reduce((sum, f) => sum + f.points * f.count, 0))
/** Hong Kong hands stop counting at the limit. */
const capped = computed(() => props.rules === 'hk' && listed.value > fan.value)

/** What a non-paying-in loser pays, and what the discarder (or every loser on a self-draw) pays. */
const base = computed(() => (props.rules === 'hk' ? hkBasePoints(fan.value) : MIN_FAN))
const full = computed(() => (props.rules === 'hk' ? 2 * base.value : MIN_FAN + fan.value))
const fullFormula = computed(() => (props.rules === 'hk' ? `2 × ${base.value}` : `${MIN_FAN} + ${fan.value}`))

const selfDraw = computed(() => props.result.from === null)
const payInFull = computed(() => {
  const from = props.result.from
  if (from === null) return t('explain.selfDraw')
  return from === props.seat ? t('explain.youDiscard') : t('explain.discard', { from: props.names[from]! })
})

/** Hong Kong faan-to-points table, from the minimum to the limit. */
const hkTable = computed(() =>
  Array.from({ length: HK_MAX_FAAN - HK_MIN_FAAN + 1 }, (_, i) => HK_MIN_FAAN + i).map((f) => ({ faan: f, points: hkBasePoints(f) })),
)

const rows = computed(() => {
  const r = props.result
  return props.names.map((name, seat) => {
    const delta = r.deltas[seat]!
    let reason: string
    if (seat === r.winner) reason = t('explain.collects')
    else if (selfDraw.value) reason = t('explain.paysSelfDraw', { formula: fullFormula.value })
    else if (seat === r.from) reason = t('explain.paysDiscarder', { formula: fullFormula.value })
    else reason = t('explain.paysBase', { n: base.value })
    return { name, seat, reason, delta }
  })
})

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    emit('close')
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  closeButton.value?.focus()
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="result explain" role="dialog" aria-modal="true" aria-labelledby="explain-title" @click.self="emit('close')">
    <div class="result__card explain__card">
      <header class="explain__head">
        <h2 id="explain-title">{{ t('explain.title') }}</h2>
        <button ref="closeButton" class="action" @click="emit('close')">{{ t('fans.close') }}</button>
      </header>

      <section>
        <h3>{{ t('explain.step1') }}</h3>
        <table class="explain__table">
          <tbody>
            <tr v-for="f in result.score.fans" :key="f.id">
              <td>
                {{ fanName(f.id) }}<span v-if="f.count > 1" class="explain__muted"> × {{ f.count }}</span>
              </td>
              <td class="num">{{ f.points * f.count }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr v-if="capped">
              <td class="explain__muted">{{ t('explain.capped', { max: HK_MAX_FAAN }) }}</td>
              <td class="num explain__muted"><s>{{ listed }}</s></td>
            </tr>
            <tr>
              <th>{{ t('result.totalFan') }}</th>
              <th class="num">{{ fan }}</th>
            </tr>
          </tfoot>
        </table>
      </section>

      <section>
        <h3>{{ t('explain.step2') }}</h3>
        <template v-if="rules === 'hk'">
          <p>{{ t('explain.hkBase', { fan, base }) }}</p>
          <ol class="explain__scale" :aria-label="t('explain.hkScale')">
            <li v-for="row in hkTable" :key="row.faan" :class="{ 'is-current': row.faan === fan }">
              <span>{{ row.faan }}</span><strong>{{ row.points }}</strong>
            </li>
          </ol>
          <p>{{ t('explain.hkPay', { base, full }) }}</p>
        </template>
        <p v-else>{{ t('explain.mcrPay', { base, fan, full }) }}</p>
      </section>

      <section>
        <h3>{{ t('explain.step3') }}</h3>
        <p class="explain__muted">{{ payInFull }}</p>
        <table class="explain__table">
          <tbody>
            <tr v-for="row in rows" :key="row.seat" :class="{ 'is-me': row.seat === seat }">
              <td>{{ row.name }}</td>
              <td class="explain__muted">{{ row.reason }}</td>
              <td class="num" :class="{ pos: row.delta > 0, neg: row.delta < 0 }">{{ row.delta > 0 ? '+' : '' }}{{ row.delta }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  </div>
</template>
