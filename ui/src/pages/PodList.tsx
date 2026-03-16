import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useKubeResources } from '../hooks/useKubeResource'
import { usePodMetrics } from '../hooks/usePodMetrics'
import { useClusterStore } from '../stores/clusterStore'
import { resolveTopOwnerFromRaw } from '../data/ownerRefs'
import { formatAge, parseCpu, parseMemoryMiB } from '../lib/k8sFormatters'
import { RESOURCE_CONFIG } from '../lib/resourceConfig'
import { StatusDot } from '../components/shared/StatusDot'
import { SearchInput } from '../components/shared/SearchInput'
import { ResourceHeader } from '../components/shared/ResourceHeader'
import { ResourceTable } from '../components/shared/ResourceTable'
import type { Column } from '../components/shared/ResourceTable'
import type { BarColor } from '../data/types'

const columns: Column[] = [
  { key: 'status', label: 'Status', className: 'col-status' },
  { key: 'name', label: 'Name', className: 'col-name' },
  { key: 'namespace', label: 'Namespace', className: 'col-md' },
  { key: 'owner', label: 'Owner', className: 'col-md' },
  { key: 'ready', label: 'Ready', className: 'col-xs' },
  { key: 'restarts', label: 'Restarts', className: 'col-sm' },
  { key: 'cpu', label: 'CPU', className: 'col-md' },
  { key: 'memory', label: 'Memory', className: 'col-md' },
  { key: 'node', label: 'Node', className: 'col-md' },
  { key: 'age', label: 'Age', className: 'col-age' },
]

function getNamespaceStyle(ns: string): { className?: string; style?: React.CSSProperties } {
  switch (ns) {
    case 'kube-system':
      return { className: 'mono', style: { color: 'var(--purple)' } }
    case 'monitoring':
      return { className: 'mono', style: { color: 'var(--blue)' } }
    default:
      return {}
  }
}

function getBarColor(percent: number): BarColor {
  if (percent >= 80) return 'red'
  if (percent >= 50) return 'yellow'
  return 'green'
}

function InlineMetricBar({ usage, limit, label }: { usage?: number; limit?: number; label: string }) {
  if (usage == null) {
    return <span style={{ color: 'var(--text-disabled)' }}>-</span>
  }
  const percent = limit && limit > 0 ? Math.min(Math.round((usage / limit) * 100), 100) : 0
  const color = getBarColor(percent)
  const display = label === 'cpu' ? `${usage}m` : `${usage}Mi`

  return (
    <div style={{ minWidth: '80px' }}>
      <div style={{ fontSize: 'var(--text-xs)', marginBottom: '2px' }}>
        <span className="tabular">{display}</span>
        {limit != null && limit > 0 && (
          <span style={{ color: 'var(--text-disabled)', marginLeft: '4px' }}>
            / {label === 'cpu' ? `${limit}m` : `${limit}Mi`}
          </span>
        )}
      </div>
      {limit != null && limit > 0 && (
        <div className="metric-bar" style={{ height: '3px', marginTop: 0 }}>
          <div className={`metric-bar-fill ${color}`} style={{ width: `${percent}%` }} />
        </div>
      )}
    </div>
  )
}

