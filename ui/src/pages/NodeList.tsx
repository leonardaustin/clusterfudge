import { useState, useEffect, useMemo, useCallback, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useKubeResources } from '../hooks/useKubeResource'
import { usePodMetrics } from '../hooks/usePodMetrics'
import { GetResource, AddNodeTaint, RemoveNodeTaint } from '../wailsjs/go/handlers/ResourceHandler'
import type { ResourceItem, PodUsage } from '../wailsjs/go/handlers/ResourceHandler'
import { formatAge, rawSpec, rawStatus, rawMetadata, labelsMap, annotationsMap, labelsToKV, parseCpu, parseMemoryMiB, getBarColor } from '../lib/k8sFormatters'
import { StatusDot } from '../components/shared/StatusDot'
import { Badge } from '../components/shared/Badge'
import { ResourceHeader } from '../components/shared/ResourceHeader'
import { ResourceTable } from '../components/shared/ResourceTable'
import type { Column } from '../components/shared/ResourceTable'
import { ResourceContextMenu } from '../components/dialogs/ResourceContextMenu'
import { PortForwardDialog } from '../components/dialogs/PortForwardDialog'
import { DetailPanel } from '../components/detail/DetailPanel'
import { CodeBlock } from '@/components/shared/CodeBlock'
import { DetailTabs } from '../components/detail/DetailTabs'
import { ResourceEvents } from '../components/detail/ResourceEvents'
import type { NodeDetailData } from '../data/detailTypes'
import type { ClusterNode, BadgeColor, BarColor, NodeCondition, NodeTaint, NodeAddress, AllocatedResources, HexPod, NodeHexGroup } from '../data/types'
import { useClusterStore } from '../stores/clusterStore'
import { useSelectionStore } from '../stores/selectionStore'
import { useToastStore } from '../stores/toastStore'
import { useUIStore } from '../stores/uiStore'
import { GetEnabledAIProviders } from '../wailsjs/go/handlers/AIHandler'
import type { AIProviderInfo } from '../wailsjs/go/handlers/AIHandler'
import { HexMap } from '../components/hex/HexMap'

const DETAIL_TABS = ['Overview', 'YAML', 'Events']

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

