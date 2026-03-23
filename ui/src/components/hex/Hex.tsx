import { useState, useRef, useCallback, useLayoutEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { HexPod } from '../../data/types'

interface HexProps {
  pod: HexPod
  wrapPod?: (pod: HexPod, children: ReactNode) => ReactNode
}

export function Hex({ pod, wrapPod }: HexProps) {
  const hexRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null)
  const [style, setStyle] = useState<{ left: number; top: number } | null>(null)

  const showTooltip = useCallback(() => {
    if (!hexRef.current) return
    const rect = hexRef.current.getBoundingClientRect()
    setAnchor({ x: rect.left + rect.width / 2, y: rect.top })
  }, [])

  const hideTooltip = useCallback(() => {
    setAnchor(null)
    setStyle(null)
  }, [])

  // After portal renders, measure it and position with rounded pixels
  useLayoutEffect(() => {
    if (!anchor || !tooltipRef.current) return
    const tt = tooltipRef.current.getBoundingClientRect()
    setStyle({
      left: Math.round(anchor.x - tt.width / 2),
      top: Math.round(anchor.y - tt.height - 6),
    })
  }, [anchor])

  const hexEl = (
    <div
      ref={hexRef}
      className="hex"
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
    >
      <svg viewBox="0 0 44 50">
        <polygon
          className="hex-fill"
          points="22,0 44,13 44,37 22,50 0,37 0,13"
          fill={pod.fill}
          opacity="0.85"
        />
      </svg>
      {anchor && createPortal(
        <div
          ref={tooltipRef}
          className="hex-tooltip-portal"
          style={style
            ? { left: style.left, top: style.top, opacity: 1 }
            : { left: anchor.x, top: anchor.y, opacity: 0 }
          }
        >
          <div className="hex-tooltip-name">{pod.name}</div>
          <div className="hex-tooltip-detail">
            {pod.namespace} &middot; {pod.status} &middot; {pod.containers}
          </div>
          <div className="hex-tooltip-metric">
            CPU: {pod.cpuPercent}% &middot; {pod.memoryDisplay}
          </div>
        </div>,
        document.body
      )}
    </div>
  )

  return wrapPod ? <>{wrapPod(pod, hexEl)}</> : hexEl
}
