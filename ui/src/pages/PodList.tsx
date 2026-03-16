import { Bot } from 'lucide-react'
import { useState, useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ContainerCard } from '../components/detail/ContainerCard'
import { DetailPanel } from '../components/detail/DetailPanel'
import { DetailTabs } from '../components/detail/DetailTabs'
import { ResourceEvents } from '../components/detail/ResourceEvents'
import { LabelEditor } from '../components/shared/LabelEditor'
import { SearchInput } from '../components/shared/SearchInput'
import { Sparkline } from '../components/shared/Sparkline'
import { StatusDot } from '../components/shared/StatusDot'
import { ResourceHeader } from '../components/shared/ResourceHeader'
import { ResourceTable } from '../components/shared/ResourceTable'
import type { Column } from '../components/shared/ResourceTable'
import type { BarColor, PodDetailData, ContainerInfo } from '../data/types'
import { resolveTopOwnerFromRaw } from '../data/ownerRefs'
import { useKubeResources } from '../hooks/useKubeResource'
import { useMetricsHistory } from '../hooks/useMetricsHistory'
import { usePodMetrics } from '../hooks/usePodMetrics'
import { formatAge, parseCpu, parseMemoryMiB, rawSpec, rawStatus, rawMetadata, labelsMap, annotationsMap, labelsToKV } from '../lib/k8sFormatters'
import { RESOURCE_CONFIG } from '../lib/resourceConfig'
import { useClusterStore } from '../stores/clusterStore'
import { useSelectionStore } from '../stores/selectionStore'
import { useUIStore } from '../stores/uiStore'
import { GetAIProviderName } from '../wailsjs/go/handlers/AIHandler'
import { GetResource } from '../wailsjs/go/handlers/ResourceHandler'
import type { ResourceItem } from '../wailsjs/go/handlers/ResourceHandler'

const DETAIL_TABS = ['Overview', 'YAML', 'Events']

const columns: Column[] = [
  { key: 'status', label: 'Status', className: 'col-status' },
  { key: 'name', label: 'Name', className: 'col-name' },
  { key: 'namespace', label: 'Namespace', className: 'col-md' },
  { key: 'owner', label: 'Owner', className: 'col-md' },
  { key: 'ready', label: 'Ready', className: 'col-xs' },
  { key: 'restarts', label: 'Restarts', className: 'col-sm' },
  { key: 'cpu', label: 'CPU', className: 'col-md' },
  { key: 'memory', label: 'Memory', className: 'col-md' },
  { key: 'node', label: 'Node', className: 'col-md' },
  { key: 'age', label: 'Age', className: 'col-age' },
]

function getNamespaceStyle(ns: string): { className?: string; style?: React.CSSProperties } {
  switch (ns) {
    case 'kube-system':
      return { className: 'mono', style: { color: 'var(--purple)' } }
    case 'monitoring':
      return { className: 'mono', style: { color: 'var(--blue)' } }
    default:
      return {}
  }
}

function getBarColor(percent: number): BarColor {
  if (percent >= 80) return 'red'
  if (percent >= 50) return 'yellow'
  return 'green'
}

function InlineMetricBar({ usage, limit, label }: { usage?: number; limit?: number; label: string }) {
  if (usage == null) {
    return <span style={{ color: 'var(--text-disabled)' }}>-</span>
  }
  const percent = limit && limit > 0 ? Math.min(Math.round((usage / limit) * 100), 100) : 0
  const color = getBarColor(percent)
  const display = label === 'cpu' ? `${usage}m` : `${usage}Mi`

  return (
    <div style={{ minWidth: '80px' }}>
      <div style={{ fontSize: 'var(--text-xs)', marginBottom: '2px' }}>
        <span className="tabular">{display}</span>
        {limit != null && limit > 0 && (
          <span style={{ color: 'var(--text-disabled)', marginLeft: '4px' }}>
            / {label === 'cpu' ? `${limit}m` : `${limit}Mi`}
          </span>
        )}
      </div>
      {limit != null && limit > 0 && (
        <div className="metric-bar" style={{ height: '3px', marginTop: 0 }}>
          <div className={`metric-bar-fill ${color}`} style={{ width: `${percent}%` }} />
        </div>
      )}
    </div>
  )
}

