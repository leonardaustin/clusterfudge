import React, { useState } from 'react'
import { useKubeResources } from '../hooks/useKubeResource'
import { useClusterStore } from '../stores/clusterStore'
import { RESOURCE_CONFIG } from '../lib/resourceConfig'
import { formatAge } from '../lib/k8sFormatters'
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
  { key: 'class', label: 'Class', className: 'col-sm' },
  { key: 'hosts', label: 'Hosts', className: 'col-md' },
  { key: 'tls', label: 'TLS', className: 'col-sm' },
  { key: 'address', label: 'Address', className: 'col-md' },
  { key: 'rules', label: 'Rules', className: 'col-xs' },
  { key: 'age', label: 'Age', className: 'col-age' },
]

const detailCellStyle: React.CSSProperties = {
  padding: 'var(--space-1) var(--space-2)',
  borderBottom: '1px solid var(--border)',
  verticalAlign: 'top',
  fontSize: 'var(--text-2xs)',
}

const detailHeaderStyle: React.CSSProperties = {
  ...detailCellStyle,
  fontWeight: 600,
  color: 'var(--text-disabled)',
  textTransform: 'uppercase' as const,
  fontSize: 'var(--text-3xs, 10px)',
  letterSpacing: '0.05em',
}

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

interface IngressTLS {
  hosts: string[]
  secretName: string
}

interface IngressPathRule {
  host: string
  path: string
  pathType: string
  backend: string
}

function transformIngress(item: { name: string; namespace: string; raw?: unknown }) {
  const r = (item.raw || {}) as Record<string, unknown>
  const spec = (r.spec || {}) as Record<string, unknown>
  const status = (r.status || {}) as Record<string, unknown>
  const rules = (spec.rules || []) as Record<string, unknown>[]
  const loadBalancer = (status.loadBalancer || {}) as Record<string, unknown>
  const ingress = (loadBalancer.ingress || []) as Record<string, unknown>[]
  const address = (ingress[0]?.ip || ingress[0]?.hostname || '') as string
  const hosts = rules.map((rule: Record<string, unknown>) => (rule.host || '*') as string).join(', ')
  const tlsEntries: IngressTLS[] = ((spec.tls || []) as Record<string, unknown>[]).map((t: Record<string, unknown>) => ({
    hosts: (t.hosts || []) as string[],
    secretName: (t.secretName || '') as string,
  }))
  const hasTLS = tlsEntries.length > 0
  const metadata = (r.metadata || {}) as Record<string, unknown>
  const annotations = (metadata.annotations || {}) as Record<string, string>
  const ingressClass = (spec.ingressClassName || annotations['kubernetes.io/ingress.class'] || '') as string

  const pathRules: IngressPathRule[] = []
  for (const rule of rules) {
    const host = (rule.host || '*') as string
    const http = (rule.http || {}) as Record<string, unknown>
    const paths = (http.paths || []) as Record<string, unknown>[]
    for (const p of paths) {
      const pBackend = (p.backend || {}) as Record<string, unknown>
      const pService = (pBackend.service || {}) as Record<string, unknown>
      const pPort = (pService.port || {}) as Record<string, unknown>
      const backend = pService.name
        ? `${pService.name}:${pPort.number || pPort.name || ''}`
        : ''
      pathRules.push({
        host,
        path: (p.path || '/') as string,
        pathType: (p.pathType || 'Prefix') as string,
        backend,
      })
    }
  }

  return {
    name: item.name,
    namespace: item.namespace,
    status: address ? 'active' as const : 'warning' as const,
    class: ingressClass,
    hosts,
    address,
    tls: tlsEntries,
    hasTLS,
    rules: pathRules,
    age: formatAge(metadata.creationTimestamp as string | undefined),
  }
}

