import { useEffect, useRef } from 'react'
import { useSettingsStore } from '@/stores/settingsStore'
import { useUIStore } from '@/stores/uiStore'
import { useClusterStore } from '@/stores/clusterStore'
import { GetConfig } from '@/wailsjs/go/handlers/ConfigHandler'
import type { Theme } from '@/stores/uiStore'

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/

function isValidHex(color: string): boolean {
  return HEX_COLOR_RE.test(color)
}

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return { r, g, b }
}

function lighten(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex)
  const lr = Math.min(255, r + amount)
  const lg = Math.min(255, g + amount)
  const lb = Math.min(255, b + amount)
  return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`
}

/** Saved route from config, exposed for route restoration. */
let _savedRoute: string | null = null
export function getSavedRoute(): string | null { return _savedRoute }
export function clearSavedRoute(): void { _savedRoute = null }

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const loaded = useSettingsStore((s) => s.loaded)
  const fontSize = useSettingsStore((s) => s.fontSize)
  const accentColor = useSettingsStore((s) => s.accentColor)
  const theme = useSettingsStore((s) => s.theme)
  const load = useSettingsStore((s) => s.load)
  const setUITheme = useUIStore((s) => s.setTheme)
  const startupDone = useRef(false)

  useEffect(() => { load() }, [load])

  // On initial load: apply startup behavior, restore layout state, and save route
  useEffect(() => {
    if (!loaded || startupDone.current) return
    startupDone.current = true

    // Load full config to access windowState (not in settingsStore)
    GetConfig().then((cfg) => {
      // Task 1: Startup behavior — auto-reconnect to last cluster
      const startupBehavior = cfg.startupBehavior
      if (startupBehavior === 'last_cluster') {
        const { activeCluster, connectCluster } = useClusterStore.getState()
        // The clusterStore persists activeCluster via zustand-persist.
        // On fresh app load the cluster is persisted but not yet connected.
        if (activeCluster) {
          connectCluster(activeCluster)
        }
      } else if (startupBehavior === 'welcome') {
        // Clear persisted active cluster so RequireCluster redirects to /welcome
        useClusterStore.getState().setActiveCluster(null)
      }

      // Task 5: Restore sidebar/tray layout from windowState
      const ws = cfg.windowState
      if (ws) {
        if (ws.sidebarWidth > 0) {
          useUIStore.getState().setSidebarWidth(ws.sidebarWidth)
        }
        if (ws.bottomTrayHeight > 0) {
          useUIStore.getState().setBottomTrayHeight(ws.bottomTrayHeight)
        }
        useUIStore.getState().setBottomTrayOpen(ws.bottomTrayVisible)
      }

      // Task 6: Save active route for restoration
      if (ws?.activeRoute && ws.activeRoute !== '/' && ws.activeRoute !== '/welcome') {
        _savedRoute = ws.activeRoute
      }
    }).catch((err) => {
      console.warn('[SettingsProvider] Failed to load full config:', err)
    })
  }, [loaded])

  // Apply font size to <html> so all rem-based sizes scale
  useEffect(() => {
    if (!loaded) return
    const clamped = Math.min(24, Math.max(10, fontSize))
    document.documentElement.style.fontSize = `${clamped}px`
  }, [loaded, fontSize])

  // Apply accent color to CSS custom properties (both Tailwind and legacy systems)
  useEffect(() => {
    if (!loaded) return
    if (!isValidHex(accentColor)) return

    const root = document.documentElement
    const { r, g, b } = hexToRgb(accentColor)
    const hover = lighten(accentColor, 20)

    // Tailwind system (globals.css)
    root.style.setProperty('--color-accent', accentColor)
    root.style.setProperty('--color-accent-hover', hover)
    root.style.setProperty('--color-accent-muted', `rgba(${r}, ${g}, ${b}, 0.12)`)

    // Legacy system (styles.css)
    root.style.setProperty('--accent', accentColor)
    root.style.setProperty('--accent-hover', hover)
    root.style.setProperty('--accent-muted', `rgba(${r}, ${g}, ${b}, 0.15)`)
  }, [loaded, accentColor])

  // Sync theme from backend config to the UI store (which ThemeProvider watches)
  useEffect(() => {
    if (!loaded) return
    if (theme === 'dark' || theme === 'light') {
      setUITheme(theme as Theme)
    }
  }, [loaded, theme, setUITheme])

  return <>{children}</>
}
