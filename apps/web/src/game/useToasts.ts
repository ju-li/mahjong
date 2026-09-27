import { shallowRef } from 'vue'

export type ToastAction = { label: string; primary?: boolean; run: () => void }

export type Toast = {
  id: number
  /** Toasts with the same key replace each other, e.g. repeat invites to one table. */
  key: string | null
  text: string
  actions: ToastAction[]
  /** Stays until dismissed or acted on. */
  sticky: boolean
}

export type ToastInput = { key?: string; text: string; actions?: ToastAction[]; sticky?: boolean; timeoutMs?: number }

/** How long a toast that isn't sticky stays up. */
export const TOAST_MS = 5000
/** Oldest toasts go once there are more than this many. */
const MAX_TOASTS = 4

const toasts = shallowRef<Toast[]>([])
const timers = new Map<number, ReturnType<typeof setTimeout>>()
let nextId = 1

function dismiss(id: number): void {
  clearTimeout(timers.get(id))
  timers.delete(id)
  toasts.value = toasts.value.filter((t) => t.id !== id)
}

/** Remove the toast with this key, if one is up. */
function dismissKey(key: string): void {
  for (const t of toasts.value) if (t.key === key) dismiss(t.id)
}

function push(input: ToastInput): number {
  if (input.key) dismissKey(input.key)
  const toast: Toast = { id: nextId++, key: input.key ?? null, text: input.text, actions: input.actions ?? [], sticky: input.sticky ?? false }
  const kept = toasts.value.slice(-(MAX_TOASTS - 1))
  for (const gone of toasts.value.slice(0, toasts.value.length - kept.length)) dismiss(gone.id)
  toasts.value = [...kept, toast]
  if (!toast.sticky) timers.set(toast.id, setTimeout(() => dismiss(toast.id), input.timeoutMs ?? TOAST_MS))
  return toast.id
}

/** Short messages stacked at the bottom of the screen; each can be dismissed, and some carry buttons. */
export function useToasts() {
  return {
    toasts,
    push,
    dismiss,
    dismissKey,
    /** Run a toast's button, then close the toast. */
    act(toast: Toast, action: ToastAction) {
      dismiss(toast.id)
      action.run()
    },
  }
}
