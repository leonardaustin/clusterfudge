import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useKubeResources } from '../hooks/useKubeResource'
import { useClusterStore } from '../stores/clusterStore'
import { formatAge } from '../lib/k8sFormatters'
import { RESOURCE_CONFIG } from '../lib/resourceConfig'
import { getOwner } from '../data/ownerRefs'
import { StatusDot } from '../components/shared/StatusDot'
import { SearchInput } from '../components/shared/SearchInput'
import { ResourceHeader } from '../components/shared/ResourceHeader'
import { ResourceTable } from '../components/shared/ResourceTable'
import type { Column } from '../components/shared/ResourceTable'

const columns: Column[] = [
  { key: 'status', label: 'Status', className: 'col-status' },
  { key: 'name', label: 'Name', className: 'col-name' },
  { key: 'namespace', label: 'Namespace', className: 'col-md' },
  { key: 'owner', label: 'Owner', className: 'col-md' },
  { key: 'desired', label: 'Desired', className: 'col-sm' },
  { key: 'current', label: 'Current', className: 'col-sm' },
  { key: 'ready', label: 'Ready', className: 'col-sm' },
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

export function ReplicaSetList() {
  const [filter, setFilter] = useState('')
  const namespace = useClusterStore((s) => s.selectedNamespace)
  const cfg = RESOURCE_CONFIG.replicasets
  const { data: items, isLoading } = useKubeResources({
    group: cfg.group,
    version: cfg.version,
    resource: cfg.plural,
    namespace,
  })

  const replicasets = items.map((item) => {
    const r = (item.raw || {}) as Record<string, unknown>
    const meta = (r.metadata || {}) as Record<string, unknown>
    const spec = (r.spec || {}) as Record<string, unknown>
    const st = (r.status || {}) as Record<string, unknown>
    const ownerRefs = (meta.ownerReferences || []) as Array<{ kind: string; name: string; uid: string }>

    const desired = (spec.replicas as number) || 0
    const current = (st.replicas as number) || 0
    const ready = (st.readyReplicas as number) || 0

    let status: string = 'running'
    if (ready < desired) status = ready === 0 ? 'failed' : 'progressing'

    return {
      name: item.name,
      namespace: item.namespace,
      status,
      desired,
      current,
      ready,
      age: formatAge((meta.creationTimestamp as string) || ''),
      ownerReferences: ownerRefs,
    }
  })

  const filtered = replicasets.filter((r) =>
    r.name.toLowerCase().includes(filter.toLowerCase()) ||
    r.namespace.toLowerCase().includes(filter.toLowerCase())
  )

  if (isLoading && items.length === 0) {
    return (
      <div className="resource-view">
        <ResourceHeader title="ReplicaSets" subtitle="Loading...">
          <SearchInput placeholder="Filter replicasets..." value={filter} onChange={setFilter} />
        </ResourceHeader>
        <div style={{ padding: 'var(--space-6)', color: 'var(--text-tertiary)' }}>Loading...</div>
      </div>
    )
  }

  return (
    <div className="resource-view">
      <ResourceHeader title="ReplicaSets" subtitle={`${filtered.length} replicasets across all namespaces`}>
        <SearchInput placeholder="Filter replicasets..." value={filter} onChange={setFilter} />
      </ResourceHeader>

      <ResourceTable columns={columns} data={filtered} renderRow={(rs) => {
          const nsProps = getNamespaceStyle(rs.namespace)
          const isFailed = rs.status === 'failed'
          const owner = getOwner(rs.ownerReferences)

          return (
            <tr key={`${rs.namespace}/${rs.name}`}>
              <td className="col-status">
                <StatusDot status={rs.status} />
              </td>
              <td className="name-cell">{rs.name}</td>
              <td className={nsProps.className} style={nsProps.style}>
                {rs.namespace}
              </td>
              <td>
                {owner ? (
                  owner.route ? (
                    <Link to={`${owner.route}/${rs.namespace}/${owner.name}`} style={{ color: 'var(--accent)' }}>
                      {owner.kind}/{owner.name}
                    </Link>
                  ) : (
                    <span style={{ color: 'var(--text-tertiary)' }}>{owner.kind}/{owner.name}</span>
                  )
                ) : (
                  <span style={{ color: 'var(--text-disabled)' }}>-</span>
                )}
              </td>
              <td className="tabular">{rs.desired}</td>
              <td className="tabular">{rs.current}</td>
              <td
                className="tabular"
                style={isFailed ? { color: 'var(--red)' } : undefined}
              >
                {rs.ready}
              </td>
              <td>{rs.age}</td>
            </tr>
          )
        }} />
    </div>
  )
}
