import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle, X } from 'lucide-react'
import { useCallback, useState } from 'react'
import { DeleteResource } from '@/wailsjs/go/handlers/ResourceHandler'
import { useToastStore } from '@/stores/toastStore'

interface DeleteConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  resourceKind: string
  group: string
  version: string
  resource: string
  namespace: string
  name: string
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  resourceKind,
  group,
  version,
  resource,
  namespace,
  name,
}: DeleteConfirmDialogProps) {
  const [confirmText, setConfirmText] = useState('')
  const [loading, setLoading] = useState(false)
  const addToast = useToastStore((s) => s.addToast)

  const handleOpenChange = useCallback(
    (val: boolean) => {
      if (val) setConfirmText('')
      onOpenChange(val)
    },
    [onOpenChange]
  )

  const confirmed = confirmText === name

  const handleDelete = useCallback(async () => {
    if (!confirmed) return
    setLoading(true)
    try {
      await DeleteResource(group, version, resource, namespace, name)
      addToast({
        type: 'success',
        title: `Deleted ${resourceKind} ${name}`,
      })
      onOpenChange(false)
    } catch (err) {
      addToast({
        type: 'error',
        title: `Failed to delete ${resourceKind}`,
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setLoading(false)
    }
  }, [confirmed, group, version, resource, namespace, name, resourceKind, addToast, onOpenChange])

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-50"
          style={{ background: 'var(--color-bg-overlay)' }}
        />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-lg p-6 w-[400px]"
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--red)',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} style={{ color: 'var(--red)' }} />
              <Dialog.Title
                className="text-sm font-semibold"
                style={{ color: 'var(--red)' }}
              >
                Delete {resourceKind}
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

          <Dialog.Description className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
            This action <strong style={{ color: 'var(--red)' }}>cannot be undone</strong>.
            This will permanently delete the {resourceKind.toLowerCase()}{' '}
            <span className="font-mono font-medium" style={{ color: 'var(--text-primary)' }}>
              {name}
            </span>
            {namespace && (
              <>
                {' '}from namespace{' '}
                <span className="font-mono" style={{ color: 'var(--text-primary)' }}>
                  {namespace}
                </span>
              </>
            )}
            .
          </Dialog.Description>

          <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
            Type <span className="font-mono font-medium" style={{ color: 'var(--text-primary)' }}>{name}</span> to confirm:
          </p>

          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={name}
            className="w-full text-xs px-3 py-2 rounded-md mb-4 font-mono"
            style={{
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
            }}
            aria-label="Confirm resource name"
          />

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
              onClick={handleDelete}
              disabled={!confirmed || loading}
              className="text-xs px-3 py-1.5 rounded transition-colors disabled:opacity-40"
              style={{
                color: '#fff',
                background: confirmed ? 'var(--red)' : 'var(--bg-tertiary)',
              }}
            >
              {loading ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
