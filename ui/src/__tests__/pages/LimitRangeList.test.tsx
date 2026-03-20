import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LimitRangeList } from '@/pages/LimitRangeList'

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

describe('LimitRangeList', () => {
  it('shows loading state', () => {
    mockUseKubeResources.mockReturnValue({
      data: [],
      isLoading: true,
      error: null,
    })

    render(<LimitRangeList />)

    expect(screen.getAllByText('Loading...').length).toBeGreaterThan(0)
  })

  it('renders title and count when data is loaded', () => {
    mockUseKubeResources.mockReturnValue({
      data: [{
        name: 'default-limits',
        namespace: 'default',
        labels: null,
        spec: null,
        status: null,
        raw: {
          metadata: { creationTimestamp: '2025-01-01T00:00:00Z' },
          spec: {
            limits: [{
              type: 'Container',
              default: { cpu: '500m', memory: '256Mi' },
              defaultRequest: { cpu: '100m', memory: '128Mi' },
              max: { cpu: '2', memory: '1Gi' },
              min: { cpu: '50m', memory: '64Mi' },
            }],
          },
        },
      }],
      isLoading: false,
      error: null,
    })

    render(<LimitRangeList />)

    expect(screen.getByText('Limit Ranges')).toBeDefined()
    expect(screen.getByText('1 limit ranges')).toBeDefined()
  })

  it('renders limit range rows with type and resource values', () => {
    mockUseKubeResources.mockReturnValue({
      data: [{
        name: 'mem-limits',
        namespace: 'production',
        labels: null,
        spec: null,
        status: null,
        raw: {
          metadata: { creationTimestamp: '2025-01-01T00:00:00Z' },
          spec: {
            limits: [{
              type: 'Container',
              default: { cpu: '1', memory: '512Mi' },
              defaultRequest: { cpu: '250m', memory: '256Mi' },
              max: { cpu: '4', memory: '2Gi' },
              min: { cpu: '100m', memory: '128Mi' },
            }],
          },
        },
      }],
      isLoading: false,
      error: null,
    })

    render(<LimitRangeList />)

    expect(screen.getByText('mem-limits')).toBeDefined()
    expect(screen.getByText('production')).toBeDefined()
    expect(screen.getByText('Container')).toBeDefined()
    expect(screen.getByText('1 / 512Mi')).toBeDefined()
    expect(screen.getByText('250m / 256Mi')).toBeDefined()
    expect(screen.getByText('4 / 2Gi')).toBeDefined()
    expect(screen.getByText('100m / 128Mi')).toBeDefined()
  })
})
