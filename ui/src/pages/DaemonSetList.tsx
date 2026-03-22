import { useState } from 'react'
import { useKubeResources } from '../hooks/useKubeResource'
import { useClusterStore } from '../stores/clusterStore'
import { formatAge } from '../lib/k8sFormatters'
import { RESOURCE_CONFIG } from '../lib/resourceConfig'
import { StatusDot } from '../components/shared/StatusDot'
import { SearchInput } from '../components/shared/SearchInput'
import { ResourceHeader } from '../components/shared/ResourceHeader'
import { ResourceTable } from '../components/shared/ResourceTable'
import type { Column } from '../components/shared/ResourceTable'

const columns: Column[] = [
  { key: 'status', label: 'Status', className: 'col-status' },
  { key: 'name', label: 'Name', className: 'col-name' },
  { key: 'namespace', label: 'Namespace', className: 'col-md' },
  { key: 'desired', label: 'Desired', className: 'col-sm' },
  { key: 'current', label: 'Current', className: 'col-sm' },
  { key: 'ready', label: 'Ready', className: 'col-sm' },
  { key: 'upToDate', label: 'Up-to-date', className: 'col-sm' },
  { key: 'available', label: 'Available', className: 'col-sm' },
  { key: 'age', label: 'Age', className: 'col-age' },
]

function getNamespaceStyle(ns: string): { className?: string; style?: React.CSSProperties } {
  switch (ns) {
    case 'kube-system':
      return { className: 'mono', style: { color: 'var(--purple)' } }
    case 'monitoring':
      return { className: 'mono', style: { color: 'var(--blue)' } }
    case 'ingress-nginx':
      return { className: 'mono', style: { color: 'var(--yellow)' } }
    default:
      return {}
  }
}

export function DaemonSetList() {
  const [filter, setFilter] = useState('')
  const namespace = useClusterStore((s) => s.selectedNamespace)
  const cfg = RESOURCE_CONFIG.daemonsets
  const { data: items, isLoading } = useKubeResources({
    group: cfg.group,
    version: cfg.version,
    resource: cfg.plural,
    namespace,
  })

  const daemonsets = items.map((item) => {
    const r = (item.raw || {}) as Record<string, unknown>
    const meta = (r.metadata || {}) as Record<string, unknown>
    const st = (r.status || {}) as Record<string, unknown>

    const desired = (st.desiredNumberScheduled as number) || 0
    const current = (st.currentNumberScheduled as number) || 0
    const ready = (st.numberReady as number) || 0
    const upToDate = (st.updatedNumberScheduled as number) || 0
    const available = (st.numberAvailable as number) || 0

    let status: string = 'running'
    if (ready < desired) status = ready === 0 ? 'failed' : 'progressing'

    return {
      name: item.name,
      namespace: item.namespace,
      status,
      desired,
      current,
      ready,
      upToDate,
      available,
      age: formatAge((meta.creationTimestamp as string) || ''),
    }
  })

  const filtered = daemonsets.filter((d) =>
    d.name.toLowerCase().includes(filter.toLowerCase()) ||
    d.namespace.toLowerCase().includes(filter.toLowerCase())
  )

  if (isLoading && items.length === 0) {
    return (
      <div className="resource-view">
        <ResourceHeader title="DaemonSets" subtitle="Loading...">
          <SearchInput placeholder="Filter daemonsets..." value={filter} onChange={setFilter} />
        </ResourceHeader>
        <div style={{ padding: 'var(--space-6)', color: 'var(--text-tertiary)' }}>Loading...</div>
      </div>
    )
  }

  return (
    <div className="resource-view">
      <ResourceHeader title="DaemonSets" subtitle={`${filtered.length} daemonsets across all namespaces`}>
        <SearchInput placeholder="Filter daemonsets..." value={filter} onChange={setFilter} />
      </ResourceHeader>

      <ResourceTable columns={columns} data={filtered} renderRow={(ds) => {
          const nsProps = getNamespaceStyle(ds.namespace)
          const isFailed = ds.status === 'failed'

          return (
            <tr key={`${ds.namespace}/${ds.name}`}>
              <td className="col-status">
                <StatusDot status={ds.status} />
              </td>
              <td className="name-cell">{ds.name}</td>
              <td className={nsProps.className} style={nsProps.style}>
                {ds.namespace}
              </td>
              <td className="tabular">{ds.desired}</td>
              <td className="tabular">{ds.current}</td>
              <td
                className="tabular"
                style={isFailed ? { color: 'var(--red)' } : undefined}
              >
                {ds.ready}
              </td>
              <td className="tabular">{ds.upToDate}</td>
              <td
                className="tabular"
                style={isFailed ? { color: 'var(--red)' } : undefined}
              >
                {ds.available}
              </td>
              <td>{ds.age}</td>
            </tr>
          )
        }} />
    </div>
  )
}
