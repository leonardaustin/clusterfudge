import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PDBList } from '@/pages/PDBList'

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

describe('PDBList', () => {
  it('shows loading state', () => {
    mockUseKubeResources.mockReturnValue({
      data: [],
      isLoading: true,
      error: null,
    })

    render(<PDBList />)

    expect(screen.getAllByText('Loading...').length).toBeGreaterThan(0)
  })

  it('renders title and count when data is loaded', () => {
    mockUseKubeResources.mockReturnValue({
      data: [{
        name: 'web-pdb',
        namespace: 'default',
        labels: null,
        spec: null,
        status: null,
        raw: {
          metadata: { creationTimestamp: '2025-01-01T00:00:00Z' },
          spec: { minAvailable: 2, maxUnavailable: null },
          status: { currentHealthy: 3, desiredHealthy: 2, disruptionsAllowed: 1 },
        },
      }],
      isLoading: false,
      error: null,
    })

    render(<PDBList />)

    expect(screen.getByText('Pod Disruption Budgets')).toBeDefined()
    expect(screen.getByText('1 PDBs across all namespaces')).toBeDefined()
  })

  it('renders data rows with disruption budget details', () => {
    mockUseKubeResources.mockReturnValue({
      data: [{
        name: 'api-pdb',
        namespace: 'production',
        labels: null,
        spec: null,
        status: null,
        raw: {
          metadata: { creationTimestamp: '2025-01-01T00:00:00Z' },
          spec: { minAvailable: 1, maxUnavailable: null },
          status: { currentHealthy: 3, desiredHealthy: 1, disruptionsAllowed: 2 },
        },
      }],
      isLoading: false,
      error: null,
    })

    render(<PDBList />)

    expect(screen.getByText('api-pdb')).toBeDefined()
    expect(screen.getByText('production')).toBeDefined()
    expect(screen.getByText('3')).toBeDefined()
  })
})
