import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { GetResource, ListResources } from '../wailsjs/go/handlers/ResourceHandler'
import type { ResourceItem } from '../wailsjs/go/handlers/ResourceHandler'
import { formatAge, creationTimestamp } from '../lib/k8sFormatters'
import { ResourceHeader } from '../components/shared/ResourceHeader'
import { DetailTabs } from '../components/detail/DetailTabs'
import { ResourceTable } from '../components/shared/ResourceTable'
import type { Column } from '../components/shared/ResourceTable'
import { useClusterStore } from '../stores/clusterStore'

const TABS = ['Instances', 'Schema']

const instanceColumns: Column[] = [
  { key: 'name', label: 'Name', className: 'col-name' },
  { key: 'namespace', label: 'Namespace', className: 'col-md' },
  { key: 'age', label: 'Age', className: 'col-age' },
]

interface CRDInfo {
  name: string
  group: string
  kind: string
  scope: string
  plural: string
  version: string
  versions: string[]
  schema: Record<string, unknown> | null
}

function extractCRDInfo(item: ResourceItem): CRDInfo {
  const raw = (item.raw || {}) as Record<string, unknown>
  const spec = (raw.spec || {}) as Record<string, unknown>
  const names = (spec.names || {}) as Record<string, unknown>
  const versionsArr = (spec.versions || []) as Record<string, unknown>[]

  // Find the served+storage version, or fall back to the first served version
  let primaryVersion = ''
  let schema: Record<string, unknown> | null = null

  for (const v of versionsArr) {
    if (v.storage === true && v.served !== false) {
      primaryVersion = v.name as string
      const vSchema = (v.schema || {}) as Record<string, unknown>
      schema = (vSchema.openAPIV3Schema || null) as Record<string, unknown> | null
      break
    }
  }

  if (!primaryVersion && versionsArr.length > 0) {
    const first = versionsArr[0]
    primaryVersion = first.name as string
    const vSchema = (first.schema || {}) as Record<string, unknown>
    schema = (vSchema.openAPIV3Schema || null) as Record<string, unknown> | null
  }

  return {
    name: item.name,
    group: (spec.group || '') as string,
    kind: (names.kind || '') as string,
    scope: (spec.scope || '') as string,
    plural: (names.plural || '') as string,
    version: primaryVersion,
    versions: versionsArr.map((v) => v.name as string),
    schema,
  }
}

