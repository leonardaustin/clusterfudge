import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PriorityClassList } from '@/pages/PriorityClassList'

vi.mock('@/hooks/useKubeResource', () => ({
  useKubeResources: vi.fn(),
}))

import { useKubeResources } from '@/hooks/useKubeResource'

const mockUseKubeResources = vi.mocked(useKubeResources)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PriorityClassList', () => {
  it('shows loading state', () => {
    mockUseKubeResources.mockReturnValue({
      data: [],
      isLoading: true,
      error: null,
    })

    render(<PriorityClassList />)

    expect(screen.getByText('Loading priority classes...')).toBeDefined()
  })

  it('renders title and count when data is loaded', () => {
    mockUseKubeResources.mockReturnValue({
      data: [{
        name: 'system-cluster-critical',
        namespace: '',
        labels: null,
        spec: null,
        status: null,
        raw: {
          metadata: { creationTimestamp: '2025-01-01T00:00:00Z' },
          value: 2000000000,
          globalDefault: false,
          preemptionPolicy: 'PreemptLowerPriority',
          description: 'Used for system critical pods',
        },
      }],
      isLoading: false,
      error: null,
    })

    render(<PriorityClassList />)

    expect(screen.getByText('Priority Classes')).toBeDefined()
    expect(screen.getByText('1 priority classes in the cluster')).toBeDefined()
  })

  it('renders priority class rows with value and preemption policy', () => {
    mockUseKubeResources.mockReturnValue({
      data: [{
        name: 'high-priority',
        namespace: '',
        labels: null,
        spec: null,
        status: null,
        raw: {
          metadata: { creationTimestamp: '2025-01-01T00:00:00Z' },
          value: 1000000,
          globalDefault: true,
          preemptionPolicy: 'Never',
          description: 'High priority workloads',
        },
      }],
      isLoading: false,
      error: null,
    })

    render(<PriorityClassList />)

    expect(screen.getByText('high-priority')).toBeDefined()
    expect(screen.getByText('1,000,000')).toBeDefined()
    expect(screen.getByText('True')).toBeDefined()
    expect(screen.getByText('Never')).toBeDefined()
    expect(screen.getByText('High priority workloads')).toBeDefined()
  })
})
