import { cn } from '@/lib/utils'

interface TableSkeletonProps {
  columns?: number
  rows?: number
  className?: string
}

export function TableSkeleton({
  columns = 6,
  rows = 10,
  className,
}: TableSkeletonProps) {
  const widths = [120, 200, 100, 80, 160, 80, 60, 100]

  return (
    <div className={cn('flex-1 animate-pulse', className)}>
      {/* Header skeleton */}
      <div className="flex items-center gap-4 px-4 h-8 border-b border-border">
        {Array.from({ length: columns }).map((_, i) => (
          <div
            key={i}
            className="h-3 rounded bg-bg-hover"
            style={{ width: widths[i % widths.length] * 0.6 }}
          />
        ))}
      </div>

      {/* Row skeletons */}
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 px-4 h-9"
        >
          {Array.from({ length: columns }).map((_, j) => (
            <div
              key={j}
              className="h-3 rounded bg-bg-hover"
              style={{
                width:
                  widths[j % widths.length] +
                  ((i * 13 + j * 29) % 40) -
                  20,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
