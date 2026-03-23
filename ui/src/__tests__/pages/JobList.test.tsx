import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { JobList } from '@/pages/JobList'

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

describe('JobList', () => {
  it('renders title when data is loaded', () => {
    render(
      <MemoryRouter>
        <JobList />
      </MemoryRouter>
    )

    expect(screen.getByText('Jobs')).toBeDefined()
    expect(screen.getByText('0 jobs across all namespaces')).toBeDefined()
  })

  it('shows loading state', () => {
    mockUseKubeResources.mockReturnValue({
      data: [],
      isLoading: true,
      error: null,
    })

    render(
      <MemoryRouter>
        <JobList />
      </MemoryRouter>
    )

    expect(screen.getAllByText('Loading...').length).toBeGreaterThan(0)
  })

  it('renders data rows correctly', () => {
    mockUseKubeResources.mockReturnValue({
      data: [
        {
          name: 'data-migration',
          namespace: 'default',
          labels: null,
          spec: null,
          status: null,
          raw: {
            metadata: {
              creationTimestamp: '2025-01-01T00:00:00Z',
              ownerReferences: [],
            },
            spec: { completions: 1 },
            status: {
              succeeded: 1,
              startTime: '2025-01-01T00:00:00Z',
              completionTime: '2025-01-01T00:05:00Z',
              conditions: [
                { type: 'Complete', status: 'True' },
              ],
            },
          },
        },
      ],
      isLoading: false,
      error: null,
    })

    render(
      <MemoryRouter>
        <JobList />
      </MemoryRouter>
    )

    expect(screen.getByText('data-migration')).toBeDefined()
    expect(screen.getByText('default')).toBeDefined()
    expect(screen.getByText('1/1')).toBeDefined()
    expect(screen.getByText('5m')).toBeDefined()
  })
})
