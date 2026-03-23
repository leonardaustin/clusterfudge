import * as Dialog from '@radix-ui/react-dialog'
import { Minus, Plus, X } from 'lucide-react'
import { useCallback, useState } from 'react'
import { ScaleDeployment } from '@/wailsjs/go/handlers/ResourceHandler'
import { useToastStore } from '@/stores/toastStore'

interface ScaleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  namespace: string
  name: string
  currentReplicas: number
}

export function ScaleDialog({
  open,
  onOpenChange,
  namespace,
  name,
  currentReplicas,
}: ScaleDialogProps) {
  const [replicas, setReplicas] = useState(currentReplicas)
  const [loading, setLoading] = useState(false)
  const addToast = useToastStore((s) => s.addToast)

  const handleOpenChange = useCallback(
    (val: boolean) => {
      if (val) setReplicas(currentReplicas)
      onOpenChange(val)
    },
    [currentReplicas, onOpenChange]
  )

  const decrement = useCallback(() => {
    setReplicas((r) => Math.max(0, r - 1))
  }, [])

  const increment = useCallback(() => {
    setReplicas((r) => r + 1)
  }, [])

  const handleScale = useCallback(async () => {
    setLoading(true)
    try {
      await ScaleDeployment(namespace, name, replicas)
      addToast({
        type: 'success',
        title: `Scaled ${name} to ${replicas} replicas`,
      })
      onOpenChange(false)
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Failed to scale deployment',
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setLoading(false)
    }
  }, [namespace, name, replicas, addToast, onOpenChange])

  const unchanged = replicas === currentReplicas

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-50"
          style={{ background: 'var(--color-bg-overlay)' }}
        />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-lg p-6 w-[360px]"
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title
              className="text-sm font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              Scale Deployment
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="p-1 rounded hover:bg-[var(--bg-hover)] transition-colors"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>

          <Dialog.Description className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
            Adjust the number of replicas for{' '}
            <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
              {name}
            </span>
          </Dialog.Description>

          <div className="flex items-center justify-center gap-3 mb-4">
            <button
              onClick={decrement}
              disabled={replicas <= 0}
              className="p-2 rounded-md transition-colors disabled:opacity-30"
              style={{
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
              }}
              aria-label="Decrease replicas"
            >
              <Minus size={16} />
            </button>

            <input
              type="number"
              min={0}
              value={replicas}
              onChange={(e) => setReplicas(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-16 text-center text-lg font-mono rounded-md py-1"
              style={{
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
              }}
              aria-label="Replica count"
            />

            <button
              onClick={increment}
              className="p-2 rounded-md transition-colors"
              style={{
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
              }}
              aria-label="Increase replicas"
            >
              <Plus size={16} />
            </button>
          </div>

          {currentReplicas !== replicas && (
            <p
              className="text-xs text-center mb-4"
              style={{ color: 'var(--text-secondary)' }}
            >
              {currentReplicas} → {replicas} replicas
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Dialog.Close asChild>
              <button
                className="text-xs px-3 py-1.5 rounded transition-colors"
                style={{
                  color: 'var(--text-secondary)',
                  background: 'var(--bg-tertiary)',
                }}
              >
                Cancel
              </button>
            </Dialog.Close>
            <button
              onClick={handleScale}
              disabled={unchanged || loading}
              className="text-xs px-3 py-1.5 rounded transition-colors disabled:opacity-40"
              style={{
                color: '#fff',
                background: unchanged ? 'var(--bg-tertiary)' : 'var(--accent)',
              }}
            >
              {loading ? 'Scaling...' : 'Scale'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
