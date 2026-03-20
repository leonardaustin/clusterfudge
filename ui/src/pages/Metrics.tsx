import { useMemo } from 'react'
import { useKubeResources } from '../hooks/useKubeResource'
import { usePodMetrics } from '../hooks/usePodMetrics'
import { useClusterStore } from '../stores/clusterStore'
import { rawSpec, rawStatus, labelsMap, parseCpu, parseMemoryMiB, getBarColor } from '../lib/k8sFormatters'
import { MetricBar } from '../components/shared/MetricBar'
import { ResourceHeader } from '../components/shared/ResourceHeader'
import type { BarColor } from '../data/types'

export function Metrics() {
  const selectedNamespace = useClusterStore((s) => s.selectedNamespace)
  const namespace = selectedNamespace || ''

  const { data: nodeItems } = useKubeResources({ group: '', version: 'v1', resource: 'nodes', namespace: '' })
  const { data: podItems } = useKubeResources({ group: '', version: 'v1', resource: 'pods', namespace })
  const { metrics: podMetrics } = usePodMetrics(namespace)

  // Cluster utilization from node capacity/allocatable
  const clusterSummary = useMemo(() => {
    let allocCpuMillis = 0
    let allocMemMiB = 0

    for (const node of nodeItems) {
      const status = rawStatus(node)
      const allocatable = (status.allocatable || {}) as Record<string, string>
      allocCpuMillis += parseCpu(allocatable.cpu)
      allocMemMiB += parseMemoryMiB(allocatable.memory)
    }

    // Sum actual usage from pod metrics
    let usedCpuMillis = 0
    let usedMemMiB = 0
    for (const [, m] of podMetrics) {
      usedCpuMillis += Math.round(m.cpuCores * 1000)
      usedMemMiB += Math.round(m.memoryMiB)
    }

    const cpuPercent = allocCpuMillis > 0 ? Math.round((usedCpuMillis / allocCpuMillis) * 100) : 0
    const memPercent = allocMemMiB > 0 ? Math.round((usedMemMiB / allocMemMiB) * 100) : 0

    return {
      cpu: {
        label: 'CPU',
        percent: cpuPercent,
        used: `${usedCpuMillis}m`,
        total: `${allocCpuMillis}m`,
        color: getBarColor(cpuPercent) as BarColor,
      },
      memory: {
        label: 'Memory',
        percent: memPercent,
        used: `${Math.round(usedMemMiB / 1024 * 10) / 10}Gi`,
        total: `${Math.round(allocMemMiB / 1024 * 10) / 10}Gi`,
        color: getBarColor(memPercent) as BarColor,
      },
      storage: {
        label: 'Pods',
        percent: 0,
        used: `${podItems.length}`,
        total: '-',
        color: 'green' as BarColor,
      },
    }
  }, [nodeItems, podMetrics, podItems.length])

  // Node comparison
  const nodeComparison = useMemo(() => {
    return nodeItems.map((node) => {
      const status = rawStatus(node)
      const labels = labelsMap(node)
      const allocatable = (status.allocatable || {}) as Record<string, string>

      const roles: string[] = []
      for (const key of Object.keys(labels)) {
        if (key.startsWith('node-role.kubernetes.io/')) {
          roles.push(key.replace('node-role.kubernetes.io/', ''))
        }
      }
      const role = roles.length > 0 ? roles.join(', ') : 'worker'

      // Count pods on this node
      const nodePods = podItems.filter((p) => {
        const spec = rawSpec(p)
        return (spec.nodeName as string) === node.name
      })

      // Sum metrics and resource requests/limits for pods on this node
      let cpuUsed = 0
      let memUsed = 0
      let cpuReqTotal = 0
      let cpuLimTotal = 0
      let memReqTotal = 0
      let memLimTotal = 0
      for (const p of nodePods) {
        const key = `${p.namespace}/${p.name}`
        const m = podMetrics.get(key)
        if (m) {
          cpuUsed += Math.round(m.cpuCores * 1000)
          memUsed += Math.round(m.memoryMiB)
        }
        const podSpec = rawSpec(p)
        const specContainers = (podSpec.containers || []) as Array<Record<string, unknown>>
        for (const c of specContainers) {
          const resources = (c.resources || {}) as Record<string, unknown>
          const requests = (resources.requests || {}) as Record<string, string>
          const limits = (resources.limits || {}) as Record<string, string>
          cpuReqTotal += parseCpu(requests.cpu)
          cpuLimTotal += parseCpu(limits.cpu)
          memReqTotal += parseMemoryMiB(requests.memory)
          memLimTotal += parseMemoryMiB(limits.memory)
        }
      }

      const allocCpu = parseCpu(allocatable.cpu)
      const allocMem = parseMemoryMiB(allocatable.memory)
      const allocStorage = parseMemoryMiB(allocatable['ephemeral-storage'])
      const cpuPercent = allocCpu > 0 ? Math.round((cpuUsed / allocCpu) * 100) : 0
      const memPercent = allocMem > 0 ? Math.round((memUsed / allocMem) * 100) : 0

      return {
        name: node.name,
        roles: role,
        cpu: {
          used: `${cpuUsed}m`,
          total: `${allocCpu}m`,
          percent: cpuPercent,
          color: getBarColor(cpuPercent) as BarColor,
        },
        memory: {
          used: `${Math.round(memUsed)}Mi`,
          total: `${Math.round(allocMem)}Mi`,
          percent: memPercent,
          color: getBarColor(memPercent) as BarColor,
        },
        storage: {
          used: '-',
          total: allocStorage > 0 ? `${Math.round(allocStorage / 1024)}Gi` : '-',
          percent: 0,
          color: 'green' as BarColor,
        },
        pods: nodePods.length,
        allocatedResources: {
          cpuRequests: `${cpuReqTotal}m`,
          cpuLimits: `${cpuLimTotal}m`,
          memoryRequests: `${Math.round(memReqTotal)}Mi`,
          memoryLimits: `${Math.round(memLimTotal)}Mi`,
        },
      }
    })
  }, [nodeItems, podItems, podMetrics])

  // Top pods by CPU
  const topPodsByCpu = useMemo(() => {
    const podsWithMetrics = podItems
      .map((p) => {
        const key = `${p.namespace}/${p.name}`
        const m = podMetrics.get(key)
        const spec = rawSpec(p)
        const specContainers = (spec.containers || []) as Array<Record<string, unknown>>

        let cpuReq = 0
        let cpuLim = 0
        for (const c of specContainers) {
          const resources = (c.resources || {}) as Record<string, unknown>
          const requests = (resources.requests || {}) as Record<string, string>
          const limits = (resources.limits || {}) as Record<string, string>
          cpuReq += parseCpu(requests.cpu)
          cpuLim += parseCpu(limits.cpu)
        }

        const usage = m ? Math.round(m.cpuCores * 1000) : 0
        const percent = cpuLim > 0 ? Math.round((usage / cpuLim) * 100) : 0

        return {
          name: p.name,
          namespace: p.namespace,
          node: (spec.nodeName as string) || '-',
          usage,
          request: cpuReq,
          limit: cpuLim,
          unit: 'm',
          percent,
          color: getBarColor(percent) as BarColor,
        }
      })
      .filter((p) => p.usage > 0)
      .sort((a, b) => b.usage - a.usage)
      .slice(0, 10)

    return podsWithMetrics
  }, [podItems, podMetrics])

  // Top pods by Memory
  const topPodsByMemory = useMemo(() => {
    const podsWithMetrics = podItems
      .map((p) => {
        const key = `${p.namespace}/${p.name}`
        const m = podMetrics.get(key)
        const spec = rawSpec(p)
        const specContainers = (spec.containers || []) as Array<Record<string, unknown>>

        let memReq = 0
        let memLim = 0
        for (const c of specContainers) {
          const resources = (c.resources || {}) as Record<string, unknown>
          const requests = (resources.requests || {}) as Record<string, string>
          const limits = (resources.limits || {}) as Record<string, string>
          memReq += parseMemoryMiB(requests.memory)
          memLim += parseMemoryMiB(limits.memory)
        }

        const usage = m ? Math.round(m.memoryMiB) : 0
        const percent = memLim > 0 ? Math.round((usage / memLim) * 100) : 0

        return {
          name: p.name,
          namespace: p.namespace,
          node: (spec.nodeName as string) || '-',
          usage,
          request: memReq,
          limit: memLim,
          unit: 'Mi',
          percent,
          color: getBarColor(percent) as BarColor,
        }
      })
      .filter((p) => p.usage > 0)
      .sort((a, b) => b.usage - a.usage)
      .slice(0, 10)

    return podsWithMetrics
  }, [podItems, podMetrics])

  // Per-namespace usage
  const namespaceUsage = useMemo(() => {
    const nsMap = new Map<string, { pods: number; cpu: number; cpuReq: number; memory: number; memReq: number }>()

    for (const p of podItems) {
      const ns = p.namespace
      if (!nsMap.has(ns)) nsMap.set(ns, { pods: 0, cpu: 0, cpuReq: 0, memory: 0, memReq: 0 })
      const entry = nsMap.get(ns)!
      entry.pods++

      const key = `${p.namespace}/${p.name}`
      const m = podMetrics.get(key)
      if (m) {
        entry.cpu += Math.round(m.cpuCores * 1000)
        entry.memory += Math.round(m.memoryMiB)
      }

      const spec = rawSpec(p)
      const specContainers = (spec.containers || []) as Array<Record<string, unknown>>
      for (const c of specContainers) {
        const resources = (c.resources || {}) as Record<string, unknown>
        const requests = (resources.requests || {}) as Record<string, string>
        entry.cpuReq += parseCpu(requests.cpu)
        entry.memReq += parseMemoryMiB(requests.memory)
      }
    }

    return Array.from(nsMap.entries())
      .map(([ns, data]) => ({
        namespace: ns,
        pods: data.pods,
        cpu: data.cpu,
        cpuReq: data.cpuReq,
        cpuPercent: data.cpuReq > 0 ? Math.round((data.cpu / data.cpuReq) * 100) : 0,
        memory: data.memory,
        memReq: data.memReq,
        memPercent: data.memReq > 0 ? Math.round((data.memory / data.memReq) * 100) : 0,
      }))
      .sort((a, b) => b.cpu - a.cpu)
  }, [podItems, podMetrics])

  return (
    <div className="resource-view">
      <ResourceHeader title="Metrics" subtitle="Cluster resource utilization overview" />

      <div className="dashboard">
      {/* Cluster Resource Utilization */}
      <div className="dashboard-section">
        <h2 className="dashboard-section-title">Cluster Utilization</h2>
        <div className="dashboard-grid dashboard-grid-3">
          {[clusterSummary.cpu, clusterSummary.memory, clusterSummary.storage].map((res) => (
            <div key={res.label} className="metric-card">
              <div className="metric-card-label">{res.label}</div>
              <div className="metric-card-value">{res.percent}%</div>
              <div className="metric-card-sub">{res.used} / {res.total}</div>
              <MetricBar percent={res.percent} color={res.color} />
            </div>
          ))}
        </div>
      </div>

      {/* Node Comparison */}
      <div className="dashboard-section">
        <h2 className="dashboard-section-title">Node Comparison</h2>
        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
          }}
        >
          <table className="resource-table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th scope="col" style={{ paddingLeft: 'var(--space-4)' }}>Node</th>
                <th scope="col">Role</th>
                <th scope="col">CPU Usage</th>
                <th scope="col">Memory Usage</th>
                <th scope="col">Storage</th>
                <th scope="col">Pods</th>
                <th scope="col">CPU Req/Lim</th>
                <th scope="col">Mem Req/Lim</th>
              </tr>
            </thead>
            <tbody>
              {nodeComparison.map((node) => (
                <tr key={node.name}>
                  <td style={{ paddingLeft: 'var(--space-4)', fontWeight: 500 }}>{node.name}</td>
                  <td>{node.roles}</td>
                  <td>
                    <div style={{ minWidth: '120px' }}>
                      <div style={{ fontSize: 'var(--text-xs)', marginBottom: '2px' }}>
                        <span className="tabular">{node.cpu.used}</span>
                        <span style={{ color: 'var(--text-disabled)' }}> / {node.cpu.total}</span>
                      </div>
                      <div className="metric-bar" style={{ height: '3px', marginTop: 0 }}>
                        <div className={`metric-bar-fill ${node.cpu.color}`} style={{ width: `${node.cpu.percent}%` }} />
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ minWidth: '120px' }}>
                      <div style={{ fontSize: 'var(--text-xs)', marginBottom: '2px' }}>
                        <span className="tabular">{node.memory.used}</span>
                        <span style={{ color: 'var(--text-disabled)' }}> / {node.memory.total}</span>
                      </div>
                      <div className="metric-bar" style={{ height: '3px', marginTop: 0 }}>
                        <div className={`metric-bar-fill ${node.memory.color}`} style={{ width: `${node.memory.percent}%` }} />
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ minWidth: '90px' }}>
                      <div style={{ fontSize: 'var(--text-xs)', marginBottom: '2px' }}>
                        <span className="tabular">{node.storage.used}</span>
                        <span style={{ color: 'var(--text-disabled)' }}> / {node.storage.total}</span>
                      </div>
                    </div>
                  </td>
                  <td className="tabular">{node.pods}</td>
                  <td style={{ fontSize: 'var(--text-xs)' }} className="mono">{node.allocatedResources.cpuRequests} / {node.allocatedResources.cpuLimits}</td>
                  <td style={{ fontSize: 'var(--text-xs)' }} className="mono">{node.allocatedResources.memoryRequests} / {node.allocatedResources.memoryLimits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top Pods by CPU */}
      <div className="dashboard-section">
        <h2 className="dashboard-section-title">Top Pods by CPU</h2>
        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
          }}
        >
          <table className="resource-table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th scope="col" style={{ paddingLeft: 'var(--space-4)', width: '30px' }}>#</th>
                <th scope="col">Pod</th>
                <th scope="col">Namespace</th>
                <th scope="col">Node</th>
                <th scope="col">Usage</th>
                <th scope="col">Request</th>
                <th scope="col">Limit</th>
                <th scope="col" style={{ minWidth: '120px' }}>Usage / Limit</th>
              </tr>
            </thead>
            <tbody>
              {topPodsByCpu.map((p, i) => (
                <tr key={p.name}>
                  <td style={{ paddingLeft: 'var(--space-4)', color: 'var(--text-disabled)' }}>{i + 1}</td>
                  <td className="name-cell">{p.name}</td>
                  <td>{p.namespace}</td>
                  <td>{p.node}</td>
                  <td className="tabular" style={{ fontWeight: 600 }}>{p.usage}{p.unit}</td>
                  <td className="tabular" style={{ color: 'var(--text-tertiary)' }}>{p.request}{p.unit}</td>
                  <td className="tabular" style={{ color: 'var(--text-tertiary)' }}>{p.limit}{p.unit}</td>
                  <td>
                    {p.limit > 0 ? (
                      <div style={{ minWidth: '100px' }}>
                        <div style={{ fontSize: 'var(--text-xs)', marginBottom: '2px', color: 'var(--text-disabled)' }}>
                          {p.percent}%
                        </div>
                        <div className="metric-bar" style={{ height: '3px', marginTop: 0 }}>
                          <div className={`metric-bar-fill ${p.color}`} style={{ width: `${Math.min(p.percent, 100)}%` }} />
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--text-disabled)' }}>no limit</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top Pods by Memory */}
      <div className="dashboard-section">
        <h2 className="dashboard-section-title">Top Pods by Memory</h2>
        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
          }}
        >
          <table className="resource-table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th scope="col" style={{ paddingLeft: 'var(--space-4)', width: '30px' }}>#</th>
                <th scope="col">Pod</th>
                <th scope="col">Namespace</th>
                <th scope="col">Node</th>
                <th scope="col">Usage</th>
                <th scope="col">Request</th>
                <th scope="col">Limit</th>
                <th scope="col" style={{ minWidth: '120px' }}>Usage / Limit</th>
              </tr>
            </thead>
            <tbody>
              {topPodsByMemory.map((p, i) => (
                <tr key={p.name}>
                  <td style={{ paddingLeft: 'var(--space-4)', color: 'var(--text-disabled)' }}>{i + 1}</td>
                  <td className="name-cell">{p.name}</td>
                  <td>{p.namespace}</td>
                  <td>{p.node}</td>
                  <td className="tabular" style={{ fontWeight: 600 }}>{p.usage}{p.unit}</td>
                  <td className="tabular" style={{ color: 'var(--text-tertiary)' }}>{p.request}{p.unit}</td>
                  <td className="tabular" style={{ color: 'var(--text-tertiary)' }}>{p.limit}{p.unit}</td>
                  <td>
                    {p.limit > 0 ? (
                      <div style={{ minWidth: '100px' }}>
                        <div style={{ fontSize: 'var(--text-xs)', marginBottom: '2px', color: 'var(--text-disabled)' }}>
                          {p.percent}%
                        </div>
                        <div className="metric-bar" style={{ height: '3px', marginTop: 0 }}>
                          <div className={`metric-bar-fill ${p.color}`} style={{ width: `${Math.min(p.percent, 100)}%` }} />
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--text-disabled)' }}>no limit</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-Namespace Usage */}
      <div className="dashboard-section">
        <h2 className="dashboard-section-title">Per-Namespace Resource Usage</h2>
        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
          }}
        >
          <table className="resource-table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th scope="col" style={{ paddingLeft: 'var(--space-4)' }}>Namespace</th>
                <th scope="col">Pods</th>
                <th scope="col">CPU Usage</th>
                <th scope="col">CPU Requests</th>
                <th scope="col" style={{ minWidth: '100px' }}>CPU Used/Req</th>
                <th scope="col">Memory Usage</th>
                <th scope="col">Memory Requests</th>
                <th scope="col" style={{ minWidth: '100px' }}>Mem Used/Req</th>
              </tr>
            </thead>
            <tbody>
              {namespaceUsage.map((ns) => (
                <tr key={ns.namespace}>
                  <td style={{ paddingLeft: 'var(--space-4)', fontWeight: 500 }}>{ns.namespace}</td>
                  <td className="tabular">{ns.pods}</td>
                  <td className="tabular" style={{ fontWeight: 600 }}>{ns.cpu}m</td>
                  <td className="tabular" style={{ color: 'var(--text-tertiary)' }}>{ns.cpuReq}m</td>
                  <td>
                    {ns.cpuReq > 0 ? (
                      <div>
                        <div style={{ fontSize: 'var(--text-xs)', marginBottom: '2px', color: 'var(--text-disabled)' }}>
                          {ns.cpuPercent}%
                        </div>
                        <div className="metric-bar" style={{ height: '3px', marginTop: 0 }}>
                          <div className={`metric-bar-fill ${getBarColor(ns.cpuPercent)}`} style={{ width: `${Math.min(ns.cpuPercent, 100)}%` }} />
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--text-disabled)' }}>-</span>
                    )}
                  </td>
                  <td className="tabular" style={{ fontWeight: 600 }}>{ns.memory}Mi</td>
                  <td className="tabular" style={{ color: 'var(--text-tertiary)' }}>{ns.memReq}Mi</td>
                  <td>
                    {ns.memReq > 0 ? (
                      <div>
                        <div style={{ fontSize: 'var(--text-xs)', marginBottom: '2px', color: 'var(--text-disabled)' }}>
                          {ns.memPercent}%
                        </div>
                        <div className="metric-bar" style={{ height: '3px', marginTop: 0 }}>
                          <div className={`metric-bar-fill ${getBarColor(ns.memPercent)}`} style={{ width: `${Math.min(ns.memPercent, 100)}%` }} />
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--text-disabled)' }}>-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </div>
  )
}
