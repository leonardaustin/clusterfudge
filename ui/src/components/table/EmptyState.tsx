import { Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  title?: string
  message?: string
  icon?: React.ReactNode
  action?: React.ReactNode
  className?: string
}

export function EmptyState({
  title = 'No resources found',
  message,
  icon,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex-1 flex flex-col items-center justify-center gap-3 py-16 text-center',
        className
      )}
    >
      <div className="text-text-tertiary">
        {icon ?? <Inbox className="w-10 h-10 mx-auto" />}
      </div>
      <h3 className="text-sm font-medium text-text-primary">{title}</h3>
      {message && (
        <p className="text-sm text-text-tertiary max-w-sm">{message}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
