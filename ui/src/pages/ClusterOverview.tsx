import { useClusterSummary } from '../hooks/useClusterSummary'
import { useClusterStore } from '../stores/clusterStore'
import { useKubeResources } from '../hooks/useKubeResource'
import { MetricCard } from '../components/shared/MetricCard'
import type { BarColor } from '../data/types'

function summaryBarColor(ready: number, total: number): BarColor {
  if (total === 0) return 'green'
  const pct = (ready / total) * 100
  if (pct >= 80) return 'green'
  if (pct >= 50) return 'yellow'
  return 'red'
}

function formatAge(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function ClusterOverview() {
  const { summary, isLoading, error, refresh } = useClusterSummary()
  const activeCluster = useClusterStore((s) => s.activeCluster)
  const k8sVersion = useClusterStore((s) => s.k8sVersion)

  // Fetch recent events from the cluster (last 20)
  const { data: eventResources } = useKubeResources({
    group: '',
    version: 'v1',
    resource: 'events',
    namespace: '',
  })

  // Sort events by lastTimestamp descending and take last 20
  const recentK8sEvents = [...eventResources]
    .sort((a, b) => {
      const aTime = (a.raw?.lastTimestamp as string) || (a.raw?.eventTime as string) || ''
      const bTime = (b.raw?.lastTimestamp as string) || (b.raw?.eventTime as string) || ''
      return bTime.localeCompare(aTime)
    })
    .slice(0, 20)

  const hasLiveData = summary !== null && !error

  // Summary cards data
  const nodeCount = summary?.nodeCount ?? 0
  const nodeReady = summary?.nodeReady ?? 0
  const podCount = summary?.podCount ?? 0
  const podRunning = summary?.podRunning ?? 0
  const deploymentCount = summary?.deploymentCount ?? 0
  const deploymentReady = summary?.deploymentReady ?? 0
  const serviceCount = summary?.serviceCount ?? 0
  const serviceLB = summary?.serviceLB ?? 0
  const namespaceSummary = summary?.namespaceSummary ?? []

  return (
    <div className="dashboard">
      {/* Header */}
      <div className="dashboard-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 className="dashboard-section-title" style={{ marginBottom: '2px' }}>
              Cluster Overview
            </h2>
            {activeCluster && (
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', margin: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
                {activeCluster}
                {k8sVersion && <><span>{' \u2022 '}</span>{k8sVersion}</>}
                <span style={{
                  display: 'inline-block',
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  backgroundColor: hasLiveData ? 'var(--color-success)' : 'var(--color-error)',
                  marginLeft: 2,
                }} />
                <span>{hasLiveData ? 'Connected' : 'Disconnected'}</span>
              </p>
            )}
          </div>
          {hasLiveData && (
            <button
              onClick={refresh}
              style={{
                padding: '4px 12px',
                fontSize: 'var(--text-xs)',
                color: 'var(--text-secondary)',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
              }}
            >
              Refresh
            </button>
          )}
        </div>
      </div>

      {/* Loading skeleton */}
      {isLoading && !summary && (
        <div className="dashboard-section">
          <div className="dashboard-grid">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="metric-card" style={{ opacity: 0.5 }}>
                <div className="metric-card-label" style={{ background: 'var(--bg-tertiary)', height: 12, width: 60, borderRadius: 4 }} />
                <div className="metric-card-value" style={{ background: 'var(--bg-tertiary)', height: 28, width: 40, borderRadius: 4, marginTop: 8 }} />
                <div className="metric-card-sub" style={{ background: 'var(--bg-tertiary)', height: 10, width: 80, borderRadius: 4, marginTop: 4 }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="dashboard-section">
          <div style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-4)',
            color: 'var(--text-secondary)',
            fontSize: 'var(--text-sm)',
          }}>
            Unable to load cluster summary: {error}
          </div>
        </div>
      )}

      {/* Summary Cards */}
      {(!isLoading || summary) && (
        <div className="dashboard-section">
          <h2 className="dashboard-section-title">Resource Summary</h2>
          <div className="dashboard-grid">
            <MetricCard
              label="Nodes"
              value={String(nodeCount)}
              sub={`${nodeReady} ready`}
              bar={nodeCount > 0 ? {
                percent: Math.round((nodeReady / nodeCount) * 100),
                color: summaryBarColor(nodeReady, nodeCount),
              } : undefined}
            />
            <MetricCard
              label="Pods"
              value={String(podCount)}
              sub={`${podRunning} running`}
              bar={podCount > 0 ? {
                percent: Math.round((podRunning / podCount) * 100),
                color: summaryBarColor(podRunning, podCount),
              } : undefined}
            />
            <MetricCard
              label="Deployments"
              value={String(deploymentCount)}
              sub={`${deploymentReady} ready`}
              bar={deploymentCount > 0 ? {
                percent: Math.round((deploymentReady / deploymentCount) * 100),
                color: summaryBarColor(deploymentReady, deploymentCount),
              } : undefined}
            />
            <MetricCard
              label="Services"
              value={String(serviceCount)}
              sub={`${serviceLB} LoadBalancer`}
            />
          </div>
        </div>
      )}

      {/* Recent Events */}
      <div className="dashboard-section">
        <h2 className="dashboard-section-title">Recent Events</h2>
        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
          }}
        >
          {recentK8sEvents.length > 0 ? (
            recentK8sEvents.map((evt, i) => {
              const eventType = (evt.raw?.type as string) || 'Normal'
              const reason = (evt.raw?.reason as string) || ''
              const message = (evt.raw?.message as string) || ''
              const involvedObj = evt.raw?.involvedObject as Record<string, unknown> | undefined
              const objectRef = involvedObj
                ? `${involvedObj.kind || ''}/${involvedObj.name || ''}`
                : evt.name
              const lastTimestamp = (evt.raw?.lastTimestamp as string) || (evt.raw?.eventTime as string) || ''
              const count = (evt.raw?.count as number) || 1
              const isWarning = eventType === 'Warning'
              const isLast = i === recentK8sEvents.length - 1

              return (
                <div
                  key={`${evt.namespace}/${evt.name}`}
                  className="event-item"
                  style={{
                    paddingLeft: 'var(--space-4)',
                    paddingRight: 'var(--space-4)',
                    ...(isLast ? { borderBottom: 'none' } : {}),
                  }}
                >
                  <div className={`event-icon ${isWarning ? 'warning' : 'normal'}`}>
                    {isWarning ? '!' : 'i'}
                  </div>
                  <div className="event-body">
                    <div className="event-reason">{reason}</div>
                    <div className="event-object">{objectRef}</div>
                    <div className="event-message">{message}</div>
                    <div className="event-meta">
                      <span>{lastTimestamp ? formatAge(lastTimestamp) : ''}</span>
                      <span>Count: {count}</span>
                    </div>
                  </div>
                </div>
              )
            })
          ) : (
            <div style={{
              padding: 'var(--space-4)',
              color: 'var(--text-tertiary)',
              fontSize: 'var(--text-sm)',
              textAlign: 'center',
            }}>
              No recent events
            </div>
          )}
        </div>
      </div>

      {/* Namespaces */}
      <div className="dashboard-section">
        <h2 className="dashboard-section-title">Namespaces</h2>
        <div className="dashboard-grid">
          {namespaceSummary.length > 0 ? (
            namespaceSummary
              .sort((a, b) => b.podCount - a.podCount)
              .map((ns) => (
                <div key={ns.name} className="workload-card">
                  <div className="workload-card-header">
                    <span className="workload-card-title">{ns.name}</span>
                    <span className="workload-card-count">{ns.podCount}</span>
                  </div>
                  <div className="workload-card-breakdown">
                    <span>{ns.podCount} pod{ns.podCount !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              ))
          ) : (
            <div style={{
              color: 'var(--text-tertiary)',
              fontSize: 'var(--text-sm)',
              padding: 'var(--space-4)',
            }}>
              No namespace data available
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
