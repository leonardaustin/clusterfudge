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
  { key: 'completions', label: 'Completions', className: 'col-sm' },
  { key: 'duration', label: 'Duration', className: 'col-sm' },
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

function computeDuration(startTime?: string, completionTime?: string): string {
  if (!startTime) return '-'
  const start = new Date(startTime).getTime()
  const end = completionTime ? new Date(completionTime).getTime() : Date.now()
  const seconds = Math.floor((end - start) / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return `${hours}h${minutes % 60}m`
}

export function JobList() {
  const [filter, setFilter] = useState('')
  const namespace = useClusterStore((s) => s.selectedNamespace)
  const cfg = RESOURCE_CONFIG.jobs
  const { data: items, isLoading } = useKubeResources({
    group: cfg.group,
    version: cfg.version,
    resource: cfg.plural,
    namespace,
  })

  const jobs = items.map((item) => {
    const r = (item.raw || {}) as Record<string, unknown>
    const meta = (r.metadata || {}) as Record<string, unknown>
    const spec = (r.spec || {}) as Record<string, unknown>
    const st = (r.status || {}) as Record<string, unknown>
    const ownerRefs = (meta.ownerReferences || []) as Array<{ kind: string; name: string; uid: string }>

    const desired = (spec.completions as number) || 1
    const succeeded = (st.succeeded as number) || 0
    const conditions = (st.conditions || []) as Array<Record<string, unknown>>
    const isFailed = conditions.some((c) => c.type === 'Failed' && c.status === 'True')
    const isComplete = conditions.some((c) => c.type === 'Complete' && c.status === 'True')

    let status: string = 'running'
    if (isComplete) status = 'complete'
    else if (isFailed) status = 'failed'

    const duration = computeDuration(
      st.startTime as string | undefined,
      st.completionTime as string | undefined,
    )

    return {
      name: item.name,
      namespace: item.namespace,
      status,
      completions: `${succeeded}/${desired}`,
      duration,
      age: formatAge((meta.creationTimestamp as string) || ''),
      ownerReferences: ownerRefs,
    }
  })

  const filtered = jobs.filter((j) =>
    j.name.toLowerCase().includes(filter.toLowerCase()) ||
    j.namespace.toLowerCase().includes(filter.toLowerCase())
  )

  if (isLoading && items.length === 0) {
    return (
      <div className="resource-view">
        <ResourceHeader title="Jobs" subtitle="Loading...">
          <SearchInput placeholder="Filter jobs..." value={filter} onChange={setFilter} />
        </ResourceHeader>
        <div style={{ padding: 'var(--space-6)', color: 'var(--text-tertiary)' }}>Loading...</div>
      </div>
    )
  }

  return (
    <div className="resource-view">
      <ResourceHeader title="Jobs" subtitle={`${filtered.length} jobs across all namespaces`}>
        <SearchInput placeholder="Filter jobs..." value={filter} onChange={setFilter} />
      </ResourceHeader>

      <ResourceTable columns={columns} data={filtered} renderRow={(job) => {
          const nsProps = getNamespaceStyle(job.namespace)
          const isFailed = job.status === 'failed'
          const owner = getOwner(job.ownerReferences)

          return (
            <tr key={`${job.namespace}/${job.name}`}>
              <td className="col-status">
                <StatusDot status={job.status} />
              </td>
              <td className="name-cell">{job.name}</td>
              <td className={nsProps.className} style={nsProps.style}>
                {job.namespace}
              </td>
              <td>
                {owner ? (
                  owner.route ? (
                    <Link to={`${owner.route}/${job.namespace}/${owner.name}`} style={{ color: 'var(--accent)' }}>
                      {owner.kind}/{owner.name}
                    </Link>
                  ) : (
                    <span style={{ color: 'var(--text-tertiary)' }}>{owner.kind}/{owner.name}</span>
                  )
                ) : (
                  <span style={{ color: 'var(--text-disabled)' }}>-</span>
                )}
              </td>
              <td
                className="tabular"
                style={isFailed ? { color: 'var(--red)' } : undefined}
              >
                {job.completions}
              </td>
              <td className="tabular">{job.duration}</td>
              <td>{job.age}</td>
            </tr>
          )
        }} />
    </div>
  )
}
