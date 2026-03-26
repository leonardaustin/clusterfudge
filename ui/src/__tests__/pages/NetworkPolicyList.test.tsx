import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NetworkPolicyList } from '@/pages/NetworkPolicyList'

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

describe('NetworkPolicyList', () => {
  it('shows loading state', () => {
    mockUseKubeResources.mockReturnValue({
      data: [],
      isLoading: true,
      error: null,
    })

    render(<NetworkPolicyList />)

    expect(screen.getAllByText('Loading...').length).toBeGreaterThan(0)
  })

  it('renders title and count when data is loaded', () => {
    mockUseKubeResources.mockReturnValue({
      data: [{
        name: 'deny-all',
        namespace: 'default',
        labels: null,
        spec: null,
        status: null,
        raw: {
          metadata: { creationTimestamp: '2025-01-01T00:00:00Z' },
          spec: {
            podSelector: { matchLabels: { app: 'web' } },
            policyTypes: ['Ingress', 'Egress'],
            ingress: [],
            egress: [],
          },
        },
      }],
      isLoading: false,
      error: null,
    })

    render(<NetworkPolicyList />)

    expect(screen.getByText('Network Policies')).toBeDefined()
    expect(screen.getByText('1 network policies')).toBeDefined()
  })

  it('renders data rows with pod selector and policy types', () => {
    mockUseKubeResources.mockReturnValue({
      data: [{
        name: 'allow-frontend',
        namespace: 'production',
        labels: null,
        spec: null,
        status: null,
        raw: {
          metadata: { creationTimestamp: '2025-01-01T00:00:00Z' },
          spec: {
            podSelector: { matchLabels: { tier: 'frontend' } },
            policyTypes: ['Ingress'],
            ingress: [
              {
                ports: [{ protocol: 'TCP', port: 80 }],
                from: [{ podSelector: { matchLabels: { role: 'api' } } }],
              },
            ],
          },
        },
      }],
      isLoading: false,
      error: null,
    })

    render(<NetworkPolicyList />)

    expect(screen.getByText('allow-frontend')).toBeDefined()
    expect(screen.getByText('production')).toBeDefined()
    expect(screen.getByText('tier=frontend')).toBeDefined()
    expect(screen.getByText('Ingress')).toBeDefined()
  })
})
