import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'

vi.mock('@/wailsjs/go/handlers/RBACHandler', () => ({
  BuildClusterRBACGraph: vi.fn().mockResolvedValue({ subjects: [], roles: [], bindings: [] }),
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

import { BuildClusterRBACGraph, type RBACGraph as RBACGraphType } from '@/wailsjs/go/handlers/RBACHandler'
import { RBACGraph } from '@/pages/RBACGraph'

const mockBuildRBACGraph = vi.mocked(BuildClusterRBACGraph)

beforeEach(() => {
  vi.clearAllMocks()
  mockBuildRBACGraph.mockResolvedValue({ subjects: [], roles: [], bindings: [] })
})

const sampleBindings = [
  {
    bindingName: 'admin-binding',
    bindingKind: 'ClusterRoleBinding',
    subject: { kind: 'User', name: 'admin-user', namespace: '' },
    roleName: 'cluster-admin',
    roleKind: 'ClusterRole',
    namespace: '',
  },
  {
    bindingName: 'dev-binding',
    bindingKind: 'RoleBinding',
    subject: { kind: 'ServiceAccount', name: 'dev-sa', namespace: 'default' },
    roleName: 'developer',
    roleKind: 'Role',
    namespace: 'default',
  },
]

describe('RBACGraph', () => {
  it('renders with title and shows loading state', async () => {
    let resolvePromise!: (value: RBACGraphType) => void
    mockBuildRBACGraph.mockReturnValue(new Promise((resolve) => { resolvePromise = resolve }))

    await act(async () => { render(<RBACGraph />) })
    expect(screen.getByText('RBAC Graph')).toBeDefined()
    expect(screen.getByText('Building RBAC graph...')).toBeDefined()

    await act(async () => { resolvePromise({ subjects: [], roles: [], bindings: [] }) })
  })

  it('renders graph view by default after loading', async () => {
    mockBuildRBACGraph.mockResolvedValue({ subjects: [], roles: [], bindings: sampleBindings })

    await act(async () => { render(<RBACGraph />) })

    expect(screen.getByTestId('react-flow')).toBeDefined()
    expect(screen.getByText('2 bindings')).toBeDefined()
  })

  it('switches to table view when Table tab is clicked', async () => {
    mockBuildRBACGraph.mockResolvedValue({ subjects: [], roles: [], bindings: sampleBindings })

    await act(async () => { render(<RBACGraph />) })

    const tableTab = screen.getByRole('tab', { name: 'Table' })
    await act(async () => { fireEvent.click(tableTab) })

    expect(screen.getByText('admin-user')).toBeDefined()
    expect(screen.getByText('cluster-admin')).toBeDefined()
    expect(screen.getByText('dev-sa')).toBeDefined()
  })

  it('shows legend with node types in graph view', async () => {
    mockBuildRBACGraph.mockResolvedValue({ subjects: [], roles: [], bindings: sampleBindings })

    await act(async () => { render(<RBACGraph />) })

    expect(screen.getByText('User')).toBeDefined()
    expect(screen.getByText('ServiceAccount')).toBeDefined()
    expect(screen.getByText('ClusterRole')).toBeDefined()
  })

  it('shows error state on failure', async () => {
    mockBuildRBACGraph.mockRejectedValue(new Error('rbac access denied'))

    await act(async () => { render(<RBACGraph />) })
    expect(screen.getByText(/Failed to load RBAC data/)).toBeDefined()
  })

  it('renders binding count in subtitle', async () => {
    mockBuildRBACGraph.mockResolvedValue({ subjects: [], roles: [], bindings: sampleBindings })

    await act(async () => { render(<RBACGraph />) })
    expect(screen.getByText('2 bindings')).toBeDefined()
  })
})
