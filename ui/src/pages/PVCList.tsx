import { useState } from 'react'
import { useKubeResources } from '../hooks/useKubeResource'
import { useClusterStore } from '../stores/clusterStore'
import { RESOURCE_CONFIG } from '../lib/resourceConfig'
import { formatAge, creationTimestamp } from '../lib/k8sFormatters'
import { StatusDot } from '../components/shared/StatusDot'
import { SearchInput } from '../components/shared/SearchInput'
import { ResourceHeader } from '../components/shared/ResourceHeader'
import { ResourceTable } from '../components/shared/ResourceTable'
import type { Column } from '../components/shared/ResourceTable'

const columns: Column[] = [
  { key: 'status', label: 'Status', className: 'col-status' },
  { key: 'name', label: 'Name', className: 'col-name' },
  { key: 'namespace', label: 'Namespace', className: 'col-md' },
  { key: 'storageClass', label: 'Storage Class', className: 'col-md' },
  { key: 'requested', label: 'Requested', className: 'col-sm' },
  { key: 'accessModes', label: 'Access Modes', className: 'col-sm' },
  { key: 'volume', label: 'Volume', className: 'col-name' },
  { key: 'age', label: 'Age', className: 'col-age' },
]

export function PVCList() {
  const [filter, setFilter] = useState('')
  const namespace = useClusterStore((s) => s.selectedNamespace)
  const cfg = RESOURCE_CONFIG.persistentvolumeclaims
  const { data: items, isLoading } = useKubeResources({
    group: cfg.group, version: cfg.version, resource: cfg.plural, namespace,
  })

  const pvcs = items.map((item) => {
    const r = (item.raw || {}) as Record<string, unknown>
    const statusObj = (r.status || {}) as Record<string, unknown>
    const spec = (r.spec || {}) as Record<string, unknown>
    const resources = (spec.resources || {}) as Record<string, unknown>
    const requests = (resources.requests || {}) as Record<string, unknown>
    const phase = (statusObj.phase || 'Unknown') as string
    return {
      name: item.name,
      namespace: item.namespace,
      status: phase.toLowerCase() as string,
      storageClass: (spec.storageClassName || '') as string,
      requested: (requests.storage || '') as string,
      accessModes: ((spec.accessModes || []) as string[]).join(', '),
      volume: (spec.volumeName || '') as string,
      age: formatAge(creationTimestamp(item)),
    }
  })

  const filtered = pvcs.filter((p) =>
    p.name.toLowerCase().includes(filter.toLowerCase()) ||
    p.namespace.toLowerCase().includes(filter.toLowerCase())
  )

  if (isLoading && items.length === 0) {
    return (
      <div className="resource-view">
        <ResourceHeader title="Persistent Volume Claims" subtitle="Loading..." />
        <div style={{ padding: 'var(--space-4)', color: 'var(--text-secondary)' }}>Loading PVCs...</div>
      </div>
    )
  }

  return (
    <div className="resource-view">
      <ResourceHeader title="Persistent Volume Claims" subtitle={`${pvcs.length} PVCs${namespace ? ` in ${namespace}` : ' across all namespaces'}`}>
        <SearchInput placeholder="Filter PVCs..." value={filter} onChange={setFilter} />
      </ResourceHeader>

      <ResourceTable columns={columns} data={filtered} renderRow={(pvc) => (
          <tr key={`${pvc.namespace}/${pvc.name}`}>
            <td className="col-status">
              <StatusDot status={pvc.status} />
            </td>
            <td className="name-cell">{pvc.name}</td>
            <td className="mono">{pvc.namespace}</td>
            <td className="mono">{pvc.storageClass}</td>
            <td className="tabular">{pvc.requested}</td>
            <td className="tabular">{pvc.accessModes}</td>
            <td className="mono" style={{ fontSize: 'var(--text-2xs)' }}>{pvc.volume || '\u2014'}</td>
            <td>{pvc.age}</td>
          </tr>
        )} />
    </div>
  )
}
