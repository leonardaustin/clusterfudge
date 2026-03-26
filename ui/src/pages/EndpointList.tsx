import { useState } from 'react'
import { useKubeResources } from '../hooks/useKubeResource'
import { useClusterStore } from '../stores/clusterStore'
import { RESOURCE_CONFIG } from '../lib/resourceConfig'
import { formatAge } from '../lib/k8sFormatters'
import { SearchInput } from '../components/shared/SearchInput'
import { ResourceHeader } from '../components/shared/ResourceHeader'
import { ResourceTable } from '../components/shared/ResourceTable'
import type { Column } from '../components/shared/ResourceTable'

const columns: Column[] = [
  { key: 'name', label: 'Name', className: 'col-name' },
  { key: 'namespace', label: 'Namespace', className: 'col-md' },
  { key: 'endpoints', label: 'Endpoints', className: 'col-lg' },
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

function formatEndpoints(subsets: Record<string, unknown>[]): string {
  if (!subsets || subsets.length === 0) return '<none>'
  const pairs: string[] = []
  for (const subset of subsets) {
    const addresses = (subset.addresses || []) as Record<string, unknown>[]
    const ports = (subset.ports || []) as Record<string, unknown>[]
    for (const addr of addresses) {
      if (ports.length === 0) {
        pairs.push(addr.ip as string)
      } else {
        for (const port of ports) {
          pairs.push(`${addr.ip}:${port.port}`)
        }
      }
    }
  }
  return pairs.length > 0 ? pairs.join(', ') : '<none>'
}

export function EndpointList() {
  const [filter, setFilter] = useState('')
  const namespace = useClusterStore((s) => s.selectedNamespace)
  const cfg = RESOURCE_CONFIG.endpoints
  const { data: items, isLoading } = useKubeResources({
    group: cfg.group, version: cfg.version, resource: cfg.plural, namespace,
  })

  const resources = items.map((item) => {
    const r = (item.raw || {}) as Record<string, unknown>
    const metadata = (r.metadata || {}) as Record<string, unknown>
    return {
      name: item.name,
      namespace: item.namespace,
      endpoints: formatEndpoints((r.subsets || []) as Record<string, unknown>[]),
      age: formatAge(metadata.creationTimestamp as string | undefined),
    }
  })

  const filtered = resources.filter((e) =>
    e.name.toLowerCase().includes(filter.toLowerCase()) ||
    e.namespace.toLowerCase().includes(filter.toLowerCase())
  )

  if (isLoading && items.length === 0) {
    return (
      <div className="resource-view">
        <ResourceHeader title="Endpoints" subtitle="Loading...">
          <SearchInput placeholder="Filter endpoints..." value={filter} onChange={setFilter} />
        </ResourceHeader>
        <div style={{ padding: 'var(--space-6)', color: 'var(--text-tertiary)' }}>Loading...</div>
      </div>
    )
  }

  return (
    <div className="resource-view">
      <ResourceHeader title="Endpoints" subtitle={`${filtered.length} endpoints`}>
        <SearchInput placeholder="Filter endpoints..." value={filter} onChange={setFilter} />
      </ResourceHeader>

      <ResourceTable columns={columns} data={filtered} renderRow={(ep) => {
          const nsProps = getNamespaceStyle(ep.namespace)

          return (
            <tr key={`${ep.namespace}/${ep.name}`}>
              <td className="name-cell">{ep.name}</td>
              <td className={nsProps.className} style={nsProps.style}>
                {ep.namespace}
              </td>
              <td className="mono">{ep.endpoints}</td>
              <td>{ep.age}</td>
            </tr>
          )
        }} />
    </div>
  )
}
