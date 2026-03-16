import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { X, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/uiStore'
import { DetailOverview } from './DetailOverview'
import { ResourceEvents } from './ResourceEvents'

interface ResourceDetailPanelProps {
  resource: Record<string, unknown>
  resourceType: string
  onClose: () => void
}

const TABS = ['Overview', 'Events', 'YAML'] as const
type Tab = (typeof TABS)[number]

const MIN_WIDTH = 320
const MAX_WIDTH = 900

export function ResourceDetailPanel({
  resource,
  resourceType,
  onClose,
}: ResourceDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('Overview')
  const { detailPanelWidth, setDetailPanelWidth } = useUIStore()

  // Reset tab to Overview when the resource changes.
  const prevResource = useRef(resource)
  useEffect(() => {
    if (resource !== prevResource.current) {
      Promise.resolve().then(() => setActiveTab('Overview'))
    }
    prevResource.current = resource
  }, [resource])

  // Stable ref for onClose to avoid recreating the listener on every parent render
  const onCloseRef = useRef(onClose)
  useLayoutEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Resize handle logic
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
      // Dragging left edge: moving left increases width, moving right decreases
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

  const name = (resource.name as string) ?? ''
  const namespace = resource.namespace as string | undefined

  return (
    <div
      style={{ width: detailPanelWidth, minWidth: MIN_WIDTH, maxWidth: MAX_WIDTH }}
      className="relative border-l border-border bg-bg-primary flex flex-col animate-in slide-in-from-right duration-150 shrink-0"
      data-testid="detail-panel"
    >
      {/* Resize handle on left edge */}
      <div
        onMouseDown={onMouseDown}
        className={cn(
          'absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-10',
          'hover:bg-accent transition-colors duration-150 delay-150',
          'group'
        )}
      >
        <div className="absolute left-0 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
          <GripVertical className="w-3 h-3 text-text-tertiary" />
        </div>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between px-4 py-3 border-b border-border">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-text-primary truncate">
            {name}
          </h2>
          <p className="text-xs text-text-tertiary">
            {resourceType}
            {namespace && ` in "${namespace}"`}
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-text-tertiary hover:text-text-secondary ml-2 mt-0.5"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border px-4">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px',
              activeTab === tab
                ? 'text-accent border-accent'
                : 'text-text-tertiary border-transparent hover:text-text-secondary'
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {activeTab === 'Overview' && (
          <DetailOverview resource={resource} resourceType={resourceType} />
        )}
        {activeTab === 'Events' && (
          <ResourceEvents
            name={name}
            namespace={namespace}
            resourceType={resourceType}
          />
        )}
        {activeTab === 'YAML' && (
          <pre className="text-xs text-text-secondary font-mono whitespace-pre-wrap break-all">
            {JSON.stringify(resource, null, 2)}
          </pre>
        )}
      </div>
    </div>
  )
}
