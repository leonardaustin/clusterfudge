import { useState, useMemo, useCallback } from 'react'

export interface Column<T = unknown> {
  key: string
  label: string
  className?: string
  /** Custom value extractor for sorting. Falls back to `item[key]`. */
  sortValue?: (item: T) => string | number | null | undefined
}

type SortDirection = 'asc' | 'desc'
interface SortState {
  key: string
  direction: SortDirection
}

interface ResourceTableProps<T> {
  columns: Column<T>[]
  data: T[]
  renderRow: (item: T, index: number) => React.ReactNode
}

function compareValues(a: unknown, b: unknown, dir: SortDirection): number {
  // Handle nullish values — push them to the end
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1

  const multiplier = dir === 'asc' ? 1 : -1

  if (typeof a === 'number' && typeof b === 'number') {
    return (a - b) * multiplier
  }

  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }) * multiplier
}

export function ResourceTable<T extends object>({
  columns,
  data,
  renderRow,
}: ResourceTableProps<T>) {
  const [sort, setSort] = useState<SortState | null>(null)

  const handleHeaderClick = useCallback((key: string) => {
    setSort((prev) => {
      if (prev?.key === key) {
        return prev.direction === 'asc'
          ? { key, direction: 'desc' }
          : null // third click clears sort
      }
      return { key, direction: 'asc' }
    })
  }, [])

  const sortedData = useMemo(() => {
    if (!sort) return data
    const col = columns.find((c) => c.key === sort.key)
    return [...data].sort((a, b) => {
      const va = col?.sortValue ? col.sortValue(a) : (a as Record<string, unknown>)[sort.key]
      const vb = col?.sortValue ? col.sortValue(b) : (b as Record<string, unknown>)[sort.key]
      return compareValues(va, vb, sort.direction)
    })
  }, [data, sort, columns])

  return (
    <div className="resource-body">
      <div className="resource-table-wrap">
        <table className="resource-table clickable">
          <thead>
            <tr>
              {columns.map((col) => {
                const isSorted = sort?.key === col.key
                return (
                  <th
                    key={col.key}
                    scope="col"
                    className={[col.className, isSorted && 'sorted'].filter(Boolean).join(' ')}
                    onClick={() => handleHeaderClick(col.key)}
                  >
                    <span className="sortable-header-content">
                      {col.label}
                      {isSorted && (
                        <span className="sort-indicator">
                          {sort!.direction === 'asc' ? '▲' : '▼'}
                        </span>
                      )}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>{sortedData.map(renderRow)}</tbody>
        </table>
      </div>
    </div>
  )
}
