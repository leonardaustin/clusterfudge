import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EndpointList } from '@/pages/EndpointList'

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
})

describe('EndpointList', () => {
  it('shows loading state', () => {
    mockUseKubeResources.mockReturnValue({
      data: [],
      isLoading: true,
      error: null,
    })

    render(<EndpointList />)

    expect(screen.getAllByText('Loading...').length).toBeGreaterThan(0)
  })

  it('renders title and count when data is loaded', () => {
    mockUseKubeResources.mockReturnValue({
      data: [{
        name: 'kubernetes',
        namespace: 'default',
        labels: null,
        spec: null,
        status: null,
        raw: {
          metadata: { creationTimestamp: '2025-01-01T00:00:00Z' },
          subsets: [
            {
              addresses: [{ ip: '10.0.0.1' }],
              ports: [{ port: 443 }],
            },
          ],
        },
      }],
      isLoading: false,
      error: null,
    })

    render(<EndpointList />)

    expect(screen.getByRole('heading', { name: 'Endpoints' })).toBeDefined()
    expect(screen.getByText('1 endpoints')).toBeDefined()
  })

  it('renders endpoint rows with formatted addresses', () => {
    mockUseKubeResources.mockReturnValue({
      data: [{
        name: 'my-service',
        namespace: 'production',
        labels: null,
        spec: null,
        status: null,
        raw: {
          metadata: { creationTimestamp: '2025-01-01T00:00:00Z' },
          subsets: [
            {
              addresses: [{ ip: '10.0.0.1' }, { ip: '10.0.0.2' }],
              ports: [{ port: 8080 }],
            },
          ],
        },
      }],
      isLoading: false,
      error: null,
    })

    render(<EndpointList />)

    expect(screen.getByText('my-service')).toBeDefined()
    expect(screen.getByText('production')).toBeDefined()
    expect(screen.getByText('10.0.0.1:8080, 10.0.0.2:8080')).toBeDefined()
  })
})
