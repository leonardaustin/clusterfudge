import { useState } from 'react'
import { useKubeResources } from '../hooks/useKubeResource'
import { useClusterStore } from '../stores/clusterStore'
import { RESOURCE_CONFIG } from '../lib/resourceConfig'
import { formatAge, creationTimestamp, annotationsMap } from '../lib/k8sFormatters'
import { SearchInput } from '../components/shared/SearchInput'
import { ResourceHeader } from '../components/shared/ResourceHeader'
import { ResourceTable } from '../components/shared/ResourceTable'
import type { Column } from '../components/shared/ResourceTable'

const columns: Column[] = [
  { key: 'name', label: 'Name', className: 'col-name' },
  { key: 'namespace', label: 'Namespace', className: 'col-md' },
  { key: 'secrets', label: 'Secrets', className: 'col-sm' },
  { key: 'imagePullSecrets', label: 'Image Pull Secrets', className: 'col-md' },
  { key: 'automountToken', label: 'Automount Token', className: 'col-sm' },
  { key: 'iamRole', label: 'IAM Role', className: 'col-name' },
  { key: 'age', label: 'Age', className: 'col-age' },
]

export function ServiceAccountList() {
  const [filter, setFilter] = useState('')
  const namespace = useClusterStore((s) => s.selectedNamespace)
  const cfg = RESOURCE_CONFIG.serviceaccounts
  const { data: items, isLoading } = useKubeResources({
    group: cfg.group, version: cfg.version, resource: cfg.plural, namespace,
  })

  const serviceAccounts = items.map((item) => {
    const r = (item.raw || {}) as Record<string, unknown>
    const secrets = ((r.secrets || []) as unknown[]).length
    const ips = ((r.imagePullSecrets || []) as Record<string, unknown>[]).map((s: Record<string, unknown>) => s.name).join(', ') || '\u2014'
    const automountToken = r.automountServiceAccountToken !== false
    const annotations = annotationsMap(item)
    const iamRole = annotations['eks.amazonaws.com/role-arn'] || annotations['iam.gke.io/gcp-service-account'] || ''
    return {
      name: item.name,
      namespace: item.namespace,
      secrets,
      imagePullSecrets: ips,
      automountToken,
      iamRole,
      age: formatAge(creationTimestamp(item)),
    }
  })

  const filtered = serviceAccounts.filter((sa) =>
    sa.name.toLowerCase().includes(filter.toLowerCase()) ||
    sa.namespace.toLowerCase().includes(filter.toLowerCase())
  )

  if (isLoading && items.length === 0) {
    return (
      <div className="resource-view">
        <ResourceHeader title="Service Accounts" subtitle="Loading..." />
        <div style={{ padding: 'var(--space-4)', color: 'var(--text-secondary)' }}>Loading service accounts...</div>
      </div>
    )
  }

  return (
    <div className="resource-view">
      <ResourceHeader title="Service Accounts" subtitle={`${serviceAccounts.length} service accounts${namespace ? ` in ${namespace}` : ' across all namespaces'}`}>
        <SearchInput placeholder="Filter service accounts..." value={filter} onChange={setFilter} />
      </ResourceHeader>

      <ResourceTable columns={columns} data={filtered} renderRow={(sa) => (
          <tr key={`${sa.namespace}/${sa.name}`}>
            <td className="name-cell">{sa.name}</td>
            <td>{sa.namespace}</td>
            <td className="tabular">{sa.secrets}</td>
            <td className="mono">{sa.imagePullSecrets}</td>
            <td>
              <span style={{ color: sa.automountToken ? 'var(--green)' : 'var(--text-secondary)' }}>
                {sa.automountToken ? 'true' : 'false'}
              </span>
            </td>
            <td className="mono" style={{ fontSize: 'var(--text-2xs)' }}>{sa.iamRole}</td>
            <td>{sa.age}</td>
          </tr>
        )} />
    </div>
  )
}
