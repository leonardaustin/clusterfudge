import type { BarColor } from '../../data/types'
import { MetricBar } from './MetricBar'

interface MetricCardProps {
  label: string
  value: string
  valueColor?: string
  valueStyle?: string
  sub: string
  bar?: { percent: number; color: BarColor }
  children?: React.ReactNode
}

export function MetricCard({ label, value, valueColor, valueStyle, sub, bar, children }: MetricCardProps) {
  const valueStyles: React.CSSProperties = {}
  if (valueColor) valueStyles.color = valueColor
  if (valueStyle) {
    const parsed = valueStyle.split(';').filter(Boolean)
    for (const rule of parsed) {
      const [prop, val] = rule.split(':').map(s => s.trim())
      if (prop && val) {
        const camelProp = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
        ;(valueStyles as Record<string, string>)[camelProp] = val
      }
    }
  }

  return (
    <div className="metric-card">
      <div className="metric-card-label">{label}</div>
      <div className="metric-card-value" style={valueStyles}>
        {children ?? value}
      </div>
      <div className="metric-card-sub">{sub}</div>
      {bar && <MetricBar percent={bar.percent} color={bar.color} />}
    </div>
  )
}
