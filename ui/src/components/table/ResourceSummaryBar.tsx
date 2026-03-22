import { cn } from '@/lib/utils'
import { StatusDot } from '@/components/cells/StatusDot'

export interface SummaryItem {
  label: string
  count: number
  status?: string
}

interface ResourceSummaryBarProps {
  title: string
  total: number
  namespace?: string
  items: SummaryItem[]
  className?: string
}

export function ResourceSummaryBar({
  title,
  total,
  namespace,
  items,
  className,
}: ResourceSummaryBarProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between px-6 py-4 border-b border-border',
        className
      )}
    >
      <div>
        <h1 className="text-lg font-semibold text-text-primary">{title}</h1>
        <p className="text-sm text-text-secondary">
          {total} {title.toLowerCase()}
          {namespace && ` in namespace "${namespace}"`}
        </p>
      </div>

      <div className="flex items-center gap-4">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            {item.status && <StatusDot status={item.status} />}
            <span
              className="text-sm font-medium text-text-primary"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {item.count}
            </span>
            <span className="text-sm text-text-tertiary">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
