import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

export function NotFound() {
  const navigate = useNavigate()

  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center max-w-sm">
        <div className="flex items-center justify-center mb-4">
          <div className="w-16 h-16 rounded-full bg-bg-hover flex items-center justify-center">
            <Search className="w-8 h-8 text-text-tertiary" />
          </div>
        </div>

        <h1 className="text-lg font-semibold text-text-primary mb-1">Page Not Found</h1>
        <p className="text-sm text-text-secondary mb-6">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>

        <button
          onClick={() => navigate('/overview')}
          className={cn(
            'inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm',
            'bg-accent text-white hover:bg-accent-hover transition-colors'
          )}
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Overview
        </button>
      </div>
    </div>
  )
}
