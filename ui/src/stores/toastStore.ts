import { create } from 'zustand'

export type ToastType = 'success' | 'error' | 'info'

export interface Toast {
  id: string
  type: ToastType
  title: string
  description?: string
  duration?: number
}

interface ToastState {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => string
  removeToast: (id: string) => void
}

const DEFAULT_TOAST_DURATION_MS = 4000

let nextId = 0
const timerMap = new Map<string, ReturnType<typeof setTimeout>>()

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],

  addToast: (toast) => {
    const id = `toast-${++nextId}`
    const duration = toast.duration ?? DEFAULT_TOAST_DURATION_MS

    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }))

    if (duration > 0) {
      const timerId = setTimeout(() => {
        timerMap.delete(id)
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
      }, duration)
      timerMap.set(id, timerId)
    }

    return id
  },

  removeToast: (id) => {
    const timerId = timerMap.get(id)
    if (timerId != null) {
      clearTimeout(timerId)
      timerMap.delete(id)
    }
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },
}))
