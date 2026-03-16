import { Bot } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ContainerCard } from '../components/detail/ContainerCard'
import { DetailPanel } from '../components/detail/DetailPanel'
import { DetailTabs } from '../components/detail/DetailTabs'
import { ResourceEvents } from '../components/detail/ResourceEvents'
import { MultiContainerLogViewer } from '../components/logs/MultiContainerLogViewer'
import { LabelEditor } from '../components/shared/LabelEditor'
import { Sparkline } from '../components/shared/Sparkline'
import { StatusDot } from '../components/shared/StatusDot'
import type { PodDetailData, ContainerInfo } from '../data/types'
import { useKubeResources } from '../hooks/useKubeResource'
import { useMetricsHistory } from '../hooks/useMetricsHistory'
import { formatAge, rawSpec, rawStatus, rawMetadata, labelsMap, annotationsMap, labelsToKV } from '../lib/k8sFormatters'
import { useUIStore } from '../stores/uiStore'
import { GetAIProviderName } from '../wailsjs/go/handlers/AIHandler'
import { GetResource } from '../wailsjs/go/handlers/ResourceHandler'
import type { ResourceItem } from '../wailsjs/go/handlers/ResourceHandler'

const TABS = ['Overview', 'Logs', 'YAML', 'Events']

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

export function PodDetail() {
  const { namespace: urlNamespace, name } = useParams<{ namespace: string; name: string }>()
  const [activeTab, setActiveTab] = useState('Overview')
  const [aiProviderName, setAiProviderName] = useState('')
  const setAITarget = useUIStore((s) => s.setAITarget)
  const setBottomTrayTab = useUIStore((s) => s.setBottomTrayTab)
  const namespace = urlNamespace || 'default'

  // Sidebar pod list
  const { data: podItems, isLoading: listLoading } = useKubeResources({
    group: '', version: 'v1', resource: 'pods', namespace,
  })

  // Check AI provider availability
  useEffect(() => {
    GetAIProviderName().then((n) => setAiProviderName(n || '')).catch(() => setAiProviderName(''))
  }, [])

  // Metrics history for sparklines
  const { history: metricsHistory, metricsUnavailable } = useMetricsHistory(namespace, name || '')

  // Single pod detail
  const [detail, setDetail] = useState<PodDetailData | null>(null)
  const [detailLoading, setDetailLoading] = useState(true)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [detailRaw, setDetailRaw] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    if (!name) return
    let cancelled = false
    ;(async () => {
      setDetailLoading(true)
      setDetailError(null)
      try {
        const item = await GetResource('', 'v1', 'pods', namespace, name)
        if (cancelled) return
        setDetail(transformPodDetail(item))
        setDetailRaw(item.raw)
        setDetailLoading(false)
      } catch (err) {
        if (cancelled) return
        setDetailError(String(err))
        setDetailLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [name, namespace])

  // Build sidebar rows from live data
  const sidebarPods = podItems.map((item) => {
    const status = rawStatus(item)
    const spec = rawSpec(item)
    const containerStatuses = (status.containerStatuses || []) as Array<Record<string, unknown>>
    const specContainers = (spec.containers || []) as Array<Record<string, unknown>>
    const readyCount = containerStatuses.filter((cs) => cs.ready).length
    const totalCount = specContainers.length
    const restarts = containerStatuses.reduce((sum, cs) => sum + ((cs.restartCount as number) || 0), 0)

    return {
      name: item.name,
      status: podStatusFromRaw(item),
      ready: `${readyCount}/${totalCount}`,
      restarts,
      node: (spec.nodeName as string) || '<none>',
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
          {detailError || `Pod "${name}" not found.`}{' '}
          <Link to="/workloads/pods" style={{ color: 'var(--blue)' }}>Back to list</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="resource-view">
      <div className="resource-body">
        {/* Left: abridged pod table */}
        <div className="resource-table-wrap">
          <table className="resource-table clickable">
            <thead>
              <tr>
                <th scope="col" className="col-status">Status</th>
                <th scope="col" className="col-name">Name</th>
                <th scope="col" className="col-xs">Ready</th>
                <th scope="col" className="col-sm">Restarts</th>
                <th scope="col" className="col-md">Node</th>
                <th scope="col" className="col-age">Age</th>
              </tr>
            </thead>
            <tbody>
              {sidebarPods.map((pod) => (
                <tr key={pod.name} className={pod.name === name ? 'selected' : undefined}>
                  <td className="col-status">
                    <StatusDot status={pod.status} />
                  </td>
                  <td className="name-cell">
                    <Link to={`/workloads/pods/${namespace}/${pod.name}`}>{pod.name}</Link>
                  </td>
                  <td className="tabular">{pod.ready}</td>
                  <td className={`tabular${pod.restarts > 0 ? ' restarts-warn' : ''}`}>
                    {pod.restarts}
                  </td>
                  <td>{pod.node}</td>
                  <td>{pod.age}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Right: Detail Panel */}
        <DetailPanel
          title={detail.name}
          subtitle={`Pod in "${detail.namespace}" namespace`}
          onClose={() => window.history.back()}
        >
          {/* Action bar with AI Diagnose */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '0 var(--space-4)', paddingTop: 'var(--space-2)' }}>
            {aiProviderName && name && (
              <button
                onClick={() => {
                  setAITarget({ namespace, name })
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

          <DetailTabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

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

            {activeTab === 'Logs' && (
              <div style={{ height: '400px' }}>
                <MultiContainerLogViewer
                  namespace={detail.namespace}
                  podName={detail.name}
                  containers={detail.containers.map((c) => c.name)}
                />
              </div>
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
      </div>

    </div>
  )
}
