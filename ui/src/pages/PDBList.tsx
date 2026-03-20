import { useState } from 'react'
import { useKubeResources } from '../hooks/useKubeResource'
import { useClusterStore } from '../stores/clusterStore'
import { formatAge } from '../lib/k8sFormatters'
import { RESOURCE_CONFIG } from '../lib/resourceConfig'
import { SearchInput } from '../components/shared/SearchInput'
import { ResourceHeader } from '../components/shared/ResourceHeader'
import { ResourceTable } from '../components/shared/ResourceTable'
import type { Column } from '../components/shared/ResourceTable'

const columns: Column[] = [
  { key: 'name', label: 'Name', className: 'col-name' },
  { key: 'namespace', label: 'Namespace', className: 'col-md' },
  { key: 'minAvailable', label: 'Min Available', className: 'col-sm' },
  { key: 'maxUnavailable', label: 'Max Unavailable', className: 'col-sm' },
  { key: 'currentHealthy', label: 'Current Healthy', className: 'col-sm' },
  { key: 'desiredHealthy', label: 'Desired Healthy', className: 'col-sm' },
  { key: 'disruptionsAllowed', label: 'Allowed Disruptions', className: 'col-sm' },
  { key: 'age', label: 'Age', className: 'col-age' },
]

export function PDBList() {
  const [filter, setFilter] = useState('')
  const namespace = useClusterStore((s) => s.selectedNamespace)
  const cfg = RESOURCE_CONFIG.poddisruptionbudgets
  const { data: items, isLoading } = useKubeResources({
    group: cfg.group,
    version: cfg.version,
    resource: cfg.plural,
    namespace,
  })

  const pdbs = items.map((item) => {
    const r = (item.raw || {}) as Record<string, unknown>
    const meta = (r.metadata || {}) as Record<string, unknown>
    const spec = (r.spec || {}) as Record<string, unknown>
    const st = (r.status || {}) as Record<string, unknown>

    const minAvailable = spec.minAvailable != null ? String(spec.minAvailable) : '-'
    const maxUnavailable = spec.maxUnavailable != null ? String(spec.maxUnavailable) : '-'
    const currentHealthy = (st.currentHealthy as number) || 0
    const desiredHealthy = (st.desiredHealthy as number) || 0
    const disruptionsAllowed = (st.disruptionsAllowed as number) || 0

    return {
      name: item.name,
      namespace: item.namespace,
      minAvailable,
      maxUnavailable,
      currentHealthy,
      desiredHealthy,
      disruptionsAllowed,
      age: formatAge((meta.creationTimestamp as string) || ''),
    }
  })

  const filtered = pdbs.filter((pdb) =>
    pdb.name.toLowerCase().includes(filter.toLowerCase()) ||
    pdb.namespace.toLowerCase().includes(filter.toLowerCase())
  )

  if (isLoading && items.length === 0) {
    return (
      <div className="resource-view">
        <ResourceHeader title="Pod Disruption Budgets" subtitle="Loading...">
          <SearchInput placeholder="Filter PDBs..." value={filter} onChange={setFilter} />
        </ResourceHeader>
        <div style={{ padding: 'var(--space-6)', color: 'var(--text-tertiary)' }}>Loading...</div>
      </div>
    )
  }

  return (
    <div className="resource-view">
      <ResourceHeader title="Pod Disruption Budgets" subtitle={`${filtered.length} PDBs across all namespaces`}>
        <SearchInput placeholder="Filter PDBs..." value={filter} onChange={setFilter} />
      </ResourceHeader>

      <ResourceTable columns={columns} data={filtered} renderRow={(pdb) => (
          <tr key={`${pdb.namespace}/${pdb.name}`}>
            <td className="name-cell">{pdb.name}</td>
            <td>{pdb.namespace}</td>
            <td className="tabular">{pdb.minAvailable}</td>
            <td className="tabular">{pdb.maxUnavailable}</td>
            <td className="tabular">{pdb.currentHealthy}</td>
            <td className="tabular">{pdb.desiredHealthy}</td>
            <td className="tabular" style={{ color: pdb.disruptionsAllowed === 0 ? 'var(--red)' : 'var(--text-primary)' }}>
              {pdb.disruptionsAllowed}
            </td>
            <td>{pdb.age}</td>
          </tr>
        )} />
    </div>
  )
}
