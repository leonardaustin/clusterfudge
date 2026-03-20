import { useState } from 'react'
import { useKubeResources } from '../hooks/useKubeResource'
import { RESOURCE_CONFIG } from '../lib/resourceConfig'
import { formatAge, creationTimestamp } from '../lib/k8sFormatters'
import { Badge } from '../components/shared/Badge'
import { SearchInput } from '../components/shared/SearchInput'
import { ResourceHeader } from '../components/shared/ResourceHeader'
import { ResourceTable } from '../components/shared/ResourceTable'
import type { Column } from '../components/shared/ResourceTable'

const columns: Column[] = [
  { key: 'name', label: 'Name', className: 'col-name' },
  { key: 'provisioner', label: 'Provisioner', className: 'col-md' },
  { key: 'reclaimPolicy', label: 'Reclaim Policy', className: 'col-md' },
  { key: 'volumeBindingMode', label: 'Volume Binding Mode', className: 'col-md' },
  { key: 'allowExpansion', label: 'Allow Expansion', className: 'col-sm' },
  { key: 'age', label: 'Age', className: 'col-age' },
]

export function StorageClassList() {
  const [filter, setFilter] = useState('')
  const cfg = RESOURCE_CONFIG.storageclasses
  const { data: items, isLoading } = useKubeResources({
    group: cfg.group, version: cfg.version, resource: cfg.plural, namespace: '',
  })

  const storageClasses = items.map((item) => {
    const r = (item.raw || {}) as Record<string, unknown>
    return {
      name: item.name,
      provisioner: (r.provisioner || '') as string,
      reclaimPolicy: (r.reclaimPolicy || '') as string,
      volumeBindingMode: (r.volumeBindingMode || '') as string,
      allowExpansion: r.allowVolumeExpansion === true,
      age: formatAge(creationTimestamp(item)),
    }
  })

  const filtered = storageClasses.filter((sc) =>
    sc.name.toLowerCase().includes(filter.toLowerCase()) ||
    sc.provisioner.toLowerCase().includes(filter.toLowerCase())
  )

  if (isLoading && items.length === 0) {
    return (
      <div className="resource-view">
        <ResourceHeader title="Storage Classes" subtitle="Loading..." />
        <div style={{ padding: 'var(--space-4)', color: 'var(--text-secondary)' }}>Loading storage classes...</div>
      </div>
    )
  }

  return (
    <div className="resource-view">
      <ResourceHeader title="Storage Classes" subtitle={`${storageClasses.length} storage classes`}>
        <SearchInput placeholder="Filter storage classes..." value={filter} onChange={setFilter} />
      </ResourceHeader>

      <ResourceTable columns={columns} data={filtered} renderRow={(sc) => (
          <tr key={sc.name}>
            <td className="name-cell">{sc.name}</td>
            <td className="mono">{sc.provisioner}</td>
            <td>{sc.reclaimPolicy}</td>
            <td>{sc.volumeBindingMode}</td>
            <td>
              <Badge color={sc.allowExpansion ? 'green' : 'gray'}>
                {sc.allowExpansion ? 'true' : 'false'}
              </Badge>
            </td>
            <td>{sc.age}</td>
          </tr>
        )} />
    </div>
  )
}
