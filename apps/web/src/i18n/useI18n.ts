import { computed, ref, watch } from 'vue'
import { FAN_BY_ID, type FanId } from '@mahjong/engine'
import { MESSAGES, type Locale, type MessageKey } from './messages'

const STORAGE_KEY = 'mahjong.locale'

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'en' || saved === 'zh-Hans') return saved
  } catch {
    // Storage unavailable: fall back to the browser language.
  }
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh') ? 'zh-Hans' : 'en'
}

/** Shared across components: one app-wide locale. */
const locale = ref<Locale>(initialLocale())

watch(
  locale,
  (value) => {
    try {
      localStorage.setItem(STORAGE_KEY, value)
    } catch {
      // Not persisted; the toggle still works for this visit.
    }
    if (typeof document !== 'undefined') document.documentElement.lang = value
  },
  { immediate: true },
)

export function translate(l: Locale, key: MessageKey, params: Record<string, string | number> = {}): string {
  return MESSAGES[l][key].replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`))
}

export function useI18n() {
  const t = (key: MessageKey, params?: Record<string, string | number>) => translate(locale.value, key, params)
  const fanName = (id: string) => {
    const def = FAN_BY_ID[id as FanId]
    if (!def) return id
    return locale.value === 'zh-Hans' ? def.chinese : def.name
  }
  const fanDescription = (id: string) => {
    const def = FAN_BY_ID[id as FanId]
    return def ? (locale.value === 'zh-Hans' ? def.description.zh : def.description.en) : ''
  }
  const toggle = () => {
    locale.value = locale.value === 'en' ? 'zh-Hans' : 'en'
  }
  return { locale, t, fanName, fanDescription, toggle, isZh: computed(() => locale.value === 'zh-Hans') }
}
