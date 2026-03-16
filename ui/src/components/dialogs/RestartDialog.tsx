import * as Dialog from '@radix-ui/react-dialog'
import { RefreshCw, X } from 'lucide-react'
import { useCallback, useState } from 'react'
import { RestartDeployment } from '@/wailsjs/go/handlers/ResourceHandler'
import { useToastStore } from '@/stores/toastStore'

interface RestartDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  namespace: string
  name: string
}

export function RestartDialog({
  open,
  onOpenChange,
  namespace,
  name,
}: RestartDialogProps) {
  const [loading, setLoading] = useState(false)
  const addToast = useToastStore((s) => s.addToast)

  const handleRestart = useCallback(async () => {
    setLoading(true)
    try {
      await RestartDeployment(namespace, name)
      addToast({
        type: 'success',
        title: `Restarted deployment ${name}`,
        description: 'Rolling restart initiated',
      })
      onOpenChange(false)
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Failed to restart deployment',
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setLoading(false)
    }
  }, [namespace, name, addToast, onOpenChange])

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-50"
          style={{ background: 'rgba(0,0,0,0.6)' }}
        />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-lg p-6 w-[360px]"
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <RefreshCw size={16} style={{ color: 'var(--accent)' }} />
              <Dialog.Title
                className="text-sm font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                Restart Deployment
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button
                className="p-1 rounded hover:bg-[var(--bg-hover)] transition-colors"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>

          <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
            This will perform a rolling restart of{' '}
            <span className="font-mono font-medium" style={{ color: 'var(--text-primary)' }}>
              {name}
            </span>{' '}
            in namespace{' '}
            <span className="font-mono" style={{ color: 'var(--text-primary)' }}>
              {namespace}
            </span>
            . Existing pods will be replaced gradually.
          </p>

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
              onClick={handleRestart}
              disabled={loading}
              className="text-xs px-3 py-1.5 rounded transition-colors disabled:opacity-40"
              style={{
                color: '#fff',
                background: 'var(--accent)',
              }}
            >
              {loading ? 'Restarting...' : 'Restart'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
