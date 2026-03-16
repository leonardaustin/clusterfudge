import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

vi.mock('@/wailsjs/go/handlers/RBACHandler', () => ({
  BuildClusterRBACGraph: vi.fn().mockResolvedValue({ subjects: [], roles: [], bindings: [] }),
}))

vi.mock('@/stores/toastStore', () => ({
  useToastStore: Object.assign(vi.fn(() => ({ addToast: vi.fn() })), {
    getState: vi.fn(() => ({ addToast: vi.fn() })),
  }),
}))

import { BuildClusterRBACGraph, type RBACGraph as RBACGraphType } from '@/wailsjs/go/handlers/RBACHandler'
import { RBACGraph } from '@/pages/RBACGraph'

const mockBuildRBACGraph = vi.mocked(BuildClusterRBACGraph)

beforeEach(() => {
  vi.clearAllMocks()
  mockBuildRBACGraph.mockResolvedValue({ subjects: [], roles: [], bindings: [] })
})

describe('RBACGraph', () => {
  it('renders with title and shows loading state', async () => {
    let resolvePromise!: (value: RBACGraphType) => void
    mockBuildRBACGraph.mockReturnValue(new Promise((resolve) => { resolvePromise = resolve }))

    await act(async () => { render(<RBACGraph />) })
    expect(screen.getByText('RBAC Graph')).toBeDefined()
    expect(screen.getByText('Building RBAC graph...')).toBeDefined()

    await act(async () => { resolvePromise({ subjects: [], roles: [], bindings: [] }) })
  })

  it('renders table after loading with no bindings', async () => {
    await act(async () => { render(<RBACGraph />) })
    expect(screen.getByText('0 bindings')).toBeDefined()
  })

  it('shows error state on failure', async () => {
    mockBuildRBACGraph.mockRejectedValue(new Error('rbac access denied'))

    await act(async () => { render(<RBACGraph />) })
    expect(screen.getByText(/Failed to load RBAC data/)).toBeDefined()
  })
})
