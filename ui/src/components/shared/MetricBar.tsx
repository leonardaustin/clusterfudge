import type { BarColor } from '../../data/types'

interface MetricBarProps {
  percent: number
  color: BarColor
}

export function MetricBar({ percent, color }: MetricBarProps) {
  return (
    <div className="metric-bar">
      <div className={`metric-bar-fill ${color}`} style={{ width: `${percent}%` }} />
    </div>
  )
}
