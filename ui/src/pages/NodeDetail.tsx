import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useKubeResources } from '../hooks/useKubeResource'
import { usePodMetrics } from '../hooks/usePodMetrics'
import { GetResource, AddNodeTaint, RemoveNodeTaint } from '../wailsjs/go/handlers/ResourceHandler'
import type { ResourceItem, PodUsage } from '../wailsjs/go/handlers/ResourceHandler'
import { useToastStore } from '../stores/toastStore'
import { formatAge, rawSpec, rawStatus, rawMetadata, labelsMap, annotationsMap, labelsToKV, parseCpu, parseMemoryMiB, getBarColor } from '../lib/k8sFormatters'
import { StatusDot } from '../components/shared/StatusDot'
import { Badge } from '../components/shared/Badge'
import { DetailPanel } from '../components/detail/DetailPanel'
import { DetailTabs } from '../components/detail/DetailTabs'
import { ResourceEvents } from '../components/detail/ResourceEvents'
import type { NodeDetailData } from '../data/detailTypes'
import type { BadgeColor } from '../data/types'

const TABS = ['Overview', 'YAML', 'Events']

function nodeRoles(labels: Record<string, string>): string {
  const roles: string[] = []
  for (const key of Object.keys(labels)) {
    if (key.startsWith('node-role.kubernetes.io/')) {
      roles.push(key.replace('node-role.kubernetes.io/', ''))
    }
  }
  return roles.length > 0 ? roles.join(', ') : 'worker'
}

function roleBadgeColor(role: string): BadgeColor {
  return role.includes('control-plane') ? 'purple' : 'gray'
}

interface NodeDetailMetrics {
  cpuUsedMillis: number
  memUsedMiB: number
  cpuRequests: number
  cpuLimits: number
  memRequests: number
  memLimits: number
}