function podStatusFromRaw(item: ResourceItem): string {
  const status = rawStatus(item)
  const phase = (status.phase as string) || 'Unknown'
  const containerStatuses = (status.containerStatuses || []) as Array<Record<string, unknown>>
  for (const cs of containerStatuses) {
    const state = (cs.state || {}) as Record<string, unknown>
    const waiting = state.waiting as Record<string, unknown> | undefined
    if (waiting?.reason) return waiting.reason as string
  }
  return phase
}

function transformPodDetail(item: ResourceItem): PodDetailData {
  const spec = rawSpec(item)
  const status = rawStatus(item)
  const meta = rawMetadata(item)
  const labels = labelsMap(item)
  const annotations = annotationsMap(item)

  const containerStatuses = (status.containerStatuses || []) as Array<Record<string, unknown>>
  const specContainers = (spec.containers || []) as Array<Record<string, unknown>>

  const readyCount = containerStatuses.filter((cs) => cs.ready).length
  const totalCount = specContainers.length

  const containers: ContainerInfo[] = specContainers.map((c) => {
    const cs = containerStatuses.find((s) => s.name === c.name)
    const resources = (c.resources || {}) as Record<string, unknown>
    const requests = (resources.requests || {}) as Record<string, string>
    const limits = (resources.limits || {}) as Record<string, string>
    const ports = (c.ports || []) as Array<Record<string, unknown>>
    const portStr = ports.map((p) => `${p.containerPort}/${p.protocol || 'TCP'}`).join(', ')

    let containerStatus = 'Waiting'
    let started = ''
    if (cs) {
      const state = (cs.state || {}) as Record<string, unknown>
      if (state.running) {
        containerStatus = 'Running'
        started = ((state.running as Record<string, unknown>).startedAt as string) || ''
      } else if (state.waiting) {
        containerStatus = ((state.waiting as Record<string, unknown>).reason as string) || 'Waiting'
      } else if (state.terminated) {
        containerStatus = ((state.terminated as Record<string, unknown>).reason as string) || 'Terminated'
      }
    }

    return {
      name: c.name as string,
      status: containerStatus,
      image: c.image as string,
      port: portStr || undefined,
      cpu: `${requests.cpu || '0'} / ${limits.cpu || 'none'} (req/limit)`,
      memory: `${requests.memory || '0'} / ${limits.memory || 'none'}`,
      started,
    }
  })

  const conditions = ((status.conditions || []) as Array<Record<string, unknown>>).map((c) => ({
    name: c.type as string,
    status: c.status === 'True',
  }))

  const volumes = ((spec.volumes || []) as Array<Record<string, unknown>>).map((v) => {
    let source = 'Unknown'
    if (v.configMap) source = `ConfigMap: ${(v.configMap as Record<string, unknown>).name}`
    else if (v.secret) source = `Secret: ${(v.secret as Record<string, unknown>).secretName}`
    else if (v.emptyDir !== undefined) source = 'EmptyDir'
    else if (v.hostPath) source = `HostPath: ${(v.hostPath as Record<string, unknown>).path}`
    else if (v.persistentVolumeClaim) source = `PVC: ${(v.persistentVolumeClaim as Record<string, unknown>).claimName}`
    else if (v.projected) source = 'Projected (ServiceAccountToken)'
    else if (v.downwardAPI) source = 'DownwardAPI'
    return { name: v.name as string, source }
  })

  return {
    name: item.name,
    namespace: item.namespace,
    status: podStatusFromRaw(item),
    ready: `${readyCount}/${totalCount}`,
    node: (spec.nodeName as string) || '<none>',
    podIp: (status.podIP as string) || '-',
    serviceAccount: (spec.serviceAccountName as string) || 'default',
    qosClass: (status.qosClass as string) || 'BestEffort',
    created: (meta.creationTimestamp as string) || '',
    labels: labelsToKV(labels),
    annotationCount: Object.keys(annotations).length,
    containers,
    conditions,
    volumes,
  }
}

