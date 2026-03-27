import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DeploymentList } from '@/pages/DeploymentList'

vi.mock('@/hooks/useKubeResource', () => ({
  useKubeResources: vi.fn(),
}))

vi.mock('@/stores/clusterStore', () => ({
  useClusterStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({ selectedNamespace: '' })
  ),
}))

import { useKubeResources } from '@/hooks/useKubeResource'
import { useClusterStore } from '@/stores/clusterStore'

const mockUseKubeResources = vi.mocked(useKubeResources)
const mockUseClusterStore = useClusterStore as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  mockUseKubeResources.mockReturnValue({
    data: [],
    isLoading: false,
    error: null,
  })
  mockUseClusterStore.mockImplementation((selector) =>
    selector({ selectedNamespace: '' })
  )
})

describe('DeploymentList', () => {
  it('renders title when data is loaded', () => {
    render(
      <MemoryRouter>
        <DeploymentList />
      </MemoryRouter>
    )

    expect(screen.getByText('Deployments')).toBeDefined()
    expect(screen.getByText('0 deployments across all namespaces')).toBeDefined()
  })

  it('shows loading state', () => {
    mockUseKubeResources.mockReturnValue({
      data: [],
      isLoading: true,
      error: null,
    })

    render(
      <MemoryRouter>
        <DeploymentList />
      </MemoryRouter>
    )

    expect(screen.getAllByText('Loading...').length).toBeGreaterThan(0)
  })

  it('renders data rows correctly', () => {
    mockUseKubeResources.mockReturnValue({
      data: [
        {
          name: 'nginx-deploy',
          namespace: 'default',
          labels: null,
          spec: null,
          status: null,
          raw: {
            metadata: { creationTimestamp: '2025-01-01T00:00:00Z' },
            spec: {
              replicas: 3,
              strategy: { type: 'RollingUpdate' },
              template: {
                spec: {
                  containers: [{ name: 'nginx', image: 'nginx:1.25' }],
                },
              },
            },
            status: {
              readyReplicas: 3,
              updatedReplicas: 3,
              availableReplicas: 3,
            },
          },
        },
      ],
      isLoading: false,
      error: null,
    })

    render(
      <MemoryRouter>
        <DeploymentList />
      </MemoryRouter>
    )

    expect(screen.getByText('nginx-deploy')).toBeDefined()
    expect(screen.getByText('default')).toBeDefined()
    expect(screen.getByText('3/3')).toBeDefined()
    expect(screen.getByText('RollingUpdate')).toBeDefined()
    expect(screen.getByText('nginx:1.25')).toBeDefined()
  })

  describe('namespace filtering', () => {
    it('passes selected namespace to useKubeResources', () => {
      mockUseClusterStore.mockImplementation((selector) =>
        selector({ selectedNamespace: 'production' })
      )

      render(
        <MemoryRouter>
          <DeploymentList />
        </MemoryRouter>
      )

      expect(mockUseKubeResources).toHaveBeenCalledWith(
        expect.objectContaining({ namespace: 'production' })
      )
    })

    it('passes empty namespace when no namespace is selected', () => {
      render(
        <MemoryRouter>
          <DeploymentList />
        </MemoryRouter>
      )

      expect(mockUseKubeResources).toHaveBeenCalledWith(
        expect.objectContaining({ namespace: '' })
      )
    })
  })
})
