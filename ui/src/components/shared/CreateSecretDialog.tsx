import { useState, useCallback } from 'react'
import { PreviewSecret } from '@/wailsjs/go/handlers/WizardHandler'
import { ApplyResource } from '@/wailsjs/go/handlers/ResourceHandler'
import { useToastStore } from '@/stores/toastStore'

type SecretMode = 'docker-registry' | 'tls'

interface CreateSecretDialogProps {
  onClose: () => void
  namespace?: string
}

export function CreateSecretDialog({ onClose, namespace = 'default' }: CreateSecretDialogProps) {
  const addToast = useToastStore((s) => s.addToast)
  const [mode, setMode] = useState<SecretMode>('docker-registry')
  const [name, setName] = useState('')
  const [ns, setNs] = useState(namespace)

  // Docker registry fields
  const [server, setServer] = useState('https://index.docker.io/v1/')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')

  // TLS fields
  const [tlsCert, setTlsCert] = useState('')
  const [tlsKey, setTlsKey] = useState('')

  const [preview, setPreview] = useState('')
  const [applying, setApplying] = useState(false)

  const generateSpec = useCallback((): Record<string, unknown> => {
    if (mode === 'docker-registry') {
      const dockerConfigJson = JSON.stringify({
        auths: {
          [server]: {
            username,
            password,
            email,
            auth: btoa(`${username}:${password}`),
          },
        },
      })
      return {
        name,
        namespace: ns,
        type: 'kubernetes.io/dockerconfigjson',
        data: { '.dockerconfigjson': dockerConfigJson },
      }
    } else {
      return {
        name,
        namespace: ns,
        type: 'kubernetes.io/tls',
        data: { 'tls.crt': tlsCert, 'tls.key': tlsKey },
      }
    }
  }, [mode, name, ns, server, username, password, email, tlsCert, tlsKey])

  const handlePreview = useCallback(async () => {
    if (!name.trim()) {
      addToast({ type: 'error', title: 'Name is required' })
      return
    }
    try {
      const yaml = await PreviewSecret(generateSpec())
      setPreview(yaml)
    } catch (e) {
      addToast({ type: 'error', title: 'Preview failed', description: String(e) })
    }
  }, [name, generateSpec, addToast])

  const handleApply = useCallback(async () => {
    if (!name.trim()) {
      addToast({ type: 'error', title: 'Name is required' })
      return
    }
    setApplying(true)
    try {
      const yaml = await PreviewSecret(generateSpec())
      const encoder = new TextEncoder()
      const bytes = Array.from(encoder.encode(yaml))
      await ApplyResource('', 'v1', 'secrets', ns, bytes)
      addToast({ type: 'success', title: `Secret "${name}" created` })
      onClose()
    } catch (e) {
      addToast({ type: 'error', title: 'Failed to create secret', description: String(e) })
    } finally {
      setApplying(false)
    }
  }, [name, ns, generateSpec, addToast, onClose])

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    padding: '6px 10px',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-primary)',
    width: '100%',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    marginBottom: '4px',
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      data-testid="create-secret-dialog"
    >
      <div
        style={{
          background: 'var(--bg-primary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-5)',
          width: '500px',
          maxHeight: '90vh',
          overflow: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
          <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            Create Secret
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 'var(--text-lg)' }}
            aria-label="Close"
          >
            x
          </button>
        </div>

        {/* Mode tabs */}
        <div style={{ display: 'flex', gap: 'var(--space-1)', marginBottom: 'var(--space-4)' }}>
          <button
            onClick={() => { setMode('docker-registry'); setPreview('') }}
            className="text-xs px-3 py-1.5 rounded"
            style={{
              background: mode === 'docker-registry' ? 'var(--accent)' : 'var(--bg-tertiary)',
              color: mode === 'docker-registry' ? '#fff' : 'var(--text-secondary)',
              border: 'none',
              cursor: 'pointer',
            }}
            data-testid="mode-docker-registry"
          >
            Docker Registry
          </button>
          <button
            onClick={() => { setMode('tls'); setPreview('') }}
            className="text-xs px-3 py-1.5 rounded"
            style={{
              background: mode === 'tls' ? 'var(--accent)' : 'var(--bg-tertiary)',
              color: mode === 'tls' ? '#fff' : 'var(--text-secondary)',
              border: 'none',
              cursor: 'pointer',
            }}
            data-testid="mode-tls"
          >
            TLS
          </button>
        </div>

        {/* Common fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div>
            <label style={labelStyle}>Name</label>
            <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="my-secret" />
          </div>
          <div>
            <label style={labelStyle}>Namespace</label>
            <input style={inputStyle} value={ns} onChange={(e) => setNs(e.target.value)} />
          </div>

          {/* Docker Registry fields */}
          {mode === 'docker-registry' && (
            <>
              <div>
                <label style={labelStyle}>Server</label>
                <input style={inputStyle} value={server} onChange={(e) => setServer(e.target.value)} placeholder="https://index.docker.io/v1/" />
              </div>
              <div>
                <label style={labelStyle}>Username</label>
                <input style={inputStyle} value={username} onChange={(e) => setUsername(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Password</label>
                <input style={inputStyle} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Email</label>
                <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </>
          )}

          {/* TLS fields */}
          {mode === 'tls' && (
            <>
              <div>
                <label style={labelStyle}>Certificate (PEM)</label>
                <textarea
                  style={{ ...inputStyle, minHeight: '100px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}
                  value={tlsCert}
                  onChange={(e) => setTlsCert(e.target.value)}
                  placeholder="-----BEGIN CERTIFICATE-----"
                />
              </div>
              <div>
                <label style={labelStyle}>Private Key (PEM)</label>
                <textarea
                  style={{ ...inputStyle, minHeight: '100px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}
                  value={tlsKey}
                  onChange={(e) => setTlsKey(e.target.value)}
                  placeholder="-----BEGIN PRIVATE KEY-----"
                />
              </div>
            </>
          )}
        </div>

        {/* Preview */}
        {preview && (
          <div style={{ marginTop: 'var(--space-3)' }}>
            <label style={labelStyle}>Preview</label>
            <pre
              style={{
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-sm)',
                padding: 'var(--space-2)',
                fontSize: 'var(--text-xs)',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-secondary)',
                maxHeight: '200px',
                overflow: 'auto',
                margin: 0,
              }}
              data-testid="secret-preview"
            >
              {preview}
            </pre>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)', justifyContent: 'flex-end' }}>
          <button
            onClick={handlePreview}
            className="text-xs px-3 py-1.5 rounded"
            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: 'none', cursor: 'pointer' }}
          >
            Preview YAML
          </button>
          <button
            onClick={handleApply}
            disabled={applying || !name.trim()}
            className="text-xs px-3 py-1.5 rounded"
            style={{
              background: applying || !name.trim() ? 'var(--bg-tertiary)' : 'var(--accent)',
              color: applying || !name.trim() ? 'var(--text-tertiary)' : '#fff',
              border: 'none',
              cursor: applying || !name.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {applying ? 'Creating...' : 'Create Secret'}
          </button>
        </div>
      </div>
    </div>
  )
}
