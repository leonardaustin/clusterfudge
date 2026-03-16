import { useState, useEffect } from 'react'
import { Download, X, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SkipVersion } from '../../wailsjs/go/handlers/UpdateHandler'
import { EventsOn } from '@/wailsjs/runtime/runtime'

interface UpdateInfo {
  version: string
  releaseUrl: string
  assetUrl: string
  size: number
  releaseNotes: string
  publishedAt: string
}

export function UpdateBanner() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const unsubAvailable = EventsOn('update:available', (...args: unknown[]) => {
      setUpdate(args[0] as UpdateInfo)
    })

    return () => {
      unsubAvailable()
    }
  }, [])

  if (!update || dismissed) return null

  const handleSkip = () => {
    SkipVersion(update.version)
    setDismissed(true)
  }

  return (
    <div
      role="alert"
      className={cn(
        'flex items-center gap-3 px-4 py-2 text-xs border-b',
        'bg-status-info/10 border-status-info/30 text-status-info'
      )}
    >
      <Download className="w-3.5 h-3.5 shrink-0" />
      <span className="font-medium">
        KubeViewer {update.version} is available
      </span>

      <a
        href={update.releaseUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-accent text-white rounded text-xs font-medium hover:bg-accent/80 transition-colors"
      >
        <ExternalLink className="w-3 h-3" />
        View release
      </a>
      <button
        onClick={() => setDismissed(true)}
        className="text-xs opacity-60 hover:opacity-100 transition-opacity"
      >
        Later
      </button>
      <button
        onClick={handleSkip}
        className="text-xs opacity-60 hover:opacity-100 transition-opacity"
      >
        Skip
      </button>

      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss update banner"
        className="ml-auto shrink-0 p-0.5 rounded hover:bg-black/10 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
