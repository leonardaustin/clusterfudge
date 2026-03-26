import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useKubeResources } from '../hooks/useKubeResource'
import { useClusterStore } from '../stores/clusterStore'
import { useSelectionStore } from '../stores/selectionStore'
import { useToastStore } from '../stores/toastStore'
import { formatAge, strategyColor, rawSpec, rawStatus, rawMetadata, labelsMap, annotationsMap, labelsToKV } from '../lib/k8sFormatters'
import { RESOURCE_CONFIG } from '../lib/resourceConfig'
import { StatusDot } from '../components/shared/StatusDot'
import { Badge } from '../components/shared/Badge'
import { SearchInput } from '../components/shared/SearchInput'
import { ResourceHeader } from '../components/shared/ResourceHeader'
import { ResourceTable } from '../components/shared/ResourceTable'
import type { Column } from '../components/shared/ResourceTable'
import { DetailPanel } from '../components/detail/DetailPanel'
import { DetailTabs } from '../components/detail/DetailTabs'
import { ContainerCard } from '../components/detail/ContainerCard'
import { ResourceEvents } from '../components/detail/ResourceEvents'
import { LabelEditor } from '../components/shared/LabelEditor'
import { YAMLEditor } from '../components/editor/YAMLEditor'
import { YAMLDiffView } from '../components/editor/YAMLDiffView'
import { GetResource, ApplyResource, DryRunApply, PauseDeployment, ResumeDeployment, GetRolloutHistory } from '../wailsjs/go/handlers/ResourceHandler'
import type { ResourceItem, RolloutRevision } from '../wailsjs/go/handlers/ResourceHandler'
import type { DeploymentDetailData } from '../data/detailTypes'

const columns: Column[] = [
  { key: 'status', label: 'Status', className: 'col-status' },
  { key: 'name', label: 'Name', className: 'col-name' },
  { key: 'namespace', label: 'Namespace', className: 'col-md' },
  { key: 'ready', label: 'Ready', className: 'col-sm' },
  { key: 'upToDate', label: 'Up-to-date', className: 'col-sm' },
  { key: 'available', label: 'Available', className: 'col-sm' },
  { key: 'strategy', label: 'Strategy', className: 'col-md' },
  { key: 'images', label: 'Images', className: 'col-md' },
  { key: 'age', label: 'Age', className: 'col-age' },
]

const DETAIL_TABS = ['Overview', 'History', 'YAML', 'Events']

function getNamespaceStyle(ns: string): { className?: string; style?: React.CSSProperties } {
  switch (ns) {
    case 'kube-system':
      return { className: 'mono', style: { color: 'var(--purple)' } }
    case 'monitoring':
      return { className: 'mono', style: { color: 'var(--blue)' } }
    case 'ingress-nginx':
      return { className: 'mono', style: { color: 'var(--yellow)' } }
    default:
      return {}
  }
}

