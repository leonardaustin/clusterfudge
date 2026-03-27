import { useState, useEffect, useRef, useMemo } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { layoutGraph, NODE_WIDTH } from '@/lib/graphLayout'
import { ResourceHeader } from '../components/shared/ResourceHeader'
import { SearchInput } from '../components/shared/SearchInput'
import { BuildClusterRBACGraph, type BindingEdge } from '@/wailsjs/go/handlers/RBACHandler'
import { useToastStore } from '@/stores/toastStore'
import { useClusterStore } from '@/stores/clusterStore'

// ─── Node colors by type ─────────────────────────────────────────────────────

const NODE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  User:               { bg: '#1e3a5f', border: '#3b82f6', text: '#93c5fd' },
  Group:              { bg: '#3b1f4e', border: '#a855f7', text: '#d8b4fe' },
  ServiceAccount:     { bg: '#1a3a2a', border: '#22c55e', text: '#86efac' },
  Role:               { bg: '#3b3012', border: '#f59e0b', text: '#fcd34d' },
  ClusterRole:        { bg: '#3b1b1b', border: '#ef4444', text: '#fca5a5' },
}

function nodeColor(kind: string) {
  return NODE_COLORS[kind] ?? { bg: 'var(--bg-tertiary)', border: 'var(--border)', text: 'var(--text-primary)' }
}

// ─── Subject kind selector ───────────────────────────────────────────────────

const SUBJECT_KINDS = [
  { value: 'all', label: 'All Kinds' },
  { value: 'User', label: 'User' },
  { value: 'Group', label: 'Group' },
  { value: 'ServiceAccount', label: 'ServiceAccount' },
]

function SubjectKindSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const current = SUBJECT_KINDS.find((k) => k.value === value)?.label ?? value

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
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
              className="flex items-center gap-2 px-2 py-1.5 text-xs cursor-default hover:bg-bg-hover transition-colors w-full text-left"
              style={{ color: k.value === value ? 'var(--accent)' : undefined, border: 'none', background: 'transparent' }}
            >
              {k.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── View toggle ─────────────────────────────────────────────────────────────

type ViewMode = 'graph' | 'table'

// ─── Transform binding edges → React Flow nodes + edges ──────────────────────

function buildFlowGraph(bindings: BindingEdge[]): { nodes: Node[]; edges: Edge[] } {
  const nodeMap = new Map<string, Node>()
  const flowEdges: Edge[] = []

  for (const b of bindings) {
    const subjectId = `subject:${b.subject.kind}:${b.subject.name}`
    const roleId = `role:${b.roleKind}:${b.roleName}`

    if (!nodeMap.has(subjectId)) {
      const colors = nodeColor(b.subject.kind)
      nodeMap.set(subjectId, {
        id: subjectId,
        data: { label: b.subject.name },
        position: { x: 0, y: 0 },
        style: {
          background: colors.bg,
          border: `1px solid ${colors.border}`,
          color: colors.text,
          borderRadius: '8px',
          padding: '6px 12px',
          fontSize: '11px',
          fontWeight: 500,
          width: NODE_WIDTH,
        },
      })
    }

    if (!nodeMap.has(roleId)) {
      const colors = nodeColor(b.roleKind)
      nodeMap.set(roleId, {
        id: roleId,
        data: { label: b.roleName },
        position: { x: 0, y: 0 },
        style: {
          background: colors.bg,
          border: `1px solid ${colors.border}`,
          color: colors.text,
          borderRadius: '8px',
          padding: '6px 12px',
          fontSize: '11px',
          fontWeight: 500,
          width: NODE_WIDTH,
        },
      })
    }

    flowEdges.push({
      id: `${subjectId}->${roleId}:${b.bindingName}`,
      source: subjectId,
      target: roleId,
      label: b.bindingName,
      labelStyle: { fontSize: '9px', fill: 'var(--text-tertiary)' },
      style: { stroke: 'var(--border)' },
      markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: 'var(--text-tertiary)' },
      animated: b.namespace === '',
    })
  }

  return layoutGraph(Array.from(nodeMap.values()), flowEdges)
}

// ─── Table fallback (kept for toggle) ────────────────────────────────────────

