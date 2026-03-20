import { useState, useEffect, useMemo } from 'react'
import { ResourceHeader } from '../components/shared/ResourceHeader'
import { SearchInput } from '../components/shared/SearchInput'
import { Badge } from '../components/shared/Badge'
import { ResourceTable } from '../components/shared/ResourceTable'
import type { Column } from '../components/shared/ResourceTable'
import { BuildClusterNetworkGraph, type NetworkGraph, type PodGroup } from '@/wailsjs/go/handlers/NetPolHandler'
import { useToastStore } from '@/stores/toastStore'

const columns: Column[] = [
  { key: 'source', label: 'Source', className: 'col-name' },
  { key: 'dest', label: 'Destination', className: 'col-name' },
  { key: 'port', label: 'Port', className: 'col-sm' },
  { key: 'protocol', label: 'Protocol', className: 'col-sm' },
  { key: 'allowed', label: 'Status', className: 'col-sm' },
]

export function NetworkPolicyGraph() {
  const [graph, setGraph] = useState<NetworkGraph | null>(null)
  const [filter, setFilter] = useState('')
  const [nsFilter, setNsFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    BuildClusterNetworkGraph('')
      .then(setGraph)
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
        useToastStore.getState().addToast({ type: 'error', title: 'Failed to build network graph', description: msg })
      })
      .finally(() => setLoading(false))
  }, [])

  const groupMap = useMemo(() => {
    const m = new Map<string, PodGroup>()
    if (graph?.groups) {
      for (const g of graph.groups) {
        m.set(g.id, g)
      }
    }
    return m
  }, [graph])

  const edges = graph?.edges ?? []

  const filtered = edges
    .filter((e) => {
      if (!nsFilter) return true
      const fromGroup = groupMap.get(e.from)
      const toGroup = groupMap.get(e.to)
      return (fromGroup?.namespace.includes(nsFilter) ?? false) || (toGroup?.namespace.includes(nsFilter) ?? false)
    })
    .filter((e) => {
      if (!filter) return true
      const q = filter.toLowerCase()
      const fromGroup = groupMap.get(e.from)
      const toGroup = groupMap.get(e.to)
      return (fromGroup?.name.toLowerCase().includes(q) ?? false) || (toGroup?.name.toLowerCase().includes(q) ?? false)
    })

  return (
    <div className="resource-view">
      <ResourceHeader title="Network Policy Graph" subtitle={`${edges.length} network edges`}>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <label htmlFor="netpol-ns-filter" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>Namespace</span>
            <input id="netpol-ns-filter" className="settings-input" placeholder="Namespace" value={nsFilter} onChange={(e) => setNsFilter(e.target.value)} style={{ width: '120px' }} />
          </label>
          <SearchInput placeholder="Search pods..." value={filter} onChange={setFilter} />
        </div>
      </ResourceHeader>

      {loading ? (
        <div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>Building network graph...</div>
      ) : error ? (
        <div style={{ padding: 'var(--space-4)', color: 'var(--red)', fontSize: 'var(--text-sm)' }}>
          Failed to build network policy graph: {error}
        </div>
      ) : (
        <ResourceTable columns={columns} data={filtered} renderRow={(edge, i) => {
            const fromGroup = groupMap.get(edge.from)
            const toGroup = groupMap.get(edge.to)
            return (
              <tr key={i}>
                <td className="col-name">
                  <span className="mono">{fromGroup?.name ?? edge.from}</span>
                  {fromGroup && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginLeft: '4px' }}>{fromGroup.namespace}</span>}
                </td>
                <td className="col-name">
                  <span className="mono">{toGroup?.name ?? edge.to}</span>
                  {toGroup && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginLeft: '4px' }}>{toGroup.namespace}</span>}
                </td>
                <td className="col-sm mono">{edge.port}</td>
                <td className="col-sm">{edge.protocol}</td>
                <td className="col-sm">
                  <Badge color={edge.allowed ? 'green' : 'red'}>{edge.allowed ? 'Allow' : 'Deny'}</Badge>
                </td>
              </tr>
            )
          }} />
      )}
    </div>
  )
}
