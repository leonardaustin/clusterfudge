import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useKubeResources } from '../hooks/useKubeResource'
import { useClusterStore } from '../stores/clusterStore'
import { RESOURCE_CONFIG } from '../lib/resourceConfig'
import { formatAge, formatServicePorts, formatSelector, serviceTypeBadgeColor } from '../lib/k8sFormatters'
import { StatusDot } from '../components/shared/StatusDot'
import { Badge } from '../components/shared/Badge'
import { SearchInput } from '../components/shared/SearchInput'
import { ResourceHeader } from '../components/shared/ResourceHeader'
import { ResourceTable } from '../components/shared/ResourceTable'
import type { Column } from '../components/shared/ResourceTable'

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

export function ServiceList() {
  const [filter, setFilter] = useState('')
  const namespace = useClusterStore((s) => s.selectedNamespace)
  const cfg = RESOURCE_CONFIG.services
  const { data: items, isLoading } = useKubeResources({
    group: cfg.group, version: cfg.version, resource: cfg.plural, namespace,
  })
  const { data: endpointItems } = useKubeResources({
    group: '', version: 'v1', resource: 'endpoints', namespace,
  })

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

      <ResourceTable columns={columns} data={filtered} renderRow={(svc) => {
          const nsProps = getNamespaceStyle(svc.namespace)

          return (
            <tr key={`${svc.namespace}/${svc.name}`}>
              <td className="col-status">
                <StatusDot status={svc.status} />
              </td>
              <td className="name-cell">
                <Link to={`/networking/services/${svc.namespace}/${svc.name}`}>{svc.name}</Link>
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
    </div>
  )
}
