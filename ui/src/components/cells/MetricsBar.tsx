import { cn } from '@/lib/utils'

interface MetricsBarProps {
  percent: number
  label?: string
  className?: string
}

function getBarColor(percent: number): string {
  if (percent >= 90) return 'bg-status-error'
  if (percent >= 70) return 'bg-status-pending'
  return 'bg-status-running'
}

export function MetricsBar({ percent, label, className }: MetricsBarProps) {
  const clamped = Math.max(0, Math.min(100, percent))

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex-1 h-1.5 bg-bg-tertiary rounded-full overflow-hidden min-w-[40px]">
        <div
          className={cn('h-full rounded-full transition-all', getBarColor(clamped))}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span
        className="text-xs text-text-secondary whitespace-nowrap"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {label ?? `${Math.round(clamped)}%`}
      </span>
    </div>
  )
}
