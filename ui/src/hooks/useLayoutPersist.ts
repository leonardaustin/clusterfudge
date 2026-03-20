import { useEffect, useRef } from 'react'
import { useUIStore } from '@/stores/uiStore'
import { UpdateConfig } from '@/wailsjs/go/handlers/ConfigHandler'

/**
 * Watches sidebar and bottom tray layout changes in uiStore
 * and debounce-saves them to the backend config's windowState.
 */
export function useLayoutPersist() {
  const sidebarWidth = useUIStore((s) => s.sidebarWidth)
  const bottomTrayHeight = useUIStore((s) => s.bottomTrayHeight)
  const bottomTrayOpen = useUIStore((s) => s.bottomTrayOpen)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initialRef = useRef(true)

  useEffect(() => {
    // Skip the initial render (values restored from config, no need to save back)
    if (initialRef.current) {
      initialRef.current = false
      return
    }

    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }

    timerRef.current = setTimeout(() => {
      UpdateConfig({
        windowState: {
          sidebarWidth,
          bottomTrayHeight,
          bottomTrayVisible: bottomTrayOpen,
        },
      }).catch((err) =>
        console.warn('[useLayoutPersist] Failed to save layout:', err)
      )
    }, 1000)

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [sidebarWidth, bottomTrayHeight, bottomTrayOpen])
}
