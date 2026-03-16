import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Server, ArrowRight, AlertTriangle, X, CheckCircle2, XCircle, Loader2, Star, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useClusterStore, colorForName } from '@/stores/clusterStore'
import type { ClusterInfo } from '@/stores/clusterStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useToastStore } from '@/stores/toastStore'
import { ListContextDetails, PreflightCheck, type PreflightResult } from '@/wailsjs/go/handlers/ClusterHandler'
import { EventsOn } from '@/wailsjs/runtime/runtime'
import { SetupGuides } from '@/components/welcome/SetupGuides'
import { AuthErrorHelp } from '@/components/welcome/AuthErrorHelp'
import { TimeoutErrorHelp } from '@/components/welcome/TimeoutErrorHelp'
import { Toggle } from '@/components/settings'
import { TroubleshootingGuide } from '@/components/welcome/TroubleshootingGuide'
import { AIProvidersSection } from '@/components/welcome/AIProvidersSection'
import { TrafficLights } from '@/components/topbar/TrafficLights'
import { useOS } from '@/hooks/useOS'

type WelcomeSection = 'clusters' | 'kubeconfig' | 'ai' | 'help' | 'troubleshooting'

const NAV_ITEMS: { id: WelcomeSection; label: string }[] = [
  { id: 'clusters', label: 'Clusters' },
  { id: 'kubeconfig', label: 'Kubeconfig' },
  { id: 'ai', label: 'AI' },
  { id: 'help', label: 'Setup Guides' },
  { id: 'troubleshooting', label: 'Troubleshooting' },
]

// ---------------------------------------------------------------------------
// Clusters section
// ---------------------------------------------------------------------------

interface ClustersSectionProps {
  clusters: ClusterInfo[]
  favSet: Set<string>
  favCount: number
  preflightResults: Record<string, PreflightResult>
  preflightRunning: boolean
  connecting: string | null
  connectionError: string | null
  onConnect: (name: string) => void
  onToggleFavorite: (name: string) => void
  onRefresh: () => void
  onGoToKubeconfig: () => void
  onDismissError: () => void
}

