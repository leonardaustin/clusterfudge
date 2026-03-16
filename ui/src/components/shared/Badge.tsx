import type { BadgeColor } from '../../data/types'

interface BadgeProps {
  color: BadgeColor
  children: React.ReactNode
}

export function Badge({ color, children }: BadgeProps) {
  return <span className={`badge badge-${color}`}>{children}</span>
}
