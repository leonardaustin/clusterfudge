import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Events } from '@/pages/Events'

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

describe('Events', () => {
  it('renders title when data is loaded', () => {
    render(<Events />)

    expect(screen.getByText('Events')).toBeDefined()
    expect(screen.getByText('0 events across all namespaces')).toBeDefined()
  })

  it('shows loading state', () => {
    mockUseKubeResources.mockReturnValue({
      data: [],
      isLoading: true,
      error: null,
    })

    render(<Events />)

    expect(screen.getByText('Loading events...')).toBeDefined()
  })

  it('renders data rows correctly', () => {
    mockUseKubeResources.mockReturnValue({
      data: [
        {
          name: 'test-event',
          namespace: 'default',
          labels: null,
          spec: null,
          status: null,
          raw: {
            type: 'Warning',
            reason: 'BackOff',
            message: 'Back-off restarting failed container',
            involvedObject: { kind: 'Pod', name: 'my-pod' },
            count: 5,
            firstTimestamp: '2025-01-01T00:00:00Z',
            lastTimestamp: '2025-01-01T01:00:00Z',
            source: { component: 'kubelet' },
          },
        },
      ],
      isLoading: false,
      error: null,
    })

    render(<Events />)

    // "Warning" appears both as a filter tab and as the event badge
    expect(screen.getAllByText('Warning').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('BackOff')).toBeDefined()
    expect(screen.getByText('Pod/my-pod')).toBeDefined()
    expect(screen.getByText('Back-off restarting failed container')).toBeDefined()
    expect(screen.getByText('5')).toBeDefined()
    expect(screen.getByText('kubelet')).toBeDefined()
  })
})
