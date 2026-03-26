import { useState, useEffect, useRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { ResourceHeader } from '../components/shared/ResourceHeader'
import { SearchInput } from '../components/shared/SearchInput'
import { ResourceTable } from '../components/shared/ResourceTable'
import type { Column } from '../components/shared/ResourceTable'
import { BuildClusterRBACGraph, type BindingEdge } from '@/wailsjs/go/handlers/RBACHandler'
import { useToastStore } from '@/stores/toastStore'

const columns: Column[] = [
  { key: 'subjectKind', label: 'Subject Kind', className: 'col-sm' },
  { key: 'subjectName', label: 'Subject', className: 'col-name' },
  { key: 'bindingName', label: 'Binding', className: 'col-md' },
  { key: 'roleName', label: 'Role', className: 'col-md' },
  { key: 'roleKind', label: 'Role Kind', className: 'col-sm' },
  { key: 'namespace', label: 'Namespace', className: 'col-md' },
]

const SUBJECT_KINDS = [
  { value: 'all', label: 'All Kinds' },
  { value: 'User', label: 'User' },
  { value: 'Group', label: 'Group' },
  { value: 'ServiceAccount', label: 'ServiceAccount' },
]

function SubjectKindSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const current = SUBJECT_KINDS.find((k) => k.value === value)?.label ?? value

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-border hover:border-border-strong text-text-secondary hover:text-text-primary bg-bg-tertiary transition-colors"
        style={{ width: '140px', justifyContent: 'space-between' }}
      >
        <span>{current}</span>
        <ChevronDown className="w-3 h-3 opacity-50" style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 150ms' }} />
      </button>
      {open && (
        <div
          className="bg-bg-tertiary border border-border rounded-md shadow-popover"
          style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, marginTop: '2px', overflow: 'hidden' }}
        >
          {SUBJECT_KINDS.map((k) => (
            <button
              key={k.value}
              onClick={() => { onChange(k.value); setOpen(false) }}
              className="flex items-center gap-2 px-2 py-1.5 text-xs rounded cursor-default hover:bg-bg-hover transition-colors w-full text-left"
              style={{ color: k.value === value ? 'var(--accent)' : undefined, border: 'none', background: 'transparent' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {k.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function RBACGraph() {
  const [bindings, setBindings] = useState<BindingEdge[]>([])
  const [filter, setFilter] = useState('')
  const [nsFilter, setNsFilter] = useState('')
  const [kindFilter, setKindFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    BuildClusterRBACGraph()
      .then((graph) => setBindings(graph.bindings ?? []))
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
        useToastStore.getState().addToast({ type: 'error', title: 'Failed to build RBAC graph', description: msg })
      })
      .finally(() => setLoading(false))
  }, [])

  const filtered = bindings
    .filter((e) => kindFilter === 'all' || e.subject.kind === kindFilter)
    .filter((e) => !nsFilter || (e.namespace ?? '').includes(nsFilter))
    .filter((e) => {
      const q = filter.toLowerCase()
      return (
        e.subject.name.toLowerCase().includes(q) ||
        e.roleName.toLowerCase().includes(q) ||
        e.bindingName.toLowerCase().includes(q)
      )
    })

  return (
    <div className="resource-view">
      <ResourceHeader title="RBAC Graph" subtitle={`${bindings.length} bindings`}>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <SubjectKindSelector value={kindFilter} onChange={setKindFilter} />
          <label htmlFor="rbac-ns-filter" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>Namespace</span>
            <input id="rbac-ns-filter" className="settings-input" placeholder="Namespace" value={nsFilter} onChange={(e) => setNsFilter(e.target.value)} style={{ width: '120px' }} />
          </label>
          <SearchInput placeholder="Search..." value={filter} onChange={setFilter} />
        </div>
      </ResourceHeader>

      {loading ? (
        <div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>Building RBAC graph...</div>
      ) : error ? (
        <div style={{ padding: 'var(--space-4)', color: 'var(--red)', fontSize: 'var(--text-sm)' }}>
          Failed to load RBAC data: {error}
        </div>
      ) : (
        <ResourceTable columns={columns} data={filtered} renderRow={(edge, i) => (
            <tr key={i}>
              <td className="col-sm">{edge.subject.kind}</td>
              <td className="col-name mono">{edge.subject.name}</td>
              <td className="col-md mono">{edge.bindingName}</td>
              <td className="col-md mono">{edge.roleName}</td>
              <td className="col-sm">{edge.roleKind}</td>
              <td className="col-md">{edge.namespace || '(cluster)'}</td>
            </tr>
          )} />
      )}
    </div>
  )
}
