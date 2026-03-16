import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useToastStore, type Toast, type ToastType } from '@/stores/toastStore'

const borderColors: Record<ToastType, string> = {
  success: 'var(--green)',
  error: 'var(--red)',
  info: 'var(--border-strong)',
}

const iconColors: Record<ToastType, string> = {
  success: 'var(--green)',
  error: 'var(--red)',
  info: 'var(--blue)',
}

function ToastItem({ toast }: { toast: Toast }) {
  const removeToast = useToastStore((s) => s.removeToast)
  const duration = toast.duration ?? 4000
  const [progress, setProgress] = useState(1)

  useEffect(() => {
    if (duration <= 0) return
    const start = Date.now()
    let raf: number
    const tick = () => {
      const elapsed = Date.now() - start
      const remaining = Math.max(0, 1 - elapsed / duration)
      setProgress(remaining)
      if (remaining > 0) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [duration])

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 80, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 80, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="relative overflow-hidden rounded-md pointer-events-auto"
      style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderLeftWidth: 3,
        borderLeftColor: borderColors[toast.type],
        boxShadow: 'var(--shadow-lg)',
        minWidth: 280,
        maxWidth: 380,
      }}
    >
      <div className="flex items-start gap-3 px-3 py-2.5">
        <div
          className="mt-0.5 w-2 h-2 rounded-full shrink-0"
          style={{ background: iconColors[toast.type] }}
        />
        <div className="flex-1 min-w-0">
          <p
            className="text-xs font-medium truncate"
            style={{ color: 'var(--text-primary)' }}
          >
            {toast.title}
          </p>
          {toast.description && (
            <p
              className="text-xs mt-0.5 line-clamp-2"
              style={{ color: 'var(--text-secondary)' }}
            >
              {toast.description}
            </p>
          )}
        </div>
        <button
          onClick={() => removeToast(toast.id)}
          className="shrink-0 p-0.5 rounded hover:bg-[var(--bg-hover)] transition-colors"
          style={{ color: 'var(--text-tertiary)' }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Progress bar */}
      {duration > 0 && (
        <div
          className="absolute bottom-0 left-0 h-0.5"
          style={{
            background: borderColors[toast.type],
            width: `${progress * 100}%`,
            opacity: 0.6,
            transition: 'width 100ms linear',
          }}
        />
      )}
    </motion.div>
  )
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)

  return (
    <div aria-live="polite" aria-atomic="false" className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} />
        ))}
      </AnimatePresence>
    </div>
  )
}