export function PodList() {
  const navigate = useNavigate()
  const { namespace: selectedNamespace, name: selectedName } = useParams<{ namespace?: string; name?: string }>()
  const panelOpen = !!selectedName

  const [filter, setFilter] = useState('')
  const [activeTab, setActiveTab] = useState('Overview')
  const [aiProviderName, setAiProviderName] = useState('')
  const [detail, setDetail] = useState<PodDetailData | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [detailRaw, setDetailRaw] = useState<Record<string, unknown> | null>(null)

  const listNamespace = useClusterStore((s) => s.selectedNamespace)
  const detailNamespace = selectedNamespace || 'default'
  const setAITarget = useUIStore((s) => s.setAITarget)
  const setBottomTrayTab = useUIStore((s) => s.setBottomTrayTab)
  const setSelectedResource = useSelectionStore((s) => s.setSelectedResource)
  const clearSelection = useSelectionStore((s) => s.clearSelection)

  // List data
  const podCfg = RESOURCE_CONFIG.pods
  const { data: items, isLoading } = useKubeResources({
    group: podCfg.group,
    version: podCfg.version,
    resource: podCfg.plural,
    namespace: listNamespace,
  })
  const { metrics } = usePodMetrics(listNamespace)

  const rsCfg = RESOURCE_CONFIG.replicasets
  const { data: rsItems } = useKubeResources({
    group: rsCfg.group,
    version: rsCfg.version,
    resource: rsCfg.plural,
    namespace: listNamespace,
  })

  // AI provider check
  useEffect(() => {
    GetAIProviderName().then((n) => setAiProviderName(n || '')).catch(() => setAiProviderName(''))
  }, [])

  // Detail fetch
  useEffect(() => {
    if (!selectedName) {
      setDetail(null)
      setDetailRaw(null)
      setDetailError(null)
      return
    }
    let cancelled = false
    setDetailLoading(true)
    setDetailError(null)
    ;(async () => {
      try {
        const item = await GetResource('', 'v1', 'pods', detailNamespace, selectedName)
        if (cancelled) return
        setDetail(transformPodDetail(item))
        setDetailRaw(item.raw)
      } catch (err) {
        if (cancelled) return
        setDetailError(String(err))
      } finally {
        if (!cancelled) setDetailLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [selectedName, detailNamespace])

  // Write to selectionStore when detail panel opens/closes
  useEffect(() => {
    if (selectedName && detailRaw) {
      setSelectedResource({
        kind: 'Pod',
        name: selectedName,
        namespace: detailNamespace,
        path: `/workloads/pods/${detailNamespace}/${selectedName}`,
        raw: detailRaw,
      })
    } else if (!selectedName) {
      clearSelection()
    }
  }, [selectedName, detailNamespace, detailRaw, setSelectedResource, clearSelection])

  // Reset tab when switching pods
  useEffect(() => {
    setActiveTab('Overview')
  }, [selectedName, detailNamespace])

  // Metrics history for sparklines
  const { history: metricsHistory, metricsUnavailable } = useMetricsHistory(detailNamespace, selectedName || '')

  // Transform list items to display format
  const pods = items.map((item) => {
    const r = (item.raw || {}) as Record<string, unknown>
    const meta = (r.metadata || {}) as Record<string, unknown>
    const spec = (r.spec || {}) as Record<string, unknown>
    const st = (r.status || {}) as Record<string, unknown>
    const containerStatuses = (st.containerStatuses || []) as Array<Record<string, unknown>>
    const containers = (spec.containers || []) as Array<Record<string, unknown>>

    const phase = (st.phase as string) || 'Unknown'
    const readyCount = containerStatuses.filter((c) => c.ready === true).length
    const totalContainers = containers.length
    const restarts = containerStatuses.reduce((sum, c) => sum + ((c.restartCount as number) || 0), 0)
    const node = (spec.nodeName as string) || '<none>'
    const ownerRefs = (meta.ownerReferences || []) as Array<{ kind: string; name: string }>

    const cpuLimit = containers.reduce((sum, c) => {
      const res = (c.resources || {}) as Record<string, unknown>
      const limits = (res.limits || {}) as Record<string, unknown>
      return sum + parseCpu(limits.cpu)
    }, 0)
    const memLimit = containers.reduce((sum, c) => {
      const res = (c.resources || {}) as Record<string, unknown>
      const limits = (res.limits || {}) as Record<string, unknown>
      return sum + parseMemoryMiB(limits.memory)
    }, 0)

    const podMetric = metrics.get(`${item.namespace}/${item.name}`)
    const cpuUsage = podMetric ? Math.round(podMetric.cpuCores * 1000) : undefined
    const memoryUsage = podMetric ? Math.round(podMetric.memoryMiB) : undefined

    let status: string = phase
    for (const cs of containerStatuses) {
      const state = (cs.state || {}) as Record<string, unknown>
      const waiting = state.waiting as Record<string, unknown> | undefined
      if (waiting?.reason) {
        status = waiting.reason as string
        break
      }
    }

    return {
      name: item.name,
      namespace: item.namespace,
      status,
      ready: `${readyCount}/${totalContainers}`,
      restarts,
      node,
      age: formatAge((meta.creationTimestamp as string) || ''),
      cpuUsage,
      cpuLimit: cpuLimit || undefined,
      memoryUsage,
      memLimit: memLimit || undefined,
      ownerReferences: ownerRefs,
    }
  })

  const filtered = pods.filter((p) =>
    p.name.toLowerCase().includes(filter.toLowerCase()) ||
    p.namespace.toLowerCase().includes(filter.toLowerCase())
  )

  if (isLoading && items.length === 0) {
    return (
      <div className="resource-view">
        <ResourceHeader title="Pods" subtitle="Loading...">
          <SearchInput placeholder="Filter pods..." value={filter} onChange={setFilter} />
        </ResourceHeader>
        <div style={{ padding: 'var(--space-6)', color: 'var(--text-tertiary)' }}>Loading...</div>
      </div>
    )
  }

  return (
    <div className="resource-view">
      <ResourceHeader title="Pods" subtitle={`${filtered.length} pods across all namespaces`}>
        <SearchInput placeholder="Filter pods..." value={filter} onChange={setFilter} />
      </ResourceHeader>

      <div style={panelOpen ? { flex: 1, overflow: 'hidden', display: 'flex' } : { display: 'contents' }}>
        <ResourceTable columns={columns} data={filtered} renderRow={(pod) => {
            const nsProps = getNamespaceStyle(pod.namespace)
            const isDisabledNode = pod.node === '<none>'
            const owner = resolveTopOwnerFromRaw(pod.ownerReferences, rsItems)
            const isSelected = pod.name === selectedName && pod.namespace === selectedNamespace

            return (
              <tr
                key={`${pod.namespace}/${pod.name}`}
                className={isSelected ? 'selected' : undefined}
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/workloads/pods/${pod.namespace}/${pod.name}`)}
              >
                <td className="col-status">
                  <StatusDot status={pod.status} />
                </td>
                <td className="name-cell">{pod.name}</td>
                <td className={nsProps.className} style={nsProps.style}>
                  {pod.namespace}
                </td>
                <td>
                  {owner ? (
                    owner.route ? (
                      <Link
                        to={`${owner.route}/${pod.namespace}/${owner.name}`}
                        style={{ color: 'var(--accent)' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {owner.kind}/{owner.name}
                      </Link>
                    ) : (
                      <span style={{ color: 'var(--text-tertiary)' }}>{owner.kind}/{owner.name}</span>
                    )
                  ) : (
                    <span style={{ color: 'var(--text-disabled)' }}>-</span>
                  )}
                </td>
                <td className="tabular">{pod.ready}</td>
                <td className={`tabular${pod.restarts > 0 ? ' restarts-warn' : ''}`}>
                  {pod.restarts}
                </td>
                <td>
                  <InlineMetricBar usage={pod.cpuUsage} limit={pod.cpuLimit} label="cpu" />
                </td>
                <td>
                  <InlineMetricBar usage={pod.memoryUsage} limit={pod.memLimit} label="memory" />
                </td>
                <td style={isDisabledNode ? { color: 'var(--text-disabled)' } : undefined}>
                  {pod.node}
                </td>
                <td>{pod.age}</td>
              </tr>
            )
          }} />

        {panelOpen && (
          <>
            {detailLoading && !detail ? (
              <DetailPanel
                title="Loading..."
                subtitle=""
                onClose={() => navigate('/workloads/pods')}
              >
                <div style={{ padding: 'var(--space-4)', color: 'var(--text-secondary)' }}>Loading...</div>
              </DetailPanel>
            ) : detailError ? (
              <DetailPanel
                title="Error"
                subtitle=""
                onClose={() => navigate('/workloads/pods')}
              >
                <div style={{ padding: 'var(--space-4)', color: 'var(--text-secondary)' }}>
                  {detailError}
                </div>
              </DetailPanel>
            ) : detail ? (
              <DetailPanel
                title={detail.name}
                subtitle={`Pod in "${detail.namespace}" namespace`}
                onClose={() => navigate('/workloads/pods')}
              >
                {/* Action bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '0 var(--space-4)', paddingTop: 'var(--space-2)', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setBottomTrayTab('logs')}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors"
                    style={{
                      borderColor: 'var(--border)',
                      color: 'var(--text-secondary)',
                      background: 'var(--bg-tertiary, transparent)',
                    }}
                    title="View logs in bottom tray"
                  >
                    View Logs
                  </button>
                  <button
                    onClick={() => setBottomTrayTab('terminal')}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors"
                    style={{
                      borderColor: 'var(--border)',
                      color: 'var(--text-secondary)',
                      background: 'var(--bg-tertiary, transparent)',
                    }}
                    title="Open shell in bottom tray"
                  >
                    Open Shell
                  </button>
                  {aiProviderName && selectedName && (
                    <button
                      onClick={() => {
                        setAITarget({ namespace: detailNamespace, name: selectedName })
                        setBottomTrayTab('ai')
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors"
                      style={{
                        borderColor: 'var(--accent)',
                        color: 'var(--accent)',
                        background: 'var(--accent-subtle, transparent)',
                      }}
                      title={`Open ${aiProviderName} to diagnose this pod`}
                    >
                      <Bot className="w-3.5 h-3.5" />
                      AI Diagnose
                    </button>
                  )}
                </div>

                <DetailTabs tabs={DETAIL_TABS} activeTab={activeTab} onTabChange={setActiveTab} />

                <div className="detail-panel-body">
                  {activeTab === 'Overview' && (
                    <>
                      {/* Status badges */}
                      <div style={{ marginBottom: 'var(--space-4)' }}>
                        <span className="badge badge-green">{detail.status}</span>
                        <span className="badge badge-blue" style={{ marginLeft: '4px' }}>
                          Ready {detail.ready}
                        </span>
                      </div>

                      {/* Properties */}
                      <div className="prop-list">
                        <span className="prop-group-title">Metadata</span>

                        <span className="prop-label">Name</span>
                        <span className="prop-value">{detail.name}</span>

                        <span className="prop-label">Namespace</span>
                        <span className="prop-value">{detail.namespace}</span>

                        <span className="prop-label">Node</span>
                        <span className="prop-value">{detail.node}</span>

                        <span className="prop-label">Pod IP</span>
                        <span className="prop-value mono">{detail.podIp}</span>

                        <span className="prop-label">Service Account</span>
                        <span className="prop-value">{detail.serviceAccount}</span>

                        <span className="prop-label">QoS Class</span>
                        <span className="prop-value">{detail.qosClass}</span>

                        <span className="prop-label">Created</span>
                        <span className="prop-value">{detail.created}</span>

                        <span className="prop-label">Annotations</span>
                        <span
                          className="prop-value"
                          style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}
                        >
                          {detail.annotationCount} annotations
                        </span>
                      </div>

                      {/* Labels editor */}
                      <LabelEditor
                        group=""
                        version="v1"
                        resource="pods"
                        namespace={detail.namespace}
                        name={detail.name}
                        labels={detail.labels}
                      />

                      {/* Metrics sparklines */}
                      <div className="prop-list" style={{ marginTop: 'var(--space-4)' }}>
                        <span className="prop-group-title">Metrics</span>
                      </div>
                      {metricsUnavailable ? (
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', padding: 'var(--space-2) 0' }}>
                          Metrics unavailable
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 'var(--space-6)', marginTop: 'var(--space-2)' }}>
                          <div>
                            <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)', marginBottom: '2px' }}>CPU (cores)</div>
                            <Sparkline
                              data={metricsHistory.map((p) => p.cpuCores)}
                              color="var(--blue)"
                              label="CPU usage sparkline"
                            />
                            {metricsHistory.length > 0 && (
                              <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-secondary)', marginTop: '2px' }} className="mono">
                                {metricsHistory[metricsHistory.length - 1].cpuCores.toFixed(3)}
                              </div>
                            )}
                          </div>
                          <div>
                            <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)', marginBottom: '2px' }}>Memory (MiB)</div>
                            <Sparkline
                              data={metricsHistory.map((p) => p.memoryMiB)}
                              color="var(--green)"
                              label="Memory usage sparkline"
                            />
                            {metricsHistory.length > 0 && (
                              <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-secondary)', marginTop: '2px' }} className="mono">
                                {Math.round(metricsHistory[metricsHistory.length - 1].memoryMiB)}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="prop-list" style={{ marginTop: 'var(--space-4)' }}>
                        <span className="prop-group-title">Containers</span>
                      </div>

                      {/* Container cards */}
                      <div style={{ marginTop: 'var(--space-3)' }}>
                        {detail.containers.map((c) => (
                          <ContainerCard key={c.name} container={c} />
                        ))}
                      </div>

                      {/* Conditions */}
                      <div className="prop-list" style={{ marginTop: 'var(--space-2)' }}>
                        <span className="prop-group-title">Conditions</span>
                      </div>
                      <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)' }}>
                        {detail.conditions.map((cond) => (
                          <div
                            key={cond.name}
                            style={{
                              display: 'flex',
                              gap: 'var(--space-3)',
                              padding: 'var(--space-1) 0',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            <span style={{ color: 'var(--green)' }}>&#10003;</span>
                            <span style={{ minWidth: '120px' }}>{cond.name}</span>
                            <span>{cond.status ? 'True' : 'False'}</span>
                          </div>
                        ))}
                      </div>

                      {/* Volumes */}
                      <div className="prop-list" style={{ marginTop: 'var(--space-4)' }}>
                        <span className="prop-group-title">Volumes</span>
                      </div>
                      <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)' }}>
                        {detail.volumes.map((vol) => (
                          <div
                            key={vol.name}
                            style={{
                              display: 'flex',
                              gap: 'var(--space-3)',
                              padding: 'var(--space-1) 0',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            <span className="mono" style={{ minWidth: '140px', color: 'var(--text-primary)' }}>
                              {vol.name}
                            </span>
                            <span>{vol.source}</span>
                          </div>
                        ))}
                      </div>

                    </>
                  )}

                  {activeTab === 'Events' && (
                    <ResourceEvents
                      name={detail.name}
                      namespace={detail.namespace}
                      resourceType="pods"
                    />
                  )}

                  {activeTab === 'YAML' && detailRaw && (
                    <div className="log-viewer" style={{ maxHeight: '500px' }}>
                      <pre style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                        {JSON.stringify(detailRaw, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </DetailPanel>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
