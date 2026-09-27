/**
 * Keeps the most recent console output and uncaught errors in memory, so a feedback report can
 * carry them. Starts when this module loads (first thing in `main.ts`); the console still prints as usual.
 */

export type LogEntry = { time: string; level: string; text: string }

const MAX_ENTRIES = 300
const MAX_TEXT = 2000
const LEVELS = ['log', 'info', 'warn', 'error', 'debug'] as const

const entries: LogEntry[] = []

/** One console argument as text: errors with their stack, objects as JSON where possible. */
export function describe(value: unknown): string {
  if (value instanceof Error) return value.stack || `${value.name}: ${value.message}`
  if (typeof value === 'string') return value
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') return String(value)
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

export function record(level: string, args: unknown[]): void {
  const text = args.map(describe).join(' ')
  entries.push({ time: new Date().toISOString(), level, text: text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text })
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES)
}

/** Oldest first. */
export function recentLogs(): LogEntry[] {
  return entries.slice()
}

function install(): void {
  if (typeof window === 'undefined') return
  for (const level of LEVELS) {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      try {
        record(level, args)
      } catch {
        // Never let logging break the app.
      }
      original(...args)
    }
  }
  window.addEventListener('error', (e) => {
    const where = e.filename ? ` (${e.filename}:${e.lineno}:${e.colno})` : ''
    record('uncaught', [e.error ?? `${e.message}${where}`])
  })
  window.addEventListener('unhandledrejection', (e) => record('unhandledrejection', [e.reason]))
}

install()
