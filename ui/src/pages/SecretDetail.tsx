import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { GetSecret, RevealSecretKey } from '../wailsjs/go/handlers/SecretHandler'
import type { MaskedSecret } from '../wailsjs/go/handlers/SecretHandler'
import { ResourceHeader } from '../components/shared/ResourceHeader'

const MASKED_VALUE = '******'

export function SecretDetail() {
  const { namespace: urlNamespace, name } = useParams<{ namespace: string; name: string }>()
  const namespace = urlNamespace || 'default'

  const [secret, setSecret] = useState<MaskedSecret | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Track which keys have been revealed and their decoded values
  const [revealedKeys, setRevealedKeys] = useState<Record<string, string>>({})
  const [revealingKey, setRevealingKey] = useState<string | null>(null)

  useEffect(() => {
    if (!name) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setRevealedKeys({})

    GetSecret(namespace, name)
      .then((result) => {
        if (!cancelled) {
          setSecret(result)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(String(err))
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [namespace, name])

  const handleReveal = useCallback(async (key: string) => {
    if (!name) return
    setRevealingKey(key)
    try {
      const value = await RevealSecretKey(namespace, name, key)
      setRevealedKeys((prev) => ({ ...prev, [key]: value }))
    } catch (err) {
      console.error(`Failed to reveal key "${key}":`, err)
    } finally {
      setRevealingKey(null)
    }
  }, [namespace, name])

  const handleHide = useCallback((key: string) => {
    setRevealedKeys((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  if (loading) {
    return (
      <div className="resource-view">
        <ResourceHeader title="Secret" subtitle="Loading...">
          <Link to="/config/secrets" style={{ color: 'var(--blue)', fontSize: 'var(--text-xs)' }}>
            Back to list
          </Link>
        </ResourceHeader>
        <div style={{ padding: 'var(--space-6)', color: 'var(--text-tertiary)' }}>Loading...</div>
      </div>
    )
  }

  if (error || !secret) {
    return (
      <div className="resource-view">
        <ResourceHeader title="Secret" subtitle="Error">
          <Link to="/config/secrets" style={{ color: 'var(--blue)', fontSize: 'var(--text-xs)' }}>
            Back to list
          </Link>
        </ResourceHeader>
        <div style={{ padding: 'var(--space-6)', color: 'var(--text-secondary)' }}>
          {error || `Secret "${name}" not found.`}{' '}
          <Link to="/config/secrets" style={{ color: 'var(--blue)' }}>Back to list</Link>
        </div>
      </div>
    )
  }

  const dataKeys = Object.keys(secret.data || {})

  return (
    <div className="resource-view">
      <ResourceHeader title={secret.name} subtitle={`Secret in "${secret.namespace}" namespace`}>
        <Link to="/config/secrets" style={{ color: 'var(--blue)', fontSize: 'var(--text-xs)' }}>
          Back to list
        </Link>
      </ResourceHeader>

      {/* Metadata */}
      <div style={{ padding: '0 var(--space-4)' }}>
        <div className="prop-list">
          <span className="prop-group-title">Metadata</span>

          <span className="prop-label">Name</span>
          <span className="prop-value">{secret.name}</span>

          <span className="prop-label">Namespace</span>
          <span className="prop-value">{secret.namespace}</span>

          <span className="prop-label">Type</span>
          <span className="prop-value mono">{secret.type}</span>
        </div>

        {/* Data keys */}
        <div className="prop-list" style={{ marginTop: 'var(--space-4)' }}>
          <span className="prop-group-title">Data ({dataKeys.length} keys)</span>
        </div>

        {dataKeys.length === 0 ? (
          <div style={{
            padding: 'var(--space-4)',
            color: 'var(--text-tertiary)',
            fontSize: 'var(--text-xs)',
          }}>
            No data keys in this secret.
          </div>
        ) : (
          <div style={{ marginTop: 'var(--space-2)' }}>
            {dataKeys.map((key) => {
              const isRevealed = key in revealedKeys
              const isRevealing = revealingKey === key
              const displayValue = isRevealed ? revealedKeys[key] : MASKED_VALUE

              return (
                <div
                  key={key}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 'var(--space-3)',
                    padding: 'var(--space-2) 0',
                    borderBottom: '1px solid var(--border)',
                    fontSize: 'var(--text-xs)',
                  }}
                >
                  <span
                    className="mono"
                    style={{
                      minWidth: '160px',
                      color: 'var(--text-primary)',
                      fontWeight: 500,
                    }}
                  >
                    {key}
                  </span>

                  <span
                    className="mono"
                    data-testid={`secret-value-${key}`}
                    style={{
                      flex: 1,
                      color: isRevealed ? 'var(--text-secondary)' : 'var(--text-tertiary)',
                      wordBreak: 'break-all',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {displayValue}
                  </span>

                  <button
                    onClick={() => isRevealed ? handleHide(key) : handleReveal(key)}
                    disabled={isRevealing}
                    data-testid={`toggle-${key}`}
                    style={{
                      padding: '2px 8px',
                      fontSize: 'var(--text-2xs)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      background: 'var(--bg-tertiary)',
                      color: 'var(--text-secondary)',
                      cursor: isRevealing ? 'wait' : 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    {isRevealing ? '...' : isRevealed ? 'Hide' : 'Show'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
