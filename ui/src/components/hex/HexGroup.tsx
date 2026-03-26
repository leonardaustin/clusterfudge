import type { NodeHexGroup, HexPod } from '../../data/types'
import { HexGrid } from './HexGrid'

interface HexGroupProps {
  group: NodeHexGroup
  onContextMenu: (e: React.MouseEvent, pod: HexPod) => void
}

export function HexGroup({ group, onContextMenu }: HexGroupProps) {
  return (
    <div className="hex-group">
      <div className="hex-group-title">
        <span className="status-dot running" />
        {group.name}
        <span className="count">
          ({group.podCount} pods &middot; {group.role} &middot; CPU {group.cpuPercent}%)
        </span>
      </div>
      <HexGrid rows={group.rows} onContextMenu={onContextMenu} />
    </div>
  )
}
