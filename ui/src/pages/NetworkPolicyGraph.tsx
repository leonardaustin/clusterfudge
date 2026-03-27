import { useState, useEffect, useRef, useMemo } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  type Node as FlowNode,
  type Edge,
  useNodesState,
  useEdgesState,
  MarkerType,
  type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { layoutGraph, NODE_WIDTH } from '@/lib/graphLayout'
import { ResourceHeader } from '../components/shared/ResourceHeader'
import { SearchInput } from '../components/shared/SearchInput'
import { Badge } from '../components/shared/Badge'
import { BuildClusterNetworkGraph, type NetworkGraph, type PodGroup } from '@/wailsjs/go/handlers/NetPolHandler'
import { useToastStore } from '@/stores/toastStore'
import { useClusterStore } from '@/stores/clusterStore'

// ─── Node height for netpol (slightly taller for pod count label) ────────────

const NETPOL_NODE_HEIGHT = 50

// ─── Transform network graph → React Flow ────────────────────────────────────

function buildFlowGraph(
  groups: PodGroup[],
  edges: { from: string; to: string; port: number; protocol: string; allowed: boolean; policyRef: string }[],
  groupMap: Map<string, PodGroup>
): { nodes: FlowNode[]; edges: Edge[] } {
  const flowNodes: FlowNode[] = groups.map((g) => ({
    id: g.id,
    data: {
      label: `${g.name} (${g.podCount})`,
    },
    position: { x: 0, y: 0 },
    style: {
      background: g.isolated ? '#3b1b1b' : '#1a3a2a',
      border: `1px solid ${g.isolated ? '#ef4444' : '#22c55e'}`,
      borderStyle: g.isolated ? 'dashed' : 'solid',
      color: g.isolated ? '#fca5a5' : '#86efac',
      borderRadius: '8px',
      padding: '8px 12px',
      fontSize: '12px',
      fontWeight: 500,
      width: NODE_WIDTH,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap' as const,
    },
  }))

  const flowEdges: Edge[] = edges.map((e, i) => {
    const label = e.port === 0 ? `*/${e.protocol}` : `${e.port}/${e.protocol}`
    return {
      id: `edge-${i}`,
      source: e.from,
      target: e.to,
      label,
      labelStyle: { fontSize: '10px', fill: e.allowed ? '#86efac' : '#fca5a5' },
      labelBgStyle: { fill: 'var(--bg-primary)', fillOpacity: 0.9 },
      labelBgPadding: [4, 6] as [number, number],
      style: { stroke: e.allowed ? '#22c55e' : '#ef4444', strokeWidth: 1.5 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 12,
        height: 12,
        color: e.allowed ? '#22c55e' : '#ef4444',
      },
      animated: e.allowed,
    }
  })

  // Include nodes referenced by edges AND isolated nodes (always show isolated)
  const referencedIds = new Set<string>()
  for (const e of edges) {
    referencedIds.add(e.from)
    referencedIds.add(e.to)
  }
  const activeNodes = flowNodes.filter((n) => {
    const group = groupMap.get(n.id)
    return referencedIds.has(n.id) || (group?.isolated ?? false)
  })

  if (activeNodes.length === 0 && flowNodes.length > 0) {
    return layoutGraph(flowNodes, flowEdges, { nodeHeight: NETPOL_NODE_HEIGHT, ranksep: 160 })
  }

  return layoutGraph(activeNodes, flowEdges, { nodeHeight: NETPOL_NODE_HEIGHT, ranksep: 160 })
}

// ─── Table fallback ──────────────────────────────────────────────────────────

