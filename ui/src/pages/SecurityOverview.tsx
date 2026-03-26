import { useState, useEffect } from 'react'
import { ResourceHeader } from '../components/shared/ResourceHeader'
import { Badge } from '../components/shared/Badge'
import { SearchInput } from '../components/shared/SearchInput'
import { ResourceTable } from '../components/shared/ResourceTable'
import type { Column } from '../components/shared/ResourceTable'
import { ScanAllPods, type SecurityIssue } from '@/wailsjs/go/handlers/SecurityScanHandler'
import { useToastStore } from '@/stores/toastStore'

function severityColor(severity: string) {
  switch (severity) {
    case 'critical': return 'red' as const
    case 'high': return 'red' as const
    case 'medium': return 'yellow' as const
    case 'low': return 'blue' as const
    default: return 'gray' as const
  }
}

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }

const columns: Column<SecurityIssue>[] = [
  { key: 'severity', label: 'Severity', className: 'col-sm', sortValue: (v) => SEVERITY_ORDER[v.severity] ?? 4 },
  { key: 'category', label: 'Category', className: 'col-md' },
  { key: 'message', label: 'Message', className: 'col-name' },
  { key: 'field', label: 'Field', className: 'col-md' },
]

export function SecurityOverview() {
  const [violations, setViolations] = useState<SecurityIssue[]>([])
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ScanAllPods('')
      .then((result) => setViolations(result.violations ?? []))
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
        useToastStore.getState().addToast({ type: 'error', title: 'Security scan failed', description: msg })
      })
      .finally(() => setLoading(false))
  }, [])

  const filtered = violations.filter((v) =>
    v.message.toLowerCase().includes(filter.toLowerCase()) ||
    v.category.toLowerCase().includes(filter.toLowerCase()) ||
    v.field.toLowerCase().includes(filter.toLowerCase())
  )

  return (
    <div className="resource-view">
      <ResourceHeader title="Security Overview" subtitle={`${violations.length} violations found`}>
        <SearchInput placeholder="Filter violations..." value={filter} onChange={setFilter} />
      </ResourceHeader>

      {loading ? (
        <div style={{ padding: 'var(--space-4)', color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>Scanning pods...</div>
      ) : error ? (
        <div style={{ padding: 'var(--space-4)' }}>
          <div className="card" style={{ padding: 'var(--space-4)', borderColor: 'var(--red)' }}>
            <div style={{ color: 'var(--red)', fontSize: 'var(--text-sm)' }}>Failed to run security scan: {error}</div>
          </div>
        </div>
      ) : violations.length === 0 ? (
        <div style={{ padding: 'var(--space-4)' }}>
          <div className="card" style={{ padding: 'var(--space-4)', textAlign: 'center' }}>
            <div style={{ color: 'var(--green)', fontSize: 'var(--text-sm)', fontWeight: 500 }}>No security violations detected</div>
          </div>
        </div>
      ) : (
        <ResourceTable columns={columns} data={filtered} renderRow={(v, i) => (
          <tr key={i}>
            <td className="col-sm"><Badge color={severityColor(v.severity)}>{v.severity}</Badge></td>
            <td className="col-md">{v.category}</td>
            <td className="col-name">{v.message}</td>
            <td className="col-md mono">{v.field}</td>
          </tr>
        )} />
      )}
    </div>
  )
}
