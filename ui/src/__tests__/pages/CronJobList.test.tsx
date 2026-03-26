import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CronJobList } from '@/pages/CronJobList'

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

describe('CronJobList', () => {
  it('renders title when data is loaded', () => {
    render(<CronJobList />)

    expect(screen.getByText('CronJobs')).toBeDefined()
    expect(screen.getByText('0 cronjobs across all namespaces')).toBeDefined()
  })

  it('shows loading state', () => {
    mockUseKubeResources.mockReturnValue({
      data: [],
      isLoading: true,
      error: null,
    })

    render(<CronJobList />)

    expect(screen.getAllByText('Loading...').length).toBeGreaterThan(0)
  })

  it('renders data rows correctly', () => {
    mockUseKubeResources.mockReturnValue({
      data: [
        {
          name: 'nightly-backup',
          namespace: 'default',
          labels: null,
          spec: null,
          status: null,
          raw: {
            metadata: { creationTimestamp: '2025-01-01T00:00:00Z' },
            spec: {
              schedule: '0 2 * * *',
              suspend: false,
            },
            status: {
              active: [],
              lastScheduleTime: '2025-01-02T02:00:00Z',
            },
          },
        },
      ],
      isLoading: false,
      error: null,
    })

    render(<CronJobList />)

    expect(screen.getByText('nightly-backup')).toBeDefined()
    expect(screen.getByText('default')).toBeDefined()
    expect(screen.getByText('0 2 * * *')).toBeDefined()
  })
})
