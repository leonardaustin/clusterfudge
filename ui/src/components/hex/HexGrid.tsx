import type { ReactNode } from 'react'
import type { HexPod } from '../../data/types'
import { Hex } from './Hex'

interface HexGridProps {
  rows: HexPod[][]
  wrapPod?: (pod: HexPod, children: ReactNode) => ReactNode
}

export function HexGrid({ rows, wrapPod }: HexGridProps) {
  return (
    <div className="hex-grid">
      {rows.map((row, i) => (
        <div key={i} className={`hex-row${i % 2 === 1 ? ' offset' : ''}`}>
          {row.map((pod) => (
            <Hex key={pod.name} pod={pod} wrapPod={wrapPod} />
          ))}
        </div>
      ))}
    </div>
  )
}
