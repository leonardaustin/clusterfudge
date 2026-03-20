import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatefulSetList } from '@/pages/StatefulSetList'

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

describe('StatefulSetList', () => {
  it('renders title when data is loaded', () => {
    render(<StatefulSetList />)

    expect(screen.getByText('StatefulSets')).toBeDefined()
    expect(screen.getByText('0 statefulsets across all namespaces')).toBeDefined()
  })

  it('shows loading state', () => {
    mockUseKubeResources.mockReturnValue({
      data: [],
      isLoading: true,
      error: null,
    })

    render(<StatefulSetList />)

    expect(screen.getAllByText('Loading...').length).toBeGreaterThan(0)
  })

  it('renders data rows correctly', () => {
    mockUseKubeResources.mockReturnValue({
      data: [
        {
          name: 'redis-cluster',
          namespace: 'default',
          labels: null,
          spec: null,
          status: null,
          raw: {
            metadata: { creationTimestamp: '2025-01-01T00:00:00Z' },
            spec: { replicas: 3 },
            status: { readyReplicas: 3, currentReplicas: 3 },
          },
        },
      ],
      isLoading: false,
      error: null,
    })

    render(<StatefulSetList />)

    expect(screen.getByText('redis-cluster')).toBeDefined()
    expect(screen.getByText('default')).toBeDefined()
    expect(screen.getByText('3/3')).toBeDefined()
  })
})
