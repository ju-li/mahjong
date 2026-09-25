import { describe, expect, it } from 'vitest'

/**
 * V1 / V33: the engine must stay portable (browser worker, Node server, mobile shell), so its
 * source may not touch browser or Node globals, wall-clock time or unseeded randomness.
 * Scans every engine source file except tests.
 */
const sources = import.meta.glob('../../../packages/engine/src/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

const FORBIDDEN: [RegExp, string][] = [
  [/\bwindow\b/, 'window'],
  [/\bdocument\b/, 'document'],
  [/\bself\b/, 'self'],
  [/\bnavigator\b/, 'navigator'],
  [/\bglobalThis\b/, 'globalThis'],
  [/\bfetch\s*\(/, 'fetch()'],
  [/\b(localStorage|sessionStorage|indexedDB)\b/, 'web storage'],
  [/\bstructuredClone\b/, 'structuredClone'],
  [/\b(setTimeout|setInterval|requestAnimationFrame|queueMicrotask)\b/, 'timers'],
  [/\bMath\.random\b/, 'Math.random'],
  [/\bDate\.now\b|\bnew Date\b|\bperformance\./, 'wall-clock time'],
  [/\bprocess\.|\brequire\s*\(|\bBuffer\b|\b__dirname\b/, 'Node globals'],
  [/from\s+['"]node:|from\s+['"](fs|path|os|crypto|child_process)['"]/, 'Node modules'],
]

/** Drop comments and string contents so words inside them do not count. */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g, "''")
}

describe('engine purity (V1, V33)', () => {
  const files = Object.entries(sources).filter(([path]) => !path.endsWith('.test.ts'))

  it('finds the engine sources', () => {
    expect(files.length).toBeGreaterThan(8)
  })

  it('uses no browser or Node globals, clock or unseeded randomness', () => {
    const hits: string[] = []
    for (const [path, src] of files) {
      const code = codeOnly(src)
      for (const [pattern, label] of FORBIDDEN) if (pattern.test(code)) hits.push(`${path.split('/src/')[1]}: ${label}`)
    }
    expect(hits).toEqual([])
  })

  it('detects violations (self-check)', () => {
    const code = codeOnly("const x = Math.random() // Date.now in a comment is fine\nconst s = 'window'")
    expect(FORBIDDEN.filter(([p]) => p.test(code)).map(([, l]) => l)).toEqual(['Math.random'])
  })
})
