import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useKubeResources } from '@/hooks/useKubeResource'

// Mock Wails bindings
vi.mock('@/wailsjs/go/handlers/ResourceHandler', () => ({
  ListResources: vi.fn(),
  WatchResources: vi.fn(),
  StopWatch: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/wailsjs/runtime/runtime', () => ({
  EventsOn: vi.fn(() => () => {}),
}))

import { ListResources, WatchResources } from '@/wailsjs/go/handlers/ResourceHandler'
import { EventsOn } from '@/wailsjs/runtime/runtime'

const mockListResources = vi.mocked(ListResources)
const mockWatchResources = vi.mocked(WatchResources)
const mockEventsOn = vi.mocked(EventsOn)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useKubeResources', () => {
  const opts = { group: '', version: 'v1', resource: 'pods', namespace: 'default' }

  it('fetches initial data and starts watch', async () => {
    const items = [
      { name: 'pod-1', namespace: 'default', labels: null, spec: null, status: null, raw: null },
    ]
    mockListResources.mockResolvedValue(items)
    mockWatchResources.mockResolvedValue(undefined)

    const { result } = renderHook(() => useKubeResources(opts))

    expect(result.current.isLoading).toBe(true)

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.data).toEqual(items)
    expect(result.current.error).toBeNull()
    expect(mockListResources).toHaveBeenCalledWith('', 'v1', 'pods', 'default')
    expect(mockWatchResources).toHaveBeenCalledWith('', 'v1', 'pods', 'default')
  })

  it('sets error on failure', async () => {
    mockListResources.mockRejectedValue(new Error('connection failed'))

    const { result } = renderHook(() => useKubeResources(opts))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).toBe('connection failed')
    expect(result.current.data).toEqual([])
  })

  it('subscribes to watch events', async () => {
    mockListResources.mockResolvedValue([])
    mockWatchResources.mockResolvedValue(undefined)

    renderHook(() => useKubeResources(opts))

    await waitFor(() => {
      expect(mockEventsOn).toHaveBeenCalledWith('resource-watch:pods', expect.any(Function))
    })
  })

  it('cleans up on unmount', async () => {
    const unsubscribe = vi.fn()
    mockEventsOn.mockReturnValue(unsubscribe)
    mockListResources.mockResolvedValue([])
    mockWatchResources.mockResolvedValue(undefined)

    const { unmount } = renderHook(() => useKubeResources(opts))

    await waitFor(() => {
      expect(mockEventsOn).toHaveBeenCalled()
    })

    unmount()
    expect(unsubscribe).toHaveBeenCalled()
  })
})
