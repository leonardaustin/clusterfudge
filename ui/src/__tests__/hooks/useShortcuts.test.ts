import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, cleanup } from '@testing-library/react'
import { useShortcuts } from '@/hooks/useShortcuts'

function fireKey(key: string, opts: Partial<KeyboardEventInit> = {}) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...opts,
  })
  window.dispatchEvent(event)
}

describe('useShortcuts', () => {
  afterEach(() => {
    cleanup()
  })

  it('calls handler on direct key match', () => {
    const handler = vi.fn()
    renderHook(() => useShortcuts([{ key: '[', handler }]))

    fireKey('[')
    expect(handler).toHaveBeenCalledOnce()
  })

  it('does not fire when input is focused', () => {
    const handler = vi.fn()
    renderHook(() => useShortcuts([{ key: '[', handler }]))

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    fireKey('[')
    expect(handler).not.toHaveBeenCalled()

    document.body.removeChild(input)
  })

  it('handles modifier keys (Cmd+K)', () => {
    const handler = vi.fn()
    renderHook(() => useShortcuts([{ key: 'Cmd+K', handler }]))

    fireKey('k', { metaKey: true })
    expect(handler).toHaveBeenCalledOnce()
  })

  it('handles chord sequences (G P)', () => {
    vi.useFakeTimers()
    const handler = vi.fn()
    renderHook(() => useShortcuts([{ key: 'G P', handler }]))

    fireKey('g')
    fireKey('P')
    expect(handler).toHaveBeenCalledOnce()

    vi.useRealTimers()
  })

  it('chord times out after 500ms', () => {
    vi.useFakeTimers()
    const handler = vi.fn()
    renderHook(() => useShortcuts([{ key: 'G P', handler }]))

    fireKey('g')
    vi.advanceTimersByTime(600) // past chord timeout
    fireKey('P')
    expect(handler).not.toHaveBeenCalled()

    vi.useRealTimers()
  })

  it('cleans up shortcuts on unmount', () => {
    const handler = vi.fn()
    const { unmount } = renderHook(() => useShortcuts([{ key: 'x', handler }]))

    unmount()
    fireKey('x')
    expect(handler).not.toHaveBeenCalled()
  })

  it('uses updated handler via ref delegation', () => {
    let count = 0
    const { rerender } = renderHook(
      ({ handler }) => useShortcuts([{ key: 'z', handler }]),
      { initialProps: { handler: () => { count = 1 } } }
    )

    // Re-render with new handler
    rerender({ handler: () => { count = 2 } })

    fireKey('z')
    expect(count).toBe(2) // Should use the updated handler, not the stale one
  })

  it('respects priority ordering across separate registrations', () => {
    const calls: string[] = []
    // Two components registering the same key with different priorities
    renderHook(() => {
      useShortcuts([{ key: 'q', handler: () => calls.push('low'), priority: 1 }])
      useShortcuts([{ key: 'q', handler: () => calls.push('high'), priority: 100 }])
    })

    fireKey('q')
    // Only the highest priority handler should run
    expect(calls).toEqual(['high'])
  })
})
