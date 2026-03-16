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
  { key: 'ready', label: 'Ready', className: 'col-sm' },
  { key: 'current', label: 'Current', className: 'col-sm' },
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

export function StatefulSetList() {
  const [filter, setFilter] = useState('')
  const namespace = useClusterStore((s) => s.selectedNamespace)
  const cfg = RESOURCE_CONFIG.statefulsets
  const { data: items, isLoading } = useKubeResources({
    group: cfg.group,
    version: cfg.version,
    resource: cfg.plural,
    namespace,
  })

  const statefulsets = items.map((item) => {
    const r = (item.raw || {}) as Record<string, unknown>
    const meta = (r.metadata || {}) as Record<string, unknown>
    const spec = (r.spec || {}) as Record<string, unknown>
    const st = (r.status || {}) as Record<string, unknown>

    const desired = (spec.replicas as number) || 0
    const ready = (st.readyReplicas as number) || 0
    const current = (st.currentReplicas as number) || 0

    let status: string = 'running'
    if (ready < desired) status = ready === 0 ? 'failed' : 'progressing'

    return {
      name: item.name,
      namespace: item.namespace,
      status,
      ready: `${ready}/${desired}`,
      current,
      age: formatAge((meta.creationTimestamp as string) || ''),
    }
  })

  const filtered = statefulsets.filter((s) =>
    s.name.toLowerCase().includes(filter.toLowerCase()) ||
    s.namespace.toLowerCase().includes(filter.toLowerCase())
  )

  if (isLoading && items.length === 0) {
    return (
      <div className="resource-view">
        <ResourceHeader title="StatefulSets" subtitle="Loading...">
          <SearchInput placeholder="Filter statefulsets..." value={filter} onChange={setFilter} />
        </ResourceHeader>
        <div style={{ padding: 'var(--space-6)', color: 'var(--text-tertiary)' }}>Loading...</div>
      </div>
    )
  }

  return (
    <div className="resource-view">
      <ResourceHeader title="StatefulSets" subtitle={`${filtered.length} statefulsets across all namespaces`}>
        <SearchInput placeholder="Filter statefulsets..." value={filter} onChange={setFilter} />
      </ResourceHeader>

      <ResourceTable columns={columns} data={filtered} renderRow={(ss) => {
          const nsProps = getNamespaceStyle(ss.namespace)
          const isFailed = ss.status === 'failed'

          return (
            <tr key={`${ss.namespace}/${ss.name}`}>
              <td className="col-status">
                <StatusDot status={ss.status} />
              </td>
              <td className="name-cell">{ss.name}</td>
              <td className={nsProps.className} style={nsProps.style}>
                {ss.namespace}
              </td>
              <td
                className="tabular"
                style={isFailed ? { color: 'var(--red)' } : undefined}
              >
                {ss.ready}
              </td>
              <td className="tabular">{ss.current}</td>
              <td>{ss.age}</td>
            </tr>
          )
        }} />
    </div>
  )
}
