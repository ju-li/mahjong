<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { handDeltas, houseOf, maximumFor, paymentFor, paymentTable, type HandResult, type RuleConfig, type Seat } from '@mahjong/engine'
import { useI18n } from '../i18n/useI18n'

const props = defineProps<{
  result: Extract<HandResult, { type: 'win' }>
  /** Rules the hand was played under (the view carries them). */
  config: RuleConfig
  names: string[]
  /** Your seat, to mark your row. */
  seat: Seat
}>()
const emit = defineEmits<{ close: [] }>()

const { t, fanName } = useI18n()
const closeButton = ref<HTMLButtonElement | null>(null)

const hk = computed(() => props.config.rules === 'hk')
const sg = computed(() => props.config.rules === 'sg')
const hkHouse = computed(() => houseOf({ rules: 'hk', house: props.config.house }))
const sgHouse = computed(() => houseOf({ rules: 'sg', house: props.config.house }))
const fan = computed(() => props.result.score.total)
const listed = computed(() => props.result.score.fans.reduce((sum, f) => sum + f.points * f.count, 0))
const limit = computed(() => maximumFor(props.config))
/** Hong Kong and Singapore hands stop counting at the limit. */
const capped = computed(() => limit.value !== null && listed.value > fan.value)

/** What each loser pays for this total; the engine's settlement uses the same numbers. */
const pay = computed(() => paymentFor(props.config, fan.value))
const base = computed(() => pay.value.base)
const selfDraw = computed(() => props.result.from === null)
/** What the discarder (or every loser on a self-draw) pays. */
const full = computed(() => (selfDraw.value ? pay.value.selfDraw : pay.value.discarder))
const fullFormula = computed(() => {
  if (props.config.rules === 'mcr') return `${base.value} + ${fan.value}`
  return `${full.value / base.value} × ${base.value}`
})

const payInFull = computed(() => {
  const from = props.result.from
  if (from === null) return t('explain.selfDraw')
  return from === props.seat ? t('explain.youDiscard') : t('explain.discard', { from: props.names[from]! })
})

/** Hong Kong faan (or Singapore tai) to points table, from the minimum to the limit. */
const hkTable = computed(() => paymentTable(props.config).map((p) => ({ faan: p.total, points: p.base })))

const rows = computed(() => {
  const r = props.result
  return props.names.map((name, seat) => {
    const delta = r.deltas[seat]!
    let reason: string
    if (seat === r.winner) reason = t('explain.collects')
    else if (selfDraw.value) reason = t('explain.paysSelfDraw', { formula: fullFormula.value })
    else if (seat === r.from) reason = t('explain.paysDiscarder', { formula: fullFormula.value })
    else if (pay.value.other === 0) reason = t(sg.value ? 'explain.paysNothingSg' : 'explain.paysNothing')
    else reason = t('explain.paysBase', { n: pay.value.other })
    return { name, seat, reason, delta }
  })
})

/** Singapore bites paid during the hand, per seat, and the hand's total with them. */
const bites = computed(() => {
  const bonus = props.result.bonus
  if (!bonus) return null
  const total = handDeltas(props.result)
  return props.names.map((name, seat) => ({ name, seat, bite: bonus[seat]!, total: total[seat]! }))
})

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`)

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
              <td class="explain__muted">{{ t(sg ? 'explain.cappedSg' : 'explain.capped', { max: limit ?? '' }) }}</td>
              <td class="num explain__muted"><s>{{ listed }}</s></td>
            </tr>
            <tr>
              <th>{{ t(sg ? 'result.totalTai' : 'result.totalFan') }}</th>
              <th class="num">{{ fan }}</th>
            </tr>
          </tfoot>
        </table>
      </section>

      <section>
        <h3>{{ t('explain.step2') }}</h3>
        <template v-if="hk">
          <p>{{ t(hkHouse.curve === 'full' ? 'explain.hkBaseFull' : 'explain.hkBase', { fan, base }) }}</p>
          <ol class="explain__scale" :aria-label="t('explain.hkScale')">
            <li v-for="row in hkTable" :key="row.faan" :class="{ 'is-current': row.faan === fan }">
              <span>{{ row.faan }}</span><strong>{{ row.points }}</strong>
            </li>
          </ol>
          <p v-if="hkHouse.payment === 'full'">{{ t('explain.hkPayFull', { base, full: pay.discarder }) }}</p>
          <p v-else>{{ t('explain.hkPay', { base, full: pay.selfDraw }) }}</p>
        </template>
        <template v-else-if="sg">
          <p>{{ t('explain.sgBase', { fan, base }) }}</p>
          <ol class="explain__scale" :aria-label="t('explain.sgScale')">
            <li v-for="row in hkTable" :key="row.faan" :class="{ 'is-current': row.faan === fan }">
              <span>{{ row.faan }}</span><strong>{{ row.points }}</strong>
            </li>
          </ol>
          <p v-if="sgHouse.payment === 'shooter'">{{ t('explain.sgPayShooter', { base, full: pay.discarder }) }}</p>
          <p v-else>{{ t('explain.sgPay', { base, full: pay.selfDraw }) }}</p>
        </template>
        <p v-else>{{ t('explain.mcrPay', { base, fan, full: pay.discarder }) }}</p>
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

      <section v-if="bites">
        <h3>{{ t('explain.bites') }}</h3>
        <p class="explain__muted">{{ t('explain.bitesNote') }}</p>
        <table class="explain__table">
          <thead>
            <tr>
              <th></th>
              <th class="num">{{ t('explain.bites') }}</th>
              <th class="num">{{ t('explain.handTotal') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in bites" :key="row.seat" :class="{ 'is-me': row.seat === seat }">
              <td>{{ row.name }}</td>
              <td class="num" :class="{ pos: row.bite > 0, neg: row.bite < 0 }">{{ signed(row.bite) }}</td>
              <td class="num" :class="{ pos: row.total > 0, neg: row.total < 0 }">{{ signed(row.total) }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  </div>
</template>
