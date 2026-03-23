import { useState } from 'react'
import { ResourceHeader } from '../components/shared/ResourceHeader'
import { PreviewDeployment } from '@/wailsjs/go/handlers/WizardHandler'
import { ApplyResource } from '@/wailsjs/go/handlers/ResourceHandler'
import { useToastStore } from '@/stores/toastStore'

type Step = 'basic' | 'resources' | 'labels' | 'preview'

const STEPS: { id: Step; label: string }[] = [
  { id: 'basic', label: 'Basic Info' },
  { id: 'resources', label: 'Resources' },
  { id: 'labels', label: 'Labels' },
  { id: 'preview', label: 'Preview' },
]

export function DeploymentWizard() {
  const [step, setStep] = useState<Step>('basic')
  const [name, setName] = useState('')
  const [namespace, setNamespace] = useState('default')
  const [image, setImage] = useState('')
  const [replicas, setReplicas] = useState('1')
  const [cpuRequest, setCpuRequest] = useState('100m')
  const [memRequest, setMemRequest] = useState('128Mi')
  const [cpuLimit, setCpuLimit] = useState('500m')
  const [memLimit, setMemLimit] = useState('256Mi')
  const [labels, setLabels] = useState('app=')
  const [preview, setPreview] = useState('')
  const [previewError, setPreviewError] = useState('')
  const [applying, setApplying] = useState(false)

  const stepIndex = STEPS.findIndex((s) => s.id === step)

  const canProceed = (): boolean => {
    if (step === 'basic' && (!name.trim() || !image.trim())) return false
    return true
  }

  const goNext = async () => {
    if (!canProceed()) {
      useToastStore.getState().addToast({ type: 'error', title: 'Missing required fields', description: 'Name and image are required' })
      return
    }
    const nextIdx = stepIndex + 1
    if (nextIdx >= STEPS.length) return
    const nextStep = STEPS[nextIdx].id
    if (nextStep === 'preview') {
      try {
        const labelMap: Record<string, string> = {}
        labels.split(',').forEach((pair) => {
          const [k, v] = pair.split('=')
          if (k?.trim()) labelMap[k.trim()] = v?.trim() || ''
        })
        const yaml = await PreviewDeployment({
          name, namespace, image, replicas: Number(replicas),
          cpuRequest, memRequest, cpuLimit, memLimit, labels: labelMap,
        })
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
      const yaml = preview || await PreviewDeployment({
        name, namespace, image, replicas: Number(replicas),
        cpuRequest, memRequest, cpuLimit, memLimit,
        labels: Object.fromEntries(labels.split(',').map((p) => { const [k, v] = p.split('='); return [k?.trim() || '', v?.trim() || ''] }).filter(([k]) => k)),
      })
      const encoder = new TextEncoder()
      const bytes = Array.from(encoder.encode(yaml))
      await ApplyResource('apps', 'v1', 'deployments', namespace, bytes)
      useToastStore.getState().addToast({ type: 'success', title: `Deployment "${name}" created` })
    } catch (e) {
      useToastStore.getState().addToast({ type: 'error', title: 'Apply failed', description: String(e) })
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="resource-view">
      <ResourceHeader title="Deployment Wizard" subtitle="Create a new deployment step by step" />

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
              <label htmlFor="wiz-name" style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: '4px' }}>Name</label>
              <input id="wiz-name" className="settings-input" value={name} onChange={(e) => setName(e.target.value)} style={{ width: '300px' }} placeholder="my-deployment" />
            </div>
            <div>
              <label htmlFor="wiz-namespace" style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: '4px' }}>Namespace</label>
              <input id="wiz-namespace" className="settings-input" value={namespace} onChange={(e) => setNamespace(e.target.value)} style={{ width: '300px' }} />
            </div>
            <div>
              <label htmlFor="wiz-image" style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: '4px' }}>Image</label>
              <input id="wiz-image" className="settings-input" value={image} onChange={(e) => setImage(e.target.value)} style={{ width: '300px' }} placeholder="nginx:latest" />
            </div>
            <div>
              <label htmlFor="wiz-replicas" style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: '4px' }}>Replicas</label>
              <input id="wiz-replicas" className="settings-input" type="number" min="1" value={replicas} onChange={(e) => setReplicas(e.target.value)} style={{ width: '100px' }} />
            </div>
          </div>
        )}

        {step === 'resources' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
              <div>
                <label htmlFor="wiz-cpu-req" style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: '4px' }}>CPU Request</label>
                <input id="wiz-cpu-req" className="settings-input" value={cpuRequest} onChange={(e) => setCpuRequest(e.target.value)} style={{ width: '140px' }} />
              </div>
              <div>
                <label htmlFor="wiz-mem-req" style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: '4px' }}>Memory Request</label>
                <input id="wiz-mem-req" className="settings-input" value={memRequest} onChange={(e) => setMemRequest(e.target.value)} style={{ width: '140px' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
              <div>
                <label htmlFor="wiz-cpu-lim" style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: '4px' }}>CPU Limit</label>
                <input id="wiz-cpu-lim" className="settings-input" value={cpuLimit} onChange={(e) => setCpuLimit(e.target.value)} style={{ width: '140px' }} />
              </div>
              <div>
                <label htmlFor="wiz-mem-lim" style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: '4px' }}>Memory Limit</label>
                <input id="wiz-mem-lim" className="settings-input" value={memLimit} onChange={(e) => setMemLimit(e.target.value)} style={{ width: '140px' }} />
              </div>
            </div>
          </div>
        )}

        {step === 'labels' && (
          <div>
            <label htmlFor="wiz-labels" style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: '4px' }}>Labels (comma-separated key=value pairs)</label>
            <input id="wiz-labels" className="settings-input" value={labels} onChange={(e) => setLabels(e.target.value)} style={{ width: '400px' }} placeholder="app=myapp,env=prod" />
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
