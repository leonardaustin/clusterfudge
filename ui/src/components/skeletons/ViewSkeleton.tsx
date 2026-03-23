import { cn } from '@/lib/utils'

export function ViewSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-md bg-bg-hover" />
        <div className="flex flex-col gap-1.5">
          <div className="w-48 h-5 rounded bg-bg-hover" />
          <div className="w-32 h-3 rounded bg-bg-hover" />
        </div>
      </div>

      {/* Filter bar skeleton */}
      <div className="flex items-center gap-2">
        <div className="w-64 h-8 rounded-md bg-bg-hover" />
        <div className="w-32 h-8 rounded-md bg-bg-hover" />
        <div className="flex-1" />
        <div className="w-24 h-8 rounded-md bg-bg-hover" />
      </div>

      {/* Table skeleton */}
      <div className="flex flex-col gap-0.5">
        {/* Header */}
        <div className="flex items-center gap-4 px-4 py-2">
          {[120, 200, 100, 80, 160, 80].map((w, i) => (
            <div key={i} className="h-3 rounded bg-bg-hover" style={{ width: w }} />
          ))}
        </div>

        {/* Rows */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'flex items-center gap-4 px-4 py-3 rounded-md',
              i % 2 === 0 ? 'bg-bg-secondary/50' : ''
            )}
          >
            {[120, 200, 100, 80, 160, 80].map((w, j) => (
              <div
                key={j}
                className="h-3 rounded bg-bg-hover"
                style={{ width: w + ((i * 7 + j * 13) % 40) - 20 }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
