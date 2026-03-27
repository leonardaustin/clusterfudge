import React, { useState } from 'react'
import { useKubeResources } from '../hooks/useKubeResource'
import { useClusterStore } from '../stores/clusterStore'
import { RESOURCE_CONFIG } from '../lib/resourceConfig'
import { formatAge, formatSelector } from '../lib/k8sFormatters'
import { SearchInput } from '../components/shared/SearchInput'
import { ResourceHeader } from '../components/shared/ResourceHeader'
import { ResourceTable } from '../components/shared/ResourceTable'
import type { Column } from '../components/shared/ResourceTable'

const columns: Column[] = [
  { key: 'name', label: 'Name', className: 'col-name' },
  { key: 'namespace', label: 'Namespace', className: 'col-md' },
  { key: 'podSelector', label: 'Pod Selector', className: 'col-md' },
  { key: 'policyTypes', label: 'Policy Types', className: 'col-md' },
  { key: 'ingress', label: 'Ingress Rules', className: 'col-xs' },
  { key: 'egress', label: 'Egress Rules', className: 'col-xs' },
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

interface NetworkPolicyRule {
  ports: { protocol: string; port: number | string }[]
  peers: { cidr?: string; namespaceSelector?: string; podSelector?: string }[]
}

function extractRules(rawRules: Record<string, unknown>[], direction: 'from' | 'to'): NetworkPolicyRule[] {
  if (!rawRules) return []
  return rawRules.map((rule: Record<string, unknown>) => {
    const ports = ((rule.ports || []) as Record<string, unknown>[]).map((p: Record<string, unknown>) => ({
      protocol: (p.protocol || 'TCP') as string,
      port: (p.port || '') as number | string,
    }))
    const peerKey = direction
    const peers = ((rule[peerKey] || []) as Record<string, unknown>[]).map((peer: Record<string, unknown>) => {
      const result: { cidr?: string; namespaceSelector?: string; podSelector?: string } = {}
      const ipBlock = (peer.ipBlock || {}) as Record<string, unknown>
      if (ipBlock.cidr) result.cidr = ipBlock.cidr as string
      const nsSelector = (peer.namespaceSelector || {}) as Record<string, unknown>
      if (nsSelector.matchLabels) {
        result.namespaceSelector = formatSelector(nsSelector.matchLabels as Record<string, string>)
      }
      const podSelector = (peer.podSelector || {}) as Record<string, unknown>
      if (podSelector.matchLabels) {
        result.podSelector = formatSelector(podSelector.matchLabels as Record<string, string>)
      }
      return result
    })
    return { ports, peers }
  })
}

function RuleDetail({ label, rules }: { label: string; rules: NetworkPolicyRule[] }) {
  if (rules.length === 0) {
    return (
      <div style={{ marginBottom: 'var(--space-2)' }}>
        <div style={{ fontWeight: 600, fontSize: 'var(--text-2xs)', marginBottom: 'var(--space-1)' }}>{label}</div>
        <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-disabled)' }}>No rules (deny all)</div>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 'var(--space-2)' }}>
      <div style={{ fontWeight: 600, fontSize: 'var(--text-2xs)', marginBottom: 'var(--space-1)' }}>{label}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th scope="col" style={detailHeaderStyle}>Ports</th>
            <th scope="col" style={detailHeaderStyle}>From/To</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((rule, i) => (
            <tr key={i}>
              <td className="mono" style={detailCellStyle}>
                {rule.ports.map((p) => `${p.port}/${p.protocol}`).join(', ') || 'All'}
              </td>
              <td className="mono" style={detailCellStyle}>
                {rule.peers.map((peer, j) => {
                  const parts: string[] = []
                  if (peer.cidr) parts.push(`CIDR: ${peer.cidr}`)
                  if (peer.namespaceSelector) parts.push(`ns: ${peer.namespaceSelector}`)
                  if (peer.podSelector) parts.push(`pod: ${peer.podSelector}`)
                  return <div key={j}>{parts.join(', ')}</div>
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function NetworkPolicyList() {
  const [filter, setFilter] = useState('')
  const [expandedPolicies, setExpandedPolicies] = useState<Set<string>>(new Set())
  const namespace = useClusterStore((s) => s.selectedNamespace)
  const cfg = RESOURCE_CONFIG.networkpolicies
  const { data: items, isLoading } = useKubeResources({
    group: cfg.group, version: cfg.version, resource: cfg.plural, namespace,
  })

  const resources = items.map((item) => {
    const r = (item.raw || {}) as Record<string, unknown>
    const spec = (r.spec || {}) as Record<string, unknown>
    const metadata = (r.metadata || {}) as Record<string, unknown>
    const podSelector = (spec.podSelector || {}) as Record<string, unknown>
    const podSel = podSelector.matchLabels as Record<string, string> | undefined
    const podSelectorStr = podSel && Object.keys(podSel).length > 0
      ? formatSelector(podSel)
      : '<all pods>'
    const policyTypes = ((spec.policyTypes || []) as string[]).join(', ') || 'Ingress'
    const ingressRules = extractRules((spec.ingress || []) as Record<string, unknown>[], 'from')
    const egressRules = extractRules((spec.egress || []) as Record<string, unknown>[], 'to')
    return {
      name: item.name,
      namespace: item.namespace,
      podSelector: podSelectorStr,
      policyTypes,
      ingressRules,
      egressRules,
      age: formatAge(metadata.creationTimestamp as string | undefined),
    }
  })

  const filtered = resources.filter((np) =>
    np.name.toLowerCase().includes(filter.toLowerCase()) ||
    np.namespace.toLowerCase().includes(filter.toLowerCase())
  )

  const toggleExpanded = (key: string) => {
    setExpandedPolicies((prev) => {
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
        <ResourceHeader title="Network Policies" subtitle="Loading...">
          <SearchInput placeholder="Filter network policies..." value={filter} onChange={setFilter} />
        </ResourceHeader>
        <div style={{ padding: 'var(--space-6)', color: 'var(--text-tertiary)' }}>Loading...</div>
      </div>
    )
  }

  return (
    <div className="resource-view">
      <ResourceHeader title="Network Policies" subtitle={`${filtered.length} network policies`}>
        <SearchInput placeholder="Filter network policies..." value={filter} onChange={setFilter} />
      </ResourceHeader>

      <ResourceTable columns={columns} data={filtered} renderRow={(np) => {
          const key = `${np.namespace}/${np.name}`
          const isExpanded = expandedPolicies.has(key)
          return (
            <React.Fragment key={key}>
              <tr style={{ cursor: 'pointer' }} onClick={() => toggleExpanded(key)}>
                <td className="name-cell">
                  <span style={{ marginRight: 'var(--space-1)', fontSize: 'var(--text-2xs)', color: 'var(--text-disabled)' }}>
                    {isExpanded ? '\u25BC' : '\u25B6'}
                  </span>
                  {np.name}
                </td>
                <td>{np.namespace}</td>
                <td className="mono">{np.podSelector}</td>
                <td>{np.policyTypes}</td>
                <td className="tabular">{np.ingressRules.length}</td>
                <td className="tabular">{np.egressRules.length}</td>
                <td>{np.age}</td>
              </tr>
              {isExpanded && (
                <tr key={`${key}-detail`}>
                  <td colSpan={7} style={{ padding: 'var(--space-2) var(--space-4)', background: 'var(--bg-secondary, var(--surface-1))' }}>
                    {np.policyTypes.includes('Ingress') && (
                      <RuleDetail label="Ingress Rules" rules={np.ingressRules} />
                    )}
                    {np.policyTypes.includes('Egress') && (
                      <RuleDetail label="Egress Rules" rules={np.egressRules} />
                    )}
                  </td>
                </tr>
              )}
            </React.Fragment>
          )
        }} />
    </div>
  )
}
