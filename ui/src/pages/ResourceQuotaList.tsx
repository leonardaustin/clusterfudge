import { useState } from 'react'
import { useKubeResources } from '../hooks/useKubeResource'
import { useClusterStore } from '../stores/clusterStore'
import { RESOURCE_CONFIG } from '../lib/resourceConfig'
import { formatAge } from '../lib/k8sFormatters'
import { SearchInput } from '../components/shared/SearchInput'
import { ResourceHeader } from '../components/shared/ResourceHeader'
import { ResourceTable } from '../components/shared/ResourceTable'
import type { Column } from '../components/shared/ResourceTable'

const columns: Column[] = [
  { key: 'name', label: 'Name', className: 'col-name' },
  { key: 'namespace', label: 'Namespace', className: 'col-md' },
  { key: 'cpu', label: 'CPU (used/hard)', className: 'col-md' },
  { key: 'memory', label: 'Memory (used/hard)', className: 'col-md' },
  { key: 'pods', label: 'Pods (used/hard)', className: 'col-md' },
  { key: 'age', label: 'Age', className: 'col-age' },
]

function percentColor(percent: number): string {
  if (percent >= 90) return 'var(--red)'
  if (percent >= 75) return 'var(--yellow)'
  return 'var(--text-primary)'
}

function safePercent(used: string | undefined, hard: string | undefined): number {
  if (!used || !hard) return 0
  const u = parseFloat(used)
  const h = parseFloat(hard)
  if (h === 0 || isNaN(u) || isNaN(h)) return 0
  return Math.round((u / h) * 100)
}

export function ResourceQuotaList() {
  const [filter, setFilter] = useState('')
  const namespace = useClusterStore((s) => s.selectedNamespace)
  const cfg = RESOURCE_CONFIG.resourcequotas
  const { data: items, isLoading } = useKubeResources({
    group: cfg.group, version: cfg.version, resource: cfg.plural, namespace,
  })

  const resources = items.map((item) => {
    const r = (item.raw || {}) as Record<string, unknown>
    const spec = (r.spec || {}) as Record<string, unknown>
    const statusObj = (r.status || {}) as Record<string, unknown>
    const metadata = (r.metadata || {}) as Record<string, unknown>
    const hard = (spec.hard || {}) as Record<string, string>
    const used = (statusObj.used || {}) as Record<string, string>
    const cpuHard = hard['cpu'] || hard['requests.cpu'] || '-'
    const cpuUsed = used['cpu'] || used['requests.cpu'] || '-'
    const memHard = hard['memory'] || hard['requests.memory'] || '-'
    const memUsed = used['memory'] || used['requests.memory'] || '-'
    const podsHard = hard['pods'] || '-'
    const podsUsed = used['pods'] || '-'
    const cpuPct = safePercent(cpuUsed, cpuHard)
    const memPct = safePercent(memUsed, memHard)
    const podsPct = safePercent(podsUsed, podsHard)
    return {
      name: item.name,
      namespace: item.namespace,
      cpuHard, cpuUsed, cpuPercent: cpuPct,
      memoryHard: memHard, memoryUsed: memUsed, memoryPercent: memPct,
      podsHard, podsUsed, podsPercent: podsPct,
      age: formatAge(metadata.creationTimestamp as string | undefined),
    }
  })

  const filtered = resources.filter((rq) =>
    rq.name.toLowerCase().includes(filter.toLowerCase()) ||
    rq.namespace.toLowerCase().includes(filter.toLowerCase())
  )

  if (isLoading && items.length === 0) {
    return (
      <div className="resource-view">
        <ResourceHeader title="Resource Quotas" subtitle="Loading...">
          <SearchInput placeholder="Filter resource quotas..." value={filter} onChange={setFilter} />
        </ResourceHeader>
        <div style={{ padding: 'var(--space-6)', color: 'var(--text-tertiary)' }}>Loading...</div>
      </div>
    )
  }

  return (
    <div className="resource-view">
      <ResourceHeader title="Resource Quotas" subtitle={`${filtered.length} resource quotas`}>
        <SearchInput placeholder="Filter resource quotas..." value={filter} onChange={setFilter} />
      </ResourceHeader>

      <ResourceTable columns={columns} data={filtered} renderRow={(rq) => (
          <tr key={`${rq.namespace}/${rq.name}`}>
            <td className="name-cell">{rq.name}</td>
            <td>{rq.namespace}</td>
            <td className="mono" style={{ color: percentColor(rq.cpuPercent) }}>
              {rq.cpuUsed} / {rq.cpuHard} ({rq.cpuPercent}%)
            </td>
            <td className="mono" style={{ color: percentColor(rq.memoryPercent) }}>
              {rq.memoryUsed} / {rq.memoryHard} ({rq.memoryPercent}%)
            </td>
            <td className="mono" style={{ color: percentColor(rq.podsPercent) }}>
              {rq.podsUsed} / {rq.podsHard} ({rq.podsPercent}%)
            </td>
            <td>{rq.age}</td>
          </tr>
        )} />
    </div>
  )
}
