import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'

vi.mock('@/wailsjs/go/handlers/NetPolHandler', () => ({
  BuildClusterNetworkGraph: vi.fn().mockResolvedValue({ groups: [], edges: [] }),
}))

vi.mock('@/stores/toastStore', () => ({
  useToastStore: Object.assign(vi.fn(() => ({ addToast: vi.fn() })), {
    getState: vi.fn(() => ({ addToast: vi.fn() })),
  }),
}))

vi.mock('@/stores/clusterStore', () => ({
  useClusterStore: vi.fn((selector: (s: { selectedNamespace: string }) => unknown) =>
    selector({ selectedNamespace: '' })
  ),
}))

vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ children }: { children?: React.ReactNode }) => <div data-testid="react-flow">{children}</div>,
  Background: () => null,
  Controls: () => null,
  useNodesState: (initial: unknown[]) => [initial, vi.fn(), vi.fn()],
  useEdgesState: (initial: unknown[]) => [initial, vi.fn(), vi.fn()],
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
  MarkerType: { ArrowClosed: 'arrowclosed' },
}))

vi.mock('@dagrejs/dagre', () => {
  class MockGraph {
    setDefaultEdgeLabel() { return this }
    setGraph() {}
    setNode() {}
    setEdge() {}
    node() { return { x: 0, y: 0 } }
  }
  return {
    default: {
      graphlib: { Graph: MockGraph },
      layout: vi.fn(),
    },
  }
})

import { BuildClusterNetworkGraph, type NetworkGraph } from '@/wailsjs/go/handlers/NetPolHandler'
import { useClusterStore } from '@/stores/clusterStore'
import { NetworkPolicyGraph } from '@/pages/NetworkPolicyGraph'

const mockBuildNetworkGraph = vi.mocked(BuildClusterNetworkGraph)
const mockUseClusterStore = useClusterStore as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  mockBuildNetworkGraph.mockResolvedValue({ groups: [], edges: [] })
  mockUseClusterStore.mockImplementation((selector) =>
    selector({ selectedNamespace: '' })
  )
})

const sampleGraph: NetworkGraph = {
  groups: [
    { id: 'g1', name: 'frontend', namespace: 'default', labels: { app: 'frontend' }, podCount: 3, isolated: false },
    { id: 'g2', name: 'backend', namespace: 'default', labels: { app: 'backend' }, podCount: 2, isolated: false },
    { id: 'g3', name: 'database', namespace: 'default', labels: { app: 'db' }, podCount: 1, isolated: true },
  ],
  edges: [
    { from: 'g1', to: 'g2', port: 8080, protocol: 'TCP', allowed: true, policyRef: 'allow-frontend' },
    { from: 'g2', to: 'g3', port: 5432, protocol: 'TCP', allowed: true, policyRef: 'allow-db' },
  ],
}

