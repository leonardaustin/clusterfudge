import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DaemonSetList } from '@/pages/DaemonSetList'

vi.mock('@/hooks/useKubeResource', () => ({
  useKubeResources: vi.fn(),
}))

vi.mock('@/stores/clusterStore', () => ({
  useClusterStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({ selectedNamespace: '' })
  ),
}))

import { useKubeResources } from '@/hooks/useKubeResource'

const mockUseKubeResources = vi.mocked(useKubeResources)

beforeEach(() => {
  vi.clearAllMocks()
  mockUseKubeResources.mockReturnValue({
    data: [],
    isLoading: false,
    error: null,
  })
})

describe('DaemonSetList', () => {
  it('renders title when data is loaded', () => {
    render(<DaemonSetList />)

    expect(screen.getByText('DaemonSets')).toBeDefined()
    expect(screen.getByText('0 daemonsets across all namespaces')).toBeDefined()
  })

  it('shows loading state', () => {
    mockUseKubeResources.mockReturnValue({
      data: [],
      isLoading: true,
      error: null,
    })

    render(<DaemonSetList />)

    expect(screen.getAllByText('Loading...').length).toBeGreaterThan(0)
  })

  it('renders data rows correctly', () => {
    mockUseKubeResources.mockReturnValue({
      data: [
        {
          name: 'fluentd',
          namespace: 'kube-system',
          labels: null,
          spec: null,
          status: null,
          raw: {
            metadata: { creationTimestamp: '2025-01-01T00:00:00Z' },
            spec: {},
            status: {
              desiredNumberScheduled: 3,
              currentNumberScheduled: 3,
              numberReady: 3,
              updatedNumberScheduled: 3,
              numberAvailable: 3,
            },
          },
        },
      ],
      isLoading: false,
      error: null,
    })

    render(<DaemonSetList />)

    expect(screen.getByText('fluentd')).toBeDefined()
    expect(screen.getByText('kube-system')).toBeDefined()
    // desired, current, ready, up-to-date, available are all 3
    const threes = screen.getAllByText('3')
    expect(threes.length).toBeGreaterThanOrEqual(5)
  })
})
