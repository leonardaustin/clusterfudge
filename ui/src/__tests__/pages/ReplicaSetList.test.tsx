import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ReplicaSetList } from '@/pages/ReplicaSetList'

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

describe('ReplicaSetList', () => {
  it('renders title when data is loaded', () => {
    render(
      <MemoryRouter>
        <ReplicaSetList />
      </MemoryRouter>
    )

    expect(screen.getByText('ReplicaSets')).toBeDefined()
    expect(screen.getByText('0 replicasets across all namespaces')).toBeDefined()
  })

  it('shows loading state', () => {
    mockUseKubeResources.mockReturnValue({
      data: [],
      isLoading: true,
      error: null,
    })

    render(
      <MemoryRouter>
        <ReplicaSetList />
      </MemoryRouter>
    )

    expect(screen.getAllByText('Loading...').length).toBeGreaterThan(0)
  })

  it('renders data rows correctly', () => {
    mockUseKubeResources.mockReturnValue({
      data: [
        {
          name: 'nginx-deploy-abc123',
          namespace: 'default',
          labels: null,
          spec: null,
          status: null,
          raw: {
            metadata: {
              creationTimestamp: '2025-01-01T00:00:00Z',
              ownerReferences: [
                { kind: 'Deployment', name: 'nginx-deploy', uid: 'uid-1' },
              ],
            },
            spec: { replicas: 3 },
            status: { replicas: 3, readyReplicas: 3 },
          },
        },
      ],
      isLoading: false,
      error: null,
    })

    render(
      <MemoryRouter>
        <ReplicaSetList />
      </MemoryRouter>
    )

    expect(screen.getByText('nginx-deploy-abc123')).toBeDefined()
    expect(screen.getByText('default')).toBeDefined()
    expect(screen.getByText('Deployment/nginx-deploy')).toBeDefined()
  })
})
