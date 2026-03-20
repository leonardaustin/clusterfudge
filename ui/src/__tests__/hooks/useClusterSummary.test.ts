import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useClusterSummary } from '@/hooks/useClusterSummary'

vi.mock('@/wailsjs/go/handlers/ClusterHandler', () => ({
  GetClusterSummary: vi.fn(),
}))

vi.mock('@/stores/clusterStore', () => ({
  useClusterStore: vi.fn((selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      activeCluster: 'test-cluster',
      clusters: [{ name: 'test-cluster', status: 'connected' }],
    })
  ),
}))

import { GetClusterSummary } from '@/wailsjs/go/handlers/ClusterHandler'

const mockGetClusterSummary = vi.mocked(GetClusterSummary)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useClusterSummary', () => {
  it('fetches summary on mount', async () => {
    const summary = {
      nodeCount: 3,
      nodeReady: 3,
      podCount: 10,
      podRunning: 8,
      deploymentCount: 5,
      deploymentReady: 5,
      serviceCount: 4,
      serviceLB: 1,
      namespaceSummary: [{ name: 'default', podCount: 10 }],
    }
    mockGetClusterSummary.mockResolvedValue(summary)

    const { result } = renderHook(() => useClusterSummary())

    expect(result.current.isLoading).toBe(true)

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.summary).toEqual(summary)
    expect(result.current.error).toBeNull()
  })

  it('sets error on failure', async () => {
    mockGetClusterSummary.mockRejectedValue(new Error('not connected'))

    const { result } = renderHook(() => useClusterSummary())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).toBe('not connected')
    expect(result.current.summary).toBeNull()
  })

  it('refresh re-fetches data', async () => {
    const summary1 = {
      nodeCount: 1, nodeReady: 1, podCount: 1, podRunning: 1,
      deploymentCount: 0, deploymentReady: 0, serviceCount: 0, serviceLB: 0,
      namespaceSummary: [],
    }
    const summary2 = {
      nodeCount: 2, nodeReady: 2, podCount: 5, podRunning: 4,
      deploymentCount: 1, deploymentReady: 1, serviceCount: 1, serviceLB: 0,
      namespaceSummary: [],
    }

    mockGetClusterSummary.mockResolvedValueOnce(summary1).mockResolvedValueOnce(summary2)

    const { result } = renderHook(() => useClusterSummary())

    await waitFor(() => {
      expect(result.current.summary).toEqual(summary1)
    })

    await act(async () => {
      await result.current.refresh()
    })

    expect(result.current.summary).toEqual(summary2)
  })
})
