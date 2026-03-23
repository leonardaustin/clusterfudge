import { useState, useRef, useEffect, useMemo } from 'react'
import { ChevronDown, Copy, Check, Download } from 'lucide-react'
import { ResourceHeader } from '../components/shared/ResourceHeader'
import { StripManifestFromString } from '@/wailsjs/go/handlers/BackupHandler'
import { ListResources, ApplyResource, DryRunApply } from '@/wailsjs/go/handlers/ResourceHandler'
import { SaveFileDialog } from '@/wailsjs/go/main/App'
import { useToastStore } from '@/stores/toastStore'

function highlightJson(json: string): string {
  return json.replace(
    /("(?:\\.|[^"\\])*")\s*:|("(?:\\.|[^"\\])*")|(true|false|null)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (match, key, str, bool, num) => {
      if (key) return `<span style="color:var(--accent,#7c3aed)">${key}</span>:`
      if (str) return `<span style="color:var(--green,#22c55e)">${str}</span>`
      if (bool) return `<span style="color:var(--yellow,#eab308)">${bool}</span>`
      if (num) return `<span style="color:var(--blue,#3b82f6)">${num}</span>`
      return match
    }
  )
}

const EXPORT_KINDS = ['Deployment', 'Service', 'ConfigMap', 'StatefulSet', 'DaemonSet']

const KIND_TO_GVR: Record<string, { group: string; version: string; resource: string }> = {
  Deployment: { group: 'apps', version: 'v1', resource: 'deployments' },
  Service: { group: '', version: 'v1', resource: 'services' },
  ConfigMap: { group: '', version: 'v1', resource: 'configmaps' },
  StatefulSet: { group: 'apps', version: 'v1', resource: 'statefulsets' },
  DaemonSet: { group: 'apps', version: 'v1', resource: 'daemonsets' },
}

function KindSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
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
    <div ref={ref} style={{ position: 'relative' }}>
      <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: '4px' }}>Resource Kind</label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-border hover:border-border-strong text-text-secondary hover:text-text-primary bg-bg-tertiary transition-colors"
        style={{ width: '200px', justifyContent: 'space-between' }}
      >
        <span>{value}</span>
        <ChevronDown className="w-3 h-3 opacity-50" style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 150ms' }} />
      </button>
      {open && (
        <div
          className="bg-bg-tertiary border border-border rounded-md shadow-popover"
          style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, marginTop: '2px', overflow: 'hidden' }}
        >
          {EXPORT_KINDS.map((k) => (
            <button
              key={k}
              onClick={() => { onChange(k); setOpen(false) }}
              className="flex items-center gap-2 px-2 py-1.5 text-xs rounded cursor-default hover:bg-bg-hover transition-colors w-full text-left"
              style={{ color: k === value ? 'var(--accent)' : undefined, border: 'none', background: 'transparent' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {k}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function BackupRestore() {
  const [exportNs, setExportNs] = useState('default')
  const [exportKind, setExportKind] = useState('Deployment')
  const [importYaml, setImportYaml] = useState('')
  const [dryRun, setDryRun] = useState(true)
  const [strippedYaml, setStrippedYaml] = useState('')
  const [dryRunResult, setDryRunResult] = useState<{ live: string; result: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [exportJson, setExportJson] = useState('')
  const [exporting, setExporting] = useState(false)
  const [copied, setCopied] = useState(false)
  const exportPreRef = useRef<HTMLPreElement>(null)
  const highlightedJson = useMemo(() => exportJson ? highlightJson(exportJson) : '', [exportJson])

  const handleExport = async () => {
    const gvr = KIND_TO_GVR[exportKind]
    if (!gvr) return
    setExporting(true)
    setExportJson('')
    setCopied(false)
    try {
      const items = await ListResources(gvr.group, gvr.version, gvr.resource, exportNs)
      if (items.length === 0) {
        setExportJson(`# No ${exportKind} resources found in namespace "${exportNs}"`)
      } else {
        const docs = items.map((item) => {
          const raw = item.raw || {}
          // Strip server-side fields for clean export
          const cleaned = { ...raw } as Record<string, unknown>
          delete cleaned.status
          if (cleaned.metadata && typeof cleaned.metadata === 'object') {
            const meta = { ...(cleaned.metadata as Record<string, unknown>) }
            delete meta.resourceVersion
            delete meta.uid
            delete meta.creationTimestamp
            delete meta.managedFields
            delete meta.generation
            cleaned.metadata = meta
          }
          return JSON.stringify(cleaned, null, 2)
        })
        setExportJson(docs.join('\n---\n'))
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setExportJson(`# Export failed: ${msg}`)
      useToastStore.getState().addToast({ type: 'error', title: 'Export failed', description: msg })
    } finally {
      setExporting(false)
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(exportJson)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      useToastStore.getState().addToast({ type: 'error', title: 'Failed to copy to clipboard' })
    }
  }

  const handleDownload = async () => {
    try {
      const filename = `${exportKind.toLowerCase()}-${exportNs}.json`
      const path = await SaveFileDialog(filename, exportJson)
      if (path) {
        useToastStore.getState().addToast({ type: 'success', title: `Saved to ${path}` })
      }
    } catch {
      useToastStore.getState().addToast({ type: 'error', title: 'Failed to save file' })
    }
  }

  const handlePreKeyDown = (e: React.KeyboardEvent<HTMLPreElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
      e.preventDefault()
      e.stopPropagation()
      const sel = window.getSelection()
      const range = document.createRange()
      range.selectNodeContents(e.currentTarget)
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
  }

  const handleStripAndPreview = async () => {
    if (!importYaml) return
    setLoading(true)
    setDryRunResult(null)
    try {
      const stripped = await StripManifestFromString(importYaml)
      setStrippedYaml(stripped)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setStrippedYaml(`# Strip failed: ${msg}`)
      useToastStore.getState().addToast({ type: 'error', title: 'Strip & preview failed', description: msg })
    } finally {
      setLoading(false)
    }
  }

  const handleApply = async () => {
    const yaml = strippedYaml || importYaml
    if (!yaml) return
    setApplying(true)
    setDryRunResult(null)
    try {
      // Parse YAML to detect apiVersion/kind/namespace for the apply call.
      const apiVersionMatch = yaml.match(/apiVersion:\s*([^\s]+)/)
      const kindMatch = yaml.match(/kind:\s*([^\s]+)/)
      const nsMatch = yaml.match(/namespace:\s*([^\s]+)/)
      if (!apiVersionMatch || !kindMatch) {
        throw new Error('Could not detect apiVersion/kind from YAML')
      }
      const apiVersion = apiVersionMatch[1]
      const kindStr = kindMatch[1]
      const ns = nsMatch ? nsMatch[1] : 'default'

      // Convert kind to resource name and extract group/version.
      const resourceName = kindStr.toLowerCase() + 's'
      const parts = apiVersion.split('/')
      const group = parts.length > 1 ? parts[0] : ''
      const version = parts.length > 1 ? parts[1] : parts[0]

      const encoder = new TextEncoder()
      const bytes = Array.from(encoder.encode(yaml))

      if (dryRun) {
        const result = await DryRunApply(group, version, resourceName, ns, bytes)
        const parts2 = result.split('\n---SEPARATOR---\n')
        setDryRunResult({ live: parts2[0] || '', result: parts2[1] || parts2[0] || '' })
        useToastStore.getState().addToast({ type: 'success', title: 'Dry run succeeded — server accepted the resource' })
      } else {
        await ApplyResource(group, version, resourceName, ns, bytes)
        useToastStore.getState().addToast({ type: 'success', title: `${kindStr} applied successfully` })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      useToastStore.getState().addToast({ type: 'error', title: 'Apply failed', description: msg })
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="resource-view">
      <ResourceHeader title="Backup & Restore" subtitle="Export and import Kubernetes resources" />

      <div style={{ padding: 'var(--space-4)', flex: 1, overflowY: 'auto' }}>
      <div style={{ display: 'flex', gap: 'var(--space-5)', flexWrap: 'wrap' }}>
        <div className="card" style={{ padding: 'var(--space-4)', flex: 1, minWidth: '300px' }}>
          <h3 style={{ color: 'var(--text-primary)', marginBottom: 'var(--space-3)', fontSize: 'var(--text-base)' }}>Export</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div>
              <label htmlFor="br-export-ns" style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: '4px' }}>Namespace</label>
              <input id="br-export-ns" className="settings-input" value={exportNs} onChange={(e) => setExportNs(e.target.value)} style={{ width: '200px' }} />
            </div>
            <KindSelector value={exportKind} onChange={setExportKind} />
            <button className="settings-btn" onClick={handleExport} disabled={exporting}>
              {exporting ? 'Exporting...' : 'Export JSON'}
            </button>
            {exportJson && (
              <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                  <button
                    className="settings-btn"
                    style={{ fontSize: 'var(--text-xs)', display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px' }}
                    onClick={handleCopy}
                  >
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    className="settings-btn"
                    style={{ fontSize: 'var(--text-xs)', display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px' }}
                    onClick={handleDownload}
                  >
                    <Download className="w-3 h-3" />
                    Download
                  </button>
                </div>
                <pre
                  ref={exportPreRef}
                  tabIndex={0}
                  onKeyDown={handlePreKeyDown}
                  style={{
                    fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)',
                    whiteSpace: 'pre-wrap', background: 'var(--bg-secondary)', padding: 'var(--space-3)',
                    borderRadius: '6px', margin: 0, maxHeight: '400px', overflow: 'auto',
                    border: '1px solid var(--border)', outline: 'none', cursor: 'text',
                    userSelect: 'text', WebkitUserSelect: 'text',
                  }}
                  dangerouslySetInnerHTML={{ __html: highlightedJson }}
                />
              </div>
            )}
          </div>
        </div>

        <div className="card" style={{ padding: 'var(--space-4)', flex: 1, minWidth: '300px' }}>
          <h3 style={{ color: 'var(--text-primary)', marginBottom: 'var(--space-3)', fontSize: 'var(--text-base)' }}>Import</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div>
              <label htmlFor="br-import-yaml" style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: '4px' }}>YAML Content</label>
              <textarea
                id="br-import-yaml"
                className="settings-input"
                value={importYaml}
                onChange={(e) => setImportYaml(e.target.value)}
                rows={8}
                style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', resize: 'vertical' }}
                placeholder="Paste YAML here..."
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} id="dry-run" />
              <label htmlFor="dry-run" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>Dry run</label>
              <div style={{ flex: 1 }} />
              <button className="settings-btn" onClick={handleStripAndPreview} disabled={loading || !importYaml}>
                {loading ? 'Stripping...' : 'Strip & Preview'}
              </button>
              <button className="settings-btn" onClick={handleApply} disabled={applying || !importYaml}>
                {applying ? 'Applying...' : dryRun ? 'Dry Run Apply' : 'Apply'}
              </button>
            </div>
            {dryRunResult && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--green, #22c55e)' }} />
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--green, #22c55e)', fontWeight: 500 }}>
                    Dry run succeeded — server accepted the resource
                  </span>
                </div>
                <details style={{ fontSize: 'var(--text-xs)' }}>
                  <summary style={{ color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: 'var(--space-2)' }}>
                    View server response
                  </summary>
                  <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', background: 'var(--bg-secondary)', padding: 'var(--space-3)', borderRadius: '6px', border: '1px solid var(--border)', margin: 0, maxHeight: '300px', overflow: 'auto' }}>
                    {dryRunResult.result}
                  </pre>
                </details>
              </div>
            )}
            {strippedYaml && (
              <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', background: 'var(--bg-secondary)', padding: 'var(--space-3)', borderRadius: '6px', border: '1px solid var(--border)', margin: 0 }}>
                {strippedYaml}
              </pre>
            )}
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}
