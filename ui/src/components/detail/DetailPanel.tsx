import { useEffect, useCallback, useRef } from 'react'
import { useUIStore } from '@/stores/uiStore'

const MIN_WIDTH = 320
const MAX_WIDTH = 900

interface DetailPanelProps {
  title: string
  subtitle: string
  onClose: () => void
  children: React.ReactNode
}

export function DetailPanel({ title, subtitle, onClose, children }: DetailPanelProps) {
  const { detailPanelWidth, setDetailPanelWidth } = useUIStore()
  const dragging = useRef(false)
  const lastX = useRef(0)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    lastX.current = e.clientX
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const dx = lastX.current - e.clientX
      lastX.current = e.clientX
      setDetailPanelWidth((prev: number) =>
        Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, prev + dx))
      )
    }
    const onMouseUp = () => {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [setDetailPanelWidth])

  return (
    <div className="detail-panel" style={{ width: detailPanelWidth, minWidth: MIN_WIDTH, maxWidth: MAX_WIDTH, position: 'relative' }}>
      {/* Resize handle (left edge) */}
      <div
        onMouseDown={onMouseDown}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          cursor: 'col-resize',
          zIndex: 10,
          transition: 'background-color 150ms 150ms',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--accent)'
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.backgroundColor = ''
        }}
      />
      <div className="detail-panel-header">
        <div>
          <div className="detail-panel-title">{title}</div>
          <div className="detail-panel-subtitle">{subtitle}</div>
        </div>
        <button className="detail-panel-close" title="Close" onClick={onClose}>
          &times;
        </button>
      </div>
      {children}
    </div>
  )
}