function transformNodeDetail(item: ResourceItem, podCount: number, metrics: NodeDetailMetrics): NodeDetailData {
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

export function NodeDetail() {
  const { name } = useParams<{ name: string }>()
  const [activeTab, setActiveTab] = useState('Overview')
  const addToast = useToastStore((s) => s.addToast)
  const [showAddTaint, setShowAddTaint] = useState(false)
  const [newTaintKey, setNewTaintKey] = useState('')
  const [newTaintValue, setNewTaintValue] = useState('')
  const [newTaintEffect, setNewTaintEffect] = useState('NoSchedule')
  const [taintLoading, setTaintLoading] = useState(false)

  // Sidebar node list
  const { data: nodeItems, isLoading: listLoading } = useKubeResources({
    group: '', version: 'v1', resource: 'nodes', namespace: '',
  })
  // Fetch all pods to count per node
  const { data: podItems } = useKubeResources({
    group: '', version: 'v1', resource: 'pods', namespace: '',
  })

  const { metrics: podMetrics } = usePodMetrics('')

  const nodeAggregates = useMemo(() => {
    const podCounts = new Map<string, number>()
    const metricsPerNode = new Map<string, NodeDetailMetrics>()

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

  // Pods scheduled on this node
  const nodePods = useMemo(() => {
    if (!name) return []
    return podItems
      .filter((pod) => {
        const spec = rawSpec(pod)
        return (spec.nodeName as string) === name
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
  }, [name, podItems, podMetrics])

  // Single node detail
  const [detail, setDetail] = useState<NodeDetailData | null>(null)
  const [detailLoading, setDetailLoading] = useState(true)
  const [detailError, setDetailError] = useState<string | null>(null)

  useEffect(() => {
    if (!name) return
    let cancelled = false
    setDetailLoading(true)
    setDetailError(null)

    const defaultMetrics: NodeDetailMetrics = { cpuUsedMillis: 0, memUsedMiB: 0, cpuRequests: 0, cpuLimits: 0, memRequests: 0, memLimits: 0 }

    GetResource('', 'v1', 'nodes', '', name)
      .then((item) => {
        if (cancelled) return
        setDetail(transformNodeDetail(item, nodeAggregates.podCounts.get(name) || 0, nodeAggregates.metricsPerNode.get(name) || defaultMetrics))
        setDetailLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setDetailError(String(err))
        setDetailLoading(false)
      })

    return () => { cancelled = true }
  }, [name, nodeAggregates])

  const handleAddTaint = useCallback(async () => {
    if (!name || !newTaintKey.trim()) return
    setTaintLoading(true)
    try {
      await AddNodeTaint(name, newTaintKey.trim(), newTaintValue.trim(), newTaintEffect)
      addToast({ type: 'success', title: `Added taint ${newTaintKey}` })
      setShowAddTaint(false)
      setNewTaintKey('')
      setNewTaintValue('')
      setNewTaintEffect('NoSchedule')
      // Refresh detail
      const item = await GetResource('', 'v1', 'nodes', '', name)
      const defaultMetrics: NodeDetailMetrics = { cpuUsedMillis: 0, memUsedMiB: 0, cpuRequests: 0, cpuLimits: 0, memRequests: 0, memLimits: 0 }
      setDetail(transformNodeDetail(item, nodeAggregates.podCounts.get(name) || 0, nodeAggregates.metricsPerNode.get(name) || defaultMetrics))
    } catch (err) {
      addToast({ type: 'error', title: 'Failed to add taint', description: String(err) })
    } finally {
      setTaintLoading(false)
    }
  }, [name, newTaintKey, newTaintValue, newTaintEffect, addToast, nodeAggregates])

  const handleRemoveTaint = useCallback(async (taintKey: string) => {
    if (!name) return
    setTaintLoading(true)
    try {
      await RemoveNodeTaint(name, taintKey)
      addToast({ type: 'success', title: `Removed taint ${taintKey}` })
      // Refresh detail
      const item = await GetResource('', 'v1', 'nodes', '', name)
      const defaultMetrics: NodeDetailMetrics = { cpuUsedMillis: 0, memUsedMiB: 0, cpuRequests: 0, cpuLimits: 0, memRequests: 0, memLimits: 0 }
      setDetail(transformNodeDetail(item, nodeAggregates.podCounts.get(name) || 0, nodeAggregates.metricsPerNode.get(name) || defaultMetrics))
    } catch (err) {
      addToast({ type: 'error', title: 'Failed to remove taint', description: String(err) })
    } finally {
      setTaintLoading(false)
    }
  }, [name, addToast, nodeAggregates])

  // Sidebar rows
  const sidebarNodes = nodeItems.map((item) => {
    const labels = labelsMap(item)
    const status = rawStatus(item)
    const nodeInfo = (status.nodeInfo || {}) as Record<string, string>
    const conditions = (status.conditions || []) as Array<Record<string, unknown>>
    const readyCond = conditions.find((c) => c.type === 'Ready')
    const role = nodeRoles(labels)

    return {
      name: item.name,
      status: readyCond && readyCond.status === 'True' ? 'ready' : 'not-ready',
      roles: role,
      roleBadgeColor: roleBadgeColor(role) as BadgeColor,
      version: nodeInfo.kubeletVersion || '',
      pods: nodeAggregates.podCounts.get(item.name) || 0,
      age: formatAge((rawMetadata(item).creationTimestamp as string) || ''),
    }
  })

  if (detailLoading || listLoading) {
    return (
      <div className="resource-view">
        <div style={{ padding: 'var(--space-6)', color: 'var(--text-secondary)' }}>Loading...</div>
      </div>
    )
  }

  if (detailError || !detail) {
    return (
      <div className="resource-view">
        <div style={{ padding: 'var(--space-6)', color: 'var(--text-secondary)' }}>
          {detailError || `Node "${name}" not found.`}{' '}
          <Link to="/cluster/nodes" style={{ color: 'var(--blue)' }}>Back to list</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="resource-view">
      <div className="resource-body">
        {/* Left: abridged node table */}
        <div className="resource-table-wrap">
          <table className="resource-table clickable">
            <thead>
              <tr>
                <th scope="col" className="col-status">Status</th>
                <th scope="col" className="col-name">Name</th>
                <th scope="col" className="col-sm">Roles</th>
                <th scope="col" className="col-sm">Version</th>
                <th scope="col" className="col-xs">Pods</th>
                <th scope="col" className="col-age">Age</th>
              </tr>
            </thead>
            <tbody>
              {sidebarNodes.map((node) => (
                <tr key={node.name} className={node.name === name ? 'selected' : undefined}>
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
                  <td className="tabular">{node.pods}</td>
                  <td>{node.age}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Right: Detail Panel */}
        <DetailPanel
          title={detail.name}
          subtitle={`Node (${detail.roles})`}
          onClose={() => window.history.back()}
        >
          <DetailTabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

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
                          ✕
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
                    <table className="resource-table clickable" style={{ fontSize: 'var(--text-xs)' }}>
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
                          <tr key={`${pod.namespace}/${pod.name}`}>
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
                <pre style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                  {detail.yaml}
                </pre>
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
      </div>
    </div>
  )
}
