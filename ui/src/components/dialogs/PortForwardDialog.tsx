import * as Dialog from '@radix-ui/react-dialog'
import { Cable, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { usePortForward } from '@/hooks/usePortForward'

interface ContainerPort {
  containerPort: number
  protocol?: string
  name?: string
}

interface PortForwardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  podName: string
  namespace: string
  containerPorts: ContainerPort[]
}

export function PortForwardDialog({
  open,
  onOpenChange,
  podName,
  namespace,
  containerPorts,
}: PortForwardDialogProps) {
  const hasPorts = containerPorts.length > 0
  const [selectedPort, setSelectedPort] = useState(0)
  const [localPort, setLocalPort] = useState('')
  const [manualPort, setManualPort] = useState('')
  const [loading, setLoading] = useState(false)
  const { startPortForward } = usePortForward()

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedPort(hasPorts ? containerPorts[0].containerPort : 0)
      setLocalPort(hasPorts ? String(containerPorts[0].containerPort) : '')
      setManualPort('')
      setLoading(false)
    }
  }, [open, hasPorts, containerPorts])

  const handlePortChange = useCallback(
    (port: number) => {
      setSelectedPort(port)
      setLocalPort(String(port))
    },
    []
  )

  const handleForward = useCallback(async () => {
    const podPort = hasPorts ? selectedPort : parseInt(manualPort, 10)
    if (!podPort || podPort <= 0) return

    const local = localPort === '' ? podPort : parseInt(localPort, 10)
    if (isNaN(local) || local < 0) return

    setLoading(true)
    try {
      const result = await startPortForward({
        namespace,
        podName,
        podPort,
        localPort: local,
      })
      if (result) {
        onOpenChange(false)
      }
    } finally {
      setLoading(false)
    }
  }, [hasPorts, selectedPort, manualPort, localPort, namespace, podName, startPortForward, onOpenChange])

  const targetPort = hasPorts ? selectedPort : parseInt(manualPort, 10)
  const parsedLocal = parseInt(localPort, 10)
  const isValid = targetPort > 0 && (localPort === '' || (!isNaN(parsedLocal) && parsedLocal >= 0))

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-50"
          style={{ background: 'var(--color-bg-overlay)' }}
        />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-lg p-6 w-[400px]"
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title
              className="text-sm font-semibold flex items-center gap-2"
              style={{ color: 'var(--text-primary)' }}
            >
              <Cable size={16} />
              Port Forward
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
            Forward a port from{' '}
            <span className="font-medium font-mono" style={{ color: 'var(--text-primary)' }}>
              {podName}
            </span>{' '}
            in{' '}
            <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
              {namespace}
            </span>
          </Dialog.Description>

          {hasPorts ? (
            <div className="mb-4">
              <label
                className="block text-xs mb-1.5"
                style={{ color: 'var(--text-secondary)' }}
              >
                Container Port
              </label>
              {containerPorts.length === 1 ? (
                <div
                  className="text-xs font-mono px-3 py-2 rounded"
                  style={{
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {containerPorts[0].containerPort}/{containerPorts[0].protocol || 'TCP'}
                  {containerPorts[0].name && (
                    <span style={{ color: 'var(--text-tertiary)', marginLeft: '8px' }}>
                      ({containerPorts[0].name})
                    </span>
                  )}
                </div>
              ) : (
                <select
                  value={selectedPort}
                  onChange={(e) => handlePortChange(parseInt(e.target.value, 10))}
                  className="w-full text-xs font-mono px-3 py-2 rounded outline-none"
                  style={{
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {containerPorts.map((p) => (
                    <option key={`${p.containerPort}-${p.protocol}`} value={p.containerPort}>
                      {p.containerPort}/{p.protocol || 'TCP'}
                      {p.name ? ` (${p.name})` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ) : (
            <div className="mb-4">
              <div
                className="text-xs mb-2 px-3 py-2 rounded"
                style={{
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                }}
              >
                This pod has no exposed container ports. Enter a port manually.
              </div>
              <label
                className="block text-xs mb-1.5"
                style={{ color: 'var(--text-secondary)' }}
              >
                Target Port
              </label>
              <input
                type="number"
                min={1}
                max={65535}
                value={manualPort}
                onChange={(e) => {
                  setManualPort(e.target.value)
                  if (e.target.value) setLocalPort(e.target.value)
                }}
                placeholder="e.g. 8080"
                className="w-full text-xs font-mono px-3 py-2 rounded outline-none"
                style={{
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                }}
              />
            </div>
          )}

          <div className="mb-4">
            <label
              className="block text-xs mb-1.5"
              style={{ color: 'var(--text-secondary)' }}
            >
              Local Port
              <span className="ml-1" style={{ color: 'var(--text-tertiary)' }}>
                (0 = auto-assign)
              </span>
            </label>
            <input
              type="number"
              min={0}
              max={65535}
              value={localPort}
              onChange={(e) => setLocalPort(e.target.value)}
              placeholder="Same as container port"
              className="w-full text-xs font-mono px-3 py-2 rounded outline-none"
              style={{
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
              }}
            />
          </div>

          {isValid && (
            <p
              className="text-xs text-center mb-4 font-mono"
              style={{ color: 'var(--text-secondary)' }}
            >
              {podName}:{targetPort} &rarr; localhost:{localPort || targetPort}
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
              onClick={handleForward}
              disabled={!isValid || loading}
              className="text-xs px-3 py-1.5 rounded transition-colors disabled:opacity-40"
              style={{
                color: '#fff',
                background: isValid ? 'var(--accent)' : 'var(--bg-tertiary)',
              }}
            >
              {loading ? 'Forwarding...' : 'Forward'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
