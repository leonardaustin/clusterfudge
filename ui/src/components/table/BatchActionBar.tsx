import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface BatchAction {
  label: string
  icon?: React.ReactNode
  onClick: () => void
  variant?: 'default' | 'danger'
}

interface BatchActionBarProps {
  selectedCount: number
  actions: BatchAction[]
  onClear: () => void
  className?: string
}

export function BatchActionBar({
  selectedCount,
  actions,
  onClear,
  className,
}: BatchActionBarProps) {
  if (selectedCount === 0) return null

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-2 bg-accent/5 border-t border-accent/20',
        className
      )}
    >
      <span className="text-sm text-text-secondary">
        <span className="font-medium text-text-primary">{selectedCount}</span>
        {' '}selected
      </span>

      <div className="flex items-center gap-2 ml-2">
        {actions.map((action) => (
          <button
            key={action.label}
            onClick={action.onClick}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 text-sm rounded-md border transition-colors',
              action.variant === 'danger'
                ? 'border-status-error/30 text-status-error hover:bg-status-error/10'
                : 'border-border text-text-secondary hover:text-text-primary hover:bg-bg-hover'
            )}
          >
            {action.icon}
            {action.label}
          </button>
        ))}
      </div>

      <div className="flex-1" />

      <button
        onClick={onClear}
        className="text-text-tertiary hover:text-text-secondary"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
