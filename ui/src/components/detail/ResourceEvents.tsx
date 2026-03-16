import { useEffect, useState, useCallback } from 'react'
import { AlertCircle, AlertTriangle, Info, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatRelative } from '@/components/cells/RelativeTime'
import {
  ListEvents,
  type EventInfo,
} from '@/wailsjs/go/handlers/ResourceHandler'

const EVENTS_POLL_INTERVAL_MS = 10_000

const RESOURCE_KIND_MAP: Record<string, string> = {
  pods: 'Pod',
  deployments: 'Deployment',
  services: 'Service',
  nodes: 'Node',
  replicasets: 'ReplicaSet',
  daemonsets: 'DaemonSet',
  statefulsets: 'StatefulSet',
  jobs: 'Job',
  cronjobs: 'CronJob',
}

interface ResourceEventsProps {
  name: string
  namespace: string | undefined
  resourceType: string
}

export function ResourceEvents({
  name,
  namespace,
  resourceType,
}: ResourceEventsProps) {
  const [events, setEvents] = useState<EventInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const kind = RESOURCE_KIND_MAP[resourceType] ?? resourceType

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await ListEvents(namespace ?? '', 100)
      const filtered = result.filter(
        (e) => e.objectKind === kind && e.objectName === name
      )
      setEvents(filtered)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [namespace, kind, name])

  useEffect(() => {
    fetchEvents()
    const interval = setInterval(fetchEvents, EVENTS_POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [fetchEvents])

  if (error) {
    return (
      <div className="flex items-center justify-center h-32 gap-2 text-status-error text-sm">
        <AlertCircle className="w-4 h-4" />
        <span>{error}</span>
      </div>
    )
  }

  if (events.length === 0 && !loading) {
    return (
      <div className="flex items-center justify-center h-32 gap-2 text-text-tertiary text-sm">
        <AlertCircle className="w-4 h-4" />
        <span>No events found</span>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-text-tertiary">
          {events.length} event{events.length !== 1 ? 's' : ''}
        </span>
        <div className="flex-1" />
        <button
          onClick={fetchEvents}
          disabled={loading}
          className="p-1 text-text-tertiary hover:text-text-secondary rounded transition-colors"
          title="Refresh events"
        >
          <RefreshCw
            className={cn('w-3.5 h-3.5', loading && 'animate-spin')}
          />
        </button>
      </div>

      {events.map((event, i) => (
        <div
          key={`${event.reason}-${event.lastTimestamp}-${i}`}
          className="flex items-start gap-2 py-1.5 border-b border-border/50 text-xs"
        >
          <span
            className={cn(
              'shrink-0 mt-0.5',
              event.type === 'Warning' ? 'text-yellow-400' : 'text-sky-400'
            )}
          >
            {event.type === 'Warning' ? (
              <AlertTriangle className="w-3.5 h-3.5" />
            ) : (
              <Info className="w-3.5 h-3.5" />
            )}
          </span>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-text-secondary font-medium">
                {event.reason}
              </span>
              {event.count > 1 && (
                <span className="text-2xs bg-bg-tertiary text-text-secondary px-1.5 py-0.5 rounded-full tabular-nums">
                  {event.count}x
                </span>
              )}
              <span className="text-text-tertiary ml-auto shrink-0 tabular-nums">
                {formatRelative(event.lastTimestamp)}
              </span>
            </div>
            <p className="text-text-primary mt-0.5">{event.message}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
