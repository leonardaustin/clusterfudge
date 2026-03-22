import { useState } from 'react'
import { useKubeResources } from '../hooks/useKubeResource'
import { useClusterStore } from '../stores/clusterStore'
import { RESOURCE_CONFIG } from '../lib/resourceConfig'
import { formatAge } from '../lib/k8sFormatters'
import { SearchInput } from '../components/shared/SearchInput'
import { ResourceHeader } from '../components/shared/ResourceHeader'
import { ResourceTable } from '../components/shared/ResourceTable'
import type { Column } from '../components/shared/ResourceTable'

const columns: Column[] = [
  { key: 'name', label: 'Name', className: 'col-name' },
  { key: 'namespace', label: 'Namespace', className: 'col-md' },
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

export function ConfigMapList() {
  const [filter, setFilter] = useState('')
  const namespace = useClusterStore((s) => s.selectedNamespace)
  const cfg = RESOURCE_CONFIG.configmaps
  const { data: items, isLoading } = useKubeResources({
    group: cfg.group, version: cfg.version, resource: cfg.plural, namespace,
  })

  const resources = items.map((item) => {
    const r = (item.raw || {}) as Record<string, unknown>
    const metadata = (r.metadata || {}) as Record<string, unknown>
    return {
      name: item.name,
      namespace: item.namespace,
      dataCount: Object.keys((r.data || {}) as Record<string, unknown>).length,
      age: formatAge(metadata.creationTimestamp as string | undefined),
    }
  })

  const filtered = resources.filter((cm) =>
    cm.name.toLowerCase().includes(filter.toLowerCase()) ||
    cm.namespace.toLowerCase().includes(filter.toLowerCase())
  )

  if (isLoading && items.length === 0) {
    return (
      <div className="resource-view">
        <ResourceHeader title="ConfigMaps" subtitle="Loading...">
          <SearchInput placeholder="Filter configmaps..." value={filter} onChange={setFilter} />
        </ResourceHeader>
        <div style={{ padding: 'var(--space-6)', color: 'var(--text-tertiary)' }}>Loading...</div>
      </div>
    )
  }

  return (
    <div className="resource-view">
      <ResourceHeader title="ConfigMaps" subtitle={`${filtered.length} configmaps`}>
        <SearchInput placeholder="Filter configmaps..." value={filter} onChange={setFilter} />
      </ResourceHeader>

      <ResourceTable columns={columns} data={filtered} renderRow={(cm) => {
          const nsProps = getNamespaceStyle(cm.namespace)

          return (
            <tr key={`${cm.namespace}/${cm.name}`}>
              <td className="name-cell">{cm.name}</td>
              <td className={nsProps.className} style={nsProps.style}>
                {cm.namespace}
              </td>
              <td className="tabular">{cm.dataCount}</td>
              <td>{cm.age}</td>
            </tr>
          )
        }} />
    </div>
  )
}
