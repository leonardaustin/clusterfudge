import { useState, useEffect, useCallback, useMemo } from 'react'
import { Toggle, RadioGroup, Slider, SettingRow, SectionHeader } from '@/components/settings'
import { ExportConfig, ImportConfig, ValidateFilePath } from '@/wailsjs/go/handlers/ConfigHandler'
import { CheckForUpdate } from '@/wailsjs/go/handlers/UpdateHandler'
import { GetVersion } from '@/wailsjs/go/main/App'
import { ListContextDetails, PreflightCheck, type PreflightResult } from '@/wailsjs/go/handlers/ClusterHandler'
import { useSettingsStore } from '@/stores/settingsStore'
import { useClusterStore, colorForName } from '@/stores/clusterStore'
import { useToastStore } from '@/stores/toastStore'
import { useUIStore } from '@/stores/uiStore'
import type { Theme } from '@/stores/uiStore'
import { SetupGuides } from '@/components/welcome/SetupGuides'
import { TroubleshootingGuide } from '@/components/welcome/TroubleshootingGuide'
import { AIProvidersSection } from '@/components/welcome/AIProvidersSection'
import { SponsorButton } from '@/components/welcome/SponsorButton'
import { AuthErrorHelp } from '@/components/welcome/AuthErrorHelp'
import { TimeoutErrorHelp } from '@/components/welcome/TimeoutErrorHelp'
import { cn } from '@/lib/utils'
import { CheckCircle2, XCircle, Loader2, AlertTriangle, Star, RefreshCw, ArrowRight } from 'lucide-react'

type SettingsSection = 'general' | 'appearance' | 'kubeconfig' | 'ai' | 'clusters' | 'setup-guides' | 'troubleshooting' | 'editor' | 'terminal' | 'shortcuts' | 'advanced' | 'about'

const NAV_ITEMS: { id: SettingsSection; label: string; group?: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'kubeconfig', label: 'Kubeconfig' },
  { id: 'ai', label: 'AI' },
  { id: 'editor', label: 'Editor' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'advanced', label: 'Advanced' },
  { id: 'about', label: 'About' },
  { id: 'clusters', label: 'Clusters', group: 'Connection' },
  { id: 'setup-guides', label: 'Setup Guides', group: 'Connection' },
  { id: 'troubleshooting', label: 'Troubleshooting', group: 'Connection' },
]

const ACCENT_PRESETS = [
  { label: 'Purple', color: '#7C3AED' },
  { label: 'Blue', color: '#2563EB' },
  { label: 'Green', color: '#059669' },
  { label: 'Orange', color: '#D97706' },
  { label: 'Red', color: '#DC2626' },
  { label: 'Pink', color: '#DB2777' },
]

const DEFAULT_SHORTCUTS = [
  { action: 'Command Palette', keys: 'Ctrl+Shift+P', category: 'General' },
  { action: 'Search', keys: 'Ctrl+F', category: 'General' },
  { action: 'Refresh', keys: 'Ctrl+R', category: 'General' },
  { action: 'Toggle Sidebar', keys: 'Ctrl+B', category: 'Navigation' },
  { action: 'Close Panel', keys: 'Escape', category: 'Navigation' },
  { action: 'Next Tab', keys: 'Ctrl+Tab', category: 'Navigation' },
  { action: 'Previous Tab', keys: 'Ctrl+Shift+Tab', category: 'Navigation' },
  { action: 'Delete Resource', keys: 'Ctrl+Backspace', category: 'Resources' },
  { action: 'Edit YAML', keys: 'Ctrl+E', category: 'Resources' },
  { action: 'Open Terminal', keys: 'Ctrl+`', category: 'Terminal' },
]

