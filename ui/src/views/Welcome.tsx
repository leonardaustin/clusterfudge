import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Server, ArrowRight, AlertTriangle, X, CheckCircle2, XCircle,
  Loader2, Star, RefreshCw, Bot, BookOpen, Newspaper, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useClusterStore, colorForName } from '@/stores/clusterStore'
import type { ClusterInfo } from '@/stores/clusterStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useToastStore } from '@/stores/toastStore'
import { ListContextDetails, PreflightCheck, SetKubeconfigPaths, type PreflightResult } from '@/wailsjs/go/handlers/ClusterHandler'
import { ValidateFilePath } from '@/wailsjs/go/handlers/ConfigHandler'
import { EventsOn } from '@/wailsjs/runtime/runtime'
import { SetupGuides } from '@/components/welcome/SetupGuides'
import { AuthErrorHelp } from '@/components/welcome/AuthErrorHelp'
import { TimeoutErrorHelp } from '@/components/welcome/TimeoutErrorHelp'
import { Toggle } from '@/components/settings'
import { TroubleshootingGuide } from '@/components/welcome/TroubleshootingGuide'
import { AIProvidersSection } from '@/components/welcome/AIProvidersSection'
import { NewsFeed } from '@/components/welcome/NewsFeed'
import { SponsorButton } from '@/components/welcome/SponsorButton'
import { TrafficLights } from '@/components/topbar/TrafficLights'
import { ToastContainer } from '@/components/notifications/ToastContainer'
import { useOS } from '@/hooks/useOS'

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

type WelcomeTab = 'clusters' | 'ai' | 'news' | 'help'

const TABS: { id: WelcomeTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'clusters', label: 'Clusters', icon: Server },
  { id: 'ai', label: 'AI Assistants', icon: Bot },
  { id: 'news', label: 'News', icon: Newspaper },
  { id: 'help', label: 'Help', icon: BookOpen },
]

// ---------------------------------------------------------------------------
// Slide animation
// ---------------------------------------------------------------------------

const slideVariants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 300 : -300,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (dir: number) => ({
    x: dir > 0 ? -300 : 300,
    opacity: 0,
  }),
}