function transformNodeDetail(item: ResourceItem, podCount: number, metrics: NodeMetrics): NodeDetailData {
  const spec = rawSpec(item)
  const status = rawStatus(item)
  const meta = rawMetadata(item)
  const labels = labelsMap(item)
  const annotations = annotationsMap(item)
  const nodeInfo = (status.nodeInfo || {}) as Record<string, string>
  const allocatable = (status.allocatable || {}) as Record<string, string>
  const capacity = (status.capacity || {}) as Record<string, string>

  const conditions = ((status.conditions || []) as Array<Record<string, unknown>>).map((c) => ({
    type: c.type as string,
    status: c.status === 'True',
    reason: (c.reason as string) || '',
    message: (c.message as string) || '',
    lastTransitionTime: (c.lastTransitionTime as string) || '',
  }))

  const taints = ((spec.taints || []) as Array<Record<string, unknown>>).map((t) => ({
    key: (t.key as string) || '',
    value: (t.value as string) || '',
    effect: (t.effect as string) || '',
  }))

  const addresses = ((status.addresses || []) as Array<Record<string, string>>).map((a) => ({
    type: a.type || '',
    address: a.address || '',
  }))

  const readyCond = conditions.find((c) => c.type === 'Ready')

  const cpuAllocatable = parseCpu(allocatable.cpu)
  const memAllocatable = parseMemoryMiB(allocatable.memory)
  const cpuPercent = cpuAllocatable > 0 ? Math.round((metrics.cpuUsedMillis / cpuAllocatable) * 100) : 0
  const memPercent = memAllocatable > 0 ? Math.round((metrics.memUsedMiB / memAllocatable) * 100) : 0

  return {
    name: item.name,
    roles: nodeRoles(labels),
    status: readyCond?.status ? 'Ready' : 'NotReady',
    version: nodeInfo.kubeletVersion || '',
    osImage: nodeInfo.osImage || '',
    os: nodeInfo.operatingSystem || 'linux',
    arch: nodeInfo.architecture || 'amd64',
    kernel: nodeInfo.kernelVersion || '',
    containerRuntime: nodeInfo.containerRuntimeVersion || '',
    addresses,
    labels: labelsToKV(labels),
    annotations: labelsToKV(annotations),
    created: (meta.creationTimestamp as string) || '',
    conditions,
    taints,
    resources: {
      cpu: {
        capacity: capacity.cpu || '0',
        allocatable: `${cpuAllocatable}m`,
        requests: `${metrics.cpuRequests}m`,
        limits: `${metrics.cpuLimits}m`,
        usage: `${metrics.cpuUsedMillis}m`,
        usagePercent: cpuPercent,
      },
      memory: {
        capacity: capacity.memory || '0',
        allocatable: `${Math.round(memAllocatable / 1024 * 10) / 10}Gi`,
        requests: `${Math.round(metrics.memRequests)}Mi`,
        limits: `${Math.round(metrics.memLimits)}Mi`,
        usage: `${Math.round(metrics.memUsedMiB)}Mi`,
        usagePercent: memPercent,
      },
      ephemeralStorage: {
        capacity: capacity['ephemeral-storage'] || '0',
        allocatable: allocatable['ephemeral-storage'] || '0',
        usage: '-',
        usagePercent: 0,
      },
      pods: {
        capacity: parseInt(capacity.pods || '110', 10),
        allocatable: parseInt(allocatable.pods || '110', 10),
        running: podCount,
        usagePercent: parseInt(allocatable.pods || '110', 10) > 0 ? Math.round((podCount / parseInt(allocatable.pods || '110', 10)) * 100) : 0,
      },
    },
    pods: [],
    events: [],
    yaml: JSON.stringify(item.raw, null, 2),
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
  if (pct >= 80) return 'var(--red)'
  if (pct >= 60) return 'var(--yellow)'
  if (pct >= 40) return 'var(--yellow)'
  if (pct >= 20) return 'var(--green)'
  return 'var(--green)'
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
      if (displayStatus === 'Completed' || displayStatus === 'Succeeded') fill = 'var(--blue)'
      if (displayStatus === 'Pending') fill = 'var(--gray)'
      if (displayStatus === 'CrashLoopBackOff' || displayStatus === 'Failed') fill = 'var(--red)'

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
  const { name: selectedName } = useParams<{ name?: string }>()
  const panelOpen = !!selectedName

  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<ViewMode>('hex')
  const [activeTab, setActiveTab] = useState('Overview')
  const [aiProviders, setAiProviders] = useState<AIProviderInfo[]>([])
  const [portForwardTarget, setPortForwardTarget] = useState<{
    name: string
    namespace: string
    ports: Array<{ containerPort: number; protocol?: string; name?: string }>
  } | null>(null)
  const selectedNamespace = useClusterStore((s) => s.selectedNamespace)
  const addToast = useToastStore((s) => s.addToast)
  const setSelectedResource = useSelectionStore((s) => s.setSelectedResource)
  const clearSelection = useSelectionStore((s) => s.clearSelection)
  const setAITarget = useUIStore((s) => s.setAITarget)
  const setBottomTrayTab = useUIStore((s) => s.setBottomTrayTab)

  // Detail state
  const [detail, setDetail] = useState<NodeDetailData | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  // Taint management state
  const [showAddTaint, setShowAddTaint] = useState(false)
  const [newTaintKey, setNewTaintKey] = useState('')
  const [newTaintValue, setNewTaintValue] = useState('')
  const [newTaintEffect, setNewTaintEffect] = useState('NoSchedule')
  const [taintLoading, setTaintLoading] = useState(false)

  // List data
  const { data: nodeItems, isLoading, error } = useKubeResources({
    group: '', version: 'v1', resource: 'nodes', namespace: '',
  })
  const { data: podItems } = useKubeResources({
    group: '', version: 'v1', resource: 'pods', namespace: '',
  })
  const { metrics: podMetrics } = usePodMetrics('')

  // Aggregated node metrics (reused for both list and detail)
  const nodeAggregates = useMemo(() => {
    const podCounts = new Map<string, number>()
    const metricsPerNode = new Map<string, NodeMetrics>()

    for (const pod of podItems) {
      const spec = rawSpec(pod)
      const nodeName = (spec.nodeName as string) || ''
      if (!nodeName) continue

      podCounts.set(nodeName, (podCounts.get(nodeName) || 0) + 1)

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

    return { podCounts, metricsPerNode }
  }, [podItems, podMetrics])

  const nodes = useMemo(() => {
    const defaultMetrics: NodeMetrics = { cpuUsedMillis: 0, memUsedMiB: 0, cpuRequests: 0, cpuLimits: 0, memRequests: 0, memLimits: 0 }
    return nodeItems.map((item) => transformNode(item, nodeAggregates.podCounts.get(item.name) || 0, nodeAggregates.metricsPerNode.get(item.name) || defaultMetrics))
  }, [nodeItems, nodeAggregates])

  // Pods scheduled on the selected node (for detail panel)
  const nodePods = useMemo(() => {
    if (!selectedName) return []
    return podItems
      .filter((pod) => {
        const spec = rawSpec(pod)
        return (spec.nodeName as string) === selectedName
      })
      .map((pod) => {
        const status = rawStatus(pod)
        const phase = (status.phase as string) || 'Unknown'
        const key = `${pod.namespace}/${pod.name}`
        const m: PodUsage | undefined = podMetrics.get(key)
        return {
          name: pod.name,
          namespace: pod.namespace,
          status: phase,
          cpu: m ? `${Math.round(m.cpuCores * 1000)}m` : '-',
          memory: m ? `${Math.round(m.memoryMiB)}Mi` : '-',
        }
      })
  }, [selectedName, podItems, podMetrics])

  // Detail fetch
  useEffect(() => {
    if (!selectedName) {
      setDetail(null)
      setDetailError(null)
      return
    }
    let cancelled = false
    setDetailLoading(true)
    setDetailError(null)

    const defaultMetrics: NodeMetrics = { cpuUsedMillis: 0, memUsedMiB: 0, cpuRequests: 0, cpuLimits: 0, memRequests: 0, memLimits: 0 }

    GetResource('', 'v1', 'nodes', '', selectedName)
      .then((item) => {
        if (cancelled) return
        setDetail(transformNodeDetail(item, nodeAggregates.podCounts.get(selectedName) || 0, nodeAggregates.metricsPerNode.get(selectedName) || defaultMetrics))
        setDetailLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setDetailError(String(err))
        setDetailLoading(false)
      })

    return () => { cancelled = true }
  }, [selectedName, nodeAggregates])

  // Write to selectionStore when detail panel opens/closes
  useEffect(() => {
    if (selectedName && detail) {
      setSelectedResource({
        kind: 'Node',
        name: selectedName,
        path: `/cluster/nodes/${selectedName}`,
      })
    } else if (!selectedName) {
      clearSelection()
    }
  }, [selectedName, detail, setSelectedResource, clearSelection])

  // Reset tab when switching nodes
  useEffect(() => {
    setActiveTab('Overview')
  }, [selectedName])

  // Taint management callbacks
  const handleAddTaint = useCallback(async () => {
    if (!selectedName || !newTaintKey.trim()) return
    setTaintLoading(true)
    try {
      await AddNodeTaint(selectedName, newTaintKey.trim(), newTaintValue.trim(), newTaintEffect)
      addToast({ type: 'success', title: `Added taint ${newTaintKey}` })
      setShowAddTaint(false)
      setNewTaintKey('')
      setNewTaintValue('')
      setNewTaintEffect('NoSchedule')
      // Refresh detail
      const item = await GetResource('', 'v1', 'nodes', '', selectedName)
      const defaultMetrics: NodeMetrics = { cpuUsedMillis: 0, memUsedMiB: 0, cpuRequests: 0, cpuLimits: 0, memRequests: 0, memLimits: 0 }
      setDetail(transformNodeDetail(item, nodeAggregates.podCounts.get(selectedName) || 0, nodeAggregates.metricsPerNode.get(selectedName) || defaultMetrics))
    } catch (err) {
      addToast({ type: 'error', title: 'Failed to add taint', description: String(err) })
    } finally {
      setTaintLoading(false)
    }
  }, [selectedName, newTaintKey, newTaintValue, newTaintEffect, addToast, nodeAggregates])

  const handleRemoveTaint = useCallback(async (taintKey: string) => {
    if (!selectedName) return
    setTaintLoading(true)
    try {
      await RemoveNodeTaint(selectedName, taintKey)
      addToast({ type: 'success', title: `Removed taint ${taintKey}` })
      // Refresh detail
      const item = await GetResource('', 'v1', 'nodes', '', selectedName)
      const defaultMetrics: NodeMetrics = { cpuUsedMillis: 0, memUsedMiB: 0, cpuRequests: 0, cpuLimits: 0, memRequests: 0, memLimits: 0 }
      setDetail(transformNodeDetail(item, nodeAggregates.podCounts.get(selectedName) || 0, nodeAggregates.metricsPerNode.get(selectedName) || defaultMetrics))
    } catch (err) {
      addToast({ type: 'error', title: 'Failed to remove taint', description: String(err) })
    } finally {
      setTaintLoading(false)
    }
  }, [selectedName, addToast, nodeAggregates])

  // Hex map groups — filter pods by selected namespace for the hex visualization
  const nodeHexGroups = useMemo(() => {
    const filteredPods = selectedNamespace
      ? podItems.filter((p) => p.namespace === selectedNamespace)
      : podItems
    return buildHexGroups(nodeItems, filteredPods, podMetrics as Map<string, { cpuCores: number; memoryMiB: number }>)
  }, [nodeItems, podItems, podMetrics, selectedNamespace])

  const totalPods = nodeHexGroups.reduce((sum, g) => sum + g.podCount, 0)

  // AI provider check (for hex map context menu)
  useEffect(() => {
    GetEnabledAIProviders().then((p) => setAiProviders(p || [])).catch(() => setAiProviders([]))
  }, [])

  // Extract container ports from a pod item for port forward dialog
  const extractPorts = useCallback((podItem: ResourceItem) => {
    const r = (podItem.raw || {}) as Record<string, unknown>
    const spec = (r.spec || {}) as Record<string, unknown>
    const containers = (spec.containers || []) as Array<Record<string, unknown>>
    return containers.flatMap((c) => {
      const ports = (Array.isArray(c.ports) ? c.ports : []) as Array<Record<string, unknown>>
      return ports.map((p) => ({
        containerPort: p.containerPort as number,
        protocol: p.protocol as string | undefined,
        name: p.name as string | undefined,
      }))
    })
  }, [])

  const openPortForward = useCallback((podName: string, podNamespace: string) => {
    const podItem = podItems.find((i) => i.name === podName && i.namespace === podNamespace)
    const ports = podItem ? extractPorts(podItem) : []
    setPortForwardTarget({ name: podName, namespace: podNamespace, ports })
  }, [podItems, extractPorts])

  const wrapPod = useCallback((pod: HexPod, children: ReactNode): ReactNode => {
    return (
      <ResourceContextMenu
        kind="Pod"
        name={pod.name}
        isRunning={pod.status === 'Running'}
        aiProviders={aiProviders}
        actions={{
          onViewDetails: () => navigate(`/workloads/pods/${pod.namespace}/${pod.name}`),
          onViewLogs: () => {
            setSelectedResource({
              kind: 'Pod',
              name: pod.name,
              namespace: pod.namespace,
              path: `/pods/${pod.name}`,
              raw: {},
            })
            setBottomTrayTab('logs')
          },
          onExecShell: () => {
            setSelectedResource({
              kind: 'Pod',
              name: pod.name,
              namespace: pod.namespace,
              path: `/pods/${pod.name}`,
              raw: {},
            })
            setBottomTrayTab('terminal')
          },
          onAIDiagnose: (providerID: string) => {
            const provider = aiProviders.find((p) => p.id === providerID)
            setAITarget({
              namespace: pod.namespace,
              name: pod.name,
              providerID,
              providerName: provider?.name || providerID,
            })
            setBottomTrayTab('ai')
          },
          onPortForward: () => openPortForward(pod.name, pod.namespace),
        }}
      >
        {children}
      </ResourceContextMenu>
    )
  }, [aiProviders, navigate, setSelectedResource, setBottomTrayTab, setAITarget, openPortForward])

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

      <div style={panelOpen ? { flex: 1, overflow: 'hidden', display: 'flex' } : { display: 'contents' }}>
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
            <HexMap groups={nodeHexGroups} wrapPod={wrapPod} />

            {/* Legend */}
            <div className="hex-legend">
              <span className="hex-legend-title">CPU Usage</span>
              <div className="hex-legend-gradient">
                <span>0%</span>
                <div className="hex-legend-bar" />
                <span>100%</span>
              </div>
              <span style={{ marginLeft: 'var(--space-4)' }}>
                <span style={{ display: 'inline-block', width: '10px', height: '10px', background: 'var(--blue)', borderRadius: '2px', verticalAlign: 'middle', marginRight: '4px' }} />
                Completed
              </span>
              <span>
                <span style={{ display: 'inline-block', width: '10px', height: '10px', background: 'var(--gray)', borderRadius: '2px', verticalAlign: 'middle', marginRight: '4px' }} />
                Pending
              </span>
            </div>
          </>
        )}

        {viewMode === 'table' && (
          <ResourceTable columns={columns} data={nodes} renderRow={(node) => {
              const internalIP = node.addresses.find((a) => a.type === 'InternalIP')
              const pressureConditions = node.conditions.filter(
                (c) => c.type !== 'Ready' && c.status === 'True'
              )
              const isSelected = node.name === selectedName

              return (
                <tr key={node.name} className={isSelected ? 'selected' : undefined} style={{ cursor: 'pointer' }} onClick={() => navigate(`/cluster/nodes/${node.name}`)}>
                  <td className="col-status">
                    <StatusDot status={node.status} />
                  </td>
                  <td className="name-cell">{node.name}</td>
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
                  <td className="mono">{internalIP?.address || '\u2014'}</td>
                  <td>{node.age}</td>
                </tr>
              )
            }} />
        )}

        {panelOpen && (
          <>
            {detailLoading && !detail ? (
              <DetailPanel
                title="Loading..."
                subtitle=""
                onClose={() => navigate('/cluster/nodes')}
              >
                <div style={{ padding: 'var(--space-4)', color: 'var(--text-secondary)' }}>Loading...</div>
              </DetailPanel>
            ) : detailError ? (
              <DetailPanel
                title="Error"
                subtitle=""
                onClose={() => navigate('/cluster/nodes')}
              >
                <div style={{ padding: 'var(--space-4)', color: 'var(--text-secondary)' }}>
                  {detailError}
                </div>
              </DetailPanel>
            ) : detail ? (
              <DetailPanel
                title={detail.name}
                subtitle={`Node (${detail.roles})`}
                onClose={() => navigate('/cluster/nodes')}
              >
                <DetailTabs tabs={DETAIL_TABS} activeTab={activeTab} onTabChange={setActiveTab} />

                <div className="detail-panel-body">
                  {activeTab === 'Overview' && (
                    <>
                      {/* Status badges */}
                      <div style={{ marginBottom: 'var(--space-4)' }}>
                        <span className="badge badge-green">{detail.status}</span>
                        <span className={`badge badge-${detail.roles === 'control-plane' ? 'purple' : 'gray'}`} style={{ marginLeft: '4px' }}>
                          {detail.roles}
                        </span>
                      </div>

                      {/* System Info */}
                      <div className="prop-list">
                        <span className="prop-group-title">System Info</span>

                        <span className="prop-label">Name</span>
                        <span className="prop-value">{detail.name}</span>

                        <span className="prop-label">Roles</span>
                        <span className="prop-value">{detail.roles}</span>

                        <span className="prop-label">Version</span>
                        <span className="prop-value mono">{detail.version}</span>

                        <span className="prop-label">OS / Arch</span>
                        <span className="prop-value">{detail.os}/{detail.arch}</span>

                        <span className="prop-label">OS Image</span>
                        <span className="prop-value">{detail.osImage}</span>

                        <span className="prop-label">Kernel</span>
                        <span className="prop-value mono">{detail.kernel}</span>

                        <span className="prop-label">Container Runtime</span>
                        <span className="prop-value mono">{detail.containerRuntime}</span>

                        <span className="prop-label">Created</span>
                        <span className="prop-value">{detail.created}</span>

                        <span className="prop-group-title">Addresses</span>
                      </div>
                      <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-xs)' }}>
                        {detail.addresses.map((addr) => (
                          <div
                            key={addr.type}
                            style={{
                              display: 'flex',
                              gap: 'var(--space-3)',
                              padding: 'var(--space-1) 0',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            <span style={{ minWidth: '100px', color: 'var(--text-tertiary)' }}>{addr.type}</span>
                            <span className="mono">{addr.address}</span>
                          </div>
                        ))}
                      </div>

                      {/* Labels */}
                      <div className="prop-list" style={{ marginTop: 'var(--space-4)' }}>
                        <span className="prop-group-title">Labels</span>
                      </div>
                      <div style={{ marginTop: 'var(--space-2)', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {detail.labels.map((l) => (
                          <span key={l.key} className="tag">
                            {l.key}{l.value ? `=${l.value}` : ''}
                          </span>
                        ))}
                      </div>

                      {/* Conditions */}
                      <div className="prop-list" style={{ marginTop: 'var(--space-4)' }}>
                        <span className="prop-group-title">Conditions</span>
                      </div>
                      <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)' }}>
                        {detail.conditions.map((cond) => {
                          const isGood = (cond.type === 'Ready' && cond.status) || (cond.type !== 'Ready' && !cond.status)
                          return (
                            <div
                              key={cond.type}
                              style={{
                                display: 'flex',
                                gap: 'var(--space-3)',
                                padding: 'var(--space-1) 0',
                                color: 'var(--text-secondary)',
                              }}
                            >
                              <span style={{ color: isGood ? 'var(--green)' : 'var(--red)' }}>
                                {isGood ? '\u2713' : '\u2717'}
                              </span>
                              <span style={{ minWidth: '140px' }}>{cond.type}</span>
                              <span style={{ color: 'var(--text-tertiary)' }}>{cond.reason}</span>
                            </div>
                          )
                        })}
                      </div>

                      {/* Taints */}
                      <div className="prop-list" style={{ marginTop: 'var(--space-4)' }}>
                        <span className="prop-group-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          Taints ({detail.taints.length})
                          <button
                            className="settings-btn"
                            style={{ fontSize: 'var(--text-2xs)', padding: '1px 6px', marginLeft: 'auto' }}
                            onClick={() => setShowAddTaint(!showAddTaint)}
                            disabled={taintLoading}
                          >
                            {showAddTaint ? 'Cancel' : '+ Add Taint'}
                          </button>
                        </span>
                      </div>
                      {showAddTaint && (
                        <div style={{ marginTop: 'var(--space-2)', padding: 'var(--space-2)', border: '1px solid var(--border)', borderRadius: '4px', fontSize: 'var(--text-xs)' }}>
                          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'end' }}>
                            <div>
                              <label htmlFor="taint-key" style={{ display: 'block', color: 'var(--text-tertiary)', marginBottom: '2px' }}>Key</label>
                              <input
                                id="taint-key"
                                className="settings-input"
                                value={newTaintKey}
                                onChange={(e) => setNewTaintKey(e.target.value)}
                                style={{ width: '120px', fontSize: 'var(--text-xs)' }}
                                placeholder="node.kubernetes.io/..."
                              />
                            </div>
                            <div>
                              <label htmlFor="taint-value" style={{ display: 'block', color: 'var(--text-tertiary)', marginBottom: '2px' }}>Value</label>
                              <input
                                id="taint-value"
                                className="settings-input"
                                value={newTaintValue}
                                onChange={(e) => setNewTaintValue(e.target.value)}
                                style={{ width: '100px', fontSize: 'var(--text-xs)' }}
                                placeholder="optional"
                              />
                            </div>
                            <div>
                              <label htmlFor="taint-effect" style={{ display: 'block', color: 'var(--text-tertiary)', marginBottom: '2px' }}>Effect</label>
                              <select
                                id="taint-effect"
                                className="settings-input"
                                value={newTaintEffect}
                                onChange={(e) => setNewTaintEffect(e.target.value)}
                                style={{ fontSize: 'var(--text-xs)' }}
                              >
                                <option value="NoSchedule">NoSchedule</option>
                                <option value="PreferNoSchedule">PreferNoSchedule</option>
                                <option value="NoExecute">NoExecute</option>
                              </select>
                            </div>
                            <button
                              className="settings-btn"
                              style={{ fontSize: 'var(--text-2xs)', padding: '2px 8px' }}
                              onClick={handleAddTaint}
                              disabled={taintLoading || !newTaintKey.trim()}
                            >
                              {taintLoading ? 'Adding...' : 'Add'}
                            </button>
                          </div>
                        </div>
                      )}
                      {detail.taints.length === 0 ? (
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', padding: 'var(--space-2) 0' }}>
                          No taints
                        </div>
                      ) : (
                        <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)' }}>
                          {detail.taints.map((taint, i) => (
                            <div
                              key={i}
                              style={{
                                display: 'flex',
                                gap: 'var(--space-3)',
                                padding: 'var(--space-1) 0',
                                color: 'var(--text-secondary)',
                                alignItems: 'center',
                              }}
                            >
                              <span className="mono" style={{ color: 'var(--text-primary)' }}>
                                {taint.key}{taint.value ? `=${taint.value}` : ''}
                              </span>
                              <span className={`badge badge-${taint.effect === 'NoSchedule' ? 'red' : taint.effect === 'NoExecute' ? 'red' : 'yellow'}`} style={{ fontSize: 'var(--text-2xs)' }}>
                                {taint.effect}
                              </span>
                              <button
                                className="settings-btn danger"
                                style={{ fontSize: 'var(--text-2xs)', padding: '0px 4px', marginLeft: 'auto' }}
                                onClick={() => handleRemoveTaint(taint.key)}
                                disabled={taintLoading}
                                aria-label={`Remove taint ${taint.key}`}
                              >
                                &#10005;
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Resource Capacity */}
                      <div className="prop-list" style={{ marginTop: 'var(--space-4)' }}>
                        <span className="prop-group-title">Resource Capacity</span>
                      </div>
                      <div style={{ marginTop: 'var(--space-3)' }}>
                        <div style={{ marginBottom: 'var(--space-4)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', marginBottom: '2px' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>CPU</span>
                            <span className="mono" style={{ color: 'var(--text-primary)' }}>{detail.resources.cpu.usage} / {detail.resources.cpu.allocatable} ({detail.resources.cpu.usagePercent}%)</span>
                          </div>
                          <div className="metric-bar" style={{ height: '3px', marginTop: '2px' }}>
                            <div className={`metric-bar-fill ${getBarColor(detail.resources.cpu.usagePercent)}`} style={{ width: `${detail.resources.cpu.usagePercent}%` }} />
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                            <span>Requests: {detail.resources.cpu.requests}</span>
                            <span>Limits: {detail.resources.cpu.limits}</span>
                          </div>
                        </div>

                        <div style={{ marginBottom: 'var(--space-4)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', marginBottom: '2px' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Memory</span>
                            <span className="mono" style={{ color: 'var(--text-primary)' }}>{detail.resources.memory.usage} / {detail.resources.memory.allocatable} ({detail.resources.memory.usagePercent}%)</span>
                          </div>
                          <div className="metric-bar" style={{ height: '3px', marginTop: '2px' }}>
                            <div className={`metric-bar-fill ${getBarColor(detail.resources.memory.usagePercent)}`} style={{ width: `${detail.resources.memory.usagePercent}%` }} />
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                            <span>Requests: {detail.resources.memory.requests}</span>
                            <span>Limits: {detail.resources.memory.limits}</span>
                          </div>
                        </div>

                        <div style={{ marginBottom: 'var(--space-4)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', marginBottom: '2px' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Pods</span>
                            <span className="mono" style={{ color: 'var(--text-primary)' }}>{detail.resources.pods.running} / {detail.resources.pods.allocatable} ({detail.resources.pods.usagePercent}%)</span>
                          </div>
                          <div className="metric-bar" style={{ height: '3px', marginTop: '2px' }}>
                            <div className={`metric-bar-fill ${getBarColor(detail.resources.pods.usagePercent)}`} style={{ width: `${detail.resources.pods.usagePercent}%` }} />
                          </div>
                        </div>
                      </div>

                      {/* Scheduled Pods */}
                      <div className="prop-list" style={{ marginTop: 'var(--space-4)' }}>
                        <span className="prop-group-title">Scheduled Pods ({nodePods.length})</span>
                      </div>
                      {nodePods.length === 0 ? (
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', padding: 'var(--space-2) 0' }}>
                          No pods scheduled on this node
                        </div>
                      ) : (
                        <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)', overflowX: 'auto', maxHeight: '200px', overflowY: 'auto' }}>
                          <table className="resource-table" style={{ fontSize: 'var(--text-xs)' }}>
                            <thead>
                              <tr>
                                <th scope="col">Name</th>
                                <th scope="col">Namespace</th>
                                <th scope="col">Status</th>
                                <th scope="col">CPU</th>
                                <th scope="col">Memory</th>
                              </tr>
                            </thead>
                            <tbody>
                              {nodePods.map((pod) => (
                                <tr key={`${pod.namespace}/${pod.name}`} style={{ cursor: 'pointer' }} onClick={() => navigate(`/workloads/pods/${pod.namespace}/${pod.name}`)}>
                                  <td className="name-cell">
                                    <Link to={`/workloads/pods/${pod.namespace}/${pod.name}`}>{pod.name}</Link>
                                  </td>
                                  <td>{pod.namespace}</td>
                                  <td>
                                    <StatusDot status={pod.status.toLowerCase()} />
                                    {' '}{pod.status}
                                  </td>
                                  <td className="mono">{pod.cpu}</td>
                                  <td className="mono">{pod.memory}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  )}

                  {activeTab === 'YAML' && (
                    <div className="log-viewer" style={{ maxHeight: '500px' }}>
                      <CodeBlock code={detail.yaml} language="json" />
                    </div>
                  )}

                  {activeTab === 'Events' && (
                    <ResourceEvents
                      name={detail.name}
                      namespace={undefined}
                      resourceType="nodes"
                    />
                  )}
                </div>
              </DetailPanel>
            ) : null}
          </>
        )}
      </div>

      {portForwardTarget && (
        <PortForwardDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setPortForwardTarget(null)
          }}
          podName={portForwardTarget.name}
          namespace={portForwardTarget.namespace}
          containerPorts={portForwardTarget.ports}
        />
      )}
    </div>
  )
}
