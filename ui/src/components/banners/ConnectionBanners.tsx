import { useState, useEffect } from 'react'
import { AlertTriangle, X, RefreshCw, ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useClusterStore } from '@/stores/clusterStore'
import { InlineAuthHelp } from '@/components/welcome/AuthErrorHelp'

interface BannerProps {
  variant: 'warning' | 'error' | 'info' | 'success'
  icon?: React.ReactNode
  message: React.ReactNode
  action?: React.ReactNode
  dismissable?: boolean
  onDismiss?: () => void
}

function Banner({ variant, icon, message, action, dismissable, onDismiss }: BannerProps) {
  const styles = {
    warning: 'bg-status-pending/10 border-status-pending/30 text-status-pending',
    error: 'bg-status-error/10 border-status-error/30 text-status-error',
    info: 'bg-status-info/10 border-status-info/30 text-status-info',
    success: 'bg-status-running/10 border-status-running/30 text-status-running',
  }

  return (
    <div className={cn('flex items-center gap-3 px-4 py-2 text-xs border-b', styles[variant])}>
      {icon && <div className="shrink-0">{icon}</div>}
      <div className="flex-1">{message}</div>
      {action && <div className="shrink-0">{action}</div>}
      {dismissable && onDismiss && (
        <button
          onClick={onDismiss}
          className="shrink-0 p-0.5 rounded hover:bg-black/10 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_INTERVAL = 10; // seconds

function ConnectionLostBanner() {
  const { clusters, activeCluster, connectCluster } = useClusterStore()
  const current = clusters.find((c) => c.name === activeCluster)
  const [countdown, setCountdown] = useState(BASE_INTERVAL)
  const [attempt, setAttempt] = useState(0)
  const isDisconnected = current?.status === 'disconnected' || current?.status === 'error'
  const isReconnecting = current?.status === 'connecting'
  // Reset attempt counter when connection is restored.
  useEffect(() => {
    if (!isDisconnected) {
      Promise.resolve().then(() => setAttempt(0))
    }
  }, [isDisconnected])

  useEffect(() => {
    if (!isDisconnected) return;
    if (attempt >= MAX_RECONNECT_ATTEMPTS) return;
    // Exponential backoff: 10s, 20s, 40s, 80s, 160s
    const delay = BASE_INTERVAL * Math.pow(2, attempt)

    // Countdown for display only (pure updater, no side-effects)
    Promise.resolve().then(() => setCountdown(delay))
    const interval = setInterval(() => {
      setCountdown((n) => (n <= 1 ? 0 : n - 1))
    }, 1000)

    // Reconnect after the full delay — runs outside React's render phase
    const timeout = setTimeout(() => {
      if (activeCluster) {
        connectCluster(activeCluster)
        setAttempt((a) => a + 1)
      }
    }, delay * 1000)

    return () => { clearInterval(interval); clearTimeout(timeout) }
  }, [isDisconnected, activeCluster, connectCluster, attempt])

  if (!isDisconnected && !isReconnecting) return null

  return (
    <Banner
      variant="warning"
      icon={
        isReconnecting ? (
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <AlertTriangle className="w-3.5 h-3.5" />
        )
      }
      message={
        isReconnecting
          ? `Reconnecting to ${activeCluster}...`
          : attempt >= MAX_RECONNECT_ATTEMPTS
            ? (<>
                Connection lost to {activeCluster}. Auto-reconnect stopped after {MAX_RECONNECT_ATTEMPTS} attempts.
                <InlineAuthHelp authProvider={current?.authProvider} />
              </>)
            : `Connection lost to ${activeCluster}. Retrying in ${countdown}s (attempt ${attempt + 1}/${MAX_RECONNECT_ATTEMPTS}).`
      }
      action={
        activeCluster && !isReconnecting ? (
          <button
            onClick={() => connectCluster(activeCluster)}
            className="underline underline-offset-2 hover:no-underline transition-all"
          >
            Reconnect now
          </button>
        ) : null
      }
    />
  )
}

function RBACWarningBanner({ missingPermissions }: { missingPermissions: string[] }) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed || missingPermissions.length === 0) return null

  return (
    <Banner
      variant="warning"
      icon={<AlertTriangle className="w-3.5 h-3.5" />}
      message={
        <>
          Missing permissions:{' '}
          <span className="font-mono">{missingPermissions.slice(0, 3).join(', ')}</span>
          {missingPermissions.length > 3 && ` +${missingPermissions.length - 3} more`}. Some
          features may be unavailable.
        </>
      }
      dismissable
      onDismiss={() => setDismissed(true)}
    />
  )
}

function UpdateBanner({ version, onInstall }: { version: string; onInstall: () => void }) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  return (
    <Banner
      variant="info"
      icon={<ArrowUp className="w-3.5 h-3.5" />}
      message={`Clusterfudge ${version} is available.`}
      action={
        <button
          onClick={onInstall}
          className="underline underline-offset-2 hover:no-underline transition-all"
        >
          Install update
        </button>
      }
      dismissable
      onDismiss={() => setDismissed(true)}
    />
  )
}

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <Banner
      variant="error"
      icon={<AlertTriangle className="w-3.5 h-3.5" />}
      message={message}
      dismissable
      onDismiss={onDismiss}
    />
  )
}

interface ConnectionBannersProps {
  rbacMissingPermissions?: string[]
  updateVersion?: string
  onInstallUpdate?: () => void
  errors?: Array<{ id: string; message: string }>
  onDismissError?: (id: string) => void
}

export function ConnectionBanners({
  rbacMissingPermissions = [],
  updateVersion,
  onInstallUpdate,
  errors = [],
  onDismissError,
}: ConnectionBannersProps) {
  const { connectionError, setConnectionError } = useClusterStore()

  return (
    <div className="flex flex-col">
      <ConnectionLostBanner />
      {connectionError && (
        <ErrorBanner message={connectionError} onDismiss={() => setConnectionError(null)} />
      )}
      <RBACWarningBanner missingPermissions={rbacMissingPermissions} />
      {updateVersion && onInstallUpdate && (
        <UpdateBanner version={updateVersion} onInstall={onInstallUpdate} />
      )}
      {errors.map((err) => (
        <ErrorBanner
          key={err.id}
          message={err.message}
          onDismiss={() => onDismissError?.(err.id)}
        />
      ))}
    </div>
  )
}
