import { useState } from 'react'
import { useKubeResources } from '../hooks/useKubeResource'
import { useClusterStore } from '../stores/clusterStore'
import { RESOURCE_CONFIG } from '../lib/resourceConfig'
import { formatAge } from '../lib/k8sFormatters'
import { Badge } from '../components/shared/Badge'
import { SearchInput } from '../components/shared/SearchInput'
import { ResourceHeader } from '../components/shared/ResourceHeader'
import { ResourceTable } from '../components/shared/ResourceTable'
import type { Column } from '../components/shared/ResourceTable'
import type { BadgeColor } from '../data/types'

const columns: Column[] = [
  { key: 'type', label: 'Type', className: 'col-status' },
  { key: 'reason', label: 'Reason', className: 'col-md' },
  { key: 'object', label: 'Object', className: 'col-lg' },
  { key: 'source', label: 'Source', className: 'col-md' },
  { key: 'message', label: 'Message' },
  { key: 'count', label: 'Count', className: 'col-xs' },
  { key: 'firstSeen', label: 'First Seen', className: 'col-md' },
  { key: 'lastSeen', label: 'Last Seen', className: 'col-md' },
]

type FilterTab = 'All' | 'Warning' | 'Normal'

const tabStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-1) var(--space-3)',
}

export function Events() {
  const [filter, setFilter] = useState('')
  const [activeTab, setActiveTab] = useState<FilterTab>('All')
  const namespace = useClusterStore((s) => s.selectedNamespace)
  const cfg = RESOURCE_CONFIG.events
  const { data: items, isLoading } = useKubeResources({
    group: cfg.group, version: cfg.version, resource: cfg.plural, namespace,
  })

  const events = items.map((item) => {
    const r = (item.raw || {}) as Record<string, unknown>
    const evtType = (r.type || 'Normal') as string
    const involvedObj = (r.involvedObject || {}) as Record<string, unknown>
    const object = involvedObj.kind ? `${involvedObj.kind}/${involvedObj.name}` : item.name
    const badgeColor: BadgeColor = evtType === 'Warning' ? 'yellow' : 'blue'
    const source = (r.source || {}) as Record<string, unknown>
    return {
      type: evtType as string,
      badgeColor,
      reason: (r.reason || '') as string,
      object,
      message: (r.message || '') as string,
      count: (r.count || 1) as number,
      firstSeen: r.firstTimestamp ? formatAge(r.firstTimestamp as string) : '\u2014',
      lastSeen: r.lastTimestamp ? formatAge(r.lastTimestamp as string) : '\u2014',
      sourceComponent: (source.component || '') as string,
    }
  })

  const filtered = events.filter((e) => {
    if (activeTab !== 'All' && e.type !== activeTab) return false
    if (!filter) return true
    const q = filter.toLowerCase()
    return (
      e.reason.toLowerCase().includes(q) ||
      e.object.toLowerCase().includes(q) ||
      e.message.toLowerCase().includes(q) ||
      e.sourceComponent.toLowerCase().includes(q)
    )
  })

  const tabs: FilterTab[] = ['All', 'Warning', 'Normal']

  if (isLoading && items.length === 0) {
    return (
      <div className="resource-view">
        <ResourceHeader title="Events" subtitle="Loading..." />
        <div style={{ padding: 'var(--space-4)', color: 'var(--text-secondary)' }}>Loading events...</div>
      </div>
    )
  }

  return (
    <div className="resource-view">
      <ResourceHeader title="Events" subtitle={`${events.length} events${namespace ? ` in ${namespace}` : ' across all namespaces'}`}>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          {tabs.map((tab) => (
            <button
              key={tab}
              className={`detail-tab${activeTab === tab ? ' active' : ''}`}
              style={tabStyle}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
        <SearchInput placeholder="Filter events..." value={filter} onChange={setFilter} />
      </ResourceHeader>

      <ResourceTable columns={columns} data={filtered} renderRow={(evt, i) => (
          <tr key={i}>
            <td className="col-status">
              <Badge color={evt.badgeColor}>{evt.type}</Badge>
            </td>
            <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{evt.reason}</td>
            <td className="mono" style={{ color: 'var(--accent)' }}>{evt.object}</td>
            <td className="mono" style={{ fontSize: 'var(--text-2xs)' }}>{evt.sourceComponent || '\u2014'}</td>
            <td>{evt.message}</td>
            <td className="tabular">{evt.count}</td>
            <td>{evt.firstSeen}</td>
            <td>{evt.lastSeen}</td>
          </tr>
        )} />
    </div>
  )
}
