import { useState, useEffect } from 'react'
import { ResourceHeader } from '../components/shared/ResourceHeader'
import { Badge } from '../components/shared/Badge'
import { DetectClusterProviders, type DetectedProvider } from '@/wailsjs/go/handlers/GitOpsHandler'
import { useToastStore } from '@/stores/toastStore'

export function GitOps() {
  const [providers, setProviders] = useState<DetectedProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    DetectClusterProviders()
      .then((result) => setProviders(result?.providers ?? []))
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
        useToastStore.getState().addToast({ type: 'error', title: 'Failed to detect GitOps providers', description: msg })
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="resource-view">
      <ResourceHeader title="GitOps" subtitle="Detected GitOps providers in the cluster" />

      <div className="wizard-body">
        {loading ? (
          <div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>Scanning cluster...</div>
        ) : error ? (
          <div className="card" style={{ padding: 'var(--space-4)' }}>
            <div style={{ color: 'var(--red)', fontSize: 'var(--text-sm)' }}>Failed to scan for GitOps providers: {error}</div>
          </div>
        ) : providers.length === 0 ? (
          <div className="card" style={{ padding: 'var(--space-4)', textAlign: 'center' }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>No GitOps providers detected</div>
            <div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', marginTop: 'var(--space-2)' }}>Install ArgoCD or Flux to enable GitOps features</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {providers.map((p) => (
              <div key={p.provider} className="card" style={{ padding: 'var(--space-4)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: p.resources?.length > 0 ? 'var(--space-3)' : undefined }}>
                  <div style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-primary)' }}>{p.provider}</div>
                  <Badge color="green">detected</Badge>
                  {p.version && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>v{p.version}</span>}
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>{p.namespace}</span>
                </div>
                {p.resources?.length > 0 && (
                  <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    {p.resources.map((r) => (
                      <span key={r} style={{ fontSize: 'var(--text-xs)', padding: '2px 8px', borderRadius: '4px', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>{r}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
