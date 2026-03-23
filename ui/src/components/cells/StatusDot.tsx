import {
  Circle,
  CheckCircle,
  XCircle,
  HelpCircle,
  CircleDot,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export type StatusType =
  | 'running'
  | 'ready'
  | 'succeeded'
  | 'complete'
  | 'active'
  | 'bound'
  | 'deployed'
  | 'available'
  | 'pending'
  | 'progressing'
  | 'scaling'
  | 'suspended'
  | 'pending-upgrade'
  | 'failed'
  | 'error'
  | 'crashloopbackoff'
  | 'lost'
  | 'released'
  | 'terminating'
  | 'terminated'
  | 'unknown'
  | 'warning'
  | 'limited'

const STATUS_CONFIG: Record<
  string,
  { icon: typeof Circle; colorClass: string; pulse?: boolean }
> = {
  running: { icon: Circle, colorClass: 'text-status-running fill-status-running' },
  ready: { icon: Circle, colorClass: 'text-status-running fill-status-running' },
  succeeded: { icon: CheckCircle, colorClass: 'text-status-running' },
  complete: { icon: CheckCircle, colorClass: 'text-status-running' },
  active: { icon: Circle, colorClass: 'text-status-running fill-status-running' },
  bound: { icon: Circle, colorClass: 'text-status-running fill-status-running' },
  deployed: { icon: CheckCircle, colorClass: 'text-status-running' },
  available: { icon: Circle, colorClass: 'text-status-running fill-status-running' },
  pending: { icon: Circle, colorClass: 'text-status-pending' },
  progressing: { icon: CircleDot, colorClass: 'text-status-pending' },
  scaling: { icon: CircleDot, colorClass: 'text-status-pending' },
  suspended: { icon: Circle, colorClass: 'text-status-terminated' },
  'pending-upgrade': { icon: CircleDot, colorClass: 'text-status-pending' },
  failed: { icon: XCircle, colorClass: 'text-status-error' },
  error: { icon: XCircle, colorClass: 'text-status-error' },
  crashloopbackoff: { icon: XCircle, colorClass: 'text-status-error', pulse: true },
  lost: { icon: XCircle, colorClass: 'text-status-error' },
  released: { icon: Circle, colorClass: 'text-status-terminated' },
  terminating: { icon: Loader2, colorClass: 'text-status-terminated' },
  terminated: { icon: Circle, colorClass: 'text-status-terminated' },
  unknown: { icon: HelpCircle, colorClass: 'text-status-terminated' },
  warning: { icon: Circle, colorClass: 'text-status-pending fill-status-pending' },
  limited: { icon: CircleDot, colorClass: 'text-status-pending' },
}

interface StatusDotProps {
  status: string
  className?: string
}

export function StatusDot({ status, className }: StatusDotProps) {
  const key = status.toLowerCase().replace(/\s+/g, '')
  const config = STATUS_CONFIG[key] ?? STATUS_CONFIG.unknown
  const Icon = config.icon
  return (
    <Icon
      className={cn(
        'w-3.5 h-3.5',
        config.colorClass,
        config.pulse && 'animate-pulse',
        className
      )}
    />
  )
}
