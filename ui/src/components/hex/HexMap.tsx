import type { ReactNode } from 'react'
import type { NodeHexGroup, HexPod } from '../../data/types'
import { HexGroup } from './HexGroup'

interface HexMapProps {
  groups: NodeHexGroup[]
  wrapPod?: (pod: HexPod, children: ReactNode) => ReactNode
}

export function HexMap({ groups, wrapPod }: HexMapProps) {
  return (
    <div className="hex-map">
      {groups.map((group) => (
        <HexGroup key={group.name} group={group} wrapPod={wrapPod} />
      ))}
    </div>
  )
}
