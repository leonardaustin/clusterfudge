import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useKubeResources } from '../hooks/useKubeResource'
import { useClusterStore } from '../stores/clusterStore'
import { formatAge, strategyColor } from '../lib/k8sFormatters'
import { RESOURCE_CONFIG } from '../lib/resourceConfig'
import { StatusDot } from '../components/shared/StatusDot'
import { Badge } from '../components/shared/Badge'
import { SearchInput } from '../components/shared/SearchInput'
import { ResourceHeader } from '../components/shared/ResourceHeader'
import { ResourceTable } from '../components/shared/ResourceTable'
import type { Column } from '../components/shared/ResourceTable'

const columns: Column[] = [
  { key: 'status', label: 'Status', className: 'col-status' },
  { key: 'name', label: 'Name', className: 'col-name' },
  { key: 'namespace', label: 'Namespace', className: 'col-md' },
  { key: 'ready', label: 'Ready', className: 'col-sm' },
  { key: 'upToDate', label: 'Up-to-date', className: 'col-sm' },
  { key: 'available', label: 'Available', className: 'col-sm' },
  { key: 'strategy', label: 'Strategy', className: 'col-md' },
  { key: 'images', label: 'Images', className: 'col-md' },
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

export function DeploymentList() {
  const [filter, setFilter] = useState('')
  const namespace = useClusterStore((s) => s.selectedNamespace)
  const cfg = RESOURCE_CONFIG.deployments
  const { data: items, isLoading } = useKubeResources({
    group: cfg.group,
    version: cfg.version,
    resource: cfg.plural,
    namespace,
  })

  const deployments = items.map((item) => {
    const r = (item.raw || {}) as Record<string, unknown>
    const meta = (r.metadata || {}) as Record<string, unknown>
    const spec = (r.spec || {}) as Record<string, unknown>
    const st = (r.status || {}) as Record<string, unknown>
    const strategyObj = (spec.strategy || {}) as Record<string, unknown>
    const templateSpec = ((spec.template as Record<string, unknown>)?.spec || {}) as Record<string, unknown>
    const containers = (templateSpec.containers || []) as Array<Record<string, unknown>>

    const desired = (spec.replicas as number) || 0
    const ready = (st.readyReplicas as number) || 0
    const upToDate = (st.updatedReplicas as number) || 0
    const available = (st.availableReplicas as number) || 0
    const strategy = (strategyObj.type as string) || 'RollingUpdate'
    const images = containers.map((c) => c.image as string).join(', ')

    let status: string = 'running'
    if (ready < desired) status = ready === 0 ? 'failed' : 'progressing'

    return {
      name: item.name,
      namespace: item.namespace,
      status,
      ready: `${ready}/${desired}`,
      upToDate,
      available,
      strategy,
      strategyBadgeColor: strategyColor(strategy),
      images,
      age: formatAge((meta.creationTimestamp as string) || ''),
    }
  })

  const filtered = deployments.filter((d) =>
    d.name.toLowerCase().includes(filter.toLowerCase()) ||
    d.namespace.toLowerCase().includes(filter.toLowerCase())
  )

  if (isLoading && items.length === 0) {
    return (
      <div className="resource-view">
        <ResourceHeader title="Deployments" subtitle="Loading...">
          <SearchInput placeholder="Filter deployments..." value={filter} onChange={setFilter} />
        </ResourceHeader>
        <div style={{ padding: 'var(--space-6)', color: 'var(--text-tertiary)' }}>Loading...</div>
      </div>
    )
  }

  return (
    <div className="resource-view">
      <ResourceHeader title="Deployments" subtitle={`${filtered.length} deployments across all namespaces`}>
        <SearchInput placeholder="Filter deployments..." value={filter} onChange={setFilter} />
      </ResourceHeader>

      <ResourceTable columns={columns} data={filtered} renderRow={(dep) => {
          const nsProps = getNamespaceStyle(dep.namespace)
          const isFailed = dep.status === 'failed'

          return (
            <tr key={`${dep.namespace}/${dep.name}`}>
              <td className="col-status">
                <StatusDot status={dep.status} />
              </td>
              <td className="name-cell">
                <Link to={`/workloads/deployments/${dep.namespace}/${dep.name}`}>{dep.name}</Link>
              </td>
              <td className={nsProps.className} style={nsProps.style}>
                {dep.namespace}
              </td>
              <td
                className="tabular"
                style={isFailed ? { color: 'var(--red)' } : undefined}
              >
                {dep.ready}
              </td>
              <td className="tabular">{dep.upToDate}</td>
              <td
                className="tabular"
                style={isFailed ? { color: 'var(--red)' } : undefined}
              >
                {dep.available}
              </td>
              <td>
                <Badge color={dep.strategyBadgeColor}>{dep.strategy}</Badge>
              </td>
              <td className="mono">{dep.images}</td>
              <td>{dep.age}</td>
            </tr>
          )
        }} />
    </div>
  )
}
