import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { UpdateConfig } from '@/wailsjs/go/handlers/ConfigHandler'

/**
 * Persists the current route to config.windowState.activeRoute
 * with a 500ms debounce.
 */
export function RoutePersist() {
  const location = useLocation()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }

    timerRef.current = setTimeout(() => {
      UpdateConfig({
        windowState: {
          activeRoute: location.pathname,
        },
      }).catch((err) =>
        console.warn('[RoutePersist] Failed to save route:', err)
      )
    }, 500)

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [location.pathname])

  return null
}
