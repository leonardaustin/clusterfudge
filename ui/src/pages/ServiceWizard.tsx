import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import { ResourceHeader } from '../components/shared/ResourceHeader'
import { PreviewService } from '@/wailsjs/go/handlers/WizardHandler'
import { ApplyResource } from '@/wailsjs/go/handlers/ResourceHandler'
import { useToastStore } from '@/stores/toastStore'

type Step = 'basic' | 'ports' | 'selector' | 'preview'

const STEPS: { id: Step; label: string }[] = [
  { id: 'basic', label: 'Basic Info' },
  { id: 'ports', label: 'Ports' },
  { id: 'selector', label: 'Selector' },
  { id: 'preview', label: 'Preview' },
]

const SERVICE_TYPES = ['ClusterIP', 'NodePort', 'LoadBalancer']

function ServiceTypeSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative', width: '300px' }}>
      <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: '4px' }}>Type</label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-border hover:border-border-strong text-text-secondary hover:text-text-primary bg-bg-tertiary transition-colors"
        style={{ width: '100%', justifyContent: 'space-between' }}
      >
        <span>{value}</span>
        <ChevronDown className="w-3 h-3 opacity-50" style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 150ms' }} />
      </button>
      {open && (
        <div
          className="bg-bg-tertiary border border-border rounded-md shadow-popover"
          style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, marginTop: '2px', overflow: 'hidden' }}
        >
          {SERVICE_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => { onChange(t); setOpen(false) }}
              className="flex items-center gap-2 px-2 py-1.5 text-xs rounded cursor-default hover:bg-bg-hover transition-colors w-full text-left"
              style={{ color: t === value ? 'var(--accent)' : undefined, border: 'none', background: 'transparent' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function ServiceWizard() {
  const [step, setStep] = useState<Step>('basic')
  const [name, setName] = useState('')
  const [namespace, setNamespace] = useState('default')
  const [serviceType, setServiceType] = useState('ClusterIP')
  const [port, setPort] = useState('80')
  const [targetPort, setTargetPort] = useState('8080')
  const [selector, setSelector] = useState('app=')
  const [preview, setPreview] = useState('')
  const [previewError, setPreviewError] = useState('')
  const [applying, setApplying] = useState(false)

  const stepIndex = STEPS.findIndex((s) => s.id === step)

  const canProceed = (): boolean => {
    if (step === 'basic' && !name.trim()) return false
    if (step === 'ports' && (!port.trim() || !targetPort.trim())) return false
    return true
  }

  const buildSpec = () => {
    const selectorMap: Record<string, string> = {}
    selector.split(',').forEach((pair) => {
      const [k, v] = pair.split('=')
      if (k?.trim()) selectorMap[k.trim()] = v?.trim() || ''
    })

    return {
      name,
      namespace,
      type: serviceType,
      selector: selectorMap,
      ports: [{
        port: Number(port),
        targetPort: Number(targetPort),
        protocol: 'TCP',
      }],
    }
  }

  const goNext = async () => {
    if (!canProceed()) {
      useToastStore.getState().addToast({ type: 'error', title: 'Missing required fields' })
      return
    }
    const nextIdx = stepIndex + 1
    if (nextIdx >= STEPS.length) return
    const nextStep = STEPS[nextIdx].id
    if (nextStep === 'preview') {
      try {
        const yaml = await PreviewService(buildSpec())
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
      const yaml = await PreviewService(buildSpec())
      const encoder = new TextEncoder()
      const bytes = Array.from(encoder.encode(yaml))
      await ApplyResource('', 'v1', 'services', namespace, bytes)
      useToastStore.getState().addToast({ type: 'success', title: `Service "${name}" created` })
    } catch (e) {
      useToastStore.getState().addToast({ type: 'error', title: 'Apply failed', description: String(e) })
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="resource-view">
      <ResourceHeader title="Service Wizard" subtitle="Create a new service step by step" />

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
              <input className="settings-input" value={name} onChange={(e) => setName(e.target.value)} style={{ width: '300px' }} placeholder="my-service" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: '4px' }}>Namespace</label>
              <input className="settings-input" value={namespace} onChange={(e) => setNamespace(e.target.value)} style={{ width: '300px' }} />
            </div>
            <ServiceTypeSelector value={serviceType} onChange={setServiceType} />
          </div>
        )}

        {step === 'ports' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: '4px' }}>Port</label>
                <input className="settings-input" type="number" min="1" max="65535" value={port} onChange={(e) => setPort(e.target.value)} style={{ width: '140px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: '4px' }}>Target Port</label>
                <input className="settings-input" type="number" min="1" max="65535" value={targetPort} onChange={(e) => setTargetPort(e.target.value)} style={{ width: '140px' }} />
              </div>
            </div>
          </div>
        )}

        {step === 'selector' && (
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: '4px' }}>Selector (comma-separated key=value pairs)</label>
            <input className="settings-input" value={selector} onChange={(e) => setSelector(e.target.value)} style={{ width: '400px' }} placeholder="app=myapp" />
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
