import { useState, useCallback } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useKubeResources } from '../hooks/useKubeResource'
import { RESOURCE_CONFIG } from '../lib/resourceConfig'
import { formatAge, creationTimestamp, labelsMap } from '../lib/k8sFormatters'
import { StatusDot } from '../components/shared/StatusDot'
import { SearchInput } from '../components/shared/SearchInput'
import { ResourceHeader } from '../components/shared/ResourceHeader'
import { ResourceTable } from '../components/shared/ResourceTable'
import type { Column } from '../components/shared/ResourceTable'
import { ApplyResource } from '../wailsjs/go/handlers/ResourceHandler'
import { useToastStore } from '../stores/toastStore'

const columns: Column[] = [
  { key: 'status', label: 'Status', className: 'col-status' },
  { key: 'name', label: 'Name', className: 'col-name' },
  { key: 'labels', label: 'Labels', className: 'col-md' },
  { key: 'age', label: 'Age', className: 'col-age' },
]

export function NamespaceList() {
  const [filter, setFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [newNsName, setNewNsName] = useState('')
  const [newNsLabels, setNewNsLabels] = useState('')
  const [creating, setCreating] = useState(false)
  const addToast = useToastStore((s) => s.addToast)

  const handleCreateNamespace = useCallback(async () => {
    const name = newNsName.trim()
    if (!name) return
    setCreating(true)
    try {
      const labelMap: Record<string, string> = {}
      if (newNsLabels.trim()) {
        newNsLabels.split(',').forEach((pair) => {
          const [k, v] = pair.split('=')
          if (k?.trim()) labelMap[k.trim()] = v?.trim() || ''
        })
      }

      const nsObj = {
        apiVersion: 'v1',
        kind: 'Namespace',
        metadata: {
          name,
          labels: Object.keys(labelMap).length > 0 ? labelMap : undefined,
        },
      }
      const encoder = new TextEncoder()
      const data = Array.from(encoder.encode(JSON.stringify(nsObj)))
      await ApplyResource('', 'v1', 'namespaces', '', data)
      addToast({ type: 'success', title: `Created namespace "${name}"` })
      setShowCreate(false)
      setNewNsName('')
      setNewNsLabels('')
    } catch (err) {
      addToast({ type: 'error', title: 'Failed to create namespace', description: String(err) })
    } finally {
      setCreating(false)
    }
  }, [newNsName, newNsLabels, addToast])

  const cfg = RESOURCE_CONFIG.namespaces
  const { data: items, isLoading } = useKubeResources({
    group: cfg.group, version: cfg.version, resource: cfg.plural, namespace: '',
  })

  const namespaceItems = items.map((item) => {
    const r = (item.raw || {}) as Record<string, unknown>
    const statusObj = (r.status || {}) as Record<string, unknown>
    const phase = (statusObj.phase || 'Active') as string
    const labels = labelsMap(item)
    const labelStr = Object.entries(labels).map(([k, v]) => `${k}=${v}`).join(', ')
    return {
      name: item.name,
      status: phase.toLowerCase() as string,
      labels: labelStr,
      age: formatAge(creationTimestamp(item)),
    }
  })

  const filtered = namespaceItems.filter((ns) =>
    ns.name.toLowerCase().includes(filter.toLowerCase()) ||
    ns.labels.toLowerCase().includes(filter.toLowerCase())
  )

  if (isLoading && items.length === 0) {
    return (
      <div className="resource-view">
        <ResourceHeader title="Namespaces" subtitle="Loading..." />
        <div style={{ padding: 'var(--space-4)', color: 'var(--text-secondary)' }}>Loading namespaces...</div>
      </div>
    )
  }

  return (
    <div className="resource-view">
      <ResourceHeader title="Namespaces" subtitle={`${namespaceItems.length} namespaces`}>
        <button
          className="settings-btn"
          style={{ fontSize: 'var(--text-xs)', marginRight: 'var(--space-2)' }}
          onClick={() => setShowCreate(true)}
        >
          + Create Namespace
        </button>
        <SearchInput placeholder="Filter namespaces..." value={filter} onChange={setFilter} />
      </ResourceHeader>

      <Dialog.Root open={showCreate} onOpenChange={setShowCreate}>
        <Dialog.Portal>
          <Dialog.Overlay
            className="fixed inset-0 z-50"
            style={{ background: 'rgba(0,0,0,0.6)' }}
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
              <Dialog.Title
                className="text-sm font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                Create Namespace
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

            <div className="flex flex-col gap-3 mb-4">
              <div>
                <label htmlFor="ns-name" className="text-xs font-medium" style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                  Name (required)
                </label>
                <input
                  id="ns-name"
                  type="text"
                  className="settings-input"
                  value={newNsName}
                  onChange={(e) => setNewNsName(e.target.value)}
                  placeholder="my-namespace"
                  style={{ width: '100%', fontSize: 'var(--text-xs)' }}
                />
              </div>
              <div>
                <label htmlFor="ns-labels" className="text-xs font-medium" style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                  Labels (optional, comma-separated key=value)
                </label>
                <input
                  id="ns-labels"
                  type="text"
                  className="settings-input"
                  value={newNsLabels}
                  onChange={(e) => setNewNsLabels(e.target.value)}
                  placeholder="env=prod,team=backend"
                  style={{ width: '100%', fontSize: 'var(--text-xs)' }}
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
                onClick={handleCreateNamespace}
                disabled={creating || !newNsName.trim()}
                className="text-xs px-3 py-1.5 rounded transition-colors disabled:opacity-40"
                style={{
                  color: '#fff',
                  background: 'var(--accent)',
                }}
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <ResourceTable columns={columns} data={filtered} renderRow={(ns) => (
          <tr key={ns.name}>
            <td className="col-status">
              <StatusDot status={ns.status} />
            </td>
            <td className="name-cell">{ns.name}</td>
            <td className="mono" style={{ fontSize: 'var(--text-2xs)' }}>{ns.labels}</td>
            <td>{ns.age}</td>
          </tr>
        )} />
    </div>
  )
}
