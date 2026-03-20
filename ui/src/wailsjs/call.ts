// Wails runtime bridge
// In production, window['go'] is injected by the Wails runtime.
// In dev mode (without Wails), calls are no-ops.

export function wailsCall<T>(
  handler: string,
  method: string,
  ...args: unknown[]
): Promise<T> {
  const go = (window as unknown as Record<string, Record<string, Record<string, Record<string, (...a: unknown[]) => Promise<T>>>>>)['go']
  if (go?.['handlers']?.[handler]?.[method]) {
    return go['handlers'][handler][method](...args)
  }
  if (go?.['main']?.['App']?.[method]) {
    return go['main']['App'][method](...args)
  }
  console.warn(`[Wails] ${handler}.${method} not available`)
  return Promise.resolve(undefined as T)
}
