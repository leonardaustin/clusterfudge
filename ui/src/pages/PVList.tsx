import { useState } from 'react'
import { useKubeResources } from '../hooks/useKubeResource'
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
  { key: 'capacity', label: 'Capacity', className: 'col-sm' },
  { key: 'accessModes', label: 'Access Modes', className: 'col-sm' },
  { key: 'reclaimPolicy', label: 'Reclaim Policy', className: 'col-md' },
  { key: 'storageClass', label: 'Storage Class', className: 'col-md' },
  { key: 'claim', label: 'Claim', className: 'col-name' },
  { key: 'age', label: 'Age', className: 'col-age' },
]

export function PVList() {
  const [filter, setFilter] = useState('')
  const cfg = RESOURCE_CONFIG.persistentvolumes
  const { data: items, isLoading } = useKubeResources({
    group: cfg.group, version: cfg.version, resource: cfg.plural, namespace: '',
  })

  const pvs = items.map((item) => {
    const r = (item.raw || {}) as Record<string, unknown>
    const statusObj = (r.status || {}) as Record<string, unknown>
    const spec = (r.spec || {}) as Record<string, unknown>
    const capacity = (spec.capacity || {}) as Record<string, unknown>
    const phase = (statusObj.phase || 'Unknown') as string
    const claimRef = spec.claimRef as Record<string, unknown> | undefined
    const claim = claimRef ? `${claimRef.namespace || ''}/${claimRef.name || ''}` : ''
    return {
      name: item.name,
      status: phase.toLowerCase() as string,
      capacity: (capacity.storage || '') as string,
      accessModes: ((spec.accessModes || []) as string[]).join(', '),
      reclaimPolicy: (spec.persistentVolumeReclaimPolicy || '') as string,
      storageClass: (spec.storageClassName || '') as string,
      claim,
      age: formatAge(creationTimestamp(item)),
    }
  })

  const filtered = pvs.filter((p) =>
    p.name.toLowerCase().includes(filter.toLowerCase()) ||
    p.claim.toLowerCase().includes(filter.toLowerCase())
  )

  if (isLoading && items.length === 0) {
    return (
      <div className="resource-view">
        <ResourceHeader title="Persistent Volumes" subtitle="Loading..." />
        <div style={{ padding: 'var(--space-4)', color: 'var(--text-secondary)' }}>Loading PVs...</div>
      </div>
    )
  }

  return (
    <div className="resource-view">
      <ResourceHeader title="Persistent Volumes" subtitle={`${pvs.length} persistent volumes`}>
        <SearchInput placeholder="Filter PVs..." value={filter} onChange={setFilter} />
      </ResourceHeader>

      <ResourceTable columns={columns} data={filtered} renderRow={(pv) => (
          <tr key={pv.name}>
            <td className="col-status">
              <StatusDot status={pv.status} />
            </td>
            <td className="name-cell" style={{ fontSize: 'var(--text-2xs)' }}>{pv.name}</td>
            <td className="tabular">{pv.capacity}</td>
            <td className="tabular">{pv.accessModes}</td>
            <td>{pv.reclaimPolicy}</td>
            <td className="mono">{pv.storageClass}</td>
            <td className="mono">{pv.claim || '—'}</td>
            <td>{pv.age}</td>
          </tr>
        )} />
    </div>
  )
}
