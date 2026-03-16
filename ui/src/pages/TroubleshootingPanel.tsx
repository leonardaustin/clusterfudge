import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { ResourceHeader } from '../components/shared/ResourceHeader'
import {
  InvestigateResource,
  GetTimeline,
  type Investigation,
  type ChangeRecord,
} from '@/wailsjs/go/handlers/TroubleshootHandler'
import { ListResources, RestartDeployment } from '@/wailsjs/go/handlers/ResourceHandler'
import { useToastStore } from '@/stores/toastStore'

const KINDS = ['Deployment', 'Pod', 'Service', 'StatefulSet', 'DaemonSet']

const KIND_TO_GVR: Record<string, { group: string; version: string; resource: string }> = {
  Deployment:  { group: 'apps', version: 'v1', resource: 'deployments' },
  Pod:         { group: '',     version: 'v1', resource: 'pods' },
  Service:     { group: '',     version: 'v1', resource: 'services' },
  StatefulSet: { group: 'apps', version: 'v1', resource: 'statefulsets' },
  DaemonSet:   { group: 'apps', version: 'v1', resource: 'daemonsets' },
}

const CHECK_ICONS: Record<string, { color: string; label: string }> = {
  pass: { color: 'var(--green, #22c55e)', label: 'Pass' },
  fail: { color: 'var(--red, #ef4444)', label: 'Fail' },
  warn: { color: 'var(--yellow, #eab308)', label: 'Warn' },
}

