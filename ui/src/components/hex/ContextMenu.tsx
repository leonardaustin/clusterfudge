import { useEffect } from 'react'
import type { HexPod } from '../../data/types'

interface ContextMenuProps {
  visible: boolean
  x: number
  y: number
  pod: HexPod | null
  onClose: () => void
  onAction?: (action: string, pod: HexPod) => void
}

export function ContextMenu({ visible, x, y, pod, onClose, onAction }: ContextMenuProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (visible) {
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [visible, onClose])

  if (!visible || !pod) return null

  const isRunning = pod.status === 'Running'
  const isCompleted = pod.status === 'Completed'

  const handleAction = (action: string) => {
    if (onAction && pod) {
      onAction(action, pod)
    }
    onClose()
  }

  return (
    <>
      <div className="ctx-backdrop open" onClick={onClose} />
      <div className="ctx-menu open" style={{ left: x, top: y }}>
        <div className="ctx-menu-header">
          <div className="ctx-menu-header-crumb">
            {pod.namespace} &rsaquo; Pod
          </div>
          <div className="ctx-menu-header-name">{pod.name}</div>
          <div className="ctx-menu-header-meta">
            {pod.status} &middot; {pod.containers} container
            {pod.containers !== '1/1' && pod.containers !== '0/1' ? 's' : ''}
          </div>
        </div>

        {/* View actions */}
        <div className="ctx-menu-item" onClick={() => handleAction('view-detail')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="16" />
            <line x1="8" y1="12" x2="16" y2="12" />
          </svg>
          <span>View Details</span>
          <span className="shortcut">Enter</span>
        </div>
        <div className="ctx-menu-item" onClick={() => handleAction('view-logs')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
          <span>View Logs</span>
          <span className="shortcut">L</span>
        </div>
        <div className="ctx-menu-item" onClick={() => handleAction('view-events')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
          <span>View Events</span>
          <span className="shortcut">E</span>
        </div>
        <div className="ctx-menu-item" onClick={() => handleAction('view-yaml')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span>View YAML</span>
          <span className="shortcut">Y</span>
        </div>

        <div className="ctx-menu-sep" />

        {/* Interactive actions */}
        <div
          className={`ctx-menu-item${!isRunning ? ' disabled' : ''}`}
          onClick={() => isRunning && handleAction('exec-shell')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
          <span>Exec Shell</span>
          <span className="shortcut">S</span>
        </div>
        <div
          className={`ctx-menu-item${!isRunning ? ' disabled' : ''}`}
          onClick={() => isRunning && handleAction('port-forward')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14" />
            <path d="M12 5l7 7-7 7" />
          </svg>
          <span>Port Forward...</span>
          <span className="shortcut">P</span>
        </div>
        <div className="ctx-menu-item" onClick={() => handleAction('download-logs')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span>Download Logs</span>
        </div>

        <div className="ctx-menu-sep" />

        {/* Copy actions */}
        <div className="ctx-menu-item" onClick={() => handleAction('copy-name')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          <span>Copy Pod Name</span>
          <span className="shortcut">C</span>
        </div>
        <div className="ctx-menu-item" onClick={() => handleAction('copy-yaml')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          <span>Copy as YAML</span>
        </div>

        <div className="ctx-menu-sep" />

        {/* Danger zone */}
        <div
          className={`ctx-menu-item${isCompleted ? ' disabled' : ''}`}
          onClick={() => !isCompleted && handleAction('restart')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          <span>Restart Pod</span>
        </div>
        <div className="ctx-menu-item danger" onClick={() => handleAction('delete')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          <span>Delete Pod</span>
          <span className="shortcut">Del</span>
        </div>
      </div>
    </>
  )
}
