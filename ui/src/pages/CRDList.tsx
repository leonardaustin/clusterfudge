import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useKubeResources } from '../hooks/useKubeResource'
import { RESOURCE_CONFIG } from '../lib/resourceConfig'
import { formatAge, creationTimestamp } from '../lib/k8sFormatters'
import { SearchInput } from '../components/shared/SearchInput'
import { ResourceHeader } from '../components/shared/ResourceHeader'
import { ResourceTable } from '../components/shared/ResourceTable'
import type { Column } from '../components/shared/ResourceTable'

const columns: Column[] = [
  { key: 'name', label: 'Name', className: 'col-name' },
  { key: 'group', label: 'Group', className: 'col-md' },
  { key: 'kind', label: 'Kind', className: 'col-md' },
  { key: 'scope', label: 'Scope', className: 'col-sm' },
  { key: 'versions', label: 'Versions', className: 'col-sm' },
  { key: 'established', label: 'Established', className: 'col-sm' },
  { key: 'namesAccepted', label: 'Names Accepted', className: 'col-sm' },
  { key: 'age', label: 'Age', className: 'col-age' },
]

function getConditionStatus(conditions: Record<string, unknown>[], type: string): boolean {
  if (!conditions) return false
  const cond = conditions.find((c: Record<string, unknown>) => c.type === type)
  return cond?.status === 'True'
}

export function CRDList() {
  const [filter, setFilter] = useState('')
  const cfg = RESOURCE_CONFIG.crds
  const { data: items, isLoading } = useKubeResources({
    group: cfg.group, version: cfg.version, resource: cfg.plural, namespace: '',
  })

  const crds = items.map((item) => {
    const r = (item.raw || {}) as Record<string, unknown>
    const spec = (r.spec || {}) as Record<string, unknown>
    const status = (r.status || {}) as Record<string, unknown>
    const versionsArr = (spec.versions || []) as Record<string, unknown>[]
    const versions = versionsArr.map((v: Record<string, unknown>) => v.name).join(', ')
    const conditions = ((status.conditions || []) as Record<string, unknown>[])
    const names = (spec.names || {}) as Record<string, unknown>
    return {
      name: item.name,
      group: (spec.group || '') as string,
      kind: (names.kind || '') as string,
      scope: (spec.scope || '') as string,
      versions,
      established: getConditionStatus(conditions, 'Established'),
      namesAccepted: getConditionStatus(conditions, 'NamesAccepted'),
      age: formatAge(creationTimestamp(item)),
    }
  })

  const filtered = crds.filter((crd) =>
    crd.name.toLowerCase().includes(filter.toLowerCase()) ||
    crd.group.toLowerCase().includes(filter.toLowerCase()) ||
    crd.kind.toLowerCase().includes(filter.toLowerCase())
  )

  if (isLoading && items.length === 0) {
    return (
      <div className="resource-view">
        <ResourceHeader title="Custom Resource Definitions" subtitle="Loading..." />
        <div style={{ padding: 'var(--space-4)', color: 'var(--text-secondary)' }}>Loading CRDs...</div>
      </div>
    )
  }

  return (
    <div className="resource-view">
      <ResourceHeader title="Custom Resource Definitions" subtitle={`${crds.length} CRDs in the cluster`}>
        <SearchInput placeholder="Filter CRDs..." value={filter} onChange={setFilter} />
      </ResourceHeader>

      <ResourceTable columns={columns} data={filtered} renderRow={(crd) => (
          <tr key={crd.name}>
            <td className="name-cell" style={{ fontSize: 'var(--text-2xs)' }}>
              <Link to={`/custom/${crd.group}/${crd.name.split('.')[0]}/${crd.name}`}>
                {crd.name}
              </Link>
            </td>
            <td className="mono">{crd.group}</td>
            <td>{crd.kind}</td>
            <td style={{ color: crd.scope === 'Cluster' ? 'var(--purple)' : 'var(--blue)' }}>
              {crd.scope}
            </td>
            <td className="mono">{crd.versions}</td>
            <td>
              <span style={{ color: crd.established ? 'var(--green)' : 'var(--red)' }}>
                {crd.established ? 'True' : 'False'}
              </span>
            </td>
            <td>
              <span style={{ color: crd.namesAccepted ? 'var(--green)' : 'var(--yellow)' }}>
                {crd.namesAccepted ? 'True' : 'False'}
              </span>
            </td>
            <td>{crd.age}</td>
          </tr>
        )} />
    </div>
  )
}
