import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TOAST_MS, useToasts } from './useToasts'

describe('toasts', () => {
  const { toasts, push, dismiss, act } = useToasts()
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    for (const t of toasts.value) dismiss(t.id)
    vi.useRealTimers()
  })

  it('closes on their own after a while unless sticky', () => {
    push({ text: 'hello' })
    push({ text: 'invite', sticky: true })
    expect(toasts.value.map((t) => t.text)).toEqual(['hello', 'invite'])
    vi.advanceTimersByTime(TOAST_MS)
    expect(toasts.value.map((t) => t.text)).toEqual(['invite'])
  })

  it('replaces a toast with the same key', () => {
    push({ key: 'table:ABCD', text: 'Ann invited you', sticky: true })
    push({ key: 'table:ABCD', text: 'Bo invited you', sticky: true })
    push({ key: 'table:WXYZ', text: 'Cy invited you', sticky: true })
    expect(toasts.value.map((t) => t.text)).toEqual(['Bo invited you', 'Cy invited you'])
  })

  it('runs a button and closes the toast', () => {
    const run = vi.fn()
    push({ text: 'join?', sticky: true, actions: [{ label: 'Join', run }] })
    const toast = toasts.value[0]!
    act(toast, toast.actions[0]!)
    expect(run).toHaveBeenCalledOnce()
    expect(toasts.value).toEqual([])
  })

  it('keeps only the latest few', () => {
    for (let i = 0; i < 6; i++) push({ text: `t${i}`, sticky: true })
    expect(toasts.value.map((t) => t.text)).toEqual(['t2', 't3', 't4', 't5'])
  })
})
