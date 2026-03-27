// Wails runtime bridge
// In production, window['runtime'] is injected by the Wails runtime.

type EventCallback = (...args: unknown[]) => void

interface WailsRuntime {
  EventsOn?: (eventName: string, callback: EventCallback) => () => void
  EventsOff?: (eventName: string) => void
  EventsEmit?: (eventName: string, ...data: unknown[]) => void
  BrowserOpenURL?: (url: string) => void
  Quit?: () => void
  WindowMinimise?: () => void
  WindowToggleMaximise?: () => void
  WindowFullscreen?: () => void
  WindowUnfullscreen?: () => void
  WindowIsFullscreen?: () => boolean
}

function getRuntime(): WailsRuntime | undefined {
  return (window as unknown as Record<string, WailsRuntime>)['runtime']
}

export function EventsOn(eventName: string, callback: EventCallback): () => void {
  const rt = getRuntime()
  if (rt?.EventsOn) {
    return rt.EventsOn(eventName, callback)
  }
  console.warn('[Wails] EventsOn not available')
  return () => {}
}

export function EventsOff(eventName: string): void {
  const rt = getRuntime()
  if (rt?.EventsOff) {
    rt.EventsOff(eventName)
    return
  }
  console.warn('[Wails] EventsOff not available')
}

export function EventsEmit(eventName: string, ...data: unknown[]): void {
  const rt = getRuntime()
  if (rt?.EventsEmit) {
    rt.EventsEmit(eventName, ...data)
    return
  }
  console.warn('[Wails] EventsEmit not available')
}

export function BrowserOpenURL(url: string): void {
  const rt = getRuntime()
  if (rt?.BrowserOpenURL) {
    rt.BrowserOpenURL(url)
    return
  }
  // Fallback: open in a new tab
  window.open(url, '_blank')
}

export function Quit(): void {
  getRuntime()?.Quit?.()
}

export function WindowMinimise(): void {
  getRuntime()?.WindowMinimise?.()
}

export function WindowToggleMaximise(): void {
  getRuntime()?.WindowToggleMaximise?.()
}

export function WindowFullscreen(): void {
  getRuntime()?.WindowFullscreen?.()
}

export function WindowUnfullscreen(): void {
  getRuntime()?.WindowUnfullscreen?.()
}

export function WindowToggleFullscreen(): void {
  const rt = getRuntime()
  if (rt?.WindowIsFullscreen?.()) {
    rt.WindowUnfullscreen?.()
  } else {
    rt?.WindowFullscreen?.()
  }
}
