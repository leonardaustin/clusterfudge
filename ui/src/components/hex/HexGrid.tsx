import type { HexPod } from '../../data/types'
import { Hex } from './Hex'

interface HexGridProps {
  rows: HexPod[][]
  onContextMenu: (e: React.MouseEvent, pod: HexPod) => void
}

export function HexGrid({ rows, onContextMenu }: HexGridProps) {
  return (
    <div className="hex-grid">
      {rows.map((row, i) => (
        <div key={i} className={`hex-row${i % 2 === 1 ? ' offset' : ''}`}>
          {row.map((pod) => (
            <Hex key={pod.name} pod={pod} onContextMenu={onContextMenu} />
          ))}
        </div>
      ))}
    </div>
  )
}
