import { formatDistanceToNowStrict } from 'date-fns'
import { useMemo } from 'react'

interface RelativeTimeProps {
  /** ISO timestamp or age string (e.g. "3d", "2h") */
  value: string
  className?: string
}

/**
 * Renders a compact relative time like "3d", "2h", "45m", "12s".
 * Accepts either an ISO date string or a pre-formatted age string.
 */
export function RelativeTime({ value, className }: RelativeTimeProps) {
  const display = useMemo(() => formatRelative(value), [value])

  return (
    <span
      className={className}
      style={{ fontVariantNumeric: 'tabular-nums' }}
      title={value}
    >
      {display}
    </span>
  )
}

export function formatRelative(value: string): string {
  // If already formatted (e.g. "3d", "2h", "45m", "12s"), return as-is
  if (/^\d+[dhms]$/.test(value.trim())) {
    return value.trim()
  }

  // Try parsing as ISO date
  const date = new Date(value)
  if (isNaN(date.getTime())) {
    return value
  }

  const distance = formatDistanceToNowStrict(date, { addSuffix: false })

  // Compact format: "3 days" -> "3d", "2 hours" -> "2h"
  return distance
    .replace(/ seconds?/, 's')
    .replace(/ minutes?/, 'm')
    .replace(/ hours?/, 'h')
    .replace(/ days?/, 'd')
    .replace(/ months?/, 'mo')
    .replace(/ years?/, 'y')
}
