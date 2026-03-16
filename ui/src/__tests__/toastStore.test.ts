import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useToastStore } from '../stores/toastStore'

beforeEach(() => {
  useToastStore.setState({ toasts: [] })
})

describe('toastStore', () => {
  it('adds a toast and returns an id', () => {
    const id = useToastStore.getState().addToast({
      type: 'success',
      title: 'Saved',
    })

    expect(id).toBeTruthy()
    expect(useToastStore.getState().toasts).toHaveLength(1)
    expect(useToastStore.getState().toasts[0]).toMatchObject({
      id,
      type: 'success',
      title: 'Saved',
    })
  })

  it('removes a toast by id', () => {
    const id = useToastStore.getState().addToast({
      type: 'error',
      title: 'Oops',
      duration: 0, // disable auto-remove for this test
    })

    expect(useToastStore.getState().toasts).toHaveLength(1)

    useToastStore.getState().removeToast(id)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('auto-dismisses after duration', () => {
    vi.useFakeTimers()

    useToastStore.getState().addToast({
      type: 'info',
      title: 'Auto',
      duration: 2000,
    })

    expect(useToastStore.getState().toasts).toHaveLength(1)

    vi.advanceTimersByTime(1999)
    expect(useToastStore.getState().toasts).toHaveLength(1)

    vi.advanceTimersByTime(1)
    expect(useToastStore.getState().toasts).toHaveLength(0)

    vi.useRealTimers()
  })

  it('uses default duration of 4000ms', () => {
    vi.useFakeTimers()

    useToastStore.getState().addToast({
      type: 'success',
      title: 'Default duration',
    })

    expect(useToastStore.getState().toasts).toHaveLength(1)

    vi.advanceTimersByTime(3999)
    expect(useToastStore.getState().toasts).toHaveLength(1)

    vi.advanceTimersByTime(1)
    expect(useToastStore.getState().toasts).toHaveLength(0)

    vi.useRealTimers()
  })

  it('keeps toast with duration 0 indefinitely', () => {
    vi.useFakeTimers()

    useToastStore.getState().addToast({
      type: 'error',
      title: 'Sticky',
      duration: 0,
    })

    vi.advanceTimersByTime(60000)
    expect(useToastStore.getState().toasts).toHaveLength(1)

    vi.useRealTimers()
  })

  it('clears timer when toast is manually removed before duration', () => {
    vi.useFakeTimers()
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')

    const id = useToastStore.getState().addToast({
      type: 'info',
      title: 'Will be removed early',
      duration: 5000,
    })

    expect(useToastStore.getState().toasts).toHaveLength(1)

    // Remove before timer fires
    useToastStore.getState().removeToast(id)
    expect(useToastStore.getState().toasts).toHaveLength(0)
    expect(clearTimeoutSpy).toHaveBeenCalled()

    // Advancing past original duration should not cause errors
    vi.advanceTimersByTime(6000)
    expect(useToastStore.getState().toasts).toHaveLength(0)

    clearTimeoutSpy.mockRestore()
    vi.useRealTimers()
  })
})
