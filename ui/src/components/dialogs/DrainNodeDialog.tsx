import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle, X } from 'lucide-react'
import { useCallback, useState } from 'react'
import { DrainNode } from '@/wailsjs/go/handlers/ResourceHandler'
import { useToastStore } from '@/stores/toastStore'

interface DrainNodeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  nodeName: string
}

export function DrainNodeDialog({
  open,
  onOpenChange,
  nodeName,
}: DrainNodeDialogProps) {
  const [force, setForce] = useState(false)
  const [ignoreDaemonSets, setIgnoreDaemonSets] = useState(true)
  const [deleteEmptyDirData, setDeleteEmptyDirData] = useState(false)
  const [gracePeriod, setGracePeriod] = useState(30)
  const [loading, setLoading] = useState(false)
  const addToast = useToastStore((s) => s.addToast)

  const handleOpenChange = useCallback(
    (val: boolean) => {
      if (val) {
        setForce(false)
        setIgnoreDaemonSets(true)
        setDeleteEmptyDirData(false)
        setGracePeriod(30)
      }
      onOpenChange(val)
    },
    [onOpenChange]
  )

  const handleDrain = useCallback(async () => {
    setLoading(true)
    try {
      await DrainNode(nodeName, gracePeriod, force, ignoreDaemonSets, deleteEmptyDirData)
      addToast({
        type: 'success',
        title: `Draining node ${nodeName}`,
        description: 'Node drain initiated',
      })
      onOpenChange(false)
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Failed to drain node',
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setLoading(false)
    }
  }, [nodeName, gracePeriod, force, ignoreDaemonSets, deleteEmptyDirData, addToast, onOpenChange])

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-50"
          style={{ background: 'var(--color-bg-overlay)' }}
        />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-lg p-6 w-[400px]"
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} style={{ color: 'var(--yellow)' }} />
              <Dialog.Title
                className="text-sm font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                Drain Node
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
            Drain will evict all pods from node{' '}
            <span className="font-mono font-medium" style={{ color: 'var(--text-primary)' }}>
              {nodeName}
            </span>
            . The node will be cordoned first to prevent new pods from scheduling.
          </p>

          <div className="flex flex-col gap-3 mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={force}
                onChange={(e) => setForce(e.target.checked)}
                className="rounded"
              />
              <div>
                <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                  Force
                </span>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  Delete pods even if not managed by a controller
                </p>
              </div>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={ignoreDaemonSets}
                onChange={(e) => setIgnoreDaemonSets(e.target.checked)}
                className="rounded"
              />
              <div>
                <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                  Ignore DaemonSets
                </span>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  Skip DaemonSet-managed pods during drain
                </p>
              </div>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={deleteEmptyDirData}
                onChange={(e) => setDeleteEmptyDirData(e.target.checked)}
                className="rounded"
              />
              <div>
                <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                  Delete EmptyDir Data
                </span>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  Also evict pods using emptyDir volumes (data will be lost)
                </p>
              </div>
            </label>

            <div>
              <label htmlFor="drain-grace-period" className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                Grace period (seconds)
              </label>
              <input
                id="drain-grace-period"
                type="number"
                min={0}
                value={gracePeriod}
                onChange={(e) => setGracePeriod(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full text-xs px-3 py-1.5 rounded-md mt-1 font-mono"
                style={{
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                }}
                aria-label="Grace period"
              />
            </div>
          </div>

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
              onClick={handleDrain}
              disabled={loading}
              className="text-xs px-3 py-1.5 rounded transition-colors disabled:opacity-40"
              style={{
                color: '#fff',
                background: 'var(--yellow)',
              }}
            >
              {loading ? 'Draining...' : 'Drain Node'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
