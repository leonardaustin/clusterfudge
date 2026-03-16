import { useState, useMemo, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useKubeResources } from '../hooks/useKubeResource'
import { usePodMetrics } from '../hooks/usePodMetrics'
import type { ResourceItem } from '../wailsjs/go/handlers/ResourceHandler'
import { formatAge, rawSpec, rawStatus, rawMetadata, labelsMap, parseCpu, parseMemoryMiB, getBarColor } from '../lib/k8sFormatters'
import { StatusDot } from '../components/shared/StatusDot'
import { Badge } from '../components/shared/Badge'
import { ResourceHeader } from '../components/shared/ResourceHeader'
import { ResourceTable } from '../components/shared/ResourceTable'
import type { Column } from '../components/shared/ResourceTable'
import type { ClusterNode, BadgeColor, BarColor, NodeCondition, NodeTaint, NodeAddress, AllocatedResources, HexPod, NodeHexGroup } from '../data/types'
import { useClusterStore } from '../stores/clusterStore'
import { HexMap } from '../components/hex/HexMap'
import { ContextMenu } from '../components/hex/ContextMenu'

const columns: Column[] = [
  { key: 'status', label: 'Status', className: 'col-status' },
  { key: 'name', label: 'Name', className: 'col-name' },
  { key: 'roles', label: 'Roles', className: 'col-md' },
  { key: 'version', label: 'Version', className: 'col-md' },
  { key: 'cpu', label: 'CPU', className: 'col-sm' },
  { key: 'memory', label: 'Memory', className: 'col-sm' },
  { key: 'pods', label: 'Pods', className: 'col-xs' },
  { key: 'conditions', label: 'Conditions', className: 'col-md' },
  { key: 'addresses', label: 'Internal IP', className: 'col-md' },
  { key: 'age', label: 'Age', className: 'col-age' },
]

function nodeRoles(labels: Record<string, string>): string {
  const roles: string[] = []
  for (const key of Object.keys(labels)) {
    if (key.startsWith('node-role.kubernetes.io/')) {
      roles.push(key.replace('node-role.kubernetes.io/', ''))
    }
  }
  return roles.length > 0 ? roles.join(', ') : 'worker'
}

interface NodeMetrics {
  cpuUsedMillis: number
  memUsedMiB: number
  cpuRequests: number
  cpuLimits: number
  memRequests: number
  memLimits: number
}

