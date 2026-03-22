import { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useKubeResources } from '../hooks/useKubeResource'
import { useClusterStore } from '../stores/clusterStore'
import { useSelectionStore } from '../stores/selectionStore'
import { RESOURCE_CONFIG } from '../lib/resourceConfig'
import { formatAge, formatServicePorts, formatSelector, serviceTypeBadgeColor, rawSpec, rawStatus, rawMetadata, labelsMap, annotationsMap, labelsToKV } from '../lib/k8sFormatters'
import { Cable } from 'lucide-react'
import { StatusDot } from '../components/shared/StatusDot'
import { Badge } from '../components/shared/Badge'
import { SearchInput } from '../components/shared/SearchInput'
import { ResourceHeader } from '../components/shared/ResourceHeader'
import { ResourceTable } from '../components/shared/ResourceTable'
import type { Column } from '../components/shared/ResourceTable'
import { DetailPanel } from '../components/detail/DetailPanel'
import { DetailTabs } from '../components/detail/DetailTabs'
import { ResourceEvents } from '../components/detail/ResourceEvents'
import { SelectorEditor } from '../components/shared/SelectorEditor'
import { GetResource } from '../wailsjs/go/handlers/ResourceHandler'
import type { ResourceItem } from '../wailsjs/go/handlers/ResourceHandler'
import type { ServiceDetailData, ServiceEndpointAddress } from '../data/detailTypes'

const DETAIL_TABS = ['Overview', 'YAML', 'Events']

