import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useKubeResources } from '../hooks/useKubeResource'
import { useClusterStore } from '../stores/clusterStore'
import { RESOURCE_CONFIG } from '../lib/resourceConfig'
import { formatAge } from '../lib/k8sFormatters'
import { SearchInput } from '../components/shared/SearchInput'
import { ResourceHeader } from '../components/shared/ResourceHeader'
import { ResourceTable } from '../components/shared/ResourceTable'
import { CreateSecretDialog } from '../components/shared/CreateSecretDialog'
import type { Column } from '../components/shared/ResourceTable'

const columns: Column[] = [
  { key: 'name', label: 'Name', className: 'col-name' },
  { key: 'namespace', label: 'Namespace', className: 'col-md' },
  { key: 'type', label: 'Type', className: 'col-lg' },
  { key: 'data', label: 'Data', className: 'col-sm' },
  { key: 'age', label: 'Age', className: 'col-age' },
]

function getNamespaceStyle(ns: string): { className?: string; style?: React.CSSProperties } {
  switch (ns) {
    case 'kube-system':
      return { className: 'mono', style: { color: 'var(--purple)' } }
    case 'monitoring':
      return { className: 'mono', style: { color: 'var(--blue)' } }
    default:
      return {}
  }
}

export function SecretList() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState('')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const namespace = useClusterStore((s) => s.selectedNamespace)
  const cfg = RESOURCE_CONFIG.secrets
  const { data: items, isLoading } = useKubeResources({
    group: cfg.group, version: cfg.version, resource: cfg.plural, namespace,
  })

  const resources = items.map((item) => {
    const r = (item.raw || {}) as Record<string, unknown>
    const metadata = (r.metadata || {}) as Record<string, unknown>
    return {
      name: item.name,
      namespace: item.namespace,
      type: (r.type || 'Opaque') as string,
      dataCount: Object.keys((r.data || {}) as Record<string, unknown>).length,
      age: formatAge(metadata.creationTimestamp as string | undefined),
    }
  })

  const filtered = resources.filter((s) =>
    s.name.toLowerCase().includes(filter.toLowerCase()) ||
    s.namespace.toLowerCase().includes(filter.toLowerCase())
  )

  if (isLoading && items.length === 0) {
    return (
      <div className="resource-view">
        <ResourceHeader title="Secrets" subtitle="Loading...">
          <SearchInput placeholder="Filter secrets..." value={filter} onChange={setFilter} />
        </ResourceHeader>
        <div style={{ padding: 'var(--space-6)', color: 'var(--text-tertiary)' }}>Loading...</div>
      </div>
    )
  }

  return (
    <div className="resource-view">
      <ResourceHeader title="Secrets" subtitle={`${filtered.length} secrets`}>
        <button
          onClick={() => setShowCreateDialog(true)}
          className="text-xs px-3 py-1.5 rounded"
          style={{ background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', marginRight: 'var(--space-2)' }}
        >
          Create Secret
        </button>
        <SearchInput placeholder="Filter secrets..." value={filter} onChange={setFilter} />
      </ResourceHeader>

      {showCreateDialog && (
        <CreateSecretDialog
          onClose={() => setShowCreateDialog(false)}
          namespace={namespace || 'default'}
        />
      )}

      <ResourceTable columns={columns} data={filtered} renderRow={(secret) => {
          const nsProps = getNamespaceStyle(secret.namespace)

          return (
            <tr key={`${secret.namespace}/${secret.name}`} style={{ cursor: 'pointer' }} onClick={() => navigate(`/config/secrets/${secret.namespace}/${secret.name}`)}>
              <td className="name-cell">
                <Link to={`/config/secrets/${secret.namespace}/${secret.name}`}>
                  {secret.name}
                </Link>
              </td>
              <td className={nsProps.className} style={nsProps.style}>
                {secret.namespace}
              </td>
              <td className="mono">{secret.type}</td>
              <td className="tabular">{secret.dataCount}</td>
              <td>{secret.age}</td>
            </tr>
          )
        }} />
    </div>
  )
}
