import { useState } from 'react'
import { useKubeResources } from '../hooks/useKubeResource'
import { RESOURCE_CONFIG } from '../lib/resourceConfig'
import { formatAge, creationTimestamp } from '../lib/k8sFormatters'
import { SearchInput } from '../components/shared/SearchInput'
import { ResourceHeader } from '../components/shared/ResourceHeader'
import { ResourceTable } from '../components/shared/ResourceTable'
import type { Column } from '../components/shared/ResourceTable'

const columns: Column[] = [
  { key: 'name', label: 'Name', className: 'col-name' },
  { key: 'value', label: 'Value', className: 'col-sm' },
  { key: 'globalDefault', label: 'Global Default', className: 'col-sm' },
  { key: 'preemptionPolicy', label: 'Preemption Policy', className: 'col-md' },
  { key: 'description', label: 'Description', className: 'col-name' },
  { key: 'age', label: 'Age', className: 'col-age' },
]

export function PriorityClassList() {
  const [filter, setFilter] = useState('')
  const cfg = RESOURCE_CONFIG.priorityclasses
  const { data: items, isLoading } = useKubeResources({
    group: cfg.group, version: cfg.version, resource: cfg.plural, namespace: '',
  })

  const priorityClasses = items.map((item) => {
    const r = (item.raw || {}) as Record<string, unknown>
    return {
      name: item.name,
      value: (r.value ?? 0) as number,
      globalDefault: r.globalDefault === true,
      preemptionPolicy: (r.preemptionPolicy || 'PreemptLowerPriority') as string,
      description: (r.description || '') as string,
      age: formatAge(creationTimestamp(item)),
    }
  })

  const filtered = priorityClasses.filter((pc) =>
    pc.name.toLowerCase().includes(filter.toLowerCase()) ||
    pc.description.toLowerCase().includes(filter.toLowerCase())
  )

  if (isLoading && items.length === 0) {
    return (
      <div className="resource-view">
        <ResourceHeader title="Priority Classes" subtitle="Loading..." />
        <div style={{ padding: 'var(--space-4)', color: 'var(--text-secondary)' }}>Loading priority classes...</div>
      </div>
    )
  }

  return (
    <div className="resource-view">
      <ResourceHeader title="Priority Classes" subtitle={`${priorityClasses.length} priority classes in the cluster`}>
        <SearchInput placeholder="Filter priority classes..." value={filter} onChange={setFilter} />
      </ResourceHeader>

      <ResourceTable columns={columns} data={filtered} renderRow={(pc) => (
          <tr key={pc.name}>
            <td className="name-cell">{pc.name}</td>
            <td className="mono">{pc.value.toLocaleString()}</td>
            <td>
              <span style={{ color: pc.globalDefault ? 'var(--green)' : 'var(--text-tertiary)' }}>
                {pc.globalDefault ? 'True' : 'False'}
              </span>
            </td>
            <td>{pc.preemptionPolicy}</td>
            <td style={{ fontSize: 'var(--text-2xs)' }}>{pc.description}</td>
            <td>{pc.age}</td>
          </tr>
        )} />
    </div>
  )
}
