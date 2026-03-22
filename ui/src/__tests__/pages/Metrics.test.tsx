import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/hooks/useKubeResource', () => ({
  useKubeResources: vi.fn(() => ({ data: [], isLoading: false, error: null })),
}))

vi.mock('@/hooks/usePodMetrics', () => ({
  usePodMetrics: vi.fn(() => ({ metrics: new Map() })),
}))

vi.mock('@/stores/clusterStore', () => ({
  useClusterStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({ selectedNamespace: '' })
  ),
}))

import { Metrics } from '@/pages/Metrics'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Metrics', () => {
  it('renders with title and subtitle', () => {
    render(<Metrics />)
    expect(screen.getByText('Metrics')).toBeDefined()
    expect(screen.getByText('Cluster resource utilization overview')).toBeDefined()
  })

  it('renders cluster utilization section', () => {
    render(<Metrics />)
    expect(screen.getByText('Cluster Utilization')).toBeDefined()
    expect(screen.getByText('CPU')).toBeDefined()
    expect(screen.getByText('Memory')).toBeDefined()
  })

  it('renders dashboard sections', () => {
    render(<Metrics />)
    expect(screen.getByText('Node Comparison')).toBeDefined()
    expect(screen.getByText('Top Pods by CPU')).toBeDefined()
    expect(screen.getByText('Top Pods by Memory')).toBeDefined()
    expect(screen.getByText('Per-Namespace Resource Usage')).toBeDefined()
  })
})
