import { useState, useEffect } from 'react'
import { ResourceHeader } from '../components/shared/ResourceHeader'
import { Badge } from '../components/shared/Badge'
import { SearchInput } from '../components/shared/SearchInput'
import { ResourceTable } from '../components/shared/ResourceTable'
import type { Column } from '../components/shared/ResourceTable'
import { ListAlerts, AcknowledgeAlert, type Alert } from '@/wailsjs/go/handlers/AlertHandler'
import { useToastStore } from '@/stores/toastStore'

const columns: Column[] = [
  { key: 'severity', label: 'Severity', className: 'col-sm' },
  { key: 'title', label: 'Title', className: 'col-name' },
  { key: 'resource', label: 'Resource', className: 'col-md' },
  { key: 'namespace', label: 'Namespace', className: 'col-md' },
  { key: 'timestamp', label: 'Time', className: 'col-age' },
  { key: 'actions', label: '', className: 'col-sm' },
]

function severityColor(severity: string) {
  switch (severity) {
    case 'critical': return 'red' as const
    case 'warning': return 'yellow' as const
    case 'info': return 'blue' as const
    default: return 'gray' as const
  }
}

export function Alerts() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [filter, setFilter] = useState('')
  const [severityFilter, setSeverityFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      try {
        const alerts = await ListAlerts()
        if (active) setAlerts(alerts)
      } catch (err) {
        if (active) {
          const msg = err instanceof Error ? err.message : String(err)
          setError(msg)
          useToastStore.getState().addToast({ type: 'error', title: 'Failed to load alerts', description: msg })
        }
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  const handleAck = async (id: string) => {
    try {
      await AcknowledgeAlert(id)
      setAlerts((prev) => prev.map((a) => a.id === id ? { ...a, acknowledged: true } : a))
    } catch (err) {
      useToastStore.getState().addToast({ type: 'error', title: 'Failed to acknowledge alert', description: err instanceof Error ? err.message : String(err) })
    }
  }

  const filtered = alerts
    .filter((a) => severityFilter === 'all' || a.severity === severityFilter)
    .filter((a) =>
      a.title.toLowerCase().includes(filter.toLowerCase()) ||
      a.resource.toLowerCase().includes(filter.toLowerCase())
    )

  const activeCount = alerts.filter((a) => !a.acknowledged).length

  return (
    <div className="resource-view">
      <ResourceHeader title="Alerts" subtitle={`${activeCount} active alerts`}>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <select className="settings-input" value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} style={{ width: '120px' }}>
            <option value="all">All</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </select>
          <SearchInput placeholder="Filter alerts..." value={filter} onChange={setFilter} />
        </div>
      </ResourceHeader>

      {loading && (
        <div style={{ padding: 'var(--space-3)', marginBottom: 'var(--space-3)', color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>
          Loading alerts...
        </div>
      )}

      {error && (
        <div style={{ padding: 'var(--space-3)', marginBottom: 'var(--space-3)', color: 'var(--red)', fontSize: 'var(--text-sm)' }}>
          Failed to load alerts: {error}
        </div>
      )}

      {!loading && <ResourceTable columns={columns} data={filtered} renderRow={(alert) => (
          <tr key={alert.id} style={{ opacity: alert.acknowledged ? 0.5 : 1 }}>
            <td className="col-sm">
              <Badge color={severityColor(alert.severity)}>{alert.severity}</Badge>
            </td>
            <td className="col-name">{alert.title}</td>
            <td className="col-md mono">{alert.resource}</td>
            <td className="col-md">{alert.namespace}</td>
            <td className="col-age">{alert.timestamp}</td>
            <td className="col-sm">
              {!alert.acknowledged && (
                <button className="settings-btn" style={{ fontSize: 'var(--text-xs)' }} onClick={() => handleAck(alert.id)}>Ack</button>
              )}
            </td>
          </tr>
        )} />}
    </div>
  )
}