function ClustersSection({
  clusters,
  favSet,
  favCount,
  preflightResults,
  preflightRunning,
  connecting,
  connectionError,
  onConnect,
  onToggleFavorite,
  onRefresh,
  onGoToKubeconfig,
  onDismissError,
}: ClustersSectionProps) {
  if (clusters.length === 0) {
    return (
      <div style={{ maxWidth: 640 }}>
        <div className="py-12 text-center">
          <Server className="w-12 h-12 text-text-quaternary mx-auto mb-4" />
          <h2 className="text-lg font-medium text-text-primary mb-2">No clusters found</h2>
          <p className="text-sm text-text-secondary mb-6">
            Check your kubeconfig paths or set up a new cluster connection.
          </p>
          <button className="settings-btn" onClick={onGoToKubeconfig}>
            Configure Kubeconfig
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 720 }}>
      {/* Connection error banner */}
      {connectionError && (
        <div className="flex items-center gap-2 px-4 py-3 mb-4 rounded-lg border border-status-error/30 bg-status-error/10 text-status-error text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{connectionError}</span>
          <button onClick={onDismissError} className="shrink-0 hover:opacity-70">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h2 className="settings-section-title" style={{ marginBottom: 0 }}>
          Available Clusters
        </h2>
        <button
          className="settings-btn"
          onClick={onRefresh}
          disabled={preflightRunning}
        >
          <RefreshCw className={cn('w-3 h-3 mr-1.5 inline', preflightRunning && 'animate-spin')} />
          {preflightRunning ? 'Checking...' : 'Recheck'}
        </button>
      </div>

      {favCount > 0 && (
        <p className="text-2xs font-semibold uppercase tracking-wider text-text-tertiary mb-2">
          Favorites
        </p>
      )}

      <div className="space-y-1.5">
        {clusters.map((cluster, index) => {
          const pf = preflightResults[cluster.name]
          const isFav = favSet.has(cluster.name)
          const showOtherHeader = favCount > 0 && index === favCount

          return (
            <div key={cluster.name}>
              {showOtherHeader && (
                <p className="text-2xs font-semibold uppercase tracking-wider text-text-tertiary mb-2 mt-4">
                  All Clusters
                </p>
              )}

              <div className="flex items-center gap-1">
                <button
                  onClick={() => onConnect(cluster.name)}
                  disabled={connecting !== null}
                  className={cn(
                    'flex-1 flex items-center gap-3 px-4 py-3 rounded-lg border border-border',
                    'hover:border-border-strong hover:bg-bg-hover transition-all',
                    'text-left group',
                    connecting === cluster.name && 'opacity-70 cursor-wait'
                  )}
                >
                  <div
                    className="w-8 h-8 rounded-md shrink-0 flex items-center justify-center text-white text-sm font-bold"
                    style={{ backgroundColor: cluster.color }}
                  >
                    {cluster.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-text-primary font-medium truncate">
                        {cluster.name}
                      </span>
                      {pf && !preflightRunning && (
                        pf.authenticated ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-status-running shrink-0" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-status-error shrink-0" />
                        )
                      )}
                      {preflightRunning && !pf && (
                        <Loader2 className="w-3.5 h-3.5 text-text-tertiary animate-spin shrink-0" />
                      )}
                    </div>
                    <div className="text-2xs text-text-tertiary truncate">
                      {cluster.server}
                      {pf?.serverVersion && (
                        <span className="ml-2 text-text-quaternary">v{pf.serverVersion.replace(/^v/, '')}</span>
                      )}
                    </div>
                  </div>
                  {connecting === cluster.name ? (
                    <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin shrink-0" />
                  ) : (
                    <ArrowRight className="w-4 h-4 text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  )}
                </button>
                <button
                  onClick={() => onToggleFavorite(cluster.name)}
                  className={cn(
                    'p-2 rounded-md transition-colors shrink-0',
                    isFav
                      ? 'text-amber-400 hover:text-amber-300'
                      : 'text-text-quaternary hover:text-text-secondary'
                  )}
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
    </div>
  )
}

// ---------------------------------------------------------------------------
// Kubeconfig section
// ---------------------------------------------------------------------------

interface KubeconfigSectionProps {
  paths: string[]
  autoReload: boolean
  onAddPath: () => void
  onRemovePath: (i: number) => void
  onUpdatePath: (i: number, val: string) => void
  onToggleAutoReload: (v: boolean) => void
  onReload: () => void
}

function KubeconfigSection({
  paths,
  autoReload,
  onAddPath,
  onRemovePath,
  onUpdatePath,
  onToggleAutoReload,
  onReload,
}: KubeconfigSectionProps) {
  return (
    <div className="settings-section">
      <h2 className="settings-section-title">Kubeconfig</h2>
      <p className="settings-description" style={{ marginBottom: 'var(--space-4)' }}>
        Paths to kubeconfig files. Tilde (~) is expanded to your home directory.
        After changing paths, click Reload to re-discover clusters.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
        {paths.map((p: string, i: number) => (
          <div key={`${i}-${p}`} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
            <input
              type="text"
              value={p}
              onChange={(e) => onUpdatePath(i, e.target.value)}
              placeholder="~/.kube/config"
              className="settings-input"
              style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}
            />
            <button className="settings-btn-icon" aria-label="Remove path" onClick={() => onRemovePath(i)}>
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-6)' }}>
        <button className="settings-btn" onClick={onAddPath}>+ Add path</button>
        <button className="settings-btn" onClick={onReload}>
          <RefreshCw className="w-3 h-3 mr-1.5 inline" />
          Reload clusters
        </button>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-label">Auto-reload on file change</div>
          <div className="settings-description">Re-scan kubeconfig files when they change on disk</div>
        </div>
        <Toggle checked={autoReload} onChange={onToggleAutoReload} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Welcome component
// ---------------------------------------------------------------------------

export function Welcome() {
  const navigate = useNavigate()
  const isMac = useOS() === 'mac'
  const { clusters, setClusters, connectCluster, connectionError, setConnectionError } = useClusterStore()
  const [connecting, setConnecting] = useState<string | null>(null)
  const [preflightResults, setPreflightResults] = useState<Record<string, PreflightResult>>({})
  const [preflightRunning, setPreflightRunning] = useState(false)
  const [section, setSection] = useState<WelcomeSection>('clusters')

  // Cluster favorites
  const clusterFavorites = useSettingsStore((s) => s.clusterFavorites)
  const updateSetting = useSettingsStore((s) => s.update)

  // Kubeconfig settings
  const kubeconfigPaths = useSettingsStore((s) => s.kubeconfigPaths)
  const autoReloadKubeconfig = useSettingsStore((s) => s.autoReloadKubeconfig)

  const toggleFavorite = useCallback((clusterName: string) => {
    const current = useSettingsStore.getState().clusterFavorites
    const isFav = current.includes(clusterName)
    const next = isFav
      ? current.filter((n) => n !== clusterName)
      : [...current, clusterName]
    updateSetting('clusterFavorites', next)
  }, [updateSetting])

  // Sort clusters: favorites first, then alphabetical
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

  const favCount = useMemo(() => {
    const favSet = new Set(clusterFavorites)
    return sortedClusters.filter((c) => favSet.has(c.name)).length
  }, [sortedClusters, clusterFavorites])

  const runPreflight = useCallback(async (contextNames: string[]) => {
    setPreflightRunning(true)
    const results: Record<string, PreflightResult> = {}
    const checks = contextNames.map(async (name) => {
      try {
        const result = await PreflightCheck(name)
        if (result) results[name] = result
      } catch (err) {
        console.error(`[Welcome] Preflight check failed for ${name}:`, err)
        results[name] = {
          context: name,
          reachable: false,
          authenticated: false,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    })
    await Promise.all(checks)
    setPreflightResults(results)
    setPreflightRunning(false)
  }, [])

  const loadClusters = useCallback(() => {
    ListContextDetails().then((contexts) => {
      if (!contexts || contexts.length === 0) {
        setClusters([])
        return
      }
      const clusterInfos = contexts.map((ctx) => ({
        name: ctx.name,
        server: ctx.server,
        status: 'disconnected' as const,
        color: colorForName(ctx.name),
        contextName: ctx.name,
        authProvider: ctx.authProvider,
      }))
      setClusters(clusterInfos)
      runPreflight(contexts.map((c) => c.name))
    }).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err)
      useToastStore.getState().addToast({ type: 'error', title: 'Failed to load kubeconfig', description: msg })
    })
  }, [setClusters, runPreflight])

  useEffect(() => {
    loadClusters()
  }, [loadClusters])

  useEffect(() => {
    const cleanup = EventsOn('kubeconfig:changed', () => {
      loadClusters()
    })
    return cleanup
  }, [loadClusters])

  const handleConnect = async (clusterName: string) => {
    setConnecting(clusterName)
    try {
      await connectCluster(clusterName)
      const { activeCluster } = useClusterStore.getState()
      if (activeCluster) {
        navigate('/overview')
      }
    } finally {
      setConnecting(null)
    }
  }

  // Kubeconfig path management
  const addPath = () => updateSetting('kubeconfigPaths', [...kubeconfigPaths, ''])
  const removePath = (i: number) => updateSetting('kubeconfigPaths', kubeconfigPaths.filter((_: string, idx: number) => idx !== i))
  const updatePath = (i: number, val: string) => {
    const next = [...kubeconfigPaths]
    next[i] = val
    updateSetting('kubeconfigPaths', next)
  }

  const favSet = new Set(clusterFavorites)

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-bg-primary">
      {/* macOS title bar drag region with traffic lights */}
      {isMac && (
        <div
          className="h-7 w-full bg-bg-secondary border-b border-border flex-shrink-0 flex items-center"
          style={{ ['--wails-draggable' as string]: 'drag' }}
        >
          <TrafficLights />
        </div>
      )}

      {/* Header */}
      <div className="resource-header">
        <div className="flex items-center gap-3">
          <img src="/logo.svg" alt="KubeViewer" className="w-8 h-8" />
          <div>
            <h1>KubeViewer</h1>
            <div className="subtitle">
              {sortedClusters.length > 0
                ? `${sortedClusters.length} cluster${sortedClusters.length === 1 ? '' : 's'} discovered from kubeconfig`
                : 'Connect to a Kubernetes cluster to get started'}
            </div>
          </div>
        </div>
      </div>

      {/* Settings-style layout: sidebar nav + scrollable content */}
      <div className="settings-layout">
        <nav className="settings-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`settings-nav-item${section === item.id ? ' active' : ''}`}
              onClick={() => setSection(item.id)}
            >
              {item.label}
              {item.id === 'clusters' && sortedClusters.length > 0 && (
                <span className="ml-1.5 text-text-quaternary">{sortedClusters.length}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="settings-content">
          {section === 'clusters' && (
            <ClustersSection
              clusters={sortedClusters}
              favSet={favSet}
              favCount={favCount}
              preflightResults={preflightResults}
              preflightRunning={preflightRunning}
              connecting={connecting}
              connectionError={connectionError}
              onConnect={handleConnect}
              onToggleFavorite={toggleFavorite}
              onDismissError={() => setConnectionError(null)}
              onRefresh={() => {
                if (clusters.length > 0) {
                  runPreflight(clusters.map(c => c.name))
                } else {
                  loadClusters()
                }
              }}
              onGoToKubeconfig={() => setSection('kubeconfig')}
            />
          )}

          {section === 'kubeconfig' && (
            <KubeconfigSection
              paths={kubeconfigPaths}
              autoReload={autoReloadKubeconfig}
              onAddPath={addPath}
              onRemovePath={removePath}
              onUpdatePath={updatePath}
              onToggleAutoReload={(v) => updateSetting('autoReloadKubeconfig', v)}
              onReload={loadClusters}
            />
          )}

          {section === 'ai' && <AIProvidersSection />}

          {section === 'help' && (
            <div style={{ maxWidth: 640 }}>
              <h2 className="settings-section-title">Setup Guides</h2>
              <p className="settings-description" style={{ marginBottom: 'var(--space-4)' }}>
                Step-by-step instructions for connecting to common Kubernetes providers.
              </p>
              <SetupGuides />
            </div>
          )}

          {section === 'troubleshooting' && <TroubleshootingGuide />}
        </div>
      </div>
    </div>
  )
}
