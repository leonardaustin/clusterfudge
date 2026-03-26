import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HPAList } from '@/pages/HPAList'

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

describe('HPAList', () => {
  it('shows loading state', () => {
    mockUseKubeResources.mockReturnValue({
      data: [],
      isLoading: true,
      error: null,
    })

    render(<HPAList />)

    expect(screen.getAllByText('Loading...').length).toBeGreaterThan(0)
  })

  it('renders title and count when data is loaded', () => {
    mockUseKubeResources.mockReturnValue({
      data: [{
        name: 'web-hpa',
        namespace: 'default',
        labels: null,
        spec: null,
        status: null,
        raw: {
          metadata: { creationTimestamp: '2025-01-01T00:00:00Z' },
          spec: {
            scaleTargetRef: { kind: 'Deployment', name: 'web-app' },
            minReplicas: 2,
            maxReplicas: 10,
            metrics: [],
          },
          status: {
            currentReplicas: 3,
            desiredReplicas: 3,
            currentMetrics: [],
          },
        },
      }],
      isLoading: false,
      error: null,
    })

    render(<HPAList />)

    expect(screen.getByText('Horizontal Pod Autoscalers')).toBeDefined()
    expect(screen.getByText('1 HPAs')).toBeDefined()
  })

  it('renders data rows with reference and replica info', () => {
    mockUseKubeResources.mockReturnValue({
      data: [{
        name: 'api-hpa',
        namespace: 'production',
        labels: null,
        spec: null,
        status: null,
        raw: {
          metadata: { creationTimestamp: '2025-01-01T00:00:00Z' },
          spec: {
            scaleTargetRef: { kind: 'Deployment', name: 'api-server' },
            minReplicas: 1,
            maxReplicas: 5,
            metrics: [{
              type: 'Resource',
              resource: {
                name: 'cpu',
                target: { type: 'Utilization', averageUtilization: 80 },
              },
            }],
          },
          status: {
            currentReplicas: 2,
            desiredReplicas: 2,
            currentMetrics: [{
              resource: {
                current: { averageUtilization: 45 },
              },
            }],
          },
        },
      }],
      isLoading: false,
      error: null,
    })

    render(<HPAList />)

    expect(screen.getByText('api-hpa')).toBeDefined()
    expect(screen.getByText('production')).toBeDefined()
    expect(screen.getByText('Deployment/api-server')).toBeDefined()
    expect(screen.getByText('45%/80% cpu')).toBeDefined()
  })
})
