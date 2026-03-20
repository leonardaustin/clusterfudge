import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { IngressList } from '@/pages/IngressList'

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

describe('IngressList', () => {
  it('shows loading state', () => {
    mockUseKubeResources.mockReturnValue({
      data: [],
      isLoading: true,
      error: null,
    })

    render(<IngressList />)

    expect(screen.getAllByText('Loading...').length).toBeGreaterThan(0)
  })

  it('renders title and count when data is loaded', () => {
    mockUseKubeResources.mockReturnValue({
      data: [{
        name: 'my-ingress',
        namespace: 'default',
        labels: null,
        spec: null,
        status: null,
        raw: {
          metadata: { creationTimestamp: '2025-01-01T00:00:00Z' },
          spec: {
            ingressClassName: 'nginx',
            rules: [
              {
                host: 'example.com',
                http: {
                  paths: [{
                    path: '/',
                    pathType: 'Prefix',
                    backend: { service: { name: 'my-svc', port: { number: 80 } } },
                  }],
                },
              },
            ],
            tls: [{ hosts: ['example.com'], secretName: 'tls-secret' }],
          },
          status: {
            loadBalancer: { ingress: [{ ip: '10.0.0.1' }] },
          },
        },
      }],
      isLoading: false,
      error: null,
    })

    render(<IngressList />)

    expect(screen.getByText('Ingresses')).toBeDefined()
    expect(screen.getByText('1 ingresses')).toBeDefined()
  })

  it('renders ingress rows with host, class, and address', () => {
    mockUseKubeResources.mockReturnValue({
      data: [{
        name: 'web-ingress',
        namespace: 'production',
        labels: null,
        spec: null,
        status: null,
        raw: {
          metadata: { creationTimestamp: '2025-01-01T00:00:00Z' },
          spec: {
            ingressClassName: 'nginx',
            rules: [
              {
                host: 'app.example.com',
                http: {
                  paths: [{
                    path: '/api',
                    pathType: 'Prefix',
                    backend: { service: { name: 'api-svc', port: { number: 8080 } } },
                  }],
                },
              },
            ],
          },
          status: {
            loadBalancer: { ingress: [{ ip: '192.168.1.100' }] },
          },
        },
      }],
      isLoading: false,
      error: null,
    })

    render(<IngressList />)

    expect(screen.getByText('web-ingress')).toBeDefined()
    expect(screen.getByText('production')).toBeDefined()
    expect(screen.getByText('nginx')).toBeDefined()
    expect(screen.getByText('app.example.com')).toBeDefined()
    expect(screen.getByText('192.168.1.100')).toBeDefined()
    expect(screen.getByText('No')).toBeDefined()
  })
})
