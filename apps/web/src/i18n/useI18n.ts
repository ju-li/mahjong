import { computed, ref, watch } from 'vue'
import { fanDef } from '@mahjong/engine'
import { useSettings } from '../game/settings'
import { MESSAGES, type Locale, type MessageKey } from './messages'
import { DEFAULT_TERMS, resolveTerms, type Terms } from './terms'

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

/** A message in `l` with the player's `terms` and then `params` filled in. */
export function translate(l: Locale, key: MessageKey, params: Record<string, string | number> = {}, terms: Terms = DEFAULT_TERMS): string {
  return resolveTerms(MESSAGES[l][key], terms).replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`))
}

export function useI18n() {
  const { terms } = useSettings()
  const t = (key: MessageKey, params?: Record<string, string | number>) => translate(locale.value, key, params, terms.value)
  /** Fill the player's Chinese terms into engine text (fan names and descriptions). */
  const term = (text: string) => resolveTerms(text, terms.value)
  const fanName = (id: string) => {
    const def = fanDef(id)
    if (!def) return id
    return locale.value === 'zh-Hans' ? term(def.chinese) : def.name
  }
  const fanDescription = (id: string) => {
    const def = fanDef(id)
    return def ? (locale.value === 'zh-Hans' ? term(def.description.zh) : def.description.en) : ''
  }
  const toggle = () => {
    locale.value = locale.value === 'en' ? 'zh-Hans' : 'en'
  }
  return { locale, t, term, terms, fanName, fanDescription, toggle, isZh: computed(() => locale.value === 'zh-Hans') }
}
