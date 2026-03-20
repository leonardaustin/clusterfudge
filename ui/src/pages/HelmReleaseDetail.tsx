import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { StatusDot } from '../components/shared/StatusDot'
import { DetailPanel } from '../components/detail/DetailPanel'
import { DetailTabs } from '../components/detail/DetailTabs'
import { YAMLEditor } from '../components/editor/YAMLEditor'
import { useToastStore } from '../stores/toastStore'
import {
  GetRelease,
  GetReleaseHistory,
  RollbackRelease,
  type ReleaseDetail,
  type ReleaseInfo,
} from '../wailsjs/go/handlers/HelmHandler'

const TABS = ['Overview', 'Values', 'Manifest', 'History', 'Notes']

function statusToColor(status: string): string {
  if (status === 'deployed') return 'running'
  if (status === 'failed') return 'failed'
  return 'pending'
}

export function HelmReleaseDetail() {
  const { namespace, name } = useParams<{ namespace: string; name: string }>()
  const navigate = useNavigate()
  const addToast = useToastStore((s) => s.addToast)
  const [activeTab, setActiveTab] = useState('Overview')
  const [release, setRelease] = useState<ReleaseDetail | null>(null)
  const [history, setHistory] = useState<ReleaseInfo[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    if (!name || !namespace) return
    setLoading(true)
    try {
      const [rel, hist] = await Promise.all([
        GetRelease(name, namespace),
        GetReleaseHistory(name, namespace),
      ])
      setRelease(rel)
      setHistory(hist)
    } catch (err) {
      addToast({ type: 'error', title: 'Failed to load release', description: String(err) })
    } finally {
      setLoading(false)
    }
  }, [name, namespace, addToast])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleRollback = async (revision: number) => {
    if (!name || !namespace) return
    try {
      await RollbackRelease(name, namespace, revision)
      addToast({ type: 'success', title: `Rolled back to revision ${revision}` })
      fetchData()
    } catch (err) {
      addToast({ type: 'error', title: 'Rollback failed', description: String(err) })
    }
  }

  if (loading) {
    return (
      <div className="resource-view">
        <div style={{ padding: 'var(--space-6)', color: 'var(--text-tertiary)' }}>
          Loading release...
        </div>
      </div>
    )
  }

  if (!release) {
    return (
      <div className="resource-view">
        <div style={{ padding: 'var(--space-6)', color: 'var(--text-secondary)' }}>
          Release "{name}" not found.{' '}
          <button
            onClick={() => navigate('/helm/releases')}
            style={{ color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Back to list
          </button>
        </div>
      </div>
    )
  }

  const statusColor =
    release.status === 'deployed' ? 'green' : release.status === 'failed' ? 'red' : 'yellow'

  return (
    <div className="resource-view">
      <div className="resource-body">
        <DetailPanel
          title={release.name}
          subtitle={`Helm Release in "${release.namespace}" namespace`}
          onClose={() => navigate('/helm/releases')}
        >
          <DetailTabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

          <div className="detail-panel-body">
            {activeTab === 'Overview' && (
              <>
                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <span className={`badge badge-${statusColor}`}>{release.status}</span>
                  <span className="badge badge-blue" style={{ marginLeft: '4px' }}>
                    Rev {release.revision}
                  </span>
                </div>

                <div className="prop-list">
                  <span className="prop-group-title">Release Info</span>

                  <span className="prop-label">Name</span>
                  <span className="prop-value">{release.name}</span>

                  <span className="prop-label">Namespace</span>
                  <span className="prop-value">{release.namespace}</span>

                  <span className="prop-label">Status</span>
                  <span className="prop-value">
                    <StatusDot status={statusToColor(release.status)} />{' '}
                    <span style={{ marginLeft: '4px' }}>{release.status}</span>
                  </span>

                  <span className="prop-label">Revision</span>
                  <span className="prop-value tabular">{release.revision}</span>

                  <span className="prop-group-title">Chart</span>

                  <span className="prop-label">Chart</span>
                  <span className="prop-value mono">{release.chart}</span>

                  <span className="prop-label">Chart Version</span>
                  <span className="prop-value mono">{release.chartVersion}</span>

                  <span className="prop-label">App Version</span>
                  <span className="prop-value mono">{release.appVersion}</span>

                  <span className="prop-label">Updated</span>
                  <span className="prop-value">{release.updated}</span>
                </div>
              </>
            )}

            {activeTab === 'Values' && (
              <div style={{ height: '500px' }}>
                <YAMLEditor value={release.values || '# No values'} readOnly />
              </div>
            )}

            {activeTab === 'Manifest' && (
              <div style={{ height: '500px' }}>
                <YAMLEditor value={release.manifest || '# No manifest'} readOnly />
              </div>
            )}

            {activeTab === 'History' && (
              <div style={{ fontSize: 'var(--text-xs)' }}>
                {history.length === 0 ? (
                  <div style={{ padding: 'var(--space-4)', color: 'var(--text-tertiary)' }}>
                    No history available.
                  </div>
                ) : (
                  history.map((rev) => (
                    <div
                      key={rev.revision}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-3)',
                        padding: 'var(--space-2) 0',
                        borderBottom: '1px solid var(--border-subtle)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <span
                        className="mono"
                        style={{ minWidth: '40px', color: 'var(--text-primary)' }}
                      >
                        #{rev.revision}
                      </span>
                      <StatusDot status={statusToColor(rev.status)} />
                      <span style={{ flex: 1 }}>{rev.status}</span>
                      <span style={{ color: 'var(--text-tertiary)' }}>{rev.updated}</span>
                      {rev.revision !== release.revision && (
                        <button
                          onClick={() => handleRollback(rev.revision)}
                          className="text-2xs px-1.5 py-0.5 rounded"
                          style={{ color: 'var(--yellow)', background: 'var(--yellow-muted)' }}
                        >
                          Rollback
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'Notes' && (
              <div
                style={{
                  padding: 'var(--space-3)',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-secondary)',
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {release.notes || 'No release notes available.'}
              </div>
            )}
          </div>
        </DetailPanel>
      </div>
    </div>
  )
}
