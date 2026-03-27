import type { ReactNode } from 'react'
import type { NodeHexGroup, HexPod } from '../../data/types'
import { HexGrid } from './HexGrid'

interface HexGroupProps {
  group: NodeHexGroup
  wrapPod?: (pod: HexPod, children: ReactNode) => ReactNode
}

export function HexGroup({ group, wrapPod }: HexGroupProps) {
  return (
    <div className="hex-group">
      <div className="hex-group-title">
        <span className="status-dot running" />
        {group.name}
        <span className="count">
          ({group.podCount} pods &middot; {group.role} &middot; CPU {group.cpuPercent}%)
        </span>
      </div>
      <HexGrid rows={group.rows} wrapPod={wrapPod} />
    </div>
  )
}
