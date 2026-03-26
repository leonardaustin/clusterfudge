import { AlertTriangle, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ErrorStateProps {
  title?: string
  message: string
  onRetry?: () => void
  className?: string
}

export function ErrorState({
  title = 'Failed to load resources',
  message,
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        'flex-1 flex flex-col items-center justify-center gap-3 py-16 text-center',
        className
      )}
    >
      <AlertTriangle className="w-10 h-10 text-status-error" />
      <h3 className="text-sm font-medium text-text-primary">{title}</h3>
      <p className="text-sm text-text-tertiary max-w-sm">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-accent hover:text-accent/80 border border-accent/30 rounded-md hover:bg-accent/5 transition-colors mt-2"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry
        </button>
      )}
    </div>
  )
}
