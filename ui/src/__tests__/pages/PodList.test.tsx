import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PodList } from '@/pages/PodList'

vi.mock('@/hooks/useKubeResource', () => ({
  useKubeResources: vi.fn(),
}))

vi.mock('@/hooks/usePodMetrics', () => ({
  usePodMetrics: vi.fn(() => ({ metrics: new Map() })),
}))

vi.mock('@/hooks/useMetricsHistory', () => ({
  useMetricsHistory: vi.fn(() => ({ history: [], metricsUnavailable: false })),
}))

vi.mock('@/stores/clusterStore', () => ({
  useClusterStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({ selectedNamespace: '' })
  ),
}))

vi.mock('@/stores/uiStore', () => ({
  useUIStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({ setAITarget: vi.fn(), setBottomTrayTab: vi.fn() })
  ),
}))

vi.mock('@/wailsjs/go/handlers/AIHandler', () => ({
  GetAIProviderName: vi.fn(() => Promise.resolve('')),
}))

vi.mock('@/wailsjs/go/handlers/ResourceHandler', () => ({
  GetResource: vi.fn(() => Promise.resolve(null)),
}))

import { useKubeResources } from '@/hooks/useKubeResource'

const mockUseKubeResources = vi.mocked(useKubeResources)

beforeEach(() => {
  vi.clearAllMocks()
  // Default: return empty data for all calls (pods + replicasets)
  mockUseKubeResources.mockReturnValue({
    data: [],
    isLoading: false,
    error: null,
  })
})

describe('PodList', () => {
  it('renders title when data is loaded', () => {
    render(
      <MemoryRouter>
        <PodList />
      </MemoryRouter>
    )

    expect(screen.getByText('Pods')).toBeDefined()
    expect(screen.getByText('0 pods across all namespaces')).toBeDefined()
  })

  it('shows loading state', () => {
    mockUseKubeResources.mockReturnValue({
      data: [],
      isLoading: true,
      error: null,
    })

    render(
      <MemoryRouter>
        <PodList />
      </MemoryRouter>
    )

    expect(screen.getAllByText('Loading...').length).toBeGreaterThan(0)
  })

  it('renders data rows correctly', () => {
    // First call returns pods, second call returns replicasets
    mockUseKubeResources
      .mockReturnValueOnce({
        data: [
          {
            name: 'nginx-pod',
            namespace: 'default',
            labels: null,
            spec: null,
            status: null,
            raw: {
              metadata: {
                creationTimestamp: '2025-01-01T00:00:00Z',
                ownerReferences: [],
              },
              spec: {
                nodeName: 'node-1',
                containers: [{ name: 'nginx', image: 'nginx:latest', resources: {} }],
              },
              status: {
                phase: 'Running',
                containerStatuses: [
                  { name: 'nginx', ready: true, restartCount: 2, state: {} },
                ],
              },
            },
          },
        ],
        isLoading: false,
        error: null,
      })
      .mockReturnValueOnce({
        data: [],
        isLoading: false,
        error: null,
      })

    render(
      <MemoryRouter>
        <PodList />
      </MemoryRouter>
    )

    expect(screen.getByText('nginx-pod')).toBeDefined()
    expect(screen.getByText('default')).toBeDefined()
    expect(screen.getByText('1/1')).toBeDefined()
    expect(screen.getByText('2')).toBeDefined()
    expect(screen.getByText('node-1')).toBeDefined()
  })

  it('wraps pod rows with a context menu trigger', () => {
    mockUseKubeResources
      .mockReturnValueOnce({
        data: [
          {
            name: 'ctx-pod',
            namespace: 'default',
            labels: null,
            spec: null,
            status: null,
            raw: {
              metadata: {
                creationTimestamp: '2025-01-01T00:00:00Z',
                ownerReferences: [],
              },
              spec: {
                nodeName: 'node-1',
                containers: [{ name: 'nginx', image: 'nginx:latest', resources: {} }],
              },
              status: {
                phase: 'Running',
                containerStatuses: [
                  { name: 'nginx', ready: true, restartCount: 0, state: {} },
                ],
              },
            },
          },
        ],
        isLoading: false,
        error: null,
      })
      .mockReturnValueOnce({
        data: [],
        isLoading: false,
        error: null,
      })

    render(
      <MemoryRouter>
        <PodList />
      </MemoryRouter>
    )

    const podRow = screen.getByText('ctx-pod').closest('tr')
    expect(podRow).toBeDefined()

    // The tr should be inside a Radix ContextMenu trigger (data attribute)
    const trigger = podRow?.closest('[data-radix-collection-item]') ?? podRow?.parentElement
    expect(trigger).toBeDefined()

    // Right-click on the row to open the context menu
    fireEvent.contextMenu(podRow!)

    // Radix portals the menu content; check it appears in the document
    // The context menu header should show the pod kind and name
    expect(screen.getByText('Pod')).toBeDefined()
    // 'ctx-pod' appears in both the table cell and the context menu header
    expect(screen.getAllByText('ctx-pod').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('View Logs')).toBeDefined()
    expect(screen.getByText('Exec Shell')).toBeDefined()
    expect(screen.getByText('Debug with AI')).toBeDefined()
  })
})
