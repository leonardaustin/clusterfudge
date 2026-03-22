import { useState } from 'react'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface LabelChipsProps {
  labels: Record<string, string>
  /** Max labels to show before collapsing */
  maxVisible?: number
  className?: string
}

export function LabelChips({
  labels,
  maxVisible = 3,
  className,
}: LabelChipsProps) {
  const [expanded, setExpanded] = useState(false)
  const entries = Object.entries(labels)

  if (entries.length === 0) {
    return <span className="text-text-tertiary text-xs">—</span>
  }

  const visible = expanded ? entries : entries.slice(0, maxVisible)
  const hiddenCount = entries.length - maxVisible

  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {visible.map(([key, value]) => (
        <span
          key={key}
          className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] bg-bg-tertiary text-text-secondary border border-border max-w-[200px] truncate"
          title={`${key}=${value}`}
        >
          <span className="font-medium text-text-primary truncate">{key}</span>
          <span className="text-text-tertiary mx-0.5">=</span>
          <span className="truncate">{value}</span>
        </span>
      ))}
      {hiddenCount > 0 && !expanded && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            setExpanded(true)
          }}
          className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[11px] text-accent hover:text-accent/80 hover:bg-bg-hover"
        >
          +{hiddenCount} more
          <ChevronRight className="w-3 h-3" />
        </button>
      )}
      {expanded && entries.length > maxVisible && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            setExpanded(false)
          }}
          className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[11px] text-accent hover:text-accent/80 hover:bg-bg-hover"
        >
          less
          <ChevronDown className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}
