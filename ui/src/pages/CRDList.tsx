import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { X, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useKubeResources } from '../hooks/useKubeResource'
import { RESOURCE_CONFIG } from '../lib/resourceConfig'
import { formatAge, creationTimestamp } from '../lib/k8sFormatters'
import { SearchInput } from '../components/shared/SearchInput'
import { ResourceHeader } from '../components/shared/ResourceHeader'
import { ResourceTable } from '../components/shared/ResourceTable'
import type { Column } from '../components/shared/ResourceTable'
import { ListResources } from '../wailsjs/go/handlers/ResourceHandler'
import type { ResourceItem } from '../wailsjs/go/handlers/ResourceHandler'
import { useClusterStore } from '../stores/clusterStore'
import { useUIStore } from '@/stores/uiStore'
import { CodeBlock } from '@/components/shared/CodeBlock'

// ─── CRD Info ────────────────────────────────────────────────────────────────

interface CRDRow {
  name: string
  group: string
  kind: string
  plural: string
  scope: string
  versions: string
  versionsArr: string[]
  established: boolean
  namesAccepted: boolean
  age: string
  schema: Record<string, unknown> | null
  raw: Record<string, unknown>
}

function getConditionStatus(conditions: Record<string, unknown>[], type: string): boolean {
  if (!conditions) return false
  const cond = conditions.find((c: Record<string, unknown>) => c.type === type)
  return cond?.status === 'True'
}

function extractPrimarySchema(versionsArr: Record<string, unknown>[]): Record<string, unknown> | null {
  for (const v of versionsArr) {
    if (v.storage === true && v.served !== false) {
      const vSchema = (v.schema || {}) as Record<string, unknown>
      return (vSchema.openAPIV3Schema || null) as Record<string, unknown> | null
    }
  }
  if (versionsArr.length > 0) {
    const vSchema = (versionsArr[0].schema || {}) as Record<string, unknown>
    return (vSchema.openAPIV3Schema || null) as Record<string, unknown> | null
  }
  return null
}

function extractPrimaryVersion(versionsArr: Record<string, unknown>[]): string {
  for (const v of versionsArr) {
    if (v.storage === true && v.served !== false) return v.name as string
  }
  return versionsArr.length > 0 ? (versionsArr[0].name as string) : ''
}

// ─── List columns ────────────────────────────────────────────────────────────

const columns: Column[] = [
  { key: 'name', label: 'Name', className: 'col-name' },
  { key: 'group', label: 'Group', className: 'col-md' },
  { key: 'kind', label: 'Kind', className: 'col-md' },
  { key: 'scope', label: 'Scope', className: 'col-sm' },
  { key: 'versions', label: 'Versions', className: 'col-sm' },
  { key: 'established', label: 'Established', className: 'col-sm' },
  { key: 'age', label: 'Age', className: 'col-age' },
]

// ─── Detail panel ────────────────────────────────────────────────────────────

const DETAIL_TABS = ['Overview', 'Instances', 'Schema'] as const
type DetailTab = (typeof DETAIL_TABS)[number]

const MIN_WIDTH = 360
const MAX_WIDTH = 900

