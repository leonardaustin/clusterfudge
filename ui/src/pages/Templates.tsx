import { useState, useEffect } from 'react'
import { ResourceHeader } from '../components/shared/ResourceHeader'
import { SearchInput } from '../components/shared/SearchInput'
import { ListTemplates, RenderTemplate, type Template, type RenderResult } from '@/wailsjs/go/handlers/TemplateHandler'
import { useToastStore } from '@/stores/toastStore'

export function Templates() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<Template | null>(null)
  const [variables, setVariables] = useState<Record<string, string>>({})
  const [rendered, setRendered] = useState<RenderResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    ListTemplates()
      .then(setTemplates)
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err)
        setLoadError(msg)
        useToastStore.getState().addToast({ type: 'error', title: 'Failed to load templates', description: msg })
      })
  }, [])

  const handleSelect = (t: Template) => {
    setSelected(t)
    const vars: Record<string, string> = {}
    t.variables.forEach((v) => { vars[v.name] = String(v.default ?? '') })
    setVariables(vars)
    setRendered(null)
  }

  const handleRender = async () => {
    if (!selected) return
    setLoading(true)
    try {
      const result = await RenderTemplate(selected.name, variables)
      setRendered(result)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setRendered({ yaml: `# Render failed: ${msg}`, resources: [], errors: [msg] })
      useToastStore.getState().addToast({ type: 'error', title: 'Template render failed', description: msg })
    } finally {
      setLoading(false)
    }
  }

  const filtered = templates.filter((t) =>
    t.name.toLowerCase().includes(filter.toLowerCase()) ||
    t.description.toLowerCase().includes(filter.toLowerCase())
  )

  return (
    <div className="resource-view">
      <ResourceHeader title="Templates" subtitle={`${templates.length} templates available`}>
        <SearchInput placeholder="Filter templates..." value={filter} onChange={setFilter} />
      </ResourceHeader>

      <div className="wizard-body">
        {loadError && (
          <div style={{ marginBottom: 'var(--space-3)', color: 'var(--red)', fontSize: 'var(--text-sm)' }}>
            Failed to load templates: {loadError}
          </div>
        )}

        <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
        <div style={{ width: '280px', flexShrink: 0 }}>
          {filtered.length === 0 && !loadError && (
            <div style={{ padding: 'var(--space-3)', color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>
              No templates available
            </div>
          )}
          {filtered.map((t) => (
            <div
              key={t.name}
              onClick={() => handleSelect(t)}
              style={{
                padding: 'var(--space-3)', cursor: 'pointer', borderRadius: '6px', marginBottom: 'var(--space-2)',
                background: selected?.name === t.name ? 'var(--bg-tertiary)' : 'transparent',
                border: '1px solid', borderColor: selected?.name === t.name ? 'var(--accent)' : 'var(--border)',
              }}
            >
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', fontWeight: 500 }}>{t.name}</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: '2px' }}>{t.description}</div>
            </div>
          ))}
        </div>

        <div style={{ flex: 1 }}>
          {selected && (
            <div className="card" style={{ padding: 'var(--space-4)' }}>
              <h3 style={{ color: 'var(--text-primary)', marginBottom: 'var(--space-3)', fontSize: 'var(--text-base)' }}>{selected.name}</h3>
              {selected.variables.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
                  {selected.variables.map((v) => (
                    <div key={v.name}>
                      <label htmlFor={`tmpl-var-${v.name}`} style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                        {v.name} {v.description && <span style={{ color: 'var(--text-tertiary)' }}>– {v.description}</span>}
                      </label>
                      <input
                        id={`tmpl-var-${v.name}`}
                        className="settings-input"
                        value={variables[v.name] || ''}
                        onChange={(e) => setVariables((prev) => ({ ...prev, [v.name]: e.target.value }))}
                        style={{ width: '300px' }}
                      />
                    </div>
                  ))}
                </div>
              )}
              <button className="settings-btn" onClick={handleRender} disabled={loading} style={{ marginBottom: 'var(--space-3)' }}>
                {loading ? 'Rendering...' : 'Render'}
              </button>
              {rendered && (
                <>
                  {rendered.errors && rendered.errors.length > 0 && (
                    <div style={{ color: 'var(--red)', fontSize: 'var(--text-xs)', marginBottom: 'var(--space-2)' }}>
                      {rendered.errors.join(', ')}
                    </div>
                  )}
                  <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', background: 'var(--bg-secondary)', padding: 'var(--space-3)', borderRadius: '6px', margin: 0 }}>
                    {rendered.yaml}
                  </pre>
                </>
              )}
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  )
}
