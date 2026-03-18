import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock @xterm/xterm globally – xterm.js requires a real DOM and cannot run in jsdom.
vi.mock('@xterm/xterm', () => {
  const noop = () => {}
  class Terminal {
    loadAddon = vi.fn()
    open = vi.fn()
    write = vi.fn()
    dispose = vi.fn()
    onData = vi.fn(() => ({ dispose: noop }))
    onResize = vi.fn(() => ({ dispose: noop }))
    clear = vi.fn()
    focus = vi.fn()
    get element() { return document.createElement('div') }
  }
  return { Terminal }
})

vi.mock('@xterm/addon-fit', () => {
  class FitAddon {
    fit = vi.fn()
    activate = vi.fn()
    dispose = vi.fn()
  }
  return { FitAddon }
})

vi.mock('@xterm/addon-search', () => {
  class SearchAddon {
    findNext = vi.fn()
    findPrevious = vi.fn()
    clearDecorations = vi.fn()
    activate = vi.fn()
    dispose = vi.fn()
  }
  return { SearchAddon }
})

// The CSS import in TerminalTab triggers an error in jsdom.
vi.mock('@xterm/xterm/css/xterm.css', () => ({}))

// jsdom does not provide window.matchMedia; stub it so xterm and other libs don't throw.
if (typeof window.matchMedia === 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

// jsdom does not provide ResizeObserver; stub it so components using it don't throw.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof globalThis.ResizeObserver
}

// jsdom v28 does not provide a full localStorage implementation.
// Provide a simple in-memory shim so tests that rely on localStorage work.
if (typeof globalThis.localStorage === 'undefined' || typeof globalThis.localStorage.clear !== 'function') {
  const store = new Map<string, string>()
  const storage: Storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, String(value)) },
    removeItem: (key: string) => { store.delete(key) },
    clear: () => { store.clear() },
    get length() { return store.size },
    key: (index: number) => [...store.keys()][index] ?? null,
  }
  Object.defineProperty(globalThis, 'localStorage', { value: storage, writable: true })
}