function CheckRow({ check, onRevealed }: { check: { name: string; status: string; detail: string }; onRevealed: () => void }) {
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    const delay = 750 + Math.random() * 2250 // 750ms–3s
    const timer = setTimeout(() => { setRevealed(true); onRevealed() }, delay)
    return () => clearTimeout(timer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const icon = revealed ? (CHECK_ICONS[check.status] || CHECK_ICONS.pass) : null

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2)', borderRadius: '6px' }}>
      {revealed ? (
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, background: icon!.color }} />
      ) : (
        <div style={{ width: '8px', height: '8px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            width: '8px', height: '8px', borderRadius: '50%',
            border: '2px solid var(--text-tertiary)', borderTopColor: 'transparent',
            animation: 'spin 0.8s linear infinite',
          }} />
        </div>
      )}
      <div style={{ width: '140px', flexShrink: 0, fontSize: 'var(--text-sm)', color: 'var(--text-primary)', fontWeight: 500 }}>
        {check.name}
      </div>
      <div style={{ flex: 1, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
        {revealed ? check.detail : 'Checking...'}
      </div>
      <div style={{
        fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', width: '40px', textAlign: 'right',
        color: revealed ? icon!.color : 'var(--text-tertiary)',
      }}>
        {revealed ? icon!.label : '...'}
      </div>
    </div>
  )
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
      <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: '4px' }}>Kind</label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-border hover:border-border-strong text-text-secondary hover:text-text-primary bg-bg-tertiary transition-colors"
        style={{ width: '140px', justifyContent: 'space-between' }}
      >
        <span>{value}</span>
        <ChevronDown className="w-3 h-3 opacity-50" style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 150ms' }} />
      </button>
      {open && (
        <div
          className="bg-bg-tertiary border border-border rounded-md shadow-popover"
          style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, marginTop: '2px', overflow: 'hidden' }}
        >
          {KINDS.map((k) => (
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

export function TroubleshootingPanel() {
  const navigate = useNavigate()
  const [kind, setKind] = useState('Deployment')
  const [namespace, setNamespace] = useState('default')
  const [name, setName] = useState('')
  const [nameFilter, setNameFilter] = useState('')
  const [resourceNames, setResourceNames] = useState<string[]>([])
  const [loadingNames, setLoadingNames] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [showRawData, setShowRawData] = useState(false)
  const [revealedCount, setRevealedCount] = useState(0)
  const [investigation, setInvestigation] = useState<Investigation | null>(null)
  const [timeline, setTimeline] = useState<ChangeRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Fetch resource names when kind or namespace changes
  useEffect(() => {
    let cancelled = false
    const gvr = KIND_TO_GVR[kind]
    if (!gvr || !namespace.trim()) {
      setResourceNames([])
      setLoadingNames(false)
      return
    }
    setLoadingNames(true)
    ListResources(gvr.group, gvr.version, gvr.resource, namespace)
      .then((items) => {
        if (!cancelled) {
          setResourceNames((items ?? []).map((i) => i.name).sort())
          setLoadingNames(false)
        }
      })
      .catch(() => {
        if (!cancelled) { setResourceNames([]); setLoadingNames(false) }
      })
    return () => { cancelled = true }
  }, [kind, namespace])

  // Close dropdown on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const filteredNames = nameFilter
    ? resourceNames.filter((n) => n.toLowerCase().includes(nameFilter.toLowerCase()))
    : resourceNames

  const handleSuggestionAction = async (actionType: string, actionRef: string) => {
    try {
      switch (actionType) {
        case 'view_logs':
          navigate(`/logs?namespace=${namespace}&name=${actionRef || name}`)
          break
        case 'restart':
          await RestartDeployment(namespace, actionRef || name)
          useToastStore.getState().addToast({ type: 'success', title: `Restarted ${actionRef || name}` })
          break
        case 'describe':
          navigate(`/resources/${kind.toLowerCase()}s/${namespace}/${actionRef || name}`)
          break
        case 'scale':
          navigate(`/resources/deployments/${namespace}/${actionRef || name}`)
          break
        case 'link':
          if (actionRef) navigate(actionRef)
          break
        default:
          useToastStore.getState().addToast({ type: 'info', title: `Action: ${actionType}`, description: actionRef || 'No action reference' })
      }
    } catch (e) {
      useToastStore.getState().addToast({ type: 'error', title: `Action failed: ${actionType}`, description: String(e) })
    }
  }

  const handleCheckRevealed = useCallback(() => {
    setRevealedCount((c) => c + 1)
  }, [])

  const totalChecks = investigation?.checks?.length ?? 0
  const allChecksRevealed = totalChecks > 0 && revealedCount >= totalChecks

  const handleInvestigate = async () => {
    if (!name) return
    setLoading(true)
    setError('')
    setRevealedCount(0)
    try {
      const [inv, tl] = await Promise.all([
        InvestigateResource(kind, namespace, name),
        GetTimeline(kind, namespace, name),
      ])
      setInvestigation(inv)
      setTimeline(tl || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Investigation failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="resource-view">
      <ResourceHeader title="Troubleshooting" subtitle="Investigate resource issues and view change timelines" />

      <div style={{ padding: 'var(--space-4)', flex: 1, overflowY: 'auto' }}>
      <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', alignItems: 'flex-end' }}>
        <KindSelector value={kind} onChange={(v) => { setKind(v); setName(''); setNameFilter('') }} />
        <div>
          <label htmlFor="ts-namespace" style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: '4px' }}>Namespace</label>
          <input id="ts-namespace" className="settings-input" value={namespace} onChange={(e) => { setNamespace(e.target.value); setName(''); setNameFilter('') }} style={{ width: '140px' }} />
        </div>
        <div ref={dropdownRef} style={{ position: 'relative' }}>
          <label htmlFor="ts-name" style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: '4px' }}>Name</label>
          <input
            id="ts-name"
            className="settings-input"
            value={nameFilter}
            onChange={(e) => { setNameFilter(e.target.value); setName(''); setShowDropdown(true) }}
            onFocus={() => setShowDropdown(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && filteredNames.length === 1) {
                setName(filteredNames[0]); setNameFilter(filteredNames[0]); setShowDropdown(false)
              }
              if (e.key === 'Escape') setShowDropdown(false)
            }}
            style={{ width: '260px' }}
            placeholder={loadingNames ? 'Loading...' : resourceNames.length > 0 ? `Search ${resourceNames.length} resources...` : `No ${kind.toLowerCase()}s found`}
            autoComplete="off"
          />
          {showDropdown && filteredNames.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
              maxHeight: '200px', overflowY: 'auto', marginTop: '2px',
              background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
              borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            }}>
              {filteredNames.slice(0, 50).map((n) => (
                <button
                  key={n}
                  onClick={() => { setName(n); setNameFilter(n); setShowDropdown(false) }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '6px 10px', fontSize: 'var(--text-xs)',
                    color: n === name ? 'var(--accent)' : 'var(--text-primary)',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  {n}
                </button>
              ))}
              {filteredNames.length > 50 && (
                <div style={{ padding: '6px 10px', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                  ...and {filteredNames.length - 50} more
                </div>
              )}
            </div>
          )}
        </div>
        <button className="settings-btn" onClick={handleInvestigate} disabled={loading || !name} title={!name ? 'Select a resource to investigate' : undefined}>
          {loading ? 'Investigating...' : 'Investigate'}
        </button>
      </div>

      {error && (
        <div style={{ color: 'var(--red)', marginBottom: 'var(--space-3)', fontSize: 'var(--text-sm)' }}>{error}</div>
      )}

      {investigation && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {/* Checks */}
          {investigation.checks && investigation.checks.length > 0 && (
            <div className="card" style={{ padding: 'var(--space-4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                <h3 style={{ color: 'var(--text-primary)', fontSize: 'var(--text-base)', margin: 0 }}>Checks Performed</h3>
                {investigation.rawStatus && (
                  <button className="settings-btn" style={{ fontSize: 'var(--text-xs)' }} onClick={() => setShowRawData(true)}>
                    View Raw Data
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                {investigation.checks.map((c, i) => (
                  <CheckRow key={`${investigation.resourceName}-${i}`} check={c} onRevealed={handleCheckRevealed} />
                ))}
              </div>
            </div>
          )}

          {/* Summary — shown after all checks finish */}
          {allChecksRevealed && (
            <div className="card" style={{ padding: 'var(--space-4)' }}>
              <h3 style={{ color: 'var(--text-primary)', fontSize: 'var(--text-base)', marginBottom: 'var(--space-2)' }}>Result</h3>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-2)' }}>
                <strong style={{ color: investigation.rootCause ? 'var(--red)' : 'var(--green, #22c55e)' }}>
                  {investigation.rootCause ? 'Problem:' : 'Status:'}
                </strong> {investigation.problem}
              </div>
              {investigation.rootCause && (
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                  <strong style={{ color: 'var(--yellow)' }}>Root Cause:</strong> {investigation.rootCause}
                </div>
              )}
            </div>
          )}

          {/* Suggestions */}
          {investigation.suggestions && investigation.suggestions.length > 0 && (
            <div className="card" style={{ padding: 'var(--space-4)' }}>
              <h3 style={{ color: 'var(--text-primary)', marginBottom: 'var(--space-3)', fontSize: 'var(--text-base)' }}>Suggestions</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {investigation.suggestions.map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2)', borderRadius: '6px', background: 'var(--bg-secondary)' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>{s.title}</div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>{s.description}</div>
                    </div>
                    <button className="settings-btn" style={{ fontSize: 'var(--text-xs)' }} onClick={() => handleSuggestionAction(s.actionType, s.actionRef)}>{s.actionType}</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Timeline */}
          {timeline.length > 0 && (
            <div className="card" style={{ padding: 'var(--space-4)' }}>
              <h3 style={{ color: 'var(--text-primary)', marginBottom: 'var(--space-3)', fontSize: 'var(--text-base)' }}>Change Timeline</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {timeline.map((r, i) => (
                  <div key={i} style={{ display: 'flex', gap: 'var(--space-3)', padding: 'var(--space-2)', borderLeft: '2px solid var(--accent)', paddingLeft: 'var(--space-3)' }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{r.timestamp}</div>
                    <div>
                      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
                        {r.changeType}: {r.kind}/{r.name}
                      </div>
                      {r.fieldDiffs && r.fieldDiffs.map((d, j) => (
                        <div key={j} style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                          {d.path}: {d.oldValue} → {d.newValue}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      </div>

      {/* Raw Data Modal */}
      {showRawData && investigation?.rawStatus && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
          }}
          onClick={() => setShowRawData(false)}
        >
          <div
            style={{
              background: 'var(--bg-primary)', border: '1px solid var(--border)',
              borderRadius: '8px', width: '700px', maxWidth: '90vw', maxHeight: '80vh',
              display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--border)',
            }}>
              <h3 style={{ color: 'var(--text-primary)', fontSize: 'var(--text-sm)', margin: 0 }}>
                Raw Resource Data — {investigation.resourceKind}/{investigation.resourceName}
              </h3>
              <button
                className="settings-btn"
                style={{ fontSize: 'var(--text-xs)', padding: '2px 8px' }}
                onClick={() => setShowRawData(false)}
              >
                Close
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: 'var(--space-3)' }}>
              <pre style={{
                fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)',
                whiteSpace: 'pre-wrap', margin: 0, padding: 'var(--space-3)',
                background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '6px',
              }}>
                {JSON.stringify(investigation.rawStatus, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
