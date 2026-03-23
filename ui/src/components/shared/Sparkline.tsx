interface SparklineProps {
  /** Array of numeric values to plot */
  data: number[]
  /** Width of the SVG in pixels */
  width?: number
  /** Height of the SVG in pixels */
  height?: number
  /** Stroke color for the line */
  color?: string
  /** Label for accessibility */
  label?: string
}

/**
 * A simple SVG sparkline with a polyline and gradient fill.
 * Renders at ~120x30px by default.
 */
export function Sparkline({
  data,
  width = 120,
  height = 30,
  color = 'var(--blue)',
  label = 'sparkline',
}: SparklineProps) {
  if (data.length === 0) {
    return (
      <svg width={width} height={height} role="img" aria-label={label}>
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="var(--border-subtle)"
          strokeWidth={1}
          strokeDasharray="4 2"
        />
      </svg>
    )
  }

  const padding = 1
  const max = Math.max(...data, 0.001) // avoid division by zero
  const min = 0

  const points = data.map((value, i) => {
    const x = data.length === 1
      ? width / 2
      : padding + (i / (data.length - 1)) * (width - 2 * padding)
    const y = padding + (1 - (value - min) / (max - min)) * (height - 2 * padding)
    return `${x},${y}`
  })

  const polylinePoints = points.join(' ')

  // Build polygon for gradient fill: line points + bottom-right + bottom-left
  const fillPoints = `${polylinePoints} ${width - padding},${height - padding} ${padding},${height - padding}`

  const gradientId = `sparkline-grad-${label.replace(/\s+/g, '-')}`

  return (
    <svg width={width} height={height} role="img" aria-label={label}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <polygon
        points={fillPoints}
        fill={`url(#${gradientId})`}
      />
      <polyline
        points={polylinePoints}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