const columns: Column[] = [
  { key: 'status', label: 'Status', className: 'col-status' },
  { key: 'name', label: 'Name', className: 'col-name' },
  { key: 'namespace', label: 'Namespace', className: 'col-md' },
  { key: 'type', label: 'Type', className: 'col-sm' },
  { key: 'clusterIP', label: 'Cluster IP', className: 'col-md' },
  { key: 'externalIP', label: 'External IP', className: 'col-md' },
  { key: 'ports', label: 'Ports', className: 'col-md' },
  { key: 'selector', label: 'Selector', className: 'col-md' },
  { key: 'endpoints', label: 'Endpoints', className: 'col-xs' },
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

function transformServiceDetail(item: ResourceItem): ServiceDetailData {
  const spec = rawSpec(item)
  const status = rawStatus(item)
  const meta = rawMetadata(item)
  const labels = labelsMap(item)
  const annotations = annotationsMap(item)

  const specPorts = (spec.ports || []) as Array<Record<string, unknown>>
  const ports = specPorts.map((p) => ({
    name: (p.name as string) || '',
    port: (p.port as number) || 0,
    targetPort: String(p.targetPort ?? ''),
    nodePort: p.nodePort as number | undefined,
    protocol: (p.protocol as string) || 'TCP',
  }))

  const selectorMap = (spec.selector || {}) as Record<string, string>

  // Derive external IP from status.loadBalancer or spec.externalIPs
  const externalIPs = (spec.externalIPs || []) as string[]
  const loadBalancer = (status.loadBalancer || {}) as Record<string, unknown>
  const ingress = (loadBalancer.ingress || []) as Array<Record<string, unknown>>
  let externalIP = '<none>'
  if (externalIPs.length > 0) {
    externalIP = externalIPs.join(', ')
  } else if (ingress.length > 0) {
    externalIP = ingress.map((i) => (i.ip as string) || (i.hostname as string) || '').filter(Boolean).join(', ') || '<pending>'
  }

  // Derive service status from type and external IP
  const svcType = (spec.type as string) || 'ClusterIP'
  let svcStatus = 'Active'
  if (svcType === 'LoadBalancer' && (externalIP === '<none>' || externalIP === '<pending>')) {
    svcStatus = 'Pending'
  }

  return {
    name: item.name,
    namespace: item.namespace,
    status: svcStatus,
    type: svcType,
    clusterIP: (spec.clusterIP as string) || '<none>',
    externalIP,
    ports,
    selector: labelsToKV(selectorMap),
    labels: labelsToKV(labels),
    annotations: labelsToKV(annotations),
    sessionAffinity: (spec.sessionAffinity as string) || 'None',
    externalTrafficPolicy: (spec.externalTrafficPolicy as string) || '<not set>',
    internalTrafficPolicy: (spec.internalTrafficPolicy as string) || 'Cluster',
    created: (meta.creationTimestamp as string) || '',
    endpoints: { addresses: [] },
    events: [],
    yaml: JSON.stringify(item.raw, null, 2),
  }
}

export function ServiceList() {
  const navigate = useNavigate()
  const { namespace: selectedNamespace, name: selectedName } = useParams<{ namespace?: string; name?: string }>()
  const panelOpen = !!selectedName

  const [filter, setFilter] = useState('')
  const [activeTab, setActiveTab] = useState('Overview')
  const [detail, setDetail] = useState<ServiceDetailData | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const listNamespace = useClusterStore((s) => s.selectedNamespace)
  const detailNamespace = selectedNamespace || 'default'
  const setSelectedResource = useSelectionStore((s) => s.setSelectedResource)
  const clearSelection = useSelectionStore((s) => s.clearSelection)

  // List data
  const cfg = RESOURCE_CONFIG.services
  const { data: items, isLoading } = useKubeResources({
    group: cfg.group, version: cfg.version, resource: cfg.plural, namespace: listNamespace,
  })
  const { data: endpointItems } = useKubeResources({
    group: '', version: 'v1', resource: 'endpoints', namespace: listNamespace,
  })

  // Pods in same namespace for relationship matching (when detail panel is open)
  const { data: podItems } = useKubeResources({
    group: '', version: 'v1', resource: 'pods', namespace: detailNamespace,
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
    ;(async () => {
      try {
        const [item, epItem] = await Promise.all([
          GetResource('', 'v1', 'services', detailNamespace, selectedName),
          GetResource('', 'v1', 'endpoints', detailNamespace, selectedName).catch(() => null),
        ])
        if (cancelled) return
        const svcDetail = transformServiceDetail(item)

        // Populate endpoint addresses from the Endpoints object
        if (epItem) {
          const epRaw = (epItem.raw || {}) as Record<string, unknown>
          const subsets = (epRaw.subsets || []) as Array<Record<string, unknown>>
          const addresses: ServiceEndpointAddress[] = []
          for (const subset of subsets) {
            const addrs = (subset.addresses || []) as Array<Record<string, unknown>>
            const ports = (subset.ports || []) as Array<Record<string, unknown>>
            const port = ports.length > 0 ? (ports[0].port as number) : undefined
            for (const addr of addrs) {
              const targetRef = (addr.targetRef || {}) as Record<string, unknown>
              addresses.push({
                ip: port ? `${addr.ip}:${port}` : String(addr.ip),
                podName: (targetRef.name as string) || '',
                ready: true,
              })
            }
            const notReady = (subset.notReadyAddresses || []) as Array<Record<string, unknown>>
            for (const addr of notReady) {
              const targetRef = (addr.targetRef || {}) as Record<string, unknown>
              addresses.push({
                ip: port ? `${addr.ip}:${port}` : String(addr.ip),
                podName: (targetRef.name as string) || '',
                ready: false,
              })
            }
          }
          svcDetail.endpoints = { addresses }
        }

        setDetail(svcDetail)
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
    if (selectedName && detail) {
      setSelectedResource({
        kind: 'Service',
        name: selectedName,
        namespace: detailNamespace,
        path: `/networking/services/${detailNamespace}/${selectedName}`,
      })
    } else if (!selectedName) {
      clearSelection()
    }
  }, [selectedName, detailNamespace, detail, setSelectedResource, clearSelection])

  // Reset tab when switching services
  useEffect(() => {
    setActiveTab('Overview')
  }, [selectedName, detailNamespace])

  // Filter pods matching the service's selector
  const matchingPods = useMemo(() => {
    if (!detail || detail.selector.length === 0) return []
    return podItems.filter((pod) => {
      const podLabels = labelsMap(pod)
      return detail.selector.every((s) => podLabels[s.key] === s.value)
    }).map((pod) => {
      const status = rawStatus(pod)
      const phase = (status.phase as string) || 'Unknown'
      const podIp = (status.podIP as string) || '-'
      return {
        name: pod.name,
        status: phase,
        ip: podIp,
      }
    })
  }, [detail, podItems])

  // Build a map of service name/namespace -> ready address count
  const endpointCounts = new Map<string, number>()
  for (const ep of endpointItems) {
    const raw = (ep.raw || {}) as Record<string, unknown>
    const subsets = (raw.subsets || []) as Array<Record<string, unknown>>
    const readyCount = subsets.reduce((sum, subset) => {
      const addresses = (subset.addresses || []) as Array<unknown>
      return sum + addresses.length
    }, 0)
    endpointCounts.set(`${ep.namespace}/${ep.name}`, readyCount)
  }

  const resources = items.map((item) => {
    const r = (item.raw || {}) as Record<string, unknown>
    const spec = (r.spec || {}) as Record<string, unknown>
    const status = (r.status || {}) as Record<string, unknown>
    const metadata = (r.metadata || {}) as Record<string, unknown>
    const svcType = (spec.type || 'ClusterIP') as string
    const loadBalancer = (status.loadBalancer || {}) as Record<string, unknown>
    const ingress = (loadBalancer.ingress || []) as Record<string, unknown>[]
    const externalIPs = (spec.externalIPs || []) as string[]
    const externalIP = externalIPs[0] || (ingress[0]?.ip as string) || (ingress[0]?.hostname as string) || '<none>'
    const count = endpointCounts.get(`${item.namespace}/${item.name}`)
    const annotations = (metadata.annotations || {}) as Record<string, string>
    const hasPortForward = annotations['clusterfudge.dev/port-forward'] === 'true' ||
      !!annotations['clusterfudge.dev/port-forwards']
    return {
      name: item.name,
      namespace: item.namespace,
      type: svcType,
      typeBadgeColor: serviceTypeBadgeColor(svcType),
      clusterIP: (spec.clusterIP || '<none>') as string,
      externalIP,
      ports: formatServicePorts((spec.ports || []) as unknown[]),
      selector: formatSelector(spec.selector),
      endpointCount: count !== undefined ? String(count) : '-',
      age: formatAge(metadata.creationTimestamp as string | undefined),
      status: 'running' as const,
      hasPortForward,
    }
  })

  const filtered = resources.filter((s) =>
    s.name.toLowerCase().includes(filter.toLowerCase()) ||
    s.namespace.toLowerCase().includes(filter.toLowerCase())
  )

  if (isLoading && items.length === 0) {
    return (
      <div className="resource-view">
        <ResourceHeader title="Services" subtitle="Loading...">
          <SearchInput placeholder="Filter services..." value={filter} onChange={setFilter} />
        </ResourceHeader>
        <div style={{ padding: 'var(--space-6)', color: 'var(--text-tertiary)' }}>Loading...</div>
      </div>
    )
  }

  return (
    <div className="resource-view">
      <ResourceHeader title="Services" subtitle={`${filtered.length} services`}>
        <SearchInput placeholder="Filter services..." value={filter} onChange={setFilter} />
      </ResourceHeader>

      <div style={panelOpen ? { flex: 1, overflow: 'hidden', display: 'flex' } : { display: 'contents' }}>
        <ResourceTable columns={columns} data={filtered} renderRow={(svc) => {
            const nsProps = getNamespaceStyle(svc.namespace)
            const isSelected = svc.name === selectedName && svc.namespace === selectedNamespace

            return (
              <tr key={`${svc.namespace}/${svc.name}`} className={isSelected ? 'selected' : undefined} style={{ cursor: 'pointer' }} onClick={() => navigate(`/networking/services/${svc.namespace}/${svc.name}`)}>
                <td className="col-status">
                  <StatusDot status={svc.status} />
                </td>
                <td className="name-cell">
                  {svc.name}
                  {svc.hasPortForward && (
                    <span title="Port forward preset available">
                      <Cable
                        className="inline-block ml-1 w-3 h-3"
                        style={{ color: 'var(--accent)', verticalAlign: 'text-bottom' }}
                      />
                    </span>
                  )}
                </td>
                <td className={nsProps.className} style={nsProps.style}>
                  {svc.namespace}
                </td>
                <td>
                  <Badge color={svc.typeBadgeColor}>{svc.type}</Badge>
                </td>
                <td className="mono">{svc.clusterIP}</td>
                <td className="mono" style={{ color: svc.externalIP !== '<none>' ? 'var(--accent)' : undefined }}>
                  {svc.externalIP}
                </td>
                <td className="mono">{svc.ports}</td>
                <td className="mono" style={{ fontSize: 'var(--text-2xs)' }}>{svc.selector}</td>
                <td className="tabular">{svc.endpointCount}</td>
                <td>{svc.age}</td>
              </tr>
            )
          }} />

        {panelOpen && (
          <>
            {detailLoading && !detail ? (
              <DetailPanel
                title="Loading..."
                subtitle=""
                onClose={() => navigate('/networking/services')}
              >
                <div style={{ padding: 'var(--space-4)', color: 'var(--text-secondary)' }}>Loading...</div>
              </DetailPanel>
            ) : detailError ? (
              <DetailPanel
                title="Error"
                subtitle=""
                onClose={() => navigate('/networking/services')}
              >
                <div style={{ padding: 'var(--space-4)', color: 'var(--text-secondary)' }}>
                  {detailError}
                </div>
              </DetailPanel>
            ) : detail ? (
              <DetailPanel
                title={detail.name}
                subtitle={`Service in "${detail.namespace}" namespace`}
                onClose={() => navigate('/networking/services')}
              >
                <DetailTabs tabs={DETAIL_TABS} activeTab={activeTab} onTabChange={setActiveTab} />

                <div className="detail-panel-body">
                  {activeTab === 'Overview' && (
                    <>
                      {/* Status badges */}
                      <div style={{ marginBottom: 'var(--space-4)' }}>
                        <span className={`badge badge-${detail.status === 'Active' ? 'green' : 'yellow'}`}>{detail.status}</span>
                        <span className={`badge badge-${detail.type === 'LoadBalancer' ? 'purple' : detail.type === 'NodePort' ? 'green' : 'blue'}`} style={{ marginLeft: '4px' }}>
                          {detail.type}
                        </span>
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

                        <span className="prop-label">Labels</span>
                        <span className="prop-value">
                          {detail.labels.map((l, i) => (
                            <span key={l.key} className="tag" style={i > 0 ? { marginLeft: '4px' } : undefined}>
                              {l.key}={l.value}
                            </span>
                          ))}
                        </span>

                        <span className="prop-label">Annotations</span>
                        <span
                          className="prop-value"
                          style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}
                        >
                          {detail.annotations.length} annotations
                        </span>

                        <span className="prop-group-title">Networking</span>

                        <span className="prop-label">Type</span>
                        <span className="prop-value">{detail.type}</span>

                        <span className="prop-label">Cluster IP</span>
                        <span className="prop-value mono">{detail.clusterIP}</span>

                        <span className="prop-label">External IP</span>
                        <span className="prop-value mono">{detail.externalIP}</span>

                        <span className="prop-label">Session Affinity</span>
                        <span className="prop-value">{detail.sessionAffinity}</span>

                        <span className="prop-label">External Traffic Policy</span>
                        <span className="prop-value">{detail.externalTrafficPolicy}</span>

                        <span className="prop-label">Internal Traffic Policy</span>
                        <span className="prop-value">{detail.internalTrafficPolicy}</span>

                        <span className="prop-group-title">Ports</span>
                      </div>

                      {/* Inline selector editor */}
                      <SelectorEditor
                        namespace={detail.namespace}
                        name={detail.name}
                        selectors={detail.selector}
                      />

                      {/* Ports table */}
                      <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)', overflowX: 'auto' }}>
                        <table className="resource-table" style={{ fontSize: 'var(--text-xs)' }}>
                          <thead>
                            <tr>
                              <th scope="col">Name</th>
                              <th scope="col">Port</th>
                              <th scope="col">Target Port</th>
                              <th scope="col">Node Port</th>
                              <th scope="col">Protocol</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail.ports.map((p) => (
                              <tr key={p.name}>
                                <td>{p.name}</td>
                                <td className="mono">{p.port}</td>
                                <td className="mono">{p.targetPort}</td>
                                <td className="mono">{p.nodePort ?? '-'}</td>
                                <td>{p.protocol}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Matching Pods */}
                      <div className="prop-list" style={{ marginTop: 'var(--space-4)' }}>
                        <span className="prop-group-title">Pods ({matchingPods.length})</span>
                      </div>
                      {matchingPods.length === 0 ? (
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', padding: 'var(--space-2) 0' }}>
                          No pods match this service&apos;s selector
                        </div>
                      ) : (
                        <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)', overflowX: 'auto' }}>
                          <table className="resource-table" style={{ fontSize: 'var(--text-xs)' }}>
                            <thead>
                              <tr>
                                <th scope="col">Name</th>
                                <th scope="col">Status</th>
                                <th scope="col">IP</th>
                              </tr>
                            </thead>
                            <tbody>
                              {matchingPods.map((pod) => (
                                <tr key={pod.name} style={{ cursor: 'pointer' }} onClick={() => navigate(`/workloads/pods/${detailNamespace}/${pod.name}`)}>
                                  <td className="name-cell">
                                    <Link to={`/workloads/pods/${detailNamespace}/${pod.name}`}>{pod.name}</Link>
                                  </td>
                                  <td>
                                    <StatusDot status={pod.status.toLowerCase()} />
                                    {' '}{pod.status}
                                  </td>
                                  <td className="mono">{pod.ip}</td>
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
                      namespace={detail.namespace}
                      resourceType="services"
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
