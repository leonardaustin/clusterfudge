import { useState, useRef, useCallback, memo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { cn } from '@/lib/utils'
import { ArrowUp, ArrowDown } from 'lucide-react'

export interface ResourceTableProps<T> {
  data: T[]
  columns: ColumnDef<T, unknown>[]
  isLoading: boolean
  onRowClick?: (row: T) => void
  searchValue?: string
  enableSelection?: boolean
  selectedRowId?: string
  getRowId?: (row: T) => string
}

function ResourceTableInner<T>({
  data,
  columns,
  isLoading,
  onRowClick,
  searchValue,
  enableSelection = false,
  selectedRowId,
  getRowId,
}: ResourceTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter: searchValue, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: enableSelection ? setRowSelection : undefined,
    enableRowSelection: enableSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: getRowId as ((row: T, index: number) => string) | undefined,
  })

  const { rows } = table.getRowModel()

  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 20,
  })

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!onRowClick || rows.length === 0) return

      const currentIdx = selectedRowId
        ? rows.findIndex((r) => r.id === selectedRowId)
        : -1

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const next = Math.min(currentIdx + 1, rows.length - 1)
        onRowClick(rows[next].original)
        virtualizer.scrollToIndex(next)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        const prev = Math.max(currentIdx - 1, 0)
        onRowClick(rows[prev].original)
        virtualizer.scrollToIndex(prev)
      } else if (e.key === 'Enter' && currentIdx >= 0) {
        e.preventDefault()
        onRowClick(rows[currentIdx].original)
      }
    },
    [onRowClick, rows, selectedRowId, virtualizer]
  )

  if (isLoading) {
    return <TableSkeleton columnCount={columns.length} />
  }

  if (rows.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-tertiary text-sm">
        No resources found
      </div>
    )
  }

  return (
    <div
      ref={parentRef}
      className="flex-1 overflow-auto focus:outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-bg-primary border-b border-border">
        {table.getHeaderGroups().map((headerGroup) => (
          <div key={headerGroup.id} className="flex items-center px-4 h-8">
            {headerGroup.headers.map((header) => (
              <div
                key={header.id}
                className={cn(
                  'text-[11px] font-medium text-text-tertiary uppercase tracking-wider select-none',
                  header.column.getCanSort() &&
                    'cursor-pointer hover:text-text-secondary'
                )}
                style={{ width: header.getSize(), flexShrink: 0 }}
                onClick={header.column.getToggleSortingHandler()}
              >
                <span className="flex items-center gap-1">
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext()
                  )}
                  {header.column.getIsSorted() === 'asc' && (
                    <ArrowUp className="w-3 h-3" />
                  )}
                  {header.column.getIsSorted() === 'desc' && (
                    <ArrowDown className="w-3 h-3" />
                  )}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Virtual rows */}
      <div
        style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index]
          const isSelected = row.id === selectedRowId
          return (
            <div
              key={row.id}
              data-testid="table-row"
              className={cn(
                'absolute w-full flex items-center px-4 h-9 cursor-pointer transition-colors duration-100',
                isSelected
                  ? 'bg-accent/10'
                  : 'hover:bg-bg-hover'
              )}
              style={{ top: virtualRow.start }}
              onClick={() => onRowClick?.(row.original)}
            >
              {row.getVisibleCells().map((cell) => (
                <div
                  key={cell.id}
                  className="text-sm text-text-primary truncate"
                  style={{
                    width: cell.column.getSize(),
                    flexShrink: 0,
                  }}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Memoize to prevent expensive re-renders from parent state changes
export const ResourceTable = memo(ResourceTableInner) as typeof ResourceTableInner

function TableSkeleton({ columnCount }: { columnCount: number }) {
  return (
    <div className="flex-1 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center px-4 h-8 border-b border-border">
        {Array.from({ length: columnCount }).map((_, i) => (
          <div
            key={i}
            className="h-3 rounded bg-bg-hover mr-4"
            style={{ width: 60 + ((i * 37) % 80) }}
          />
        ))}
      </div>
      {/* Row skeletons */}
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="flex items-center px-4 h-9">
          {Array.from({ length: columnCount }).map((_, j) => (
            <div
              key={j}
              className="h-3 rounded bg-bg-hover mr-4"
              style={{ width: 40 + ((i * 13 + j * 29) % 100) }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