export function CRDDetail() {
  const { name } = useParams<{
    group: string
    resource: string
    name: string
  }>()
  const selectedNamespace = useClusterStore((s) => s.selectedNamespace)

  const [activeTab, setActiveTab] = useState('Instances')
  const [crdInfo, setCrdInfo] = useState<CRDInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [instances, setInstances] = useState<ResourceItem[]>([])
  const [instancesLoading, setInstancesLoading] = useState(false)
  const [instancesError, setInstancesError] = useState<string | null>(null)

  // Load CRD details
  useEffect(() => {
    if (!name) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const item = await GetResource('apiextensions.k8s.io', 'v1', 'customresourcedefinitions', '', name)
        if (cancelled) return
        setCrdInfo(extractCRDInfo(item))
        setLoading(false)
      } catch (err) {
        if (cancelled) return
        setError(String(err))
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [name])

  // Load CRD instances when we have crdInfo
  useEffect(() => {
    if (!crdInfo) return
    let cancelled = false
    ;(async () => {
      setInstancesLoading(true)
      setInstancesError(null)
      const ns = crdInfo.scope === 'Namespaced' ? (selectedNamespace || '') : ''
      try {
        const items = await ListResources(crdInfo.group, crdInfo.version, crdInfo.plural, ns)
        if (cancelled) return
        setInstances(items ?? [])
        setInstancesLoading(false)
      } catch (err) {
        if (cancelled) return
        setInstancesError(String(err))
        setInstancesLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [crdInfo, selectedNamespace])

  if (loading) {
    return (
      <div className="resource-view">
        <ResourceHeader title="Custom Resource Definition" subtitle="Loading...">
          <Link to="/custom/all/crds" style={{ color: 'var(--blue)', fontSize: 'var(--text-xs)' }}>
            Back to CRDs
          </Link>
        </ResourceHeader>
        <div style={{ padding: 'var(--space-6)', color: 'var(--text-tertiary)' }}>Loading...</div>
      </div>
    )
  }

  if (error || !crdInfo) {
    return (
      <div className="resource-view">
        <ResourceHeader title="Custom Resource Definition" subtitle="Error">
          <Link to="/custom/all/crds" style={{ color: 'var(--blue)', fontSize: 'var(--text-xs)' }}>
            Back to CRDs
          </Link>
        </ResourceHeader>
        <div style={{ padding: 'var(--space-6)', color: 'var(--text-secondary)' }}>
          {error || `CRD "${name}" not found.`}{' '}
          <Link to="/custom/all/crds" style={{ color: 'var(--blue)' }}>Back to CRDs</Link>
        </div>
      </div>
    )
  }

  const instanceRows = instances.map((item) => ({
    name: item.name,
    namespace: item.namespace || '-',
    age: formatAge(creationTimestamp(item)),
  }))

  return (
    <div className="resource-view">
      <ResourceHeader
        title={crdInfo.name}
        subtitle={`${crdInfo.kind} (${crdInfo.group}) - ${crdInfo.scope}`}
      >
        <Link to="/custom/all/crds" style={{ color: 'var(--blue)', fontSize: 'var(--text-xs)' }}>
          Back to CRDs
        </Link>
      </ResourceHeader>

      <div style={{ padding: '0 var(--space-4)' }}>
        {/* CRD metadata summary */}
        <div className="prop-list">
          <span className="prop-label">Group</span>
          <span className="prop-value mono">{crdInfo.group}</span>

          <span className="prop-label">Kind</span>
          <span className="prop-value">{crdInfo.kind}</span>

          <span className="prop-label">Scope</span>
          <span className="prop-value" style={{
            color: crdInfo.scope === 'Cluster' ? 'var(--purple)' : 'var(--blue)',
          }}>
            {crdInfo.scope}
          </span>

          <span className="prop-label">Versions</span>
          <span className="prop-value mono">{crdInfo.versions.join(', ')}</span>
        </div>

        {/* Tabs */}
        <div style={{ marginTop: 'var(--space-4)' }}>
          <DetailTabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />
        </div>

        {/* Instances Tab */}
        {activeTab === 'Instances' && (
          <div style={{ marginTop: 'var(--space-3)' }}>
            {instancesLoading ? (
              <div style={{ padding: 'var(--space-4)', color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}>
                Loading instances...
              </div>
            ) : instancesError ? (
              <div style={{ padding: 'var(--space-4)', color: 'var(--red)', fontSize: 'var(--text-xs)' }}>
                {instancesError}
              </div>
            ) : instanceRows.length === 0 ? (
              <div style={{ padding: 'var(--space-4)', color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}>
                No instances found.
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                  {instanceRows.length} instance{instanceRows.length !== 1 ? 's' : ''}
                </div>
                <ResourceTable columns={instanceColumns} data={instanceRows} renderRow={(row) => (
                  <tr key={`${row.namespace}/${row.name}`}>
                    <td className="name-cell">{row.name}</td>
                    <td>{row.namespace}</td>
                    <td>{row.age}</td>
                  </tr>
                )} />
              </>
            )}
          </div>
        )}

        {/* Schema Tab */}
        {activeTab === 'Schema' && (
          <div style={{ marginTop: 'var(--space-3)' }}>
            {crdInfo.schema ? (
              <div className="log-viewer" style={{ maxHeight: '600px' }}>
                <pre
                  data-testid="schema-content"
                  style={{
                    margin: 0,
                    fontSize: 'var(--text-xs)',
                    color: 'var(--text-secondary)',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {JSON.stringify(crdInfo.schema, null, 2)}
                </pre>
              </div>
            ) : (
              <div style={{ padding: 'var(--space-4)', color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}>
                No schema available for this CRD.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
