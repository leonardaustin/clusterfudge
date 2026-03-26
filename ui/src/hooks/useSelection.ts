import { useState, useCallback } from 'react'

export interface UseSelectionResult<T> {
  selected: Set<string>
  isSelected: (id: string) => boolean
  toggle: (id: string) => void
  selectAll: (items: T[], getId: (item: T) => string) => void
  clearAll: () => void
  count: number
}

export function useSelection<T>(): UseSelectionResult<T> {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const isSelected = useCallback(
    (id: string) => selected.has(id),
    [selected]
  )

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const selectAll = useCallback(
    (items: T[], getId: (item: T) => string) => {
      setSelected(new Set(items.map(getId)))
    },
    []
  )

  const clearAll = useCallback(() => {
    setSelected(new Set())
  }, [])

  return {
    selected,
    isSelected,
    toggle,
    selectAll,
    clearAll,
    count: selected.size,
  }
}
