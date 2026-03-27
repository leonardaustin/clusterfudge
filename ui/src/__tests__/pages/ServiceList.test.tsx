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
import { useClusterStore } from '@/stores/clusterStore'

const mockUseKubeResources = vi.mocked(useKubeResources)
const mockUseClusterStore = useClusterStore as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  // Default: services call and endpoints call both return empty
  mockUseKubeResources.mockReturnValue({
    data: [],
    isLoading: false,
    error: null,
  })
  mockUseClusterStore.mockImplementation((selector) =>
    selector({ selectedNamespace: '' })
  )
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

  describe('namespace filtering', () => {
    it('passes selected namespace to useKubeResources for services and endpoints', () => {
      mockUseClusterStore.mockImplementation((selector) =>
        selector({ selectedNamespace: 'production' })
      )

      render(
        <MemoryRouter>
          <ServiceList />
        </MemoryRouter>
      )

      // ServiceList calls useKubeResources for services, endpoints, and pods (detail).
      // The services and endpoints calls should use the selected namespace.
      expect(mockUseKubeResources).toHaveBeenCalledWith(
        expect.objectContaining({ resource: 'services', namespace: 'production' })
      )
      expect(mockUseKubeResources).toHaveBeenCalledWith(
        expect.objectContaining({ resource: 'endpoints', namespace: 'production' })
      )
    })

    it('passes empty namespace when no namespace is selected', () => {
      render(
        <MemoryRouter>
          <ServiceList />
        </MemoryRouter>
      )

      expect(mockUseKubeResources).toHaveBeenCalledWith(
        expect.objectContaining({ resource: 'services', namespace: '' })
      )
      expect(mockUseKubeResources).toHaveBeenCalledWith(
        expect.objectContaining({ resource: 'endpoints', namespace: '' })
      )
    })
  })
})