function CRDDetailPanel({ crd, onClose }: { crd: CRDRow; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<DetailTab>('Overview')
  const { detailPanelWidth, setDetailPanelWidth } = useUIStore()
  const selectedNamespace = useClusterStore((s) => s.selectedNamespace)

  const [instances, setInstances] = useState<ResourceItem[]>([])
  const [instancesLoading, setInstancesLoading] = useState(false)
  const [instancesError, setInstancesError] = useState<string | null>(null)

  // Reset tab when CRD changes
  const prevName = useRef(crd.name)
  useEffect(() => {
    if (crd.name !== prevName.current) {
      setActiveTab('Overview')
      setInstances([])
    }
    prevName.current = crd.name
  }, [crd.name])

  // Close on Escape
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Resize
  const dragging = useRef(false)
  const lastX = useRef(0)
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    lastX.current = e.clientX
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const dx = lastX.current - e.clientX
      lastX.current = e.clientX
      setDetailPanelWidth((prev: number) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, prev + dx)))
    }
    const onMouseUp = () => {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [setDetailPanelWidth])

  // Load instances when tab is selected
  useEffect(() => {
    if (activeTab !== 'Instances') return
    let cancelled = false
    ;(async () => {
      setInstancesLoading(true)
      setInstancesError(null)
      const version = extractPrimaryVersion(
        ((crd.raw.spec as Record<string, unknown>)?.versions || []) as Record<string, unknown>[]
      )
      const ns = crd.scope === 'Namespaced' ? (selectedNamespace || '') : ''
      try {
        const items = await ListResources(crd.group, version, crd.plural, ns)
        if (!cancelled) {
          setInstances(items ?? [])
          setInstancesLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setInstancesError(String(err))
          setInstancesLoading(false)
        }
      }
    })()
    return () => { cancelled = true }
  }, [activeTab, crd.group, crd.plural, crd.scope, crd.raw, selectedNamespace])

  return (
    <div
      style={{ width: detailPanelWidth, minWidth: MIN_WIDTH, maxWidth: MAX_WIDTH }}
      className="relative border-l border-border bg-bg-primary flex flex-col animate-in slide-in-from-right duration-150 shrink-0"
    >
      {/* Resize handle */}
      <div
        onMouseDown={onMouseDown}
        className={cn(
          'absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-10',
          'hover:bg-accent transition-colors duration-150 delay-150',
          'group'
        )}
      >
        <div className="absolute left-0 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
          <GripVertical className="w-3 h-3 text-text-tertiary" />
        </div>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between px-4 py-3 border-b border-border">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-text-primary truncate">{crd.kind}</h2>
          <p className="text-xs text-text-tertiary truncate">{crd.group}</p>
        </div>
        <button onClick={onClose} className="text-text-tertiary hover:text-text-secondary ml-2 mt-0.5">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border px-4">
        {DETAIL_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px',
              activeTab === tab
                ? 'text-accent border-accent'
                : 'text-text-tertiary border-transparent hover:text-text-secondary'
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {activeTab === 'Overview' && (
          <div className="space-y-3">
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
              <span className="text-text-tertiary">Name</span>
              <span className="text-text-primary font-mono truncate">{crd.name}</span>
              <span className="text-text-tertiary">Group</span>
              <span className="text-text-primary font-mono">{crd.group}</span>
              <span className="text-text-tertiary">Kind</span>
              <span className="text-text-primary">{crd.kind}</span>
              <span className="text-text-tertiary">Plural</span>
              <span className="text-text-primary font-mono">{crd.plural}</span>
              <span className="text-text-tertiary">Scope</span>
              <span className={crd.scope === 'Cluster' ? 'text-purple-400' : 'text-blue-400'}>
                {crd.scope}
              </span>
              <span className="text-text-tertiary">Versions</span>
              <span className="text-text-primary font-mono">{crd.versions}</span>
              <span className="text-text-tertiary">Established</span>
              <span className={crd.established ? 'text-green-400' : 'text-red-400'}>
                {crd.established ? 'True' : 'False'}
              </span>
              <span className="text-text-tertiary">Names Accepted</span>
              <span className={crd.namesAccepted ? 'text-green-400' : 'text-yellow-400'}>
                {crd.namesAccepted ? 'True' : 'False'}
              </span>
              <span className="text-text-tertiary">Age</span>
              <span className="text-text-primary">{crd.age}</span>
            </div>
          </div>
        )}

        {activeTab === 'Instances' && (
          <div>
            {instancesLoading ? (
              <p className="text-xs text-text-tertiary py-4">Loading instances...</p>
            ) : instancesError ? (
              <p className="text-xs text-red-400 py-4">{instancesError}</p>
            ) : instances.length === 0 ? (
              <p className="text-xs text-text-tertiary py-4">No instances found.</p>
            ) : (
              <>
                <p className="text-xs text-text-tertiary mb-2">
                  {instances.length} instance{instances.length !== 1 ? 's' : ''}
                </p>
                <div className="space-y-1">
                  {instances.map((item) => (
                    <div
                      key={`${item.namespace || ''}/${item.name}`}
                      className="flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-bg-hover"
                    >
                      <span className="text-text-primary truncate flex-1">{item.name}</span>
                      {item.namespace && (
                        <span className="text-text-tertiary text-2xs shrink-0">{item.namespace}</span>
                      )}
                      <span className="text-text-tertiary text-2xs shrink-0">
                        {formatAge(creationTimestamp(item))}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'Schema' && (
          <div>
            {crd.schema ? (
              <CodeBlock code={JSON.stringify(crd.schema, null, 2)} language="json" />
            ) : (
              <p className="text-xs text-text-tertiary py-4">No schema available for this CRD.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── CRD List Page ───────────────────────────────────────────────────────────

export function CRDList() {
  const { name: routeName } = useParams<{ group?: string; resource?: string; name?: string }>()
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<CRDRow | null>(null)

  const cfg = RESOURCE_CONFIG.crds
  const { data: items, isLoading } = useKubeResources({
    group: cfg.group, version: cfg.version, resource: cfg.plural, namespace: '',
  })

  const crds: CRDRow[] = items.map((item) => {
    const r = (item.raw || {}) as Record<string, unknown>
    const spec = (r.spec || {}) as Record<string, unknown>
    const status = (r.status || {}) as Record<string, unknown>
    const versionsArr = (spec.versions || []) as Record<string, unknown>[]
    const versions = versionsArr.map((v: Record<string, unknown>) => v.name).join(', ')
    const conditions = ((status.conditions || []) as Record<string, unknown>[])
    const names = (spec.names || {}) as Record<string, unknown>
    return {
      name: item.name,
      group: (spec.group || '') as string,
      kind: (names.kind || '') as string,
      plural: (names.plural || '') as string,
      scope: (spec.scope || '') as string,
      versions,
      versionsArr: versionsArr.map((v) => v.name as string),
      established: getConditionStatus(conditions, 'Established'),
      namesAccepted: getConditionStatus(conditions, 'NamesAccepted'),
      age: formatAge(creationTimestamp(item)),
      schema: extractPrimarySchema(versionsArr),
      raw: r,
    }
  })

  // Auto-select CRD from route param (e.g. from sidebar click)
  useEffect(() => {
    if (routeName && crds.length > 0) {
      const match = crds.find((c) => c.name === routeName)
      if (match && match.name !== selected?.name) setSelected(match)
    }
  }, [routeName, crds, selected?.name])

  const filtered = crds.filter((crd) =>
    crd.name.toLowerCase().includes(filter.toLowerCase()) ||
    crd.group.toLowerCase().includes(filter.toLowerCase()) ||
    crd.kind.toLowerCase().includes(filter.toLowerCase())
  )

  if (isLoading && items.length === 0) {
    return (
      <div className="resource-view">
        <ResourceHeader title="Custom Resource Definitions" subtitle="Loading...">
          <SearchInput placeholder="Filter CRDs..." value={filter} onChange={setFilter} />
        </ResourceHeader>
        <div style={{ padding: 'var(--space-6)', color: 'var(--text-tertiary)' }}>Loading CRDs...</div>
      </div>
    )
  }

  return (
    <div className="resource-view">
      <ResourceHeader title="Custom Resource Definitions" subtitle={`${crds.length} CRDs in the cluster`}>
        <SearchInput placeholder="Filter CRDs..." value={filter} onChange={setFilter} />
      </ResourceHeader>

      {/* Table + detail panel */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-auto">
          <ResourceTable columns={columns} data={filtered} renderRow={(crd) => (
            <tr
              key={crd.name}
              onClick={() => setSelected(crd)}
              className={cn(
                'cursor-pointer',
                selected?.name === crd.name && 'bg-bg-active'
              )}
            >
              <td className="name-cell" style={{ fontSize: 'var(--text-2xs)' }}>
                {crd.name}
              </td>
              <td className="mono">{crd.group}</td>
              <td>{crd.kind}</td>
              <td style={{ color: crd.scope === 'Cluster' ? 'var(--purple)' : 'var(--blue)' }}>
                {crd.scope}
              </td>
              <td className="mono">{crd.versions}</td>
              <td>
                <span style={{ color: crd.established ? 'var(--green)' : 'var(--red)' }}>
                  {crd.established ? 'True' : 'False'}
                </span>
              </td>
              <td>{crd.age}</td>
            </tr>
          )} />
        </div>

        {selected && (
          <CRDDetailPanel crd={selected} onClose={() => setSelected(null)} />
        )}
      </div>
    </div>
  )
}