function NetPolTable({ edges, groupMap }: { edges: { from: string; to: string; port: number; protocol: string; allowed: boolean }[]; groupMap: Map<string, PodGroup> }) {
  if (edges.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-tertiary text-sm">
        No network edges match your filters
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto">
      <table className="resource-table" style={{ width: '100%' }}>
        <thead>
          <tr>
            <th>Source</th>
            <th>Destination</th>
            <th>Port</th>
            <th>Protocol</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {edges.map((edge, i) => {
            const fromGroup = groupMap.get(edge.from)
            const toGroup = groupMap.get(edge.to)
            return (
              <tr key={`${edge.from}-${edge.to}-${edge.port}-${edge.protocol}-${i}`}>
                <td>
                  <span className="mono">{fromGroup?.name ?? edge.from}</span>
                  {fromGroup && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginLeft: '4px' }}>{fromGroup.namespace}</span>}
                </td>
                <td>
                  <span className="mono">{toGroup?.name ?? edge.to}</span>
                  {toGroup && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginLeft: '4px' }}>{toGroup.namespace}</span>}
                </td>
                <td className="mono">{edge.port === 0 ? '*' : edge.port}</td>
                <td>{edge.protocol}</td>
                <td>
                  <Badge color={edge.allowed ? 'green' : 'red'}>{edge.allowed ? 'Allow' : 'Deny'}</Badge>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

type ViewMode = 'graph' | 'table'

export function NetworkPolicyGraph() {
  const [graph, setGraph] = useState<NetworkGraph | null>(null)
  const [filter, setFilter] = useState('')
  const selectedNamespace = useClusterStore((s) => s.selectedNamespace)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('graph')
  const rfInstance = useRef<ReactFlowInstance | null>(null)

  useEffect(() => {
    BuildClusterNetworkGraph('')
      .then(setGraph)
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
        useToastStore.getState().addToast({ type: 'error', title: 'Failed to build network graph', description: msg })
      })
      .finally(() => setLoading(false))
  }, [])

  const groupMap = useMemo(() => {
    const m = new Map<string, PodGroup>()
    if (graph?.groups) {
      for (const g of graph.groups) {
        m.set(g.id, g)
      }
    }
    return m
  }, [graph])

  const edges = graph?.edges ?? []
  const groups = graph?.groups ?? []

  const filtered = useMemo(() =>
    edges
      .filter((e) => {
        if (!selectedNamespace) return true
        const fromGroup = groupMap.get(e.from)
        const toGroup = groupMap.get(e.to)
        return fromGroup?.namespace === selectedNamespace || toGroup?.namespace === selectedNamespace
      })
      .filter((e) => {
        if (!filter) return true
        const q = filter.toLowerCase()
        const fromGroup = groupMap.get(e.from)
        const toGroup = groupMap.get(e.to)
        return (fromGroup?.name.toLowerCase().includes(q) ?? false) || (toGroup?.name.toLowerCase().includes(q) ?? false)
      }),
    [edges, selectedNamespace, filter, groupMap]
  )

  const { flowNodes, flowEdges } = useMemo(() => {
    if (viewMode !== 'graph') return { flowNodes: [], flowEdges: [] }
    // Include all groups referenced by filtered edges, plus isolated groups
    // that match the filter. This prevents dangling edges when a filter
    // matches one endpoint but not the other.
    const referencedByEdges = new Set(filtered.flatMap((e) => [e.from, e.to]))
    const filteredGroups = groups.filter((g) => {
      if (referencedByEdges.has(g.id)) return true
      if (g.isolated) {
        if (selectedNamespace && g.namespace !== selectedNamespace) return false
        if (filter && !g.name.toLowerCase().includes(filter.toLowerCase())) return false
        return true
      }
      return false
    })
    const { nodes, edges: fEdges } = buildFlowGraph(filteredGroups, filtered, groupMap)
    return { flowNodes: nodes, flowEdges: fEdges }
  }, [groups, filtered, groupMap, viewMode, selectedNamespace, filter])

  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes)
  const [rfEdges, setEdges, onEdgesChange] = useEdgesState(flowEdges)

  useEffect(() => {
    setNodes(flowNodes)
    setEdges(flowEdges)
    if (rfInstance.current && flowNodes.length > 0) {
      setTimeout(() => rfInstance.current?.fitView({ duration: 200 }), 100)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setNodes/setEdges are stable refs from useNodesState
  }, [flowNodes, flowEdges])

  const hasFilters = filter !== '' || selectedNamespace !== ''

  return (
    <div className="resource-view" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <ResourceHeader title="Network Policy Graph" subtitle={hasFilters ? `${filtered.length} of ${edges.length} edges, ${groups.length} pod groups` : `${edges.length} edges, ${groups.length} pod groups`}>
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
          <SearchInput placeholder="Search pods..." value={filter} onChange={setFilter} />
        </div>
      </ResourceHeader>

      {loading ? (
        <div className="flex-1 flex items-center justify-center" style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            Building network graph...
          </div>
        </div>
      ) : error ? (
        <div style={{ padding: 'var(--space-4)', color: 'var(--color-error)', fontSize: 'var(--text-sm)' }}>
          Failed to build network policy graph: {error}
        </div>
      ) : viewMode === 'table' ? (
        <NetPolTable edges={filtered} groupMap={groupMap} />
      ) : flowNodes.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-text-tertiary text-sm">
          {hasFilters ? 'No network policies match your filters' : 'No network policies found in this cluster'}
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 400 }}>
          <ReactFlow
            nodes={nodes}
            edges={rfEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onInit={(instance) => { rfInstance.current = instance }}
            fitView
            maxZoom={1.5}
            proOptions={{ hideAttribution: false }}
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
          <div className="flex items-center gap-1.5">
            <div style={{ width: 10, height: 10, borderRadius: 3, background: '#1a3a2a', border: '1px solid #22c55e' }} />
            <span>Pod Group</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div style={{ width: 10, height: 10, borderRadius: 3, background: '#3b1b1b', border: '1px dashed #ef4444' }} />
            <span>Isolated</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div style={{ width: 20, height: 0, borderTop: '2px solid #22c55e' }} />
            <span>Allow (animated)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div style={{ width: 20, height: 0, borderTop: '2px solid #ef4444' }} />
            <span>Deny</span>
          </div>
        </div>
      )}
    </div>
  )
}