function RBACTable({ bindings }: { bindings: BindingEdge[] }) {
  return (
    <div className="flex-1 overflow-auto">
      <table className="resource-table" style={{ width: '100%' }}>
        <thead>
          <tr>
            <th>Subject Kind</th>
            <th>Subject</th>
            <th>Binding</th>
            <th>Role</th>
            <th>Role Kind</th>
            <th>Namespace</th>
          </tr>
        </thead>
        <tbody>
          {bindings.map((edge) => (
            <tr key={`${edge.subject.kind}-${edge.subject.name}-${edge.roleName}-${edge.bindingName}`}>
              <td>{edge.subject.kind}</td>
              <td className="mono">{edge.subject.name}</td>
              <td className="mono">{edge.bindingName}</td>
              <td className="mono">{edge.roleName}</td>
              <td>{edge.roleKind}</td>
              <td>{edge.namespace || '(cluster)'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export function RBACGraph() {
  const [bindings, setBindings] = useState<BindingEdge[]>([])
  const [filter, setFilter] = useState('')
  const selectedNamespace = useClusterStore((s) => s.selectedNamespace)
  const [kindFilter, setKindFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('graph')

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

  const filtered = useMemo(() => bindings
    .filter((e) => kindFilter === 'all' || e.subject.kind === kindFilter)
    .filter((e) => !selectedNamespace || (e.namespace ?? '') === selectedNamespace)
    .filter((e) => {
      const q = filter.toLowerCase()
      return (
        e.subject.name.toLowerCase().includes(q) ||
        e.roleName.toLowerCase().includes(q) ||
        e.bindingName.toLowerCase().includes(q)
      )
    }), [bindings, kindFilter, selectedNamespace, filter])

  const { flowNodes, flowEdges } = useMemo(() => {
    if (viewMode !== 'graph' || filtered.length === 0) return { flowNodes: [], flowEdges: [] }
    const { nodes, edges } = buildFlowGraph(filtered)
    return { flowNodes: nodes, flowEdges: edges }
  }, [filtered, viewMode])

  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges)
  const rfInstance = useRef<{ fitView: (opts?: { duration?: number }) => void } | null>(null)

  useEffect(() => {
    setNodes(flowNodes)
    setEdges(flowEdges)
    if (rfInstance.current && flowNodes.length > 0) {
      setTimeout(() => rfInstance.current?.fitView({ duration: 200 }), 100)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setNodes/setEdges are stable refs from useNodesState
  }, [flowNodes, flowEdges])

  return (
    <div className="resource-view" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <ResourceHeader title="RBAC Graph" subtitle={`${bindings.length} bindings`}>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <div
            className="flex items-center rounded border border-border overflow-hidden"
            role="tablist"
            aria-label="View mode"
          >
            <button
              role="tab"
              aria-selected={viewMode === 'graph'}
              onClick={() => setViewMode('graph')}
              className={`text-xs px-2.5 py-1 transition-colors ${
                viewMode === 'graph' ? 'bg-accent text-white' : 'text-text-tertiary hover:text-text-secondary bg-bg-tertiary'
              }`}
            >
              Graph
            </button>
            <button
              role="tab"
              aria-selected={viewMode === 'table'}
              onClick={() => setViewMode('table')}
              className={`text-xs px-2.5 py-1 transition-colors ${
                viewMode === 'table' ? 'bg-accent text-white' : 'text-text-tertiary hover:text-text-secondary bg-bg-tertiary'
              }`}
            >
              Table
            </button>
          </div>
          <SubjectKindSelector value={kindFilter} onChange={setKindFilter} />
          <SearchInput placeholder="Search..." value={filter} onChange={setFilter} />
        </div>
      </ResourceHeader>

      {loading ? (
        <div style={{ padding: 'var(--space-6)', color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>Building RBAC graph...</div>
      ) : error ? (
        <div style={{ padding: 'var(--space-4)', color: 'var(--red)', fontSize: 'var(--text-sm)' }}>
          Failed to load RBAC data: {error}
        </div>
      ) : viewMode === 'table' ? (
        <RBACTable bindings={filtered} />
      ) : (
        <div style={{ flex: 1, minHeight: 400 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onInit={(instance) => { rfInstance.current = instance }}
            fitView
            proOptions={{ hideAttribution: true }}
            style={{ background: 'var(--bg-primary)' }}
          >
            <Background color="var(--border-subtle)" gap={20} size={1} />
            <Controls
              showInteractive={false}
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '6px' }}
            />
          </ReactFlow>
        </div>
      )}

      {/* Legend */}
      {viewMode === 'graph' && !loading && !error && (
        <div className="flex items-center gap-4 px-4 py-2 border-t border-border" style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
          {Object.entries(NODE_COLORS).map(([kind, colors]) => (
            <div key={kind} className="flex items-center gap-1.5">
              <div style={{ width: 10, height: 10, borderRadius: 3, background: colors.bg, border: `1px solid ${colors.border}` }} />
              <span>{kind}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5 ml-2">
            <div style={{ width: 20, height: 0, borderTop: '1px dashed var(--text-tertiary)' }} />
            <span>cluster-scoped</span>
          </div>
        </div>
      )}
    </div>
  )
}
