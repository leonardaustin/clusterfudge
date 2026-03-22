import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDebounce } from '@/hooks/useDebounce'

describe('useDebounce', () => {
  it('returns initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('hello', 300))
    expect(result.current).toBe('hello')
  })

  it('debounces value updates', () => {
    vi.useFakeTimers()

    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'hello', delay: 300 } }
    )

    // Update value
    rerender({ value: 'world', delay: 300 })
    expect(result.current).toBe('hello') // not yet updated

    // Advance part way
    act(() => { vi.advanceTimersByTime(200) })
    expect(result.current).toBe('hello') // still not updated

    // Advance past delay
    act(() => { vi.advanceTimersByTime(200) })
    expect(result.current).toBe('world') // now updated

    vi.useRealTimers()
  })

  it('resets timer on rapid changes', () => {
    vi.useFakeTimers()

    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'a', delay: 300 } }
    )

    rerender({ value: 'b', delay: 300 })
    act(() => { vi.advanceTimersByTime(200) })

    rerender({ value: 'c', delay: 300 })
    act(() => { vi.advanceTimersByTime(200) })
    expect(result.current).toBe('a') // still initial because timer kept resetting

    act(() => { vi.advanceTimersByTime(200) })
    expect(result.current).toBe('c') // final value after full delay

    vi.useRealTimers()
  })
})
