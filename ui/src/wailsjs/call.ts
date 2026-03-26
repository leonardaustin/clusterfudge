// Wails runtime bridge
// In production, window['go'] is injected by the Wails runtime.
// In dev mode (without Wails), calls are no-ops that return undefined.

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
  // In dev mode (no Wails runtime), return undefined to allow UI development.
  // In production, the runtime should always be present — log a warning.
  if (!go) {
    return Promise.resolve(undefined as T)
  }
  console.error(`[Wails] ${handler}.${method} not found in runtime bindings. Available bindings:`, go)
  return Promise.reject(new Error(`${handler}.${method} binding not available`))
}
