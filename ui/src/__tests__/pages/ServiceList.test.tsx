import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ServiceList } from '@/pages/ServiceList'

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
  // Default: services call and endpoints call both return empty
  mockUseKubeResources.mockReturnValue({
    data: [],
    isLoading: false,
    error: null,
  })
})

describe('ServiceList', () => {
  it('renders title when data is loaded', () => {
    render(
      <MemoryRouter>
        <ServiceList />
      </MemoryRouter>
    )

    expect(screen.getByText('Services')).toBeDefined()
    expect(screen.getByText('0 services')).toBeDefined()
  })

  it('shows loading state', () => {
    mockUseKubeResources.mockReturnValue({
      data: [],
      isLoading: true,
      error: null,
    })

    render(
      <MemoryRouter>
        <ServiceList />
      </MemoryRouter>
    )

    expect(screen.getAllByText('Loading...').length).toBeGreaterThan(0)
  })

  it('renders data rows correctly', () => {
    // First call: services, second call: endpoints
    mockUseKubeResources
      .mockReturnValueOnce({
        data: [
          {
            name: 'my-service',
            namespace: 'default',
            labels: null,
            spec: null,
            status: null,
            raw: {
              metadata: { creationTimestamp: '2025-01-01T00:00:00Z' },
              spec: {
                type: 'ClusterIP',
                clusterIP: '10.96.0.1',
                ports: [{ port: 80, protocol: 'TCP', targetPort: 8080 }],
                selector: { app: 'web' },
              },
              status: { loadBalancer: {} },
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
        <ServiceList />
      </MemoryRouter>
    )

    expect(screen.getByText('my-service')).toBeDefined()
    expect(screen.getByText('default')).toBeDefined()
    expect(screen.getByText('ClusterIP')).toBeDefined()
    expect(screen.getByText('10.96.0.1')).toBeDefined()
  })
})