const slideTransition = {
  x: { type: 'spring' as const, stiffness: 400, damping: 35 },
  opacity: { duration: 0.2 },
}

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
  onDismissError,
}: ClustersSectionProps) {
  if (clusters.length === 0) {
    return (
      <div className="py-10 text-center">
        <img
          src="/logo.svg"
          alt=""
          className="w-20 h-20 mx-auto mb-5"
          style={{ filter: 'drop-shadow(0 0 32px rgba(50, 108, 229, 0.3)) grayscale(0.3) opacity(0.6)' }}
        />
        <h2 className="text-lg font-semibold text-text-primary mb-2">No clusters found</h2>
        <p className="text-sm text-text-secondary max-w-xs mx-auto leading-relaxed">
          Check your kubeconfig paths in the right panel, or follow a setup guide on the Help tab.
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Connection error banner */}
      <AnimatePresence>
        {connectionError && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2 px-4 py-3 mb-4 rounded-lg border border-status-error/30 bg-status-error/10 text-status-error text-sm"
          >
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="flex-1">{connectionError}</span>
            <button onClick={onDismissError} className="shrink-0 hover:opacity-70">
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
        <div>
          <h2 className="settings-section-title">Available Clusters</h2>
          <p className="settings-description" style={{ marginBottom: 'var(--space-4)' }}>
            Clusters discovered from your kubeconfig files.
            Click a cluster to run preflight checks and connect.
          </p>
        </div>
        <button
          className="settings-btn"
          onClick={onRefresh}
          disabled={preflightRunning}
          style={{ marginTop: 2, flexShrink: 0 }}
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

      <div className="space-y-2 relative">
        {/* Bouncing arrow callout */}
        {connecting === null && (
          <motion.div
            className="absolute flex items-center gap-1.5 pointer-events-none"
            style={{
              right: 'calc(100% + 8px)',
              top: 16,
              whiteSpace: 'nowrap',
            }}
            initial={{ opacity: 0, x: 8 }}
            animate={{
              opacity: [0, 1, 1],
              x: [8, 0, 0],
            }}
            transition={{ duration: 0.5, delay: 0.8 }}
          >
            <span className="text-2xs font-medium text-accent">Pick a cluster</span>
            <motion.div
              animate={{ x: [0, 4, 0] }}
              transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
            >
              <ChevronRight className="w-3.5 h-3.5 text-accent" />
            </motion.div>
          </motion.div>
        )}
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

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => onConnect(cluster.name)}
                  disabled={connecting !== null}
                  className={cn(
                    'welcome-cluster-card group',
                    connecting === cluster.name && 'connecting'
                  )}
                  style={{ borderLeftColor: cluster.color }}
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

// ---------------------------------------------------------------------------
// Kubeconfig path input with validation
// ---------------------------------------------------------------------------

function KubeconfigPathInput({
  value,
  onChange,
  onRemove,
}: {
  value: string
  onChange: (val: string) => void
  onRemove: () => void
}) {
  const [validationError, setValidationError] = useState<string | null>(null)
  const [validating, setValidating] = useState(false)
  const [validated, setValidated] = useState(false)

  useEffect(() => {
    setValidated(false)
    if (!value) {
      setValidationError('Path is empty')
      setValidated(true)
      return
    }
    const timer = setTimeout(async () => {
      setValidating(true)
      try {
        const err = await ValidateFilePath(value)
        setValidationError(err || null)
        setValidated(true)
      } catch {
        setValidationError('Validation failed')
        setValidated(true)
      } finally {
        setValidating(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [value])

  const isValid = validated && !validationError
  const isInvalid = validated && !!validationError

  return (
    <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
      <div style={{ position: 'relative', flex: 1 }}>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="~/.kube/config"
          className="settings-input"
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
          ) : isInvalid && value ? (
            <span title={validationError ?? 'Invalid path'}>
              <XCircle className="w-3.5 h-3.5" style={{ color: 'var(--red, #ef4444)' }} />
            </span>
          ) : null}
        </div>
      </div>
      <button className="settings-btn-icon" aria-label="Remove path" onClick={onRemove}>
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}

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
          <KubeconfigPathInput
            key={i}
            value={p}
            onChange={(val) => onUpdatePath(i, val)}
            onRemove={() => onRemovePath(i)}
          />
        ))}
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-6)' }}>
        <button className="settings-btn" onClick={onAddPath}>+ Add path</button>
        <button
          className="settings-btn"
          onClick={onReload}
          style={{ background: '#059669', color: '#fff', borderColor: '#059669' }}
        >
          <RefreshCw className="w-3 h-3 mr-1.5 inline" />
          Save Path and Reload Clusters
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

  // Tab state
  const [tab, setTab] = useState<WelcomeTab>('clusters')
  const dirRef = useRef(0)

  const switchTab = (newTab: WelcomeTab) => {
    const oldIdx = TABS.findIndex((t) => t.id === tab)
    const newIdx = TABS.findIndex((t) => t.id === newTab)
    dirRef.current = newIdx > oldIdx ? 1 : -1
    setTab(newTab)
  }

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

  const loadClusters = useCallback(async () => {
    try {
      // Sync kubeconfig paths to the Go backend before listing contexts
      const paths = useSettingsStore.getState().kubeconfigPaths
      await SetKubeconfigPaths(paths)

      const contexts = await ListContextDetails()
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
    } catch (err) {
      setClusters([])
      setPreflightResults({})
      const msg = err instanceof Error ? err.message : String(err)
      useToastStore.getState().addToast({ type: 'error', title: 'Failed to load kubeconfig', description: msg })
    }
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
      {/* macOS title bar drag region */}
      {isMac && (
        <div
          className="h-7 w-full bg-bg-secondary border-b border-border flex-shrink-0 flex items-center"
          style={{ ['--wails-draggable' as string]: 'drag' }}
        >
          <TrafficLights />
        </div>
      )}

      {/* ── Hero ────────────────────────────────────────────── */}
      <motion.div
        className="welcome-hero"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        <motion.img
          src="/logo.svg"
          alt="Clusterfudge"
          className="welcome-logo"
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
        />
        <motion.h1
          className="welcome-title"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <span>Clusterfudge</span>
        </motion.h1>
        <motion.p
          className="welcome-subtitle"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          {sortedClusters.length > 0
            ? `${sortedClusters.length} cluster${sortedClusters.length === 1 ? '' : 's'} discovered — select one to connect`
            : 'Connect to a Kubernetes cluster to get started'}
        </motion.p>
        <motion.div
          className="mt-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <SponsorButton />
        </motion.div>
      </motion.div>

      {/* ── Horizontal tabs ─────────────────────────────────── */}
      <div className="welcome-tabs-bar">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={cn('welcome-tab', tab === t.id && 'active')}
            onClick={() => switchTab(t.id)}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
            {t.id === 'clusters' && sortedClusters.length > 0 && (
              <span className="welcome-tab-badge">{sortedClusters.length}</span>
            )}
            {tab === t.id && (
              <motion.div className="welcome-tab-indicator" layoutId="tab-indicator" />
            )}
          </button>
        ))}
      </div>

      {/* ── Tab content with slide transition ───────────────── */}
      <div className="welcome-tab-content">
        <AnimatePresence mode="wait" custom={dirRef.current}>
          <motion.div
            key={tab}
            custom={dirRef.current}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={slideTransition}
            className="welcome-tab-panel"
          >
            {tab === 'clusters' && (
              <div className="welcome-columns">
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
                      runPreflight(clusters.map((c) => c.name))
                    } else {
                      loadClusters()
                    }
                  }}

                />
                <KubeconfigSection
                  paths={kubeconfigPaths}
                  autoReload={autoReloadKubeconfig}
                  onAddPath={addPath}
                  onRemovePath={removePath}
                  onUpdatePath={updatePath}
                  onToggleAutoReload={(v) => updateSetting('autoReloadKubeconfig', v)}
                  onReload={loadClusters}
                />
              </div>
            )}

            {tab === 'ai' && (
              <div className="welcome-narrow">
                <AIProvidersSection />
              </div>
            )}

            {tab === 'news' && (
              <div className="welcome-narrow">
                <NewsFeed />
              </div>
            )}

            {tab === 'help' && (
              <div className="welcome-columns">
                <div>
                  <h2 className="settings-section-title">Setup Guides</h2>
                  <p className="settings-description" style={{ marginBottom: 'var(--space-4)' }}>
                    Step-by-step instructions for connecting to common Kubernetes providers.
                  </p>
                  <SetupGuides />
                </div>
                <div>
                  <TroubleshootingGuide />
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      <ToastContainer />
    </div>
  )
}