function transformDeploymentDetail(item: ResourceItem): DeploymentDetailData {
  const spec = rawSpec(item)
  const status = rawStatus(item)
  const meta = rawMetadata(item)
  const labels = labelsMap(item)
  const annotations = annotationsMap(item)

  const templateSpec = ((spec.template as Record<string, unknown>)?.spec || {}) as Record<string, unknown>
  const specContainers = (templateSpec.containers || []) as Array<Record<string, unknown>>
  const strategy = (spec.strategy || {}) as Record<string, unknown>
  const rollingUpdate = (strategy.rollingUpdate || {}) as Record<string, unknown>

  const conditions = ((status.conditions || []) as Array<Record<string, unknown>>).map((c) => ({
    type: c.type as string,
    status: c.status === 'True',
    reason: (c.reason as string) || '',
    message: (c.message as string) || '',
    lastTransitionTime: (c.lastTransitionTime as string) || '',
  }))

  const availableCondition = conditions.find((c) => c.type === 'Available')
  let deployStatus = 'Running'
  if (availableCondition && !availableCondition.status) deployStatus = 'Failed'
  else if (conditions.find((c) => c.type === 'Progressing' && !c.status)) deployStatus = 'Failed'

  const containers = specContainers.map((c) => {
    const resources = (c.resources || {}) as Record<string, unknown>
    const requests = (resources.requests || {}) as Record<string, string>
    const limits = (resources.limits || {}) as Record<string, string>
    const ports = (c.ports || []) as Array<Record<string, unknown>>
    const portStr = ports.map((p) => `${p.containerPort}/${p.protocol || 'TCP'}`).join(', ')
    const env = ((c.env || []) as Array<Record<string, unknown>>).map((e) => ({
      name: e.name as string,
      value: (e.value as string) || '',
    }))

    return {
      name: c.name as string,
      status: 'Defined',
      image: c.image as string,
      port: portStr || undefined,
      cpu: `${requests.cpu || '0'} / ${limits.cpu || 'none'} (req/limit)`,
      memory: `${requests.memory || '0'} / ${limits.memory || 'none'}`,
      started: '',
      env,
    }
  })

  const selectorMap = ((spec.selector as Record<string, unknown>)?.matchLabels || {}) as Record<string, string>

  return {
    name: item.name,
    namespace: item.namespace,
    status: deployStatus,
    paused: (spec.paused as boolean) || false,
    strategy: (strategy.type as string) || 'RollingUpdate',
    maxSurge: String(rollingUpdate.maxSurge ?? '25%'),
    maxUnavailable: String(rollingUpdate.maxUnavailable ?? '25%'),
    replicas: {
      desired: (spec.replicas as number) || 0,
      ready: (status.readyReplicas as number) || 0,
      updated: (status.updatedReplicas as number) || 0,
      available: (status.availableReplicas as number) || 0,
    },
    selector: labelsToKV(selectorMap),
    labels: labelsToKV(labels),
    annotations: labelsToKV(annotations),
    created: (meta.creationTimestamp as string) || '',
    containers,
    conditions,
    rolloutHistory: [],
    events: [],
    yaml: JSON.stringify(item.raw, null, 2),
  }
}

