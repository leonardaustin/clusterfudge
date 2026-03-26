import { useState } from 'react'
import { useKubeResources } from '../hooks/useKubeResource'
import { useClusterStore } from '../stores/clusterStore'
import { RESOURCE_CONFIG } from '../lib/resourceConfig'
import { formatAge } from '../lib/k8sFormatters'
import { StatusDot } from '../components/shared/StatusDot'
import { SearchInput } from '../components/shared/SearchInput'
import { ResourceHeader } from '../components/shared/ResourceHeader'
import { ResourceTable } from '../components/shared/ResourceTable'
import type { Column } from '../components/shared/ResourceTable'

const columns: Column[] = [
  { key: 'status', label: 'Status', className: 'col-status' },
  { key: 'name', label: 'Name', className: 'col-name' },
  { key: 'namespace', label: 'Namespace', className: 'col-md' },
  { key: 'reference', label: 'Reference', className: 'col-md' },
  { key: 'targets', label: 'Targets', className: 'col-md' },
  { key: 'minPods', label: 'Min Pods', className: 'col-sm' },
  { key: 'maxPods', label: 'Max Pods', className: 'col-sm' },
  { key: 'replicas', label: 'Replicas', className: 'col-sm' },
  { key: 'age', label: 'Age', className: 'col-age' },
]

function formatTargets(metrics: Record<string, unknown>[], currentMetrics: Record<string, unknown>[]): string {
  if (!metrics || metrics.length === 0) return '<none>'
  return metrics.map((m: Record<string, unknown>, i: number) => {
    const current = currentMetrics?.[i]
    const resource = (m.resource || {}) as Record<string, unknown>
    if (m.type === 'Resource') {
      const target = (resource.target || {}) as Record<string, unknown>
      const currentResource = (current?.resource || {}) as Record<string, unknown>
      const currentValue = (currentResource.current || {}) as Record<string, unknown>
      if (target.type === 'Utilization') {
        const currentPct = currentValue.averageUtilization ?? '?'
        return `${currentPct}%/${target.averageUtilization}% ${resource.name || ''}`
      }
      if (target.type === 'AverageValue') {
        const currentVal = currentValue.averageValue ?? '?'
        return `${currentVal}/${target.averageValue} ${resource.name || ''}`
      }
    }
    return `${m.type}`
  }).join(', ')
}

function deriveStatus(spec: Record<string, unknown>, status: Record<string, unknown>): 'running' | 'scaling' | 'limited' {
  const replicas = (status.currentReplicas ?? 0) as number
  const max = (spec.maxReplicas ?? 0) as number
  const desired = (status.desiredReplicas ?? 0) as number
  if (replicas >= max && desired >= max) return 'limited'
  if (replicas !== desired) return 'scaling'
  return 'running'
}

export function HPAList() {
  const [filter, setFilter] = useState('')
  const namespace = useClusterStore((s) => s.selectedNamespace)
  const cfg = RESOURCE_CONFIG.horizontalpodautoscalers
  const { data: items, isLoading } = useKubeResources({
    group: cfg.group, version: cfg.version, resource: cfg.plural, namespace,
  })

  const resources = items.map((item) => {
    const r = (item.raw || {}) as Record<string, unknown>
    const spec = (r.spec || {}) as Record<string, unknown>
    const status = (r.status || {}) as Record<string, unknown>
    const ref = (spec.scaleTargetRef || {}) as Record<string, unknown>
    const metadata = (r.metadata || {}) as Record<string, unknown>
    const hpaStatus = deriveStatus(spec, status)
    return {
      name: item.name,
      namespace: item.namespace,
      status: hpaStatus,
      reference: `${ref.kind || ''}/${ref.name || ''}`,
      targets: formatTargets((spec.metrics || []) as Record<string, unknown>[], (status.currentMetrics || []) as Record<string, unknown>[]),
      minPods: (spec.minReplicas ?? 1) as number,
      maxPods: (spec.maxReplicas ?? 0) as number,
      replicas: (status.currentReplicas ?? 0) as number,
      age: formatAge(metadata.creationTimestamp as string | undefined),
    }
  })

  const filtered = resources.filter((h) =>
    h.name.toLowerCase().includes(filter.toLowerCase()) ||
    h.namespace.toLowerCase().includes(filter.toLowerCase())
  )

  if (isLoading && items.length === 0) {
    return (
      <div className="resource-view">
        <ResourceHeader title="Horizontal Pod Autoscalers" subtitle="Loading...">
          <SearchInput placeholder="Filter HPAs..." value={filter} onChange={setFilter} />
        </ResourceHeader>
        <div style={{ padding: 'var(--space-6)', color: 'var(--text-tertiary)' }}>Loading...</div>
      </div>
    )
  }

  return (
    <div className="resource-view">
      <ResourceHeader title="Horizontal Pod Autoscalers" subtitle={`${filtered.length} HPAs`}>
        <SearchInput placeholder="Filter HPAs..." value={filter} onChange={setFilter} />
      </ResourceHeader>

      <ResourceTable columns={columns} data={filtered} renderRow={(hpa) => {
          const isLimited = hpa.status === 'limited'

          return (
            <tr key={`${hpa.namespace}/${hpa.name}`}>
              <td className="col-status">
                <StatusDot status={hpa.status} />
              </td>
              <td className="name-cell">{hpa.name}</td>
              <td>{hpa.namespace}</td>
              <td className="mono">{hpa.reference}</td>
              <td
                className="mono"
                style={isLimited ? { color: 'var(--yellow)' } : undefined}
              >
                {hpa.targets}
              </td>
              <td className="tabular">{hpa.minPods}</td>
              <td className="tabular">{hpa.maxPods}</td>
              <td
                className="tabular"
                style={isLimited ? { color: 'var(--yellow)' } : undefined}
              >
                {hpa.replicas}
              </td>
              <td>{hpa.age}</td>
            </tr>
          )
        }} />
    </div>
  )
}
