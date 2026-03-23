import { useState } from 'react'
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd'
import { Settings, GripVertical, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ColumnConfig {
  id: string
  label: string
  visible: boolean
}

interface ColumnCustomizerProps {
  columns: ColumnConfig[]
  onChange: (columns: ColumnConfig[]) => void
}

export function ColumnCustomizer({ columns, onChange }: ColumnCustomizerProps) {
  const [isOpen, setIsOpen] = useState(false)

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return

    const reordered = [...columns]
    const [removed] = reordered.splice(result.source.index, 1)
    reordered.splice(result.destination.index, 0, removed)
    onChange(reordered)
  }

  const toggleVisibility = (id: string) => {
    onChange(
      columns.map((col) =>
        col.id === id ? { ...col, visible: !col.visible } : col
      )
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-md border transition-colors',
          isOpen
            ? 'border-accent text-accent bg-accent/5'
            : 'border-border text-text-secondary hover:text-text-primary hover:bg-bg-hover'
        )}
      >
        <Settings className="w-3.5 h-3.5" />
        Columns
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          {/* Dropdown */}
          <div className="absolute right-0 top-full mt-1 z-50 w-64 bg-bg-primary border border-border rounded-lg shadow-lg py-1">
            <div className="px-3 py-2 text-xs font-medium text-text-tertiary uppercase tracking-wider border-b border-border">
              Customize columns
            </div>
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="columns">
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="max-h-[320px] overflow-y-auto py-1"
                  >
                    {columns.map((col, index) => (
                      <Draggable
                        key={col.id}
                        draggableId={col.id}
                        index={index}
                      >
                        {(dragProvided, snapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            className={cn(
                              'flex items-center gap-2 px-3 py-1.5 text-sm',
                              snapshot.isDragging && 'bg-bg-hover rounded'
                            )}
                          >
                            <div
                              {...dragProvided.dragHandleProps}
                              className="text-text-tertiary hover:text-text-secondary cursor-grab"
                            >
                              <GripVertical className="w-3.5 h-3.5" />
                            </div>
                            <span
                              className={cn(
                                'flex-1 truncate',
                                col.visible
                                  ? 'text-text-primary'
                                  : 'text-text-tertiary'
                              )}
                            >
                              {col.label}
                            </span>
                            <button
                              onClick={() => toggleVisibility(col.id)}
                              className="text-text-tertiary hover:text-text-secondary"
                            >
                              {col.visible ? (
                                <Eye className="w-3.5 h-3.5" />
                              ) : (
                                <EyeOff className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          </div>
        </>
      )}
    </div>
  )
}
