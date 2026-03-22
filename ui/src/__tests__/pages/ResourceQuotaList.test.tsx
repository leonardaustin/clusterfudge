import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ResourceQuotaList } from '@/pages/ResourceQuotaList'

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

describe('ResourceQuotaList', () => {
  it('shows loading state', () => {
    mockUseKubeResources.mockReturnValue({
      data: [],
      isLoading: true,
      error: null,
    })

    render(<ResourceQuotaList />)

    expect(screen.getAllByText('Loading...').length).toBeGreaterThan(0)
  })

  it('renders title and count when data is loaded', () => {
    mockUseKubeResources.mockReturnValue({
      data: [{
        name: 'compute-quota',
        namespace: 'default',
        labels: null,
        spec: null,
        status: null,
        raw: {
          metadata: { creationTimestamp: '2025-01-01T00:00:00Z' },
          spec: {
            hard: { cpu: '10', memory: '16Gi', pods: '20' },
          },
          status: {
            used: { cpu: '5', memory: '8Gi', pods: '12' },
          },
        },
      }],
      isLoading: false,
      error: null,
    })

    render(<ResourceQuotaList />)

    expect(screen.getByText('Resource Quotas')).toBeDefined()
    expect(screen.getByText('1 resource quotas')).toBeDefined()
  })

  it('renders resource quota rows with usage percentages', () => {
    mockUseKubeResources.mockReturnValue({
      data: [{
        name: 'team-quota',
        namespace: 'team-a',
        labels: null,
        spec: null,
        status: null,
        raw: {
          metadata: { creationTimestamp: '2025-01-01T00:00:00Z' },
          spec: {
            hard: { cpu: '8', memory: '32Gi', pods: '50' },
          },
          status: {
            used: { cpu: '4', memory: '16Gi', pods: '25' },
          },
        },
      }],
      isLoading: false,
      error: null,
    })

    render(<ResourceQuotaList />)

    expect(screen.getByText('team-quota')).toBeDefined()
    expect(screen.getByText('team-a')).toBeDefined()
    expect(screen.getByText('4 / 8 (50%)')).toBeDefined()
    expect(screen.getByText('16Gi / 32Gi (50%)')).toBeDefined()
    expect(screen.getByText('25 / 50 (50%)')).toBeDefined()
  })
})
