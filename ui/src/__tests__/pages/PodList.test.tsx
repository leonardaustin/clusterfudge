import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PodList } from '@/pages/PodList'

vi.mock('@/hooks/useKubeResource', () => ({
  useKubeResources: vi.fn(),
}))

vi.mock('@/hooks/usePodMetrics', () => ({
  usePodMetrics: vi.fn(() => ({ metrics: new Map() })),
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
  // Default: return empty data for all calls (pods + replicasets)
  mockUseKubeResources.mockReturnValue({
    data: [],
    isLoading: false,
    error: null,
  })
})

describe('PodList', () => {
  it('renders title when data is loaded', () => {
    render(
      <MemoryRouter>
        <PodList />
      </MemoryRouter>
    )

    expect(screen.getByText('Pods')).toBeDefined()
    expect(screen.getByText('0 pods across all namespaces')).toBeDefined()
  })

  it('shows loading state', () => {
    mockUseKubeResources.mockReturnValue({
      data: [],
      isLoading: true,
      error: null,
    })

    render(
      <MemoryRouter>
        <PodList />
      </MemoryRouter>
    )

    expect(screen.getAllByText('Loading...').length).toBeGreaterThan(0)
  })

  it('renders data rows correctly', () => {
    // First call returns pods, second call returns replicasets
    mockUseKubeResources
      .mockReturnValueOnce({
        data: [
          {
            name: 'nginx-pod',
            namespace: 'default',
            labels: null,
            spec: null,
            status: null,
            raw: {
              metadata: {
                creationTimestamp: '2025-01-01T00:00:00Z',
                ownerReferences: [],
              },
              spec: {
                nodeName: 'node-1',
                containers: [{ name: 'nginx', image: 'nginx:latest', resources: {} }],
              },
              status: {
                phase: 'Running',
                containerStatuses: [
                  { name: 'nginx', ready: true, restartCount: 2, state: {} },
                ],
              },
            },
          },
        ],
        isLoading: false,
        error: null,
      })
      .mockReturnValueOnce({
        data: [],
        isLoading: false,
        error: null,
      })

    render(
      <MemoryRouter>
        <PodList />
      </MemoryRouter>
    )

    expect(screen.getByText('nginx-pod')).toBeDefined()
    expect(screen.getByText('default')).toBeDefined()
    expect(screen.getByText('1/1')).toBeDefined()
    expect(screen.getByText('2')).toBeDefined()
    expect(screen.getByText('node-1')).toBeDefined()
  })
})