describe('NetworkPolicyGraph', () => {
  it('renders with title and shows loading state', async () => {
    let resolvePromise!: (value: NetworkGraph) => void
    mockBuildNetworkGraph.mockReturnValue(new Promise((resolve) => { resolvePromise = resolve }))

    await act(async () => { render(<NetworkPolicyGraph />) })
    expect(screen.getByText('Network Policy Graph')).toBeDefined()
    expect(screen.getByText('Building network graph...')).toBeDefined()

    await act(async () => { resolvePromise({ groups: [], edges: [] }) })
  })

  it('renders graph view by default after loading', async () => {
    mockBuildNetworkGraph.mockResolvedValue(sampleGraph)

    await act(async () => { render(<NetworkPolicyGraph />) })

    expect(screen.getByTestId('react-flow')).toBeDefined()
    expect(screen.getByText('2 edges, 3 pod groups')).toBeDefined()
  })

  it('switches to table view when Table tab is clicked', async () => {
    mockBuildNetworkGraph.mockResolvedValue(sampleGraph)

    await act(async () => { render(<NetworkPolicyGraph />) })

    const tableTab = screen.getByRole('tab', { name: 'Table' })
    await act(async () => { fireEvent.click(tableTab) })

    expect(screen.getByText('frontend')).toBeDefined()
    expect(screen.getAllByText('backend').length).toBeGreaterThan(0)
  })

  it('shows legend in graph view', async () => {
    mockBuildNetworkGraph.mockResolvedValue(sampleGraph)

    await act(async () => { render(<NetworkPolicyGraph />) })

    expect(screen.getByText('Pod Group')).toBeDefined()
    expect(screen.getByText('Isolated')).toBeDefined()
    expect(screen.getByText('Allow (animated)')).toBeDefined()
    expect(screen.getByText('Deny')).toBeDefined()
  })

  it('shows error state on failure', async () => {
    mockBuildNetworkGraph.mockRejectedValue(new Error('no permissions'))

    await act(async () => { render(<NetworkPolicyGraph />) })
    expect(screen.getByText(/Failed to build network policy graph/)).toBeDefined()
  })

  it('handles null groups without crashing', async () => {
    mockBuildNetworkGraph.mockResolvedValue({ groups: null, edges: [] } as unknown as NetworkGraph)

    await act(async () => { render(<NetworkPolicyGraph />) })
    expect(screen.getByText('0 edges, 0 pod groups')).toBeDefined()
  })

  it('handles missing groups field without crashing', async () => {
    mockBuildNetworkGraph.mockResolvedValue({ edges: [] } as unknown as NetworkGraph)

    await act(async () => { render(<NetworkPolicyGraph />) })
    expect(screen.getByText('0 edges, 0 pod groups')).toBeDefined()
  })

  describe('namespace filtering', () => {
    const multiNsGraph: NetworkGraph = {
      groups: [
        { id: 'g1', name: 'web', namespace: 'frontend', labels: { app: 'web' }, podCount: 2, isolated: false },
        { id: 'g2', name: 'api', namespace: 'frontend', labels: { app: 'api' }, podCount: 1, isolated: false },
        { id: 'g3', name: 'db', namespace: 'backend', labels: { app: 'db' }, podCount: 1, isolated: false },
        { id: 'g4', name: 'cache', namespace: 'backend', labels: { app: 'cache' }, podCount: 1, isolated: true },
      ],
      edges: [
        { from: 'g1', to: 'g2', port: 3000, protocol: 'TCP', allowed: true, policyRef: 'allow-web' },
        { from: 'g2', to: 'g3', port: 5432, protocol: 'TCP', allowed: true, policyRef: 'allow-api-db' },
      ],
    }

    it('shows all edges in table view when no namespace is selected', async () => {
      mockBuildNetworkGraph.mockResolvedValue(multiNsGraph)

      await act(async () => { render(<NetworkPolicyGraph />) })
      const tableTab = screen.getByRole('tab', { name: 'Table' })
      await act(async () => { fireEvent.click(tableTab) })

      // 'api' appears as both source and destination across 2 edges
      expect(screen.getAllByText('web').length).toBeGreaterThan(0)
      expect(screen.getAllByText('api').length).toBeGreaterThan(0)
      expect(screen.getAllByText('db').length).toBeGreaterThan(0)
    })

    it('filters edges to selected namespace in table view', async () => {
      mockUseClusterStore.mockImplementation((selector) =>
        selector({ selectedNamespace: 'frontend' })
      )
      mockBuildNetworkGraph.mockResolvedValue(multiNsGraph)

      await act(async () => { render(<NetworkPolicyGraph />) })
      const tableTab = screen.getByRole('tab', { name: 'Table' })
      await act(async () => { fireEvent.click(tableTab) })

      // Both edges match because g2 (api) is in 'frontend' namespace
      expect(screen.getAllByText('web').length).toBeGreaterThan(0)
      expect(screen.getAllByText('api').length).toBeGreaterThan(0)
    })

    it('shows no edges when namespace has no matching pods', async () => {
      mockUseClusterStore.mockImplementation((selector) =>
        selector({ selectedNamespace: 'nonexistent' })
      )
      mockBuildNetworkGraph.mockResolvedValue(multiNsGraph)

      await act(async () => { render(<NetworkPolicyGraph />) })
      const tableTab = screen.getByRole('tab', { name: 'Table' })
      await act(async () => { fireEvent.click(tableTab) })

      expect(screen.getByText('No network edges match your filters')).toBeDefined()
    })

    it('updates subtitle to reflect filtered edge count', async () => {
      mockUseClusterStore.mockImplementation((selector) =>
        selector({ selectedNamespace: 'frontend' })
      )
      mockBuildNetworkGraph.mockResolvedValue(multiNsGraph)

      await act(async () => { render(<NetworkPolicyGraph />) })

      // With 'frontend' selected, both edges match (g1→g2 and g2→g3 since g2 is in frontend)
      expect(screen.getByText('2 of 2 edges, 4 pod groups')).toBeDefined()
    })
  })
})
