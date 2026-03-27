import * as Dialog from '@radix-ui/react-dialog'
import { Package, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useToastStore } from '@/stores/toastStore'
import { useClusterStore } from '@/stores/clusterStore'
import { InstallChart } from '@/wailsjs/go/handlers/HelmHandler'

interface HelmInstallDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  chartName?: string
  chartVersion?: string
  chartRepo?: string
  onInstalled?: () => void
}

export function HelmInstallDialog({
  open,
  onOpenChange,
  chartName = '',
  chartVersion = '',
  chartRepo = '',
  onInstalled,
}: HelmInstallDialogProps) {
  const [releaseName, setReleaseName] = useState('')
  const [namespace, setNamespace] = useState('')
  const [chartRef, setChartRef] = useState('')
  const [valuesJson, setValuesYaml] = useState('')
  const [loading, setLoading] = useState(false)
  const addToast = useToastStore((s) => s.addToast)
  const namespaces = useClusterStore((s) => s.namespaces)
  const selectedNamespace = useClusterStore((s) => s.selectedNamespace)

  useEffect(() => {
    if (open) {
      setReleaseName(chartName)
      setNamespace(selectedNamespace || 'default')
      setChartRef(chartRepo && chartName ? `${chartRepo}/${chartName}` : '')
      setValuesYaml('')
      setLoading(false)
    }
  }, [open, chartName, chartRepo, selectedNamespace])

  const handleInstall = useCallback(async () => {
    if (!releaseName.trim() || !namespace.trim() || !chartRef.trim()) return

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

      await InstallChart(releaseName.trim(), namespace.trim(), chartRef.trim(), JSON.stringify(values))
      addToast({ type: 'success', title: `Installed ${releaseName}` })
      onOpenChange(false)
      onInstalled?.()
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Failed to install chart',
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setLoading(false)
    }
  }, [releaseName, namespace, chartRef, valuesJson, addToast, onOpenChange, onInstalled])

  const isValid = releaseName.trim() !== '' && namespace.trim() !== '' && chartRef.trim() !== ''

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
              <Package size={16} />
              Install Helm Chart
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
            Install a Helm chart into your cluster.
            {chartName && (
              <>
                {' '}Chart:{' '}
                <span className="font-medium font-mono" style={{ color: 'var(--text-primary)' }}>
                  {chartName}
                </span>
                {chartVersion && <span> v{chartVersion}</span>}
              </>
            )}
          </Dialog.Description>

          <div className="mb-3">
            <label className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              Release Name
            </label>
            <input
              type="text"
              value={releaseName}
              onChange={(e) => setReleaseName(e.target.value)}
              placeholder="e.g. my-release"
              className="w-full text-xs px-3 py-2 rounded outline-none"
              style={{
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
              }}
            />
          </div>

          <div className="mb-3">
            <label className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              Namespace
            </label>
            <select
              value={namespace}
              onChange={(e) => setNamespace(e.target.value)}
              className="w-full text-xs px-3 py-2 rounded outline-none"
              style={{
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
              }}
            >
              {namespaces && namespaces.length > 0 ? (
                namespaces.map((ns) => (
                  <option key={ns} value={ns}>{ns}</option>
                ))
              ) : (
                <option value="default">default</option>
              )}
            </select>
          </div>

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
              onClick={handleInstall}
              disabled={!isValid || loading}
              className="text-xs px-3 py-1.5 rounded transition-colors disabled:opacity-40"
              style={{
                color: '#fff',
                background: isValid ? 'var(--accent)' : 'var(--bg-tertiary)',
              }}
            >
              {loading ? 'Installing...' : 'Install'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
