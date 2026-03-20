import { useState, useCallback } from 'react'
import { useKubeResources } from '../hooks/useKubeResource'
import { useClusterStore } from '../stores/clusterStore'
import { formatAge } from '../lib/k8sFormatters'
import { RESOURCE_CONFIG } from '../lib/resourceConfig'
import { StatusDot } from '../components/shared/StatusDot'
import { Badge } from '../components/shared/Badge'
import { SearchInput } from '../components/shared/SearchInput'
import { ResourceHeader } from '../components/shared/ResourceHeader'
import { ResourceTable } from '../components/shared/ResourceTable'
import type { Column } from '../components/shared/ResourceTable'
import { CreateJobFromCronJob } from '../wailsjs/go/handlers/ResourceHandler'
import { useToastStore } from '../stores/toastStore'

const columns: Column[] = [
  { key: 'status', label: 'Status', className: 'col-status' },
  { key: 'name', label: 'Name', className: 'col-name' },
  { key: 'namespace', label: 'Namespace', className: 'col-md' },
  { key: 'schedule', label: 'Schedule', className: 'col-md' },
  { key: 'lastSchedule', label: 'Last Schedule', className: 'col-sm' },
  { key: 'active', label: 'Active', className: 'col-sm' },
  { key: 'age', label: 'Age', className: 'col-age' },
  { key: 'actions', label: '', className: 'col-xs' },
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

export function CronJobList() {
  const [filter, setFilter] = useState('')
  const namespace = useClusterStore((s) => s.selectedNamespace)
  const addToast = useToastStore((s) => s.addToast)

  const handleCreateJob = useCallback(async (ns: string, cronJobName: string) => {
    try {
      await CreateJobFromCronJob(ns, cronJobName, '')
      addToast({ type: 'success', title: `Created job from ${cronJobName}` })
    } catch (err) {
      addToast({ type: 'error', title: 'Failed to create job', description: String(err) })
    }
  }, [addToast])
  const cfg = RESOURCE_CONFIG.cronjobs
  const { data: items, isLoading } = useKubeResources({
    group: cfg.group,
    version: cfg.version,
    resource: cfg.plural,
    namespace,
  })

  const cronjobs = items.map((item) => {
    const r = (item.raw || {}) as Record<string, unknown>
    const meta = (r.metadata || {}) as Record<string, unknown>
    const spec = (r.spec || {}) as Record<string, unknown>
    const st = (r.status || {}) as Record<string, unknown>

    const schedule = (spec.schedule as string) || '-'
    const suspend = (spec.suspend as boolean) || false
    const activeJobs = (st.active as unknown[]) || []
    const lastScheduleTime = st.lastScheduleTime as string | undefined

    const isSuspended = suspend === true
    let status: string = isSuspended ? 'suspended' : 'active'

    return {
      name: item.name,
      namespace: item.namespace,
      status,
      schedule,
      lastSchedule: lastScheduleTime ? formatAge(lastScheduleTime) : '-',
      active: activeJobs.length,
      age: formatAge((meta.creationTimestamp as string) || ''),
    }
  })

  const filtered = cronjobs.filter((c) =>
    c.name.toLowerCase().includes(filter.toLowerCase()) ||
    c.namespace.toLowerCase().includes(filter.toLowerCase())
  )

  if (isLoading && items.length === 0) {
    return (
      <div className="resource-view">
        <ResourceHeader title="CronJobs" subtitle="Loading...">
          <SearchInput placeholder="Filter cronjobs..." value={filter} onChange={setFilter} />
        </ResourceHeader>
        <div style={{ padding: 'var(--space-6)', color: 'var(--text-tertiary)' }}>Loading...</div>
      </div>
    )
  }

  return (
    <div className="resource-view">
      <ResourceHeader title="CronJobs" subtitle={`${filtered.length} cronjobs across all namespaces`}>
        <SearchInput placeholder="Filter cronjobs..." value={filter} onChange={setFilter} />
      </ResourceHeader>

      <ResourceTable columns={columns} data={filtered} renderRow={(cj) => {
          const nsProps = getNamespaceStyle(cj.namespace)
          const isSuspended = cj.status === 'suspended'

          return (
            <tr key={`${cj.namespace}/${cj.name}`}>
              <td className="col-status">
                <StatusDot status={isSuspended ? 'progressing' : cj.status} />
              </td>
              <td className="name-cell">{cj.name}</td>
              <td className={nsProps.className} style={nsProps.style}>
                {cj.namespace}
              </td>
              <td className="mono">{cj.schedule}</td>
              <td className="tabular">{cj.lastSchedule}</td>
              <td className="tabular">
                {cj.active > 0 ? (
                  <Badge color="blue">{cj.active}</Badge>
                ) : (
                  cj.active
                )}
              </td>
              <td>{cj.age}</td>
              <td>
                <button
                  className="settings-btn"
                  style={{ fontSize: 'var(--text-2xs)', padding: '1px 6px' }}
                  onClick={() => handleCreateJob(cj.namespace, cj.name)}
                  title={`Create a manual job from ${cj.name}`}
                >
                  Run
                </button>
              </td>
            </tr>
          )
        }} />
    </div>
  )
}