function GeneralSection({ version }: { version: string }) {
  const defaultNamespace = useSettingsStore((s) => s.defaultNamespace)
  const startupBehavior = useSettingsStore((s) => s.startupBehavior)
  const autoCheckUpdates = useSettingsStore((s) => s.autoCheckUpdates)
  const update = useSettingsStore((s) => s.update)
  const [checking, setChecking] = useState(false)

  const handleCheckUpdate = useCallback(async () => {
    setChecking(true)
    try {
      const info = await CheckForUpdate()
      console.log('[Settings] CheckForUpdate result:', JSON.stringify(info))
      if (info && info.version) {
        useToastStore.getState().addToast({
          type: 'info',
          title: 'Update available',
          description: `Version ${info.version} is available`,
        })
      } else {
        useToastStore.getState().addToast({
          type: 'success',
          title: 'Up to date',
          description: 'You are running the latest version',
        })
      }
    } catch (err) {
      console.error('[Settings] CheckForUpdate error:', err)
      useToastStore.getState().addToast({
        type: 'error',
        title: 'Update check failed',
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setChecking(false)
    }
  }, [])

  return (
    <div className="settings-section">
      <SectionHeader title="General" />
      <SettingRow label="Default namespace" description="Namespace selected when connecting to a new cluster" htmlFor="settings-default-ns">
        <input
          id="settings-default-ns"
          type="text"
          value={defaultNamespace}
          onChange={(e) => update('defaultNamespace', e.target.value)}
          className="settings-input"
          style={{ width: '180px' }}
        />
      </SettingRow>
      <SettingRow label="Startup behavior">
        <RadioGroup
          options={[
            { label: 'Last cluster', value: 'last_cluster' },
            { label: 'Welcome screen', value: 'welcome' },
          ]}
          value={startupBehavior}
          onChange={(v) => update('startupBehavior', v)}
        />
      </SettingRow>
      <SettingRow label="Check for updates automatically">
        <Toggle checked={autoCheckUpdates} onChange={(v) => update('autoCheckUpdates', v)} />
      </SettingRow>
      <SettingRow label="Beta features" description="Show experimental pages in the sidebar (security, operations, wizards, etc.)">
        <Toggle checked={useSettingsStore((s) => s.betaFeatures)} onChange={(v) => update('betaFeatures', v)} />
      </SettingRow>
      <SettingRow label="Current version" description={`Clusterfudge ${version}`}>
        <button className="settings-btn" onClick={handleCheckUpdate} disabled={checking}>
          {checking ? 'Checking…' : 'Check now'}
        </button>
      </SettingRow>
    </div>
  )
}

function AppearanceSection() {
  const theme = useSettingsStore((s) => s.theme)
  const accentColor = useSettingsStore((s) => s.accentColor)
  const fontSize = useSettingsStore((s) => s.fontSize)
  const update = useSettingsStore((s) => s.update)
  const setUITheme = useUIStore((s) => s.setTheme)

  const handleThemeChange = useCallback((v: string) => {
    update('theme', v)
    if (v === 'dark' || v === 'light' || v === 'monokai' || v === 'solarized') {
      setUITheme(v as Theme)
    }
  }, [update, setUITheme])

  return (
    <div className="settings-section">
      <SectionHeader title="Appearance" />
      <SettingRow label="Theme">
        <RadioGroup
          options={[
            { label: 'Dark', value: 'dark' },
            { label: 'Light', value: 'light' },
            { label: 'Monokai', value: 'monokai' },
            { label: 'Solarized', value: 'solarized' },
            { label: 'System', value: 'system' },
          ]}
          value={theme}
          onChange={handleThemeChange}
        />
      </SettingRow>
      <SettingRow label="Accent color">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {ACCENT_PRESETS.map((preset) => (
            <button
              key={preset.color}
              aria-label={preset.label}
              className={`settings-color-swatch${accentColor === preset.color ? ' active' : ''}`}
              style={{ backgroundColor: preset.color }}
              onClick={() => update('accentColor', preset.color)}
            />
          ))}
        </div>
      </SettingRow>
      <SettingRow label="Font size">
        <Slider value={fontSize} min={12} max={18} unit="px" onChange={(v) => update('fontSize', v)} />
      </SettingRow>
    </div>
  )
}

function KubeconfigPathInput({ value, onChange, onRemove, index }: {
  value: string
  onChange: (val: string) => void
  onRemove: () => void
  index: number
}) {
  const [error, setError] = useState<string | null>(null)
  const [validating, setValidating] = useState(false)
  const [validated, setValidated] = useState(false)

  useEffect(() => {
    setValidated(false)
    if (!value) { setError('Path is empty'); setValidated(true); return }
    const timer = setTimeout(async () => {
      setValidating(true)
      try {
        const err = await ValidateFilePath(value)
        setError(err || null)
        setValidated(true)
      } catch {
        setError('Validation failed')
        setValidated(true)
      } finally {
        setValidating(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [value])

  const isValid = validated && !error
  const isInvalid = validated && !!error

  return (
    <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
      <div style={{ position: 'relative', flex: 1 }}>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="settings-input"
          aria-label={`Kubeconfig path ${index + 1}`}
          style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', paddingRight: '28px' }}
        />
        <div style={{
          position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
          display: 'flex', alignItems: 'center',
        }}>
          {validating ? (
            <Loader2 className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)', animation: 'spin 1s linear infinite' }} />
          ) : isValid ? (
            <span title="File found">
              <CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--green, #22c55e)' }} />
            </span>
          ) : isInvalid ? (
            <span title={error ?? 'Invalid path'}>
              <XCircle className="w-3.5 h-3.5" style={{ color: 'var(--red, #ef4444)' }} />
            </span>
          ) : null}
        </div>
      </div>
      <button className="settings-btn-icon" aria-label="Remove path" onClick={onRemove}>✕</button>
    </div>
  )
}

function KubeconfigSection() {
  const kubeconfigPaths = useSettingsStore((s) => s.kubeconfigPaths)
  const autoReloadKubeconfig = useSettingsStore((s) => s.autoReloadKubeconfig)
  const update = useSettingsStore((s) => s.update)

  const addPath = () => update('kubeconfigPaths', [...kubeconfigPaths, ''])
  const removePath = (i: number) => update('kubeconfigPaths', kubeconfigPaths.filter((_: string, idx: number) => idx !== i))
  const updatePath = (i: number, val: string) => {
    const next = [...kubeconfigPaths]
    next[i] = val
    update('kubeconfigPaths', next)
  }

  return (
    <div className="settings-section">
      <SectionHeader title="Kubeconfig" description="Paths to kubeconfig files. Tilde (~) is expanded to your home directory." />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>File paths</span>
        {kubeconfigPaths.map((p: string, i: number) => (
          <KubeconfigPathInput
            key={i}
            value={p}
            onChange={(val) => updatePath(i, val)}
            onRemove={() => removePath(i)}
            index={i}
          />
        ))}
      </div>
      <button className="settings-btn" style={{ marginBottom: 'var(--space-4)' }} onClick={addPath}>+ Add path</button>
      <SettingRow label="Auto-reload on file change" description="Re-scan kubeconfig files when they change on disk">
        <Toggle checked={autoReloadKubeconfig} onChange={(v) => update('autoReloadKubeconfig', v)} />
      </SettingRow>
    </div>
  )
}

function EditorSection() {
  const editorTabSize = useSettingsStore((s) => s.editorTabSize)
  const editorWordWrap = useSettingsStore((s) => s.editorWordWrap)
  const editorMinimap = useSettingsStore((s) => s.editorMinimap)
  const editorFontSize = useSettingsStore((s) => s.editorFontSize)
  const update = useSettingsStore((s) => s.update)

  return (
    <div className="settings-section">
      <SectionHeader title="Editor" description="Monaco editor settings for YAML editing" />
      <SettingRow label="Tab size">
        <RadioGroup
          options={[
            { label: '2 spaces', value: '2' },
            { label: '4 spaces', value: '4' },
          ]}
          value={String(editorTabSize)}
          onChange={(v) => update('editorTabSize', Number(v))}
        />
      </SettingRow>
      <SettingRow label="Word wrap">
        <Toggle checked={editorWordWrap} onChange={(v) => update('editorWordWrap', v)} />
      </SettingRow>
      <SettingRow label="Minimap">
        <Toggle checked={editorMinimap} onChange={(v) => update('editorMinimap', v)} />
      </SettingRow>
      <SettingRow label="Font size">
        <Slider value={editorFontSize} min={10} max={20} unit="px" onChange={(v) => update('editorFontSize', v)} />
      </SettingRow>
    </div>
  )
}

function TerminalSection() {
  const terminalFontSize = useSettingsStore((s) => s.terminalFontSize)
  const terminalCursorStyle = useSettingsStore((s) => s.terminalCursorStyle)
  const terminalCursorBlink = useSettingsStore((s) => s.terminalCursorBlink)
  const terminalShell = useSettingsStore((s) => s.terminalShell)
  const terminalCopyOnSelect = useSettingsStore((s) => s.terminalCopyOnSelect)
  const update = useSettingsStore((s) => s.update)

  return (
    <div className="settings-section">
      <SectionHeader title="Terminal" />
      <SettingRow label="Font size">
        <Slider value={terminalFontSize} min={10} max={20} unit="px" onChange={(v) => update('terminalFontSize', v)} />
      </SettingRow>
      <SettingRow label="Cursor style">
        <RadioGroup
          options={[
            { label: 'Block', value: 'block' },
            { label: 'Bar', value: 'bar' },
            { label: 'Underline', value: 'underline' },
          ]}
          value={terminalCursorStyle}
          onChange={(v) => update('terminalCursorStyle', v)}
        />
      </SettingRow>
      <SettingRow label="Cursor blink">
        <Toggle checked={terminalCursorBlink} onChange={(v) => update('terminalCursorBlink', v)} />
      </SettingRow>
      <SettingRow label="Shell command" description="Leave empty to auto-detect" htmlFor="settings-shell">
        <input
          id="settings-shell"
          type="text"
          value={terminalShell}
          onChange={(e) => update('terminalShell', e.target.value)}
          placeholder="/bin/zsh"
          className="settings-input"
          style={{ width: '180px' }}
        />
      </SettingRow>
      <SettingRow label="Copy on select">
        <Toggle checked={terminalCopyOnSelect} onChange={(v) => update('terminalCopyOnSelect', v)} />
      </SettingRow>
    </div>
  )
}

function ShortcutsSection() {
  return (
    <div className="settings-section">
      <SectionHeader title="Keyboard Shortcuts" />
      <table className="settings-shortcut-table">
        <thead>
          <tr>
            <th scope="col">Action</th>
            <th scope="col">Keys</th>
            <th scope="col">Category</th>
          </tr>
        </thead>
        <tbody>
          {DEFAULT_SHORTCUTS.map((s) => (
            <tr key={s.action}>
              <td>{s.action}</td>
              <td><kbd>{s.keys}</kbd></td>
              <td>{s.category}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function K8sTuningSection() {
  const k8sRequestTimeoutSec = useSettingsStore((s) => s.k8sRequestTimeoutSec)
  const k8sQps = useSettingsStore((s) => s.k8sQps)
  const k8sBurst = useSettingsStore((s) => s.k8sBurst)
  const update = useSettingsStore((s) => s.update)

  return (
    <>
      <SectionHeader title="Kubernetes Client Tuning" description="Changes require app restart to take effect." />
      <SettingRow label="Request timeout (seconds)" description="Per-request timeout for API calls" htmlFor="settings-k8s-timeout">
        <input
          id="settings-k8s-timeout"
          type="number"
          value={k8sRequestTimeoutSec}
          min={1}
          max={300}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10)
            if (!isNaN(v) && v >= 1 && v <= 300) update('k8sRequestTimeoutSec', v)
          }}
          className="settings-input"
          style={{ width: '100px' }}
        />
      </SettingRow>
      <SettingRow label="Client QPS" description="Queries per second limit for the Kubernetes client" htmlFor="settings-k8s-qps">
        <input
          id="settings-k8s-qps"
          type="number"
          value={k8sQps}
          min={1}
          max={1000}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            if (!isNaN(v) && v >= 1 && v <= 1000) update('k8sQps', v)
          }}
          className="settings-input"
          style={{ width: '100px' }}
        />
      </SettingRow>
      <SettingRow label="Client burst" description="Burst limit for the Kubernetes client" htmlFor="settings-k8s-burst">
        <input
          id="settings-k8s-burst"
          type="number"
          value={k8sBurst}
          min={1}
          max={2000}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10)
            if (!isNaN(v) && v >= 1 && v <= 2000) update('k8sBurst', v)
          }}
          className="settings-input"
          style={{ width: '100px' }}
        />
      </SettingRow>
    </>
  )
}

function AdvancedSection() {
  const reset = useSettingsStore((s) => s.reset)

  const handleExport = async () => {
    let json: string
    try {
      json = await ExportConfig()
    } catch (err) {
      useToastStore.getState().addToast({ type: 'error', title: 'Export failed', description: err instanceof Error ? err.message : String(err) })
      return
    }
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'clusterfudge-settings.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      const text = await file.text()
      try {
        await ImportConfig(text)
        // Reload store so UI reflects imported values
        useSettingsStore.getState().load()
        useToastStore.getState().addToast({ type: 'success', title: 'Settings imported successfully' })
      } catch (err) {
        useToastStore.getState().addToast({ type: 'error', title: 'Import failed', description: err instanceof Error ? err.message : String(err) })
      }
    }
    input.click()
  }

  return (
    <div className="settings-section">
      <SectionHeader title="Advanced" />
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', marginBottom: 'var(--space-6)' }}>
        <button className="settings-btn" onClick={handleExport}>Export settings</button>
        <button className="settings-btn" onClick={handleImport}>Import settings</button>
        <button className="settings-btn danger" onClick={reset}>Reset all settings</button>
      </div>
      <K8sTuningSection />
    </div>
  )
}

function SettingsClustersSection() {
  const { clusters, setClusters, connectCluster, activeCluster } = useClusterStore()
  const clusterFavorites = useSettingsStore((s) => s.clusterFavorites)
  const updateSetting = useSettingsStore((s) => s.update)
  const [preflightResults, setPreflightResults] = useState<Record<string, PreflightResult>>({})
  const [preflightRunning, setPreflightRunning] = useState(false)
  const [connecting, setConnecting] = useState<string | null>(null)

  const toggleFavorite = useCallback((name: string) => {
    const current = useSettingsStore.getState().clusterFavorites
    const isFav = current.includes(name)
    const next = isFav ? current.filter((n) => n !== name) : [...current, name]
    updateSetting('clusterFavorites', next)
  }, [updateSetting])

  const sortedClusters = useMemo(() => {
    const favSet = new Set(clusterFavorites)
    return [...clusters].sort((a, b) => {
      const aFav = favSet.has(a.name)
      const bFav = favSet.has(b.name)
      if (aFav && !bFav) return -1
      if (!aFav && bFav) return 1
      return a.name.localeCompare(b.name)
    })
  }, [clusters, clusterFavorites])

  const favSet = new Set(clusterFavorites)
  const favCount = sortedClusters.filter((c) => favSet.has(c.name)).length

  const runPreflight = useCallback(async (names: string[]) => {
    setPreflightRunning(true)
    const results: Record<string, PreflightResult> = {}
    await Promise.all(names.map(async (name) => {
      try {
        const r = await PreflightCheck(name)
        if (r) results[name] = r
      } catch (err) {
        results[name] = { context: name, reachable: false, authenticated: false, error: err instanceof Error ? err.message : String(err) }
      }
    }))
    setPreflightResults(results)
    setPreflightRunning(false)
  }, [])

  const loadClusters = useCallback(() => {
    ListContextDetails().then((contexts) => {
      if (!contexts || contexts.length === 0) { setClusters([]); return }
      const infos = contexts.map((ctx) => ({
        name: ctx.name, server: ctx.server, status: 'disconnected' as const,
        color: colorForName(ctx.name), contextName: ctx.name, authProvider: ctx.authProvider,
      }))
      setClusters(infos)
      runPreflight(contexts.map((c) => c.name))
    }).catch((err) => {
      useToastStore.getState().addToast({ type: 'error', title: 'Failed to load kubeconfig', description: err instanceof Error ? err.message : String(err) })
    })
  }, [setClusters, runPreflight])

  useEffect(() => { loadClusters() }, [loadClusters])

  const handleConnect = async (name: string) => {
    setConnecting(name)
    try {
      await connectCluster(name)
      useToastStore.getState().addToast({ type: 'success', title: `Connected to ${name}` })
    } finally {
      setConnecting(null)
    }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="settings-section-title" style={{ marginBottom: 0 }}>Clusters</h2>
          {activeCluster && (
            <p className="settings-description">Connected to {activeCluster}</p>
          )}
        </div>
        <button className="settings-btn" onClick={() => clusters.length > 0 ? runPreflight(clusters.map(c => c.name)) : loadClusters()} disabled={preflightRunning}>
          <RefreshCw className={cn('w-3 h-3 mr-1.5 inline', preflightRunning && 'animate-spin')} />
          {preflightRunning ? 'Checking...' : 'Recheck'}
        </button>
      </div>

      {sortedClusters.length === 0 ? (
        <p className="text-sm text-text-secondary">No clusters found. Check your kubeconfig paths.</p>
      ) : (
        <>
          {favCount > 0 && (
            <p className="text-2xs font-semibold uppercase tracking-wider text-text-tertiary mb-2">Favorites</p>
          )}
          <div className="space-y-1.5">
            {sortedClusters.map((cluster, index) => {
              const pf = preflightResults[cluster.name]
              const isFav = favSet.has(cluster.name)
              const isActive = activeCluster === cluster.name
              const showOtherHeader = favCount > 0 && index === favCount

              return (
                <div key={cluster.name}>
                  {showOtherHeader && (
                    <p className="text-2xs font-semibold uppercase tracking-wider text-text-tertiary mb-2 mt-4">All Clusters</p>
                  )}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleConnect(cluster.name)}
                      disabled={connecting !== null || isActive}
                      className={cn(
                        'flex-1 flex items-center gap-3 px-4 py-3 rounded-lg border',
                        'hover:border-border-strong hover:bg-bg-hover transition-all text-left group',
                        isActive ? 'border-accent/40 bg-accent/5' : 'border-border',
                        connecting === cluster.name && 'opacity-70 cursor-wait',
                      )}
                    >
                      <div className="w-8 h-8 rounded-md shrink-0 flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: cluster.color }}>
                        {cluster.name[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-text-primary font-medium truncate">{cluster.name}</span>
                          {isActive && <span className="text-2xs text-accent font-medium">Connected</span>}
                          {pf && !preflightRunning && (
                            pf.authenticated
                              ? <CheckCircle2 className="w-3.5 h-3.5 text-status-running shrink-0" />
                              : <XCircle className="w-3.5 h-3.5 text-status-error shrink-0" />
                          )}
                          {preflightRunning && !pf && <Loader2 className="w-3.5 h-3.5 text-text-tertiary animate-spin shrink-0" />}
                        </div>
                        <div className="text-2xs text-text-tertiary truncate">
                          {cluster.server}
                          {pf?.serverVersion && <span className="ml-2 text-text-quaternary">v{pf.serverVersion.replace(/^v/, '')}</span>}
                        </div>
                      </div>
                      {connecting === cluster.name ? (
                        <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin shrink-0" />
                      ) : !isActive ? (
                        <ArrowRight className="w-4 h-4 text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      ) : null}
                    </button>
                    <button
                      onClick={() => toggleFavorite(cluster.name)}
                      className={cn('p-2 rounded-md transition-colors shrink-0', isFav ? 'text-amber-400 hover:text-amber-300' : 'text-text-quaternary hover:text-text-secondary')}
                      title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      <Star className={cn('w-4 h-4', isFav && 'fill-current')} />
                    </button>
                  </div>
                  {pf?.error && !preflightRunning && (
                    <div className="ml-11 mt-1">
                      <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-status-error/5 border border-status-error/20 text-2xs text-status-error">
                        <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                        <span>{pf.error}</span>
                      </div>
                      <AuthErrorHelp authProvider={pf.authProvider} errorCode={pf.errorCode} />
                      <TimeoutErrorHelp errorCode={pf.errorCode} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function AboutSection({ version }: { version: string }) {
  return (
    <div className="settings-section">
      <SectionHeader title="About" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
          <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5" />
          <line x1="12" y1="22" x2="12" y2="15.5" />
          <polyline points="22 8.5 12 15.5 2 8.5" />
        </svg>
        <div>
          <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--text-primary)' }}>Clusterfudge</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>{version}</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
        <span>A modern Kubernetes desktop client built with Go and React.</span>
      </div>

      <div style={{ marginTop: 'var(--space-6)', borderTop: '1px solid var(--border)', paddingTop: 'var(--space-5)' }}>
        <SectionHeader title="Support" />
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          <p style={{ margin: 0 }}>
            Clusterfudge is free and open source. If you find it useful and want to support
            the project, please feel free to sponsor (use your company card, they <em>probably</em> won&apos;t mind).
          </p>
          <div style={{ marginTop: 'var(--space-4)' }}>
            <SponsorButton />
          </div>
          <div style={{ margin: 'var(--space-4) 0 0 0', transform: 'rotate(-2deg)', transformOrigin: 'left center', display: 'inline-block' }}>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>Cheers,</span>
            <br />
            <span style={{ fontFamily: "'Meddon', cursive", fontSize: '1.75rem', color: 'var(--text-secondary)' }}>Lenny</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export function Settings() {
  const [section, setSection] = useState<SettingsSection>('general')
  const [version, setVersion] = useState('dev')

  useEffect(() => {
    GetVersion().then(setVersion).catch((err) => console.warn('[Settings] Failed to fetch version:', err))
  }, [])

  const sectionComponents: Record<SettingsSection, () => React.ReactNode> = {
    general: () => <GeneralSection version={version} />,
    appearance: () => <AppearanceSection />,
    kubeconfig: () => <KubeconfigSection />,
    editor: () => <EditorSection />,
    terminal: () => <TerminalSection />,
    shortcuts: () => <ShortcutsSection />,
    advanced: () => <AdvancedSection />,
    about: () => <AboutSection version={version} />,
    ai: () => <AIProvidersSection />,
    clusters: () => <SettingsClustersSection />,
    'setup-guides': () => (
      <div style={{ maxWidth: 640 }}>
        <h2 className="settings-section-title">Setup Guides</h2>
        <p className="settings-description" style={{ marginBottom: 'var(--space-4)' }}>
          Step-by-step instructions for connecting to common Kubernetes providers.
        </p>
        <SetupGuides />
      </div>
    ),
    troubleshooting: () => <TroubleshootingGuide />,
  }

  // Split nav items into main settings and connection sections
  const mainItems = NAV_ITEMS.filter((i) => !i.group)
  const connectionItems = NAV_ITEMS.filter((i) => i.group === 'Connection')

  return (
    <div className="resource-view">
      <div className="resource-header">
        <div>
          <h1>Settings</h1>
          <div className="subtitle">Application preferences</div>
        </div>
      </div>
      <div className="settings-layout">
        <nav className="settings-nav">
          {mainItems.map((item) => (
            <button
              key={item.id}
              className={`settings-nav-item${section === item.id ? ' active' : ''}`}
              onClick={() => setSection(item.id)}
            >
              {item.label}
            </button>
          ))}
          <div style={{ borderTop: '1px solid var(--border)', margin: 'var(--space-2) 0' }} />
          <div style={{ padding: '4px var(--space-4)', fontSize: 'var(--text-2xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-quaternary)' }}>
            Connection
          </div>
          {connectionItems.map((item) => (
            <button
              key={item.id}
              className={`settings-nav-item${section === item.id ? ' active' : ''}`}
              onClick={() => setSection(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="settings-content">
          {sectionComponents[section]()}
        </div>
      </div>
    </div>
  )
}
