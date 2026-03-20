import { useState, useEffect } from 'react'
import { Newspaper } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { BrowserOpenURL } from '@/wailsjs/runtime/runtime'

interface GitHubRelease {
  id: number
  tag_name: string
  name: string
  html_url: string
  published_at: string
  body: string | null
}

function relativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffSec = Math.floor((now - then) / 1000)

  if (diffSec < 60) return 'just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 30) return `${diffDay}d ago`
  const diffMonth = Math.floor(diffDay / 30)
  if (diffMonth < 12) return `${diffMonth}mo ago`
  return `${Math.floor(diffMonth / 12)}y ago`
}

function truncate(text: string, max: number): string {
  const cleaned = text.replace(/\r\n/g, ' ').replace(/\n/g, ' ').trim()
  if (cleaned.length <= max) return cleaned
  return cleaned.slice(0, max).trimEnd() + '...'
}

export function NewsFeed() {
  const [releases, setReleases] = useState<GitHubRelease[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    fetch(
      'https://api.github.com/repos/leonardaustin/clusterfudge/releases?per_page=5',
      { signal: controller.signal }
    )
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<GitHubRelease[]>
      })
      .then((data) => {
        setReleases(data)
        setLoading(false)
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setError(true)
          setLoading(false)
        }
      })

    return () => controller.abort()
  }, [])

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Newspaper className="w-4 h-4 text-text-tertiary" />
        <span className="text-2xs font-semibold uppercase tracking-wider text-text-tertiary">
          What's New
        </span>
      </div>

      {loading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-12 rounded-md bg-bg-tertiary animate-pulse"
            />
          ))}
        </div>
      )}

      {!loading && (error || releases.length === 0) && (
        <p className="text-2xs text-text-quaternary py-2">
          No news yet — check back after the first release!
        </p>
      )}

      {!loading && !error && releases.length > 0 && (
        <div className="space-y-1.5">
          {releases.map((release, i) => (
            <motion.button
              key={release.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.25 }}
              onClick={() => BrowserOpenURL(release.html_url)}
              className={cn(
                'w-full text-left px-3 py-2 rounded-md',
                'bg-bg-secondary hover:bg-bg-tertiary transition-colors',
                'border border-border',
                'cursor-pointer'
              )}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <span className="inline-block px-1.5 py-0.5 rounded text-2xs font-mono font-medium bg-bg-tertiary text-text-secondary leading-none">
                  {release.tag_name}
                </span>
                <span className="text-2xs text-text-quaternary">
                  {relativeTime(release.published_at)}
                </span>
              </div>
              {release.body && (
                <p className="text-2xs text-text-tertiary leading-relaxed">
                  {truncate(release.body, 100)}
                </p>
              )}
            </motion.button>
          ))}
        </div>
      )}
    </div>
  )
}