function transformNode(item: ResourceItem, podCount: number, metrics: NodeMetrics): ClusterNode {
  const spec = rawSpec(item)
  const status = rawStatus(item)
  const labels = labelsMap(item)
  const nodeInfo = (status.nodeInfo || {}) as Record<string, string>
  const allocatable = (status.allocatable || {}) as Record<string, string>
  const capacity = (status.capacity || {}) as Record<string, string>

  const conditions: NodeCondition[] = ((status.conditions || []) as Array<Record<string, unknown>>).map((c) => ({
    type: c.type as string,
    status: (c.status as string) as 'True' | 'False' | 'Unknown',
  }))

  const taints: NodeTaint[] = ((spec.taints || []) as Array<Record<string, unknown>>).map((t) => ({
    key: (t.key as string) || '',
    value: (t.value as string) || undefined,
    effect: (t.effect as string) || '',
  }))

  const addresses: NodeAddress[] = ((status.addresses || []) as Array<Record<string, string>>).map((a) => ({
    type: a.type || '',
    address: a.address || '',
  }))

  const role = nodeRoles(labels)
  const cpuCoresNum = parseCpu(capacity.cpu) / 1000
  const memGiB = parseMemoryMiB(capacity.memory) / 1024
  const allocCpu = parseCpu(allocatable.cpu)
  const allocMem = parseMemoryMiB(allocatable.memory)
  const allocPods = parseInt(allocatable.pods || '110', 10)

  const ephStorageGiB = parseMemoryMiB(allocatable['ephemeral-storage']) / 1024

  const cpuPercent = allocCpu > 0 ? Math.round((metrics.cpuUsedMillis / allocCpu) * 100) : 0
  const memPercent = allocMem > 0 ? Math.round((metrics.memUsedMiB / allocMem) * 100) : 0

  const allocatedResources: AllocatedResources = {
    cpuRequests: `${metrics.cpuRequests}m`,
    cpuLimits: `${metrics.cpuLimits}m`,
    memoryRequests: `${Math.round(metrics.memRequests)}Mi`,
    memoryLimits: `${Math.round(metrics.memLimits)}Mi`,
  }

  return {
    name: item.name,
    status: 'ready',
    roles: role,
    roleBadgeColor: (role.includes('control-plane') ? 'purple' : 'gray') as BadgeColor,
    version: nodeInfo.kubeletVersion || '',
    cpuCores: String(cpuCoresNum),
    memory: `${Math.round(memGiB * 10) / 10}Gi`,
    pods: podCount,
    osImage: nodeInfo.osImage || '',
    kernel: nodeInfo.kernelVersion || '',
    containerRuntime: nodeInfo.containerRuntimeVersion || '',
    age: formatAge((rawMetadata(item).creationTimestamp as string) || ''),
    cpuUsage: { value: `${metrics.cpuUsedMillis}m / ${allocCpu}m`, percent: cpuPercent, color: getBarColor(cpuPercent) },
    memoryUsage: { value: `${Math.round(metrics.memUsedMiB)}Mi / ${Math.round(allocMem)}Mi`, percent: memPercent, color: getBarColor(memPercent) },
    podUsage: { value: `${podCount}/${allocPods}`, percent: allocPods > 0 ? Math.round((podCount / allocPods) * 100) : 0, color: (allocPods > 0 && podCount / allocPods >= 0.8 ? 'red' : allocPods > 0 && podCount / allocPods >= 0.5 ? 'yellow' : 'green') as BarColor },
    systemInfo: `${nodeInfo.osImage || ''} | ${nodeInfo.containerRuntimeVersion || ''} | ${nodeInfo.kubeletVersion || ''}`,
    cpuCoresNum,
    memoryGiB: memGiB,
    cpuUsageMillicores: metrics.cpuUsedMillis,
    memoryUsageMiB: metrics.memUsedMiB,
    ephemeralStorageGiB: ephStorageGiB,
    conditions,
    taints,
    addresses,
    ephemeralStorage: `${Math.round(ephStorageGiB * 10) / 10}Gi`,
    allocatedResources,
  }
}

function ConditionBadge({ type, status }: { type: string; status: string }) {
  if (type === 'Ready') {
    return <Badge color={status === 'True' ? 'green' : 'red'}>{type}</Badge>
  }
  // For pressure/unavailable conditions, True is bad
  if (status === 'True') {
    return <Badge color="red">{type}</Badge>
  }
  return null
}

