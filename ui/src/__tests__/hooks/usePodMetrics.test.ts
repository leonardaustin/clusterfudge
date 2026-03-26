import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { usePodMetrics } from '@/hooks/usePodMetrics'

vi.mock('@/wailsjs/go/handlers/ResourceHandler', () => ({
  GetPodMetrics: vi.fn(),
}))

import { GetPodMetrics } from '@/wailsjs/go/handlers/ResourceHandler'

const mockGetPodMetrics = vi.mocked(GetPodMetrics)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('usePodMetrics', () => {
  it('fetches metrics on mount', async () => {
    const metrics = [
      { podName: 'pod-1', namespace: 'default', cpuCores: 0.5, memoryMiB: 128 },
    ]
    mockGetPodMetrics.mockResolvedValue(metrics)

    const { result } = renderHook(() => usePodMetrics('default'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.metrics.get('default/pod-1')).toEqual(metrics[0])
    expect(result.current.error).toBeNull()
  })

  it('handles null response (no metrics-server)', async () => {
    mockGetPodMetrics.mockResolvedValue(null as unknown as never[])

    const { result } = renderHook(() => usePodMetrics('default'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.metrics.size).toBe(0)
    expect(result.current.error).toBeNull()
  })

  it('sets error on failure', async () => {
    mockGetPodMetrics.mockRejectedValue(new Error('unavailable'))

    const { result } = renderHook(() => usePodMetrics('default'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).toBe('unavailable')
  })

  it('cleans up interval on unmount', async () => {
    mockGetPodMetrics.mockResolvedValue([])

    const { result, unmount } = renderHook(() => usePodMetrics('default'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    unmount()
    // If cleanup didn't work, we'd see errors from the interval firing after unmount
  })
})
