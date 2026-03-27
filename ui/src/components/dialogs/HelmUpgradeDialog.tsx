import * as Dialog from '@radix-ui/react-dialog'
import { ArrowUpCircle, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useToastStore } from '@/stores/toastStore'
import { UpgradeChart } from '@/wailsjs/go/handlers/HelmHandler'

interface HelmUpgradeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  releaseName: string
  namespace: string
  currentChart?: string
  onUpgraded?: () => void
}

export function HelmUpgradeDialog({
  open,
  onOpenChange,
  releaseName,
  namespace,
  currentChart = '',
  onUpgraded,
}: HelmUpgradeDialogProps) {
  const [chartRef, setChartRef] = useState('')
  const [valuesJson, setValuesYaml] = useState('')
  const [loading, setLoading] = useState(false)
  const addToast = useToastStore((s) => s.addToast)

  useEffect(() => {
    if (open) {
      setChartRef(currentChart)
      setValuesYaml('')
      setLoading(false)
    }
  }, [open, currentChart])

  const handleUpgrade = useCallback(async () => {
    if (!chartRef.trim()) return

    setLoading(true)
    try {
      let values: Record<string, unknown> = {}
      if (valuesJson.trim()) {
        try {
          values = JSON.parse(valuesJson)
        } catch {
          addToast({ type: 'error', title: 'Invalid values JSON', description: 'Values must be valid JSON (e.g. {"key": "value"})' })
          setLoading(false)
          return
        }
      }

      await UpgradeChart(releaseName, namespace, chartRef.trim(), JSON.stringify(values))
      addToast({ type: 'success', title: `Upgraded ${releaseName}` })
      onOpenChange(false)
      onUpgraded?.()
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Failed to upgrade release',
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setLoading(false)
    }
  }, [releaseName, namespace, chartRef, valuesJson, addToast, onOpenChange, onUpgraded])

  const isValid = chartRef.trim() !== ''

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-50"
          style={{ background: 'var(--color-bg-overlay)' }}
        />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-lg p-6 w-[440px]"
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
              <ArrowUpCircle size={16} />
              Upgrade Release
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
            Upgrade{' '}
            <span className="font-medium font-mono" style={{ color: 'var(--text-primary)' }}>
              {releaseName}
            </span>{' '}
            in{' '}
            <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
              {namespace}
            </span>
          </Dialog.Description>

          <div className="mb-3">
            <label className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              Chart Reference
            </label>
            <input
              type="text"
              value={chartRef}
              onChange={(e) => setChartRef(e.target.value)}
              placeholder="e.g. bitnami/nginx or oci://registry/chart"
              className="w-full text-xs font-mono px-3 py-2 rounded outline-none"
              style={{
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
              }}
            />
          </div>

          <div className="mb-4">
            <label className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              Values (JSON)
              <span className="ml-1" style={{ color: 'var(--text-tertiary)' }}>(optional)</span>
            </label>
            <textarea
              value={valuesJson}
              onChange={(e) => setValuesYaml(e.target.value)}
              placeholder='{"key": "value"}'
              rows={4}
              className="w-full text-xs rounded outline-none resize-y"
              style={{
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                fontFamily: 'var(--font-mono)',
                padding: '10px',
                minHeight: '80px',
              }}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Dialog.Close asChild>
              <button
                className="text-xs px-3 py-1.5 rounded transition-colors"
                style={{ color: 'var(--text-secondary)', background: 'var(--bg-tertiary)' }}
              >
                Cancel
              </button>
            </Dialog.Close>
            <button
              onClick={handleUpgrade}
              disabled={!isValid || loading}
              className="text-xs px-3 py-1.5 rounded transition-colors disabled:opacity-40"
              style={{
                color: '#fff',
                background: isValid ? 'var(--accent)' : 'var(--bg-tertiary)',
              }}
            >
              {loading ? 'Upgrading...' : 'Upgrade'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