function NodeCard({ node, expanded, onToggle }: { node: ClusterNode; expanded: boolean; onToggle: () => void }) {
  const usageMetrics = [
    { label: 'CPU', ...node.cpuUsage },
    { label: 'Memory', ...node.memoryUsage },
    { label: 'Pods', ...node.podUsage },
  ]

  return (
    <div className="node-card">
      <div className="node-card-header" style={{ cursor: 'pointer' }} onClick={onToggle}>
        <span className="status-dot running" />
        <div style={{ flex: 1 }}>
          <div className="node-card-name">
            <Link to={`/cluster/nodes/${node.name}`}>{node.name}</Link>
          </div>
          <div className="node-card-role">{node.roles}</div>
        </div>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-disabled)' }}>
          {expanded ? '\u25B2' : '\u25BC'}
        </span>
      </div>

      {usageMetrics.map((m) => (
        <div key={m.label}>
          <div className="usage-row">
            <span className="usage-label">{m.label}</span>
            <span className="usage-value">{m.value}</span>
          </div>
          <div className="metric-bar" style={{ marginTop: 0, marginBottom: 'var(--space-3)' }}>
            <div className={`metric-bar-fill ${m.color}`} style={{ width: `${m.percent}%` }} />
          </div>
        </div>
      ))}

      {expanded && (
        <div style={{ marginTop: 'var(--space-3)', borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3)' }}>
          <div style={{ marginBottom: 'var(--space-2)' }}>
            <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-disabled)', fontWeight: 600 }}>Conditions</span>
            <div style={{ display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap', marginTop: 'var(--space-1)' }}>
              {node.conditions.map((c) => (
                <ConditionBadge key={c.type} type={c.type} status={c.status} />
              ))}
            </div>
          </div>

          {node.taints.length > 0 && (
            <div style={{ marginBottom: 'var(--space-2)' }}>
              <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-disabled)', fontWeight: 600 }}>Taints</span>
              <div style={{ marginTop: 'var(--space-1)' }}>
                {node.taints.map((t, i) => (
                  <div key={i} className="mono" style={{ fontSize: 'var(--text-2xs)' }}>
                    {t.key}{t.value ? `=${t.value}` : ''}:{t.effect}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginBottom: 'var(--space-2)' }}>
            <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-disabled)', fontWeight: 600 }}>Addresses</span>
            <div style={{ marginTop: 'var(--space-1)' }}>
              {node.addresses.map((a, i) => (
                <div key={i} className="mono" style={{ fontSize: 'var(--text-2xs)' }}>
                  {a.type}: {a.address}
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 'var(--space-2)' }}>
            <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-disabled)', fontWeight: 600 }}>Ephemeral Storage</span>
            <div className="mono" style={{ fontSize: 'var(--text-2xs)', marginTop: 'var(--space-1)' }}>{node.ephemeralStorage}</div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-2xs)', color: 'var(--text-disabled)' }}>
        {node.systemInfo}
      </div>
    </div>
  )
}

// ─── Hex Map helpers ─────────────────────────────────────────────────────────

function cpuPercentToFill(pct: number): string {
  if (pct >= 80) return '#ef4444'
  if (pct >= 60) return '#f97316'
  if (pct >= 40) return '#eab308'
  if (pct >= 20) return '#84cc16'
  return '#22c55e'
}

function buildHexGroups(
  nodes: ResourceItem[],
  pods: ResourceItem[],
  podMetrics: Map<string, { cpuCores: number; memoryMiB: number }>,
): NodeHexGroup[] {
  const groups: NodeHexGroup[] = []

  for (const node of nodes) {
    const labels = labelsMap(node)
    const roles: string[] = []
    for (const key of Object.keys(labels)) {
      if (key.startsWith('node-role.kubernetes.io/')) {
        roles.push(key.replace('node-role.kubernetes.io/', ''))
      }
    }
    const role = roles.length > 0 ? roles.join(', ') : 'worker'

    const nodePods = pods.filter((p) => {
      const spec = rawSpec(p)
      return (spec.nodeName as string) === node.name
    })

    const hexPods: HexPod[] = nodePods.map((p) => {
      const status = rawStatus(p)
      const spec = rawSpec(p)
      const phase = (status.phase as string) || 'Unknown'
      const containerStatuses = (status.containerStatuses || []) as Array<Record<string, unknown>>
      const specContainers = (spec.containers || []) as Array<Record<string, unknown>>
      const readyCount = containerStatuses.filter((cs) => cs.ready).length
      const totalCount = specContainers.length
      const restarts = containerStatuses.reduce((sum, cs) => sum + ((cs.restartCount as number) || 0), 0)

      const metricsKey = `${p.namespace}/${p.name}`
      const met = podMetrics.get(metricsKey)
      const cpuPercent = met ? Math.round(met.cpuCores * 100) : 0
      const memDisplay = met ? `${Math.round(met.memoryMiB)} MiB` : '-'

      let displayStatus = phase
      for (const cs of containerStatuses) {
        const state = (cs.state || {}) as Record<string, unknown>
        const waiting = state.waiting as Record<string, unknown> | undefined
        if (waiting?.reason) {
          displayStatus = waiting.reason as string
          break
        }
      }

      let fill = cpuPercentToFill(cpuPercent)
      if (displayStatus === 'Completed' || displayStatus === 'Succeeded') fill = '#60a5fa'
      if (displayStatus === 'Pending') fill = '#6b7280'
      if (displayStatus === 'CrashLoopBackOff' || displayStatus === 'Failed') fill = '#ef4444'

      return {
        name: p.name,
        namespace: p.namespace,
        status: displayStatus,
        containers: `${readyCount}/${totalCount}`,
        cpuPercent,
        memoryDisplay: restarts > 0 ? `Restarts: ${restarts}` : memDisplay,
        fill,
        restarts: restarts > 0 ? restarts : undefined,
      }
    })

    const rows: HexPod[][] = []
    const rowSizes = [7, 6, 5, 7, 6, 5]
    let idx = 0
    let sizeIdx = 0
    while (idx < hexPods.length) {
      const size = rowSizes[sizeIdx % rowSizes.length]!
      rows.push(hexPods.slice(idx, idx + size))
      idx += size
      sizeIdx++
    }

    const totalCpu = hexPods.reduce((sum, p) => sum + p.cpuPercent, 0)
    const avgCpu = hexPods.length > 0 ? Math.round(totalCpu / hexPods.length) : 0

    const nodeStatus = rawStatus(node)
    const conditions = (nodeStatus.conditions || []) as Array<Record<string, unknown>>
    const readyCond = conditions.find((c) => c.type === 'Ready')
    const nodeReady = readyCond && readyCond.status === 'True' ? 'running' : 'not-ready'

    groups.push({
      name: node.name,
      status: nodeReady,
      podCount: hexPods.length,
      role,
      cpuPercent: avgCpu,
      rows,
    })
  }

  return groups
}

// ─── Main Component ──────────────────────────────────────────────────────────

type ViewMode = 'cards' | 'hex' | 'table'

export function NodeList() {
  const navigate = useNavigate()
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<ViewMode>('hex')
  const selectedNamespace = useClusterStore((s) => s.selectedNamespace)

  const { data: nodeItems, isLoading, error } = useKubeResources({
    group: '', version: 'v1', resource: 'nodes', namespace: '',
  })
  const { data: podItems } = useKubeResources({
    group: '', version: 'v1', resource: 'pods', namespace: '',
  })
  const { metrics: podMetrics } = usePodMetrics('')

  const nodes = useMemo(() => {
    const podCountByNode = new Map<string, number>()
    const metricsPerNode = new Map<string, NodeMetrics>()

    for (const pod of podItems) {
      const spec = rawSpec(pod)
      const nodeName = (spec.nodeName as string) || ''
      if (!nodeName) continue

      podCountByNode.set(nodeName, (podCountByNode.get(nodeName) || 0) + 1)

      if (!metricsPerNode.has(nodeName)) {
        metricsPerNode.set(nodeName, { cpuUsedMillis: 0, memUsedMiB: 0, cpuRequests: 0, cpuLimits: 0, memRequests: 0, memLimits: 0 })
      }
      const nm = metricsPerNode.get(nodeName)!

      const key = `${pod.namespace}/${pod.name}`
      const m = podMetrics.get(key)
      if (m) {
        nm.cpuUsedMillis += Math.round(m.cpuCores * 1000)
        nm.memUsedMiB += Math.round(m.memoryMiB)
      }

      const specContainers = (spec.containers || []) as Array<Record<string, unknown>>
      for (const c of specContainers) {
        const resources = (c.resources || {}) as Record<string, unknown>
        const requests = (resources.requests || {}) as Record<string, string>
        const limits = (resources.limits || {}) as Record<string, string>
        nm.cpuRequests += parseCpu(requests.cpu)
        nm.cpuLimits += parseCpu(limits.cpu)
        nm.memRequests += parseMemoryMiB(requests.memory)
        nm.memLimits += parseMemoryMiB(limits.memory)
      }
    }

    const defaultMetrics: NodeMetrics = { cpuUsedMillis: 0, memUsedMiB: 0, cpuRequests: 0, cpuLimits: 0, memRequests: 0, memLimits: 0 }
    return nodeItems.map((item) => transformNode(item, podCountByNode.get(item.name) || 0, metricsPerNode.get(item.name) || defaultMetrics))
  }, [nodeItems, podItems, podMetrics])

  // Hex map groups — filter pods by selected namespace for the hex visualization
  const nodeHexGroups = useMemo(() => {
    const filteredPods = selectedNamespace
      ? podItems.filter((p) => p.namespace === selectedNamespace)
      : podItems
    return buildHexGroups(nodeItems, filteredPods, podMetrics as Map<string, { cpuCores: number; memoryMiB: number }>)
  }, [nodeItems, podItems, podMetrics, selectedNamespace])

  const totalPods = nodeHexGroups.reduce((sum, g) => sum + g.podCount, 0)

  const [ctxMenu, setCtxMenu] = useState<{
    visible: boolean
    x: number
    y: number
    pod: HexPod | null
  }>({ visible: false, x: 0, y: 0, pod: null })

  const handleContextMenu = useCallback((e: React.MouseEvent, pod: HexPod) => {
    e.preventDefault()
    e.stopPropagation()
    const x = Math.min(e.clientX, window.innerWidth - 220)
    const y = Math.min(e.clientY, window.innerHeight - 400)
    setCtxMenu({ visible: true, x, y, pod })
  }, [])

  const closeContextMenu = useCallback(() => {
    setCtxMenu((prev) => ({ ...prev, visible: false }))
  }, [])

  const toggleNode = (name: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }

  if (isLoading) {
    return (
      <div className="resource-view">
        <ResourceHeader title="Nodes" subtitle="Loading..." />
      </div>
    )
  }

  if (error) {
    return (
      <div className="resource-view">
        <ResourceHeader title="Nodes" subtitle={`Error: ${error}`} />
      </div>
    )
  }

  const readyCount = nodes.filter((n) => n.conditions.find((c) => c.type === 'Ready' && c.status === 'True')).length

  return (
    <div className="resource-view">
      <ResourceHeader title="Nodes" subtitle={`${nodes.length} nodes — ${readyCount} ready`} />

      {/* View mode toggle */}
      <div className="map-controls" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="map-view-toggle" style={{ marginLeft: 0 }}>
          <button className={viewMode === 'hex' ? 'active' : ''} onClick={() => setViewMode('hex')}>Hex Map</button>
          <button className={viewMode === 'table' ? 'active' : ''} onClick={() => setViewMode('table')}>Table</button>
          <button className={viewMode === 'cards' ? 'active' : ''} onClick={() => setViewMode('cards')}>Cards</button>
        </div>
        {viewMode === 'hex' && (
          <div style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
            {totalPods} pods — colored by CPU usage
          </div>
        )}
      </div>

      {viewMode === 'cards' && (
        <div className="node-detail-cards">
          {nodes.map((node) => (
            <NodeCard
              key={node.name}
              node={node}
              expanded={expandedNodes.has(node.name)}
              onToggle={() => toggleNode(node.name)}
            />
          ))}
        </div>
      )}

      {viewMode === 'hex' && (
        <>
          <HexMap groups={nodeHexGroups} onContextMenu={handleContextMenu} />

          {/* Legend */}
          <div className="hex-legend">
            <span className="hex-legend-title">CPU Usage</span>
            <div className="hex-legend-gradient">
              <span>0%</span>
              <div className="hex-legend-bar" />
              <span>100%</span>
            </div>
            <span style={{ marginLeft: 'var(--space-4)' }}>
              <span style={{ display: 'inline-block', width: '10px', height: '10px', background: '#60a5fa', borderRadius: '2px', verticalAlign: 'middle', marginRight: '4px' }} />
              Completed
            </span>
            <span>
              <span style={{ display: 'inline-block', width: '10px', height: '10px', background: '#6b7280', borderRadius: '2px', verticalAlign: 'middle', marginRight: '4px' }} />
              Pending
            </span>
          </div>

          <ContextMenu
            visible={ctxMenu.visible}
            x={ctxMenu.x}
            y={ctxMenu.y}
            pod={ctxMenu.pod}
            onClose={closeContextMenu}
          />
        </>
      )}

      {viewMode === 'table' && (
        <ResourceTable columns={columns} data={nodes} renderRow={(node) => {
            const internalIP = node.addresses.find((a) => a.type === 'InternalIP')
            const pressureConditions = node.conditions.filter(
              (c) => c.type !== 'Ready' && c.status === 'True'
            )

            return (
              <tr key={node.name} style={{ cursor: 'pointer' }} onClick={() => navigate(`/cluster/nodes/${node.name}`)}>
                <td className="col-status">
                  <StatusDot status={node.status} />
                </td>
                <td className="name-cell">
                  <Link to={`/cluster/nodes/${node.name}`}>{node.name}</Link>
                </td>
                <td>
                  <Badge color={node.roleBadgeColor}>{node.roles}</Badge>
                </td>
                <td className="mono">{node.version}</td>
                <td className="tabular">{node.cpuCores}</td>
                <td className="tabular">{node.memory}</td>
                <td className="tabular">{node.pods}</td>
                <td>
                  <div style={{ display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap' }}>
                    <Badge color="green">Ready</Badge>
                    {pressureConditions.map((c) => (
                      <Badge key={c.type} color="red">{c.type}</Badge>
                    ))}
                    {node.taints.length > 0 && (
                      <Badge color="gray">{node.taints.length} taint{node.taints.length > 1 ? 's' : ''}</Badge>
                    )}
                  </div>
                </td>
                <td className="mono">{internalIP?.address || '—'}</td>
                <td>{node.age}</td>
              </tr>
            )
          }} />
      )}
    </div>
  )
}
