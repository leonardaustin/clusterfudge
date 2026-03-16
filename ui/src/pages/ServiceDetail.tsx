import { useState, useEffect, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useKubeResources } from '../hooks/useKubeResource'
import { GetResource } from '../wailsjs/go/handlers/ResourceHandler'
import type { ResourceItem } from '../wailsjs/go/handlers/ResourceHandler'
import { formatAge, rawSpec, rawStatus, rawMetadata, labelsMap, annotationsMap, labelsToKV, formatServicePorts } from '../lib/k8sFormatters'
import { StatusDot } from '../components/shared/StatusDot'
import { DetailPanel } from '../components/detail/DetailPanel'
import { DetailTabs } from '../components/detail/DetailTabs'
import { ResourceEvents } from '../components/detail/ResourceEvents'
import { SelectorEditor } from '../components/shared/SelectorEditor'
import type { ServiceDetailData, ServiceEndpointAddress } from '../data/detailTypes'

const TABS = ['Overview', 'YAML', 'Events']

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

export function ServiceDetail() {
  const { namespace: urlNamespace, name } = useParams<{ namespace: string; name: string }>()
  const [activeTab, setActiveTab] = useState('Overview')
  const namespace = urlNamespace || 'default'

  // Sidebar service list
  const { data: svcItems, isLoading: listLoading } = useKubeResources({
    group: '', version: 'v1', resource: 'services', namespace,
  })

  // Pods in same namespace for relationship matching
  const { data: podItems } = useKubeResources({
    group: '', version: 'v1', resource: 'pods', namespace,
  })

  // Single service detail
  const [detail, setDetail] = useState<ServiceDetailData | null>(null)
  const [detailLoading, setDetailLoading] = useState(true)
  const [detailError, setDetailError] = useState<string | null>(null)

  useEffect(() => {
    if (!name) return
    let cancelled = false
    ;(async () => {
      setDetailLoading(true)
      setDetailError(null)
      try {
        const [item, epItem] = await Promise.all([
          GetResource('', 'v1', 'services', namespace, name),
          GetResource('', 'v1', 'endpoints', namespace, name).catch(() => null),
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
        setDetailLoading(false)
      } catch (err) {
        if (cancelled) return
        setDetailError(String(err))
        setDetailLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [name, namespace])

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

  // Sidebar rows
  const sidebarSvcs = svcItems.map((item) => {
    const spec = rawSpec(item)
    const svcStatus = rawStatus(item)
    const specPorts = (spec.ports || []) as Array<Record<string, unknown>>
    const sType = (spec.type as string) || 'ClusterIP'
    const lbIngress = ((svcStatus.loadBalancer as Record<string, unknown> || {}).ingress || []) as unknown[]
    const sidebarStatus = sType === 'LoadBalancer' && lbIngress.length === 0 ? 'pending' : 'running'
    return {
      name: item.name,
      namespace: item.namespace,
      status: sidebarStatus,
      type: (spec.type as string) || 'ClusterIP',
      clusterIP: (spec.clusterIP as string) || '<none>',
      ports: formatServicePorts(specPorts),
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
          {detailError || `Service "${name}" not found.`}{' '}
          <Link to="/networking/services" style={{ color: 'var(--blue)' }}>Back to list</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="resource-view">
      <div className="resource-body">
        {/* Left: abridged service table */}
        <div className="resource-table-wrap">
          <table className="resource-table clickable">
            <thead>
              <tr>
                <th scope="col" className="col-status">Status</th>
                <th scope="col" className="col-name">Name</th>
                <th scope="col" className="col-sm">Type</th>
                <th scope="col" className="col-md">Cluster IP</th>
                <th scope="col" className="col-md">Ports</th>
                <th scope="col" className="col-age">Age</th>
              </tr>
            </thead>
            <tbody>
              {sidebarSvcs.slice(0, 6).map((svc) => (
                <tr key={`${svc.namespace}/${svc.name}`} className={svc.name === name ? 'selected' : undefined}>
                  <td className="col-status">
                    <StatusDot status={svc.status} />
                  </td>
                  <td className="name-cell">
                    <Link to={`/networking/services/${svc.namespace}/${svc.name}`}>{svc.name}</Link>
                  </td>
                  <td>{svc.type}</td>
                  <td className="mono">{svc.clusterIP}</td>
                  <td className="mono">{svc.ports}</td>
                  <td>{svc.age}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Right: Detail Panel */}
        <DetailPanel
          title={detail.name}
          subtitle={`Service in "${detail.namespace}" namespace`}
          onClose={() => window.history.back()}
        >
          <DetailTabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

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
                    <table className="resource-table clickable" style={{ fontSize: 'var(--text-xs)' }}>
                      <thead>
                        <tr>
                          <th scope="col">Name</th>
                          <th scope="col">Status</th>
                          <th scope="col">IP</th>
                        </tr>
                      </thead>
                      <tbody>
                        {matchingPods.map((pod) => (
                          <tr key={pod.name}>
                            <td className="name-cell">
                              <Link to={`/workloads/pods/${namespace}/${pod.name}`}>{pod.name}</Link>
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
      </div>
    </div>
  )
}
