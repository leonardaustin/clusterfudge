import { useCallback, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * Vim-style j/k/h/l navigation for resource list pages.
 *
 * - `j` — select next item (down)
 * - `k` — select previous item (up)
 * - `l` — drill into selected item (open detail)
 * - `h` — drill out (go back to list)
 *
 * Shortcuts are disabled when an input, textarea, or select is focused.
 *
 * @param items - Array of navigable items (filtered/sorted as displayed)
 * @param selectedId - Currently selected item ID, or undefined
 * @param getItemId - Function to extract a unique ID from an item
 * @param getItemPath - Function to get the navigation path for an item
 * @param listPath - Path to navigate to when pressing `h` (drill out)
 */
export function useVimNavigation<T>(
  items: T[],
  selectedId: string | undefined,
  getItemId: (item: T) => string,
  getItemPath: (item: T) => string,
  listPath: string
) {
  const navigate = useNavigate()
  const itemsRef = useRef(items)
  const selectedIdRef = useRef(selectedId)

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  useEffect(() => {
    selectedIdRef.current = selectedId
  }, [selectedId])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Skip when input elements are focused
      const el = document.activeElement
      if (el) {
        const tag = el.tagName.toLowerCase()
        if (
          tag === 'input' ||
          tag === 'textarea' ||
          tag === 'select' ||
          (el as HTMLElement).isContentEditable
        ) {
          return
        }
      }

      const currentItems = itemsRef.current
      if (currentItems.length === 0) return

      const currentId = selectedIdRef.current
      const currentIdx = currentId
        ? currentItems.findIndex((item) => getItemId(item) === currentId)
        : -1

      switch (e.key) {
        case 'j': {
          e.preventDefault()
          const next = Math.min(currentIdx + 1, currentItems.length - 1)
          navigate(getItemPath(currentItems[next]))
          break
        }
        case 'k': {
          e.preventDefault()
          const prev = Math.max(currentIdx - 1, 0)
          navigate(getItemPath(currentItems[prev]))
          break
        }
        case 'l': {
          if (currentIdx >= 0) {
            e.preventDefault()
            navigate(getItemPath(currentItems[currentIdx]))
          }
          break
        }
        case 'h': {
          e.preventDefault()
          navigate(listPath)
          break
        }
      }
    },
    [navigate, getItemId, getItemPath, listPath]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}