export function IngressList() {
  const [filter, setFilter] = useState('')
  const [expandedIngresses, setExpandedIngresses] = useState<Set<string>>(new Set())
  const namespace = useClusterStore((s) => s.selectedNamespace)
  const cfg = RESOURCE_CONFIG.ingresses
  const { data: items, isLoading } = useKubeResources({
    group: cfg.group, version: cfg.version, resource: cfg.plural, namespace,
  })

  const resources = items.map(transformIngress)

  const filtered = resources.filter((i) =>
    i.name.toLowerCase().includes(filter.toLowerCase()) ||
    i.namespace.toLowerCase().includes(filter.toLowerCase())
  )

  const toggleExpanded = (key: string) => {
    setExpandedIngresses((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  if (isLoading && items.length === 0) {
    return (
      <div className="resource-view">
        <ResourceHeader title="Ingresses" subtitle="Loading...">
          <SearchInput placeholder="Filter ingresses..." value={filter} onChange={setFilter} />
        </ResourceHeader>
        <div style={{ padding: 'var(--space-6)', color: 'var(--text-tertiary)' }}>Loading...</div>
      </div>
    )
  }

  return (
    <div className="resource-view">
      <ResourceHeader title="Ingresses" subtitle={`${filtered.length} ingresses`}>
        <SearchInput placeholder="Filter ingresses..." value={filter} onChange={setFilter} />
      </ResourceHeader>

      <ResourceTable columns={columns} data={filtered} renderRow={(ing) => {
          const nsProps = getNamespaceStyle(ing.namespace)
          const key = `${ing.namespace}/${ing.name}`
          const isExpanded = expandedIngresses.has(key)

          return (
            <React.Fragment key={key}>
              <tr style={{ cursor: 'pointer' }} onClick={() => toggleExpanded(key)}>
                <td className="col-status">
                  <StatusDot status={ing.status} />
                </td>
                <td className="name-cell">
                  <span style={{ marginRight: 'var(--space-1)', fontSize: 'var(--text-2xs)', color: 'var(--text-disabled)' }}>
                    {isExpanded ? '\u25BC' : '\u25B6'}
                  </span>
                  {ing.name}
                </td>
                <td className={nsProps.className} style={nsProps.style}>
                  {ing.namespace}
                </td>
                <td className="mono">{ing.class}</td>
                <td className="mono">{ing.hosts}</td>
                <td>
                  <Badge color={ing.hasTLS ? 'green' : 'gray'}>{ing.hasTLS ? 'Yes' : 'No'}</Badge>
                </td>
                <td className="mono">{ing.address || '\u2014'}</td>
                <td className="tabular">{ing.rules.length}</td>
                <td>{ing.age}</td>
              </tr>
              {isExpanded && (
                <tr key={`${key}-detail`}>
                  <td colSpan={9} style={{ padding: 'var(--space-2) var(--space-4)', background: 'var(--bg-secondary, var(--surface-1))' }}>
                    {ing.hasTLS && (
                      <div style={{ marginBottom: 'var(--space-2)' }}>
                        <div style={{ fontWeight: 600, fontSize: 'var(--text-2xs)', marginBottom: 'var(--space-1)' }}>TLS</div>
                        {ing.tls.map((t, i) => (
                          <div key={i} className="mono" style={{ fontSize: 'var(--text-2xs)' }}>
                            {t.hosts.join(', ')} &rarr; {t.secretName}
                          </div>
                        ))}
                      </div>
                    )}
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 'var(--text-2xs)', marginBottom: 'var(--space-1)' }}>Path Rules</div>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            <th scope="col" style={detailHeaderStyle}>Host</th>
                            <th scope="col" style={detailHeaderStyle}>Path</th>
                            <th scope="col" style={detailHeaderStyle}>Path Type</th>
                            <th scope="col" style={detailHeaderStyle}>Backend</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ing.rules.map((rule, i) => (
                            <tr key={i}>
                              <td className="mono" style={detailCellStyle}>{rule.host}</td>
                              <td className="mono" style={detailCellStyle}>{rule.path}</td>
                              <td style={detailCellStyle}>{rule.pathType}</td>
                              <td className="mono" style={detailCellStyle}>{rule.backend}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          )
        }} />
    </div>
  )
}
