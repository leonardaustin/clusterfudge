import { useState, useEffect } from 'react'
import { ResourceHeader } from '../components/shared/ResourceHeader'
import { SearchInput } from '../components/shared/SearchInput'
import { ResourceTable } from '../components/shared/ResourceTable'
import type { Column } from '../components/shared/ResourceTable'
import { GetAuditLog, type AuditEntry } from '@/wailsjs/go/handlers/AuditHandler'
import { useToastStore } from '@/stores/toastStore'

const columns: Column[] = [
  { key: 'timestamp', label: 'Timestamp', className: 'col-md' },
  { key: 'action', label: 'Action', className: 'col-sm' },
  { key: 'kind', label: 'Kind', className: 'col-sm' },
  { key: 'name', label: 'Name', className: 'col-name' },
  { key: 'namespace', label: 'Namespace', className: 'col-md' },
  { key: 'user', label: 'User', className: 'col-md' },
  { key: 'detail', label: 'Detail', className: 'col-md' },
]

export function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [filter, setFilter] = useState('')
  const [kindFilter, setKindFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const filterMap: Record<string, string> = {}
    if (kindFilter) filterMap.kind = kindFilter
    if (actionFilter) filterMap.action = actionFilter
    ;(async () => {
      setError(null)
      setLoading(true)
      try {
        const entries = await GetAuditLog(filterMap)
        if (active) setEntries(entries)
      } catch (err) {
        if (active) {
          const msg = err instanceof Error ? err.message : String(err)
          setError(msg)
          useToastStore.getState().addToast({ type: 'error', title: 'Failed to load audit log', description: msg })
        }
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [kindFilter, actionFilter])

  const filtered = entries.filter((e) =>
    e.name.toLowerCase().includes(filter.toLowerCase()) ||
    e.namespace.toLowerCase().includes(filter.toLowerCase()) ||
    e.detail.toLowerCase().includes(filter.toLowerCase())
  )

  return (
    <div className="resource-view">
      <ResourceHeader title="Audit Log" subtitle={`${entries.length} entries`}>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <label htmlFor="audit-kind-filter" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>Kind</span>
            <input id="audit-kind-filter" className="settings-input" placeholder="Kind" value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} style={{ width: '100px' }} />
          </label>
          <label htmlFor="audit-action-filter" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>Action</span>
            <input id="audit-action-filter" className="settings-input" placeholder="Action" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} style={{ width: '100px' }} />
          </label>
          <SearchInput placeholder="Search..." value={filter} onChange={setFilter} />
        </div>
      </ResourceHeader>

      {error && (
        <div style={{ padding: 'var(--space-3)', marginBottom: 'var(--space-3)', color: 'var(--red)', fontSize: 'var(--text-sm)' }}>
          Failed to load audit log: {error}
        </div>
      )}

      {loading && entries.length === 0 && (
        <div style={{ padding: 'var(--space-4)', color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>Loading audit log...</div>
      )}

      <ResourceTable columns={columns} data={filtered} renderRow={(entry) => (
          <tr key={entry.id}>
            <td className="col-md" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>{entry.timestamp}</td>
            <td className="col-sm">{entry.action}</td>
            <td className="col-sm">{entry.kind}</td>
            <td className="col-name mono">{entry.name}</td>
            <td className="col-md">{entry.namespace}</td>
            <td className="col-md">{entry.user}</td>
            <td className="col-md" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>{entry.detail}</td>
          </tr>
        )} />
    </div>
  )
}