export function PodList() {
  const [filter, setFilter] = useState('')
  const namespace = useClusterStore((s) => s.selectedNamespace)
  const podCfg = RESOURCE_CONFIG.pods
  const { data: items, isLoading } = useKubeResources({
    group: podCfg.group,
    version: podCfg.version,
    resource: podCfg.plural,
    namespace,
  })
  const { metrics } = usePodMetrics(namespace)

  // Also fetch replicasets for owner resolution
  const rsCfg = RESOURCE_CONFIG.replicasets
  const { data: rsItems } = useKubeResources({
    group: rsCfg.group,
    version: rsCfg.version,
    resource: rsCfg.plural,
    namespace,
  })

  // Transform ResourceItem[] to display format
  const pods = items.map((item) => {
    const r = (item.raw || {}) as Record<string, unknown>
    const meta = (r.metadata || {}) as Record<string, unknown>
    const spec = (r.spec || {}) as Record<string, unknown>
    const st = (r.status || {}) as Record<string, unknown>
    const containerStatuses = (st.containerStatuses || []) as Array<Record<string, unknown>>
    const containers = (spec.containers || []) as Array<Record<string, unknown>>

    const phase = (st.phase as string) || 'Unknown'
    const readyCount = containerStatuses.filter((c) => c.ready === true).length
    const totalContainers = containers.length
    const restarts = containerStatuses.reduce((sum, c) => sum + ((c.restartCount as number) || 0), 0)
    const node = (spec.nodeName as string) || '<none>'
    const ownerRefs = (meta.ownerReferences || []) as Array<{ kind: string; name: string }>

    // CPU/memory limits from container specs
    const cpuLimit = containers.reduce((sum, c) => {
      const res = (c.resources || {}) as Record<string, unknown>
      const limits = (res.limits || {}) as Record<string, unknown>
      return sum + parseCpu(limits.cpu)
    }, 0)
    const memLimit = containers.reduce((sum, c) => {
      const res = (c.resources || {}) as Record<string, unknown>
      const limits = (res.limits || {}) as Record<string, unknown>
      return sum + parseMemoryMiB(limits.memory)
    }, 0)

    // Metrics from metrics-server
    const podMetric = metrics.get(`${item.namespace}/${item.name}`)
    const cpuUsage = podMetric ? Math.round(podMetric.cpuCores * 1000) : undefined
    const memoryUsage = podMetric ? Math.round(podMetric.memoryMiB) : undefined

    // Map phase to status dot — check waiting reason for CrashLoopBackOff etc.
    let status: string = phase
    for (const cs of containerStatuses) {
      const state = (cs.state || {}) as Record<string, unknown>
      const waiting = state.waiting as Record<string, unknown> | undefined
      if (waiting?.reason) {
        status = waiting.reason as string
        break
      }
    }

    return {
      name: item.name,
      namespace: item.namespace,
      status,
      ready: `${readyCount}/${totalContainers}`,
      restarts,
      node,
      age: formatAge((meta.creationTimestamp as string) || ''),
      cpuUsage,
      cpuLimit: cpuLimit || undefined,
      memoryUsage,
      memLimit: memLimit || undefined,
      ownerReferences: ownerRefs,
    }
  })

  const filtered = pods.filter((p) =>
    p.name.toLowerCase().includes(filter.toLowerCase()) ||
    p.namespace.toLowerCase().includes(filter.toLowerCase())
  )

  if (isLoading && items.length === 0) {
    return (
      <div className="resource-view">
        <ResourceHeader title="Pods" subtitle="Loading...">
          <SearchInput placeholder="Filter pods..." value={filter} onChange={setFilter} />
        </ResourceHeader>
        <div style={{ padding: 'var(--space-6)', color: 'var(--text-tertiary)' }}>Loading...</div>
      </div>
    )
  }

  return (
    <div className="resource-view">
      <ResourceHeader title="Pods" subtitle={`${filtered.length} pods across all namespaces`}>
        <SearchInput placeholder="Filter pods..." value={filter} onChange={setFilter} />
      </ResourceHeader>

      <ResourceTable columns={columns} data={filtered} renderRow={(pod) => {
          const nsProps = getNamespaceStyle(pod.namespace)
          const isDisabledNode = pod.node === '<none>'
          const owner = resolveTopOwnerFromRaw(pod.ownerReferences, rsItems)

          return (
            <tr key={`${pod.namespace}/${pod.name}`}>
              <td className="col-status">
                <StatusDot status={pod.status} />
              </td>
              <td className="name-cell">
                <Link to={`/workloads/pods/${pod.namespace}/${pod.name}`}>{pod.name}</Link>
              </td>
              <td className={nsProps.className} style={nsProps.style}>
                {pod.namespace}
              </td>
              <td>
                {owner ? (
                  owner.route ? (
                    <Link to={`${owner.route}/${pod.namespace}/${owner.name}`} style={{ color: 'var(--accent)' }}>
                      {owner.kind}/{owner.name}
                    </Link>
                  ) : (
                    <span style={{ color: 'var(--text-tertiary)' }}>{owner.kind}/{owner.name}</span>
                  )
                ) : (
                  <span style={{ color: 'var(--text-disabled)' }}>-</span>
                )}
              </td>
              <td className="tabular">{pod.ready}</td>
              <td className={`tabular${pod.restarts > 0 ? ' restarts-warn' : ''}`}>
                {pod.restarts}
              </td>
              <td>
                <InlineMetricBar usage={pod.cpuUsage} limit={pod.cpuLimit} label="cpu" />
              </td>
              <td>
                <InlineMetricBar usage={pod.memoryUsage} limit={pod.memLimit} label="memory" />
              </td>
              <td style={isDisabledNode ? { color: 'var(--text-disabled)' } : undefined}>
                {pod.node}
              </td>
              <td>{pod.age}</td>
            </tr>
          )
        }} />
    </div>
  )
}
