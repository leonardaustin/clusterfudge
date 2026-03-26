import type { NodeHexGroup, HexPod } from '../../data/types'
import { HexGroup } from './HexGroup'

interface HexMapProps {
  groups: NodeHexGroup[]
  onContextMenu: (e: React.MouseEvent, pod: HexPod) => void
}

export function HexMap({ groups, onContextMenu }: HexMapProps) {
  return (
    <div className="hex-map">
      {groups.map((group) => (
        <HexGroup key={group.name} group={group} onContextMenu={onContextMenu} />
      ))}
    </div>
  )
}
