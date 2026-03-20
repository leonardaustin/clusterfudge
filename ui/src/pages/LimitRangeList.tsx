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
  { key: 'type', label: 'Type', className: 'col-sm' },
  { key: 'defaultLimit', label: 'Default Limit', className: 'col-md' },
  { key: 'defaultRequest', label: 'Default Request', className: 'col-md' },
  { key: 'max', label: 'Max', className: 'col-md' },
  { key: 'min', label: 'Min', className: 'col-md' },
  { key: 'age', label: 'Age', className: 'col-age' },
]

function typeColor(type: string): string {
  switch (type) {
    case 'Container': return 'var(--blue)'
    case 'Pod': return 'var(--purple)'
    case 'PersistentVolumeClaim': return 'var(--yellow)'
    default: return 'var(--text-primary)'
  }
}

function formatResources(res: Record<string, string> | undefined): string {
  if (!res) return '\u2014'
  const parts: string[] = []
  if (res.cpu) parts.push(res.cpu)
  if (res.memory) parts.push(res.memory)
  if (res.storage) parts.push(res.storage)
  return parts.length > 0 ? parts.join(' / ') : '\u2014'
}

export function LimitRangeList() {
  const [filter, setFilter] = useState('')
  const namespace = useClusterStore((s) => s.selectedNamespace)
  const cfg = RESOURCE_CONFIG.limitranges
  const { data: items, isLoading } = useKubeResources({
    group: cfg.group, version: cfg.version, resource: cfg.plural, namespace,
  })

  // Each LimitRange can have multiple limits entries; flatten them into rows
  const resources: {
    name: string; namespace: string; type: string
    defaultLimit: string; defaultRequest: string; max: string; min: string; age: string
  }[] = []

  for (const item of items) {
    const r = (item.raw || {}) as Record<string, unknown>
    const spec = (r.spec || {}) as Record<string, unknown>
    const metadata = (r.metadata || {}) as Record<string, unknown>
    const limits = (spec.limits || []) as Record<string, unknown>[]
    const age = formatAge(metadata.creationTimestamp as string | undefined)
    if (limits.length === 0) {
      resources.push({
        name: item.name, namespace: item.namespace, type: '-',
        defaultLimit: '\u2014', defaultRequest: '\u2014', max: '\u2014', min: '\u2014', age,
      })
    } else {
      for (const limit of limits) {
        resources.push({
          name: item.name,
          namespace: item.namespace,
          type: (limit.type || '-') as string,
          defaultLimit: formatResources(limit.default as Record<string, string> | undefined),
          defaultRequest: formatResources(limit.defaultRequest as Record<string, string> | undefined),
          max: formatResources(limit.max as Record<string, string> | undefined),
          min: formatResources(limit.min as Record<string, string> | undefined),
          age,
        })
      }
    }
  }

  const filtered = resources.filter((lr) =>
    lr.name.toLowerCase().includes(filter.toLowerCase()) ||
    lr.namespace.toLowerCase().includes(filter.toLowerCase())
  )

  if (isLoading && items.length === 0) {
    return (
      <div className="resource-view">
        <ResourceHeader title="Limit Ranges" subtitle="Loading...">
          <SearchInput placeholder="Filter limit ranges..." value={filter} onChange={setFilter} />
        </ResourceHeader>
        <div style={{ padding: 'var(--space-6)', color: 'var(--text-tertiary)' }}>Loading...</div>
      </div>
    )
  }

  return (
    <div className="resource-view">
      <ResourceHeader title="Limit Ranges" subtitle={`${filtered.length} limit ranges`}>
        <SearchInput placeholder="Filter limit ranges..." value={filter} onChange={setFilter} />
      </ResourceHeader>

      <ResourceTable columns={columns} data={filtered} renderRow={(lr, i) => (
          <tr key={`${lr.namespace}/${lr.name}/${lr.type}/${i}`}>
            <td className="name-cell">{lr.name}</td>
            <td>{lr.namespace}</td>
            <td style={{ color: typeColor(lr.type) }}>{lr.type}</td>
            <td className="mono">{lr.defaultLimit}</td>
            <td className="mono">{lr.defaultRequest}</td>
            <td className="mono">{lr.max}</td>
            <td className="mono">{lr.min}</td>
            <td>{lr.age}</td>
          </tr>
        )} />
    </div>
  )
}
