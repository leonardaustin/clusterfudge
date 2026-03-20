import { useState } from 'react'
import { ResourceHeader } from '../components/shared/ResourceHeader'
import { PreviewConfigMap } from '@/wailsjs/go/handlers/WizardHandler'
import { ApplyResource } from '@/wailsjs/go/handlers/ResourceHandler'
import { useToastStore } from '@/stores/toastStore'

type Step = 'basic' | 'data' | 'preview'

const STEPS: { id: Step; label: string }[] = [
  { id: 'basic', label: 'Basic Info' },
  { id: 'data', label: 'Data' },
  { id: 'preview', label: 'Preview' },
]

interface DataEntry {
  key: string
  value: string
}

export function ConfigMapWizard() {
  const [step, setStep] = useState<Step>('basic')
  const [name, setName] = useState('')
  const [namespace, setNamespace] = useState('default')
  const [entries, setEntries] = useState<DataEntry[]>([{ key: '', value: '' }])
  const [preview, setPreview] = useState('')
  const [previewError, setPreviewError] = useState('')
  const [applying, setApplying] = useState(false)

  const stepIndex = STEPS.findIndex((s) => s.id === step)

  const canProceed = (): boolean => {
    if (step === 'basic' && !name.trim()) return false
    return true
  }

  const buildSpec = () => {
    const data: Record<string, string> = {}
    for (const e of entries) {
      if (e.key.trim()) data[e.key.trim()] = e.value
    }
    return { name, namespace, data }
  }

  const goNext = async () => {
    if (!canProceed()) {
      useToastStore.getState().addToast({ type: 'error', title: 'Missing required fields', description: 'Name is required' })
      return
    }
    const nextIdx = stepIndex + 1
    if (nextIdx >= STEPS.length) return
    const nextStep = STEPS[nextIdx].id
    if (nextStep === 'preview') {
      try {
        const yaml = await PreviewConfigMap(buildSpec())
        setPreview(yaml)
        setPreviewError('')
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Preview failed'
        setPreviewError(msg)
        useToastStore.getState().addToast({ type: 'error', title: 'Preview generation failed', description: msg })
      }
    }
    setStep(nextStep)
  }

  const goBack = () => {
    const prevIdx = stepIndex - 1
    if (prevIdx < 0) return
    setStep(STEPS[prevIdx].id)
  }

  const handleApply = async () => {
    setApplying(true)
    try {
      const yaml = await PreviewConfigMap(buildSpec())
      const encoder = new TextEncoder()
      const bytes = Array.from(encoder.encode(yaml))
      await ApplyResource('', 'v1', 'configmaps', namespace, bytes)
      useToastStore.getState().addToast({ type: 'success', title: `ConfigMap "${name}" created` })
    } catch (e) {
      useToastStore.getState().addToast({ type: 'error', title: 'Apply failed', description: String(e) })
    } finally {
      setApplying(false)
    }
  }

  const addEntry = () => setEntries([...entries, { key: '', value: '' }])
  const removeEntry = (idx: number) => setEntries(entries.filter((_, i) => i !== idx))
  const updateEntry = (idx: number, field: 'key' | 'value', val: string) => {
    setEntries(entries.map((e, i) => i === idx ? { ...e, [field]: val } : e))
  }

  return (
    <div className="resource-view">
      <ResourceHeader title="ConfigMap Wizard" subtitle="Create a new ConfigMap step by step" />

      <div className="wizard-body">
        <div className="wizard-steps">
          {STEPS.map((s, i) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 'var(--text-xs)', fontWeight: 600,
                background: i <= stepIndex ? 'var(--accent)' : 'var(--bg-tertiary)',
                color: i <= stepIndex ? '#fff' : 'var(--text-tertiary)',
              }}>
                {i + 1}
              </div>
              <span style={{ fontSize: 'var(--text-sm)', color: i === stepIndex ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>{s.label}</span>
              {i < STEPS.length - 1 && <div style={{ width: '32px', height: '1px', background: 'var(--border)' }} />}
            </div>
          ))}
        </div>

        <div className="card" style={{ padding: 'var(--space-4)', minHeight: '200px' }}>
        {step === 'basic' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: '4px' }}>Name</label>
              <input className="settings-input" value={name} onChange={(e) => setName(e.target.value)} style={{ width: '300px' }} placeholder="my-configmap" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: '4px' }}>Namespace</label>
              <input className="settings-input" value={namespace} onChange={(e) => setNamespace(e.target.value)} style={{ width: '300px' }} />
            </div>
          </div>
        )}

        {step === 'data' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: '4px' }}>Key-value data entries</div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: '4px' }}>
              <span style={{ width: '200px', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>Key</span>
              <span style={{ width: '300px', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>Value</span>
            </div>
            {entries.map((entry, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                <input
                  className="settings-input"
                  value={entry.key}
                  onChange={(e) => updateEntry(idx, 'key', e.target.value)}
                  style={{ width: '200px' }}
                  placeholder="key"
                  aria-label={`Entry ${idx + 1} key`}
                />
                <input
                  className="settings-input"
                  value={entry.value}
                  onChange={(e) => updateEntry(idx, 'value', e.target.value)}
                  style={{ width: '300px' }}
                  placeholder="value"
                  aria-label={`Entry ${idx + 1} value`}
                />
                {entries.length > 1 && (
                  <button
                    className="settings-btn"
                    onClick={() => removeEntry(idx)}
                    style={{ padding: '2px 8px', fontSize: 'var(--text-xs)' }}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            <button className="settings-btn" onClick={addEntry} style={{ width: 'fit-content' }}>
              + Add Entry
            </button>
          </div>
        )}

        {step === 'preview' && (
          <div>
            {previewError ? (
              <div style={{ color: 'var(--red)', fontSize: 'var(--text-sm)' }}>{previewError}</div>
            ) : (
              <pre style={{
                fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)',
                whiteSpace: 'pre-wrap', margin: 0, padding: 'var(--space-3)',
                background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '6px',
                overflowX: 'auto',
              }}>
                {preview || 'No preview available'}
              </pre>
            )}
          </div>
        )}
      </div>

        <div className="wizard-nav">
          {stepIndex > 0 && <button className="settings-btn" onClick={goBack}>Back</button>}
          <div style={{ flex: 1 }} />
          {stepIndex < STEPS.length - 1 && <button className="settings-btn" onClick={goNext}>Next</button>}
          {step === 'preview' && !previewError && (
            <button className="settings-btn" onClick={handleApply} disabled={applying}>
              {applying ? 'Applying...' : 'Apply'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