export function DeploymentList() {
  const navigate = useNavigate()
  const { namespace: selectedNamespace, name: selectedName } = useParams<{ namespace?: string; name?: string }>()
  const panelOpen = !!selectedName

  const [filter, setFilter] = useState('')
  const [activeTab, setActiveTab] = useState('Overview')
  const addToast = useToastStore((s) => s.addToast)

  // Detail state
  const [detail, setDetail] = useState<DeploymentDetailData | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [diffView, setDiffView] = useState<{ original: string; modified: string } | null>(null)
  const [rolloutHistory, setRolloutHistory] = useState<RolloutRevision[]>([])
  const [pauseLoading, setPauseLoading] = useState(false)

  const detailNamespace = selectedNamespace || 'default'
  const setSelectedResource = useSelectionStore((s) => s.setSelectedResource)
  const clearSelection = useSelectionStore((s) => s.clearSelection)

  // List data
  const listNamespace = useClusterStore((s) => s.selectedNamespace)
  const cfg = RESOURCE_CONFIG.deployments
  const { data: items, isLoading } = useKubeResources({
    group: cfg.group,
    version: cfg.version,
    resource: cfg.plural,
    namespace: listNamespace,
  })

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

    GetResource('apps', 'v1', 'deployments', detailNamespace, selectedName)
      .then((item) => {
        if (cancelled) return
        setDetail(transformDeploymentDetail(item))
        setDetailLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setDetailError(String(err))
        setDetailLoading(false)
      })

    return () => { cancelled = true }
  }, [selectedName, detailNamespace])

  // Write to selectionStore when detail panel opens/closes
  useEffect(() => {
    if (selectedName && detail) {
      setSelectedResource({
        kind: 'Deployment',
        name: selectedName,
        namespace: detailNamespace,
        path: `/workloads/deployments/${detailNamespace}/${selectedName}`,
      })
    } else if (!selectedName) {
      clearSelection()
    }
  }, [selectedName, detailNamespace, detail, setSelectedResource, clearSelection])

  // Reset tab when switching deployments
  useEffect(() => {
    setActiveTab('Overview')
  }, [selectedName, detailNamespace])

  // Fetch rollout history when the History tab is active.
  useEffect(() => {
    if (activeTab !== 'History' || !selectedName) return
    GetRolloutHistory(detailNamespace, selectedName)
      .then(setRolloutHistory)
      .catch((err) => addToast({ type: 'error', title: 'Failed to load rollout history', description: String(err) }))
  }, [activeTab, selectedName, detailNamespace, addToast])

  const handlePause = useCallback(async () => {
    if (!detail) return
    setPauseLoading(true)
    try {
      await PauseDeployment(detail.namespace, detail.name)
      addToast({ type: 'success', title: `Paused rollout for ${detail.name}` })
      setDetail((prev) => prev ? { ...prev, paused: true } : prev)
    } catch (err) {
      addToast({ type: 'error', title: 'Failed to pause rollout', description: String(err) })
    } finally {
      setPauseLoading(false)
    }
  }, [detail, addToast])

  const handleResume = useCallback(async () => {
    if (!detail) return
    setPauseLoading(true)
    try {
      await ResumeDeployment(detail.namespace, detail.name)
      addToast({ type: 'success', title: `Resumed rollout for ${detail.name}` })
      setDetail((prev) => prev ? { ...prev, paused: false } : prev)
    } catch (err) {
      addToast({ type: 'error', title: 'Failed to resume rollout', description: String(err) })
    } finally {
      setPauseLoading(false)
    }
  }, [detail, addToast])

  const handleApplyYAML = useCallback(async (yaml: string) => {
    if (!detail) return
    try {
      const encoder = new TextEncoder()
      const data = Array.from(encoder.encode(yaml))
      await ApplyResource('apps', 'v1', 'deployments', detail.namespace, data)
      addToast({ type: 'success', title: `Applied changes to ${detail.name}` })
    } catch (err) {
      addToast({ type: 'error', title: 'Failed to apply YAML', description: String(err) })
    }
  }, [detail, addToast])

  const handlePreviewYAML = useCallback(async (yaml: string) => {
    if (!detail) return
    try {
      const encoder = new TextEncoder()
      const data = Array.from(encoder.encode(yaml))
      const result = await DryRunApply('apps', 'v1', 'deployments', detail.namespace, data)
      const separator = '\n---SEPARATOR---\n'
      const sepIdx = result.indexOf(separator)
      if (sepIdx === -1) {
        addToast({ type: 'error', title: 'Unexpected dry-run response format' })
        return
      }
      const original = result.substring(0, sepIdx)
      const modified = result.substring(sepIdx + separator.length)
      setDiffView({ original, modified })
    } catch (err) {
      addToast({ type: 'error', title: 'Dry-run failed', description: String(err) })
    }
  }, [detail, addToast])

  // Transform list items to display format
  const deployments = items.map((item) => {
    const r = (item.raw || {}) as Record<string, unknown>
    const meta = (r.metadata || {}) as Record<string, unknown>
    const spec = (r.spec || {}) as Record<string, unknown>
    const st = (r.status || {}) as Record<string, unknown>
    const strategyObj = (spec.strategy || {}) as Record<string, unknown>
    const templateSpec = ((spec.template as Record<string, unknown>)?.spec || {}) as Record<string, unknown>
    const containers = (templateSpec.containers || []) as Array<Record<string, unknown>>

    const desired = (spec.replicas as number) || 0
    const ready = (st.readyReplicas as number) || 0
    const upToDate = (st.updatedReplicas as number) || 0
    const available = (st.availableReplicas as number) || 0
    const strategy = (strategyObj.type as string) || 'RollingUpdate'
    const images = containers.map((c) => c.image as string).join(', ')

    let status: string = 'running'
    if (ready < desired) status = ready === 0 ? 'failed' : 'progressing'

    return {
      name: item.name,
      namespace: item.namespace,
      status,
      ready: `${ready}/${desired}`,
      upToDate,
      available,
      strategy,
      strategyBadgeColor: strategyColor(strategy),
      images,
      age: formatAge((meta.creationTimestamp as string) || ''),
    }
  })

  const filtered = deployments.filter((d) =>
    d.name.toLowerCase().includes(filter.toLowerCase()) ||
    d.namespace.toLowerCase().includes(filter.toLowerCase())
  )

  if (isLoading && items.length === 0) {
    return (
      <div className="resource-view">
        <ResourceHeader title="Deployments" subtitle="Loading...">
          <SearchInput placeholder="Filter deployments..." value={filter} onChange={setFilter} />
        </ResourceHeader>
        <div style={{ padding: 'var(--space-6)', color: 'var(--text-tertiary)' }}>Loading...</div>
      </div>
    )
  }

  const statusColor = detail?.status === 'Running' ? 'green' : detail?.status === 'Failed' ? 'red' : 'yellow'

  return (
    <div className="resource-view">
      <ResourceHeader title="Deployments" subtitle={`${filtered.length} deployments across all namespaces`}>
        <SearchInput placeholder="Filter deployments..." value={filter} onChange={setFilter} />
      </ResourceHeader>

      <div style={panelOpen ? { flex: 1, overflow: 'hidden', display: 'flex' } : { display: 'contents' }}>
        <ResourceTable columns={columns} data={filtered} renderRow={(dep) => {
            const nsProps = getNamespaceStyle(dep.namespace)
            const isFailed = dep.status === 'failed'
            const isSelected = dep.name === selectedName && dep.namespace === selectedNamespace

            return (
              <tr key={`${dep.namespace}/${dep.name}`} className={isSelected ? 'selected' : undefined} style={{ cursor: 'pointer' }} onClick={() => navigate(`/workloads/deployments/${dep.namespace}/${dep.name}`)}>
                <td className="col-status">
                  <StatusDot status={dep.status} />
                </td>
                <td className="name-cell">{dep.name}</td>
                <td className={nsProps.className} style={nsProps.style}>
                  {dep.namespace}
                </td>
                <td
                  className="tabular"
                  style={isFailed ? { color: 'var(--red)' } : undefined}
                >
                  {dep.ready}
                </td>
                <td className="tabular">{dep.upToDate}</td>
                <td
                  className="tabular"
                  style={isFailed ? { color: 'var(--red)' } : undefined}
                >
                  {dep.available}
                </td>
                <td>
                  <Badge color={dep.strategyBadgeColor}>{dep.strategy}</Badge>
                </td>
                <td className="mono">{dep.images}</td>
                <td>{dep.age}</td>
              </tr>
            )
          }} />

        {panelOpen && (
          <>
            {detailLoading && !detail ? (
              <DetailPanel
                title="Loading..."
                subtitle=""
                onClose={() => navigate('/workloads/deployments')}
              >
                <div style={{ padding: 'var(--space-4)', color: 'var(--text-secondary)' }}>Loading...</div>
              </DetailPanel>
            ) : detailError ? (
              <DetailPanel
                title="Error"
                subtitle=""
                onClose={() => navigate('/workloads/deployments')}
              >
                <div style={{ padding: 'var(--space-4)', color: 'var(--text-secondary)' }}>
                  {detailError}
                </div>
              </DetailPanel>
            ) : detail ? (
              <DetailPanel
                title={detail.name}
                subtitle={`Deployment in "${detail.namespace}" namespace`}
                onClose={() => navigate('/workloads/deployments')}
              >
                <DetailTabs tabs={DETAIL_TABS} activeTab={activeTab} onTabChange={setActiveTab} />

                <div className="detail-panel-body">
                  {activeTab === 'Overview' && (
                    <>
                      {/* Status badges */}
                      <div style={{ marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span className={`badge badge-${statusColor}`}>{detail.status}</span>
                        <span className="badge badge-blue">
                          {detail.replicas.ready}/{detail.replicas.desired} Ready
                        </span>
                        {detail.paused && (
                          <span className="badge badge-yellow">Paused</span>
                        )}
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
                          {detail.paused ? (
                            <button
                              className="settings-btn"
                              style={{ fontSize: 'var(--text-xs)', padding: '2px 8px' }}
                              onClick={handleResume}
                              disabled={pauseLoading}
                            >
                              {pauseLoading ? 'Resuming...' : 'Resume Rollout'}
                            </button>
                          ) : (
                            <button
                              className="settings-btn"
                              style={{ fontSize: 'var(--text-xs)', padding: '2px 8px' }}
                              onClick={handlePause}
                              disabled={pauseLoading}
                            >
                              {pauseLoading ? 'Pausing...' : 'Pause Rollout'}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Metadata */}
                      <div className="prop-list">
                        <span className="prop-group-title">Metadata</span>

                        <span className="prop-label">Name</span>
                        <span className="prop-value">{detail.name}</span>

                        <span className="prop-label">Namespace</span>
                        <span className="prop-value">{detail.namespace}</span>

                        <span className="prop-label">Created</span>
                        <span className="prop-value">{detail.created}</span>

                        <span className="prop-label">Annotations</span>
                        <span
                          className="prop-value"
                          style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}
                        >
                          {detail.annotations.length} annotations
                        </span>
                      </div>

                      {/* Labels editor */}
                      <LabelEditor
                        group="apps"
                        version="v1"
                        resource="deployments"
                        namespace={detail.namespace}
                        name={detail.name}
                        labels={detail.labels}
                      />

                      <div className="prop-list" style={{ marginTop: 'var(--space-4)' }}>
                        <span className="prop-group-title">Strategy</span>

                        <span className="prop-label">Type</span>
                        <span className="prop-value">{detail.strategy}</span>

                        <span className="prop-label">Max Surge</span>
                        <span className="prop-value mono">{detail.maxSurge}</span>

                        <span className="prop-label">Max Unavailable</span>
                        <span className="prop-value mono">{detail.maxUnavailable}</span>

                        <span className="prop-group-title">Replicas</span>

                        <span className="prop-label">Desired</span>
                        <span className="prop-value tabular">{detail.replicas.desired}</span>

                        <span className="prop-label">Ready</span>
                        <span className="prop-value tabular">{detail.replicas.ready}</span>

                        <span className="prop-label">Updated</span>
                        <span className="prop-value tabular">{detail.replicas.updated}</span>

                        <span className="prop-label">Available</span>
                        <span className="prop-value tabular">{detail.replicas.available}</span>

                        <span className="prop-label">Selector</span>
                        <span className="prop-value">
                          {detail.selector.map((s) => (
                            <span key={s.key} className="tag">
                              {s.key}={s.value}
                            </span>
                          ))}
                        </span>

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
                            key={cond.type}
                            style={{
                              display: 'flex',
                              gap: 'var(--space-3)',
                              padding: 'var(--space-1) 0',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            <span style={{ color: cond.status ? 'var(--green)' : 'var(--red)' }}>
                              {cond.status ? '\u2713' : '\u2717'}
                            </span>
                            <span style={{ minWidth: '120px' }}>{cond.type}</span>
                            <span style={{ color: 'var(--text-tertiary)' }}>{cond.reason}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {activeTab === 'History' && (
                    <div style={{ fontSize: 'var(--text-xs)' }}>
                      {rolloutHistory.length === 0 ? (
                        <div style={{ color: 'var(--text-tertiary)', padding: 'var(--space-4)' }}>
                          No rollout history available
                        </div>
                      ) : (
                        <table className="resource-table" style={{ fontSize: 'var(--text-xs)' }}>
                          <thead>
                            <tr>
                              <th scope="col">Revision</th>
                              <th scope="col">Image(s)</th>
                              <th scope="col">Change Cause</th>
                              <th scope="col">Created</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rolloutHistory.map((rev) => (
                              <tr key={rev.revision}>
                                <td className="tabular">{rev.revision}</td>
                                <td className="mono">{(rev.images || []).join(', ')}</td>
                                <td style={{ color: 'var(--text-tertiary)' }}>{rev.changeCause || '-'}</td>
                                <td>{rev.created}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}

                  {activeTab === 'YAML' && (
                    <div style={{ height: '500px' }}>
                      {diffView ? (
                        <YAMLDiffView
                          original={diffView.original}
                          modified={diffView.modified}
                          onClose={() => setDiffView(null)}
                        />
                      ) : (
                        <YAMLEditor
                          value={detail.yaml}
                          onApply={handleApplyYAML}
                          onPreview={handlePreviewYAML}
                        />
                      )}
                    </div>
                  )}

                  {activeTab === 'Events' && (
                    <ResourceEvents
                      name={detail.name}
                      namespace={detail.namespace}
                      resourceType="deployments"
                    />
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
