import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

vi.mock('@/wailsjs/go/handlers/NetPolHandler', () => ({
  BuildClusterNetworkGraph: vi.fn().mockResolvedValue({ groups: [], edges: [] }),
}))

vi.mock('@/stores/toastStore', () => ({
  useToastStore: Object.assign(vi.fn(() => ({ addToast: vi.fn() })), {
    getState: vi.fn(() => ({ addToast: vi.fn() })),
  }),
}))

import { BuildClusterNetworkGraph, type NetworkGraph } from '@/wailsjs/go/handlers/NetPolHandler'
import { NetworkPolicyGraph } from '@/pages/NetworkPolicyGraph'

const mockBuildNetworkGraph = vi.mocked(BuildClusterNetworkGraph)

beforeEach(() => {
  vi.clearAllMocks()
  mockBuildNetworkGraph.mockResolvedValue({ groups: [], edges: [] })
})

describe('NetworkPolicyGraph', () => {
  it('renders with title and shows loading state', async () => {
    let resolvePromise!: (value: NetworkGraph) => void
    mockBuildNetworkGraph.mockReturnValue(new Promise((resolve) => { resolvePromise = resolve }))

    await act(async () => { render(<NetworkPolicyGraph />) })
    expect(screen.getByText('Network Policy Graph')).toBeDefined()
    expect(screen.getByText('Building network graph...')).toBeDefined()

    await act(async () => { resolvePromise({ groups: [], edges: [] }) })
  })

  it('renders table after loading with no edges', async () => {
    await act(async () => { render(<NetworkPolicyGraph />) })
    expect(screen.getByText('0 network edges')).toBeDefined()
  })

  it('shows error state on failure', async () => {
    mockBuildNetworkGraph.mockRejectedValue(new Error('no permissions'))

    await act(async () => { render(<NetworkPolicyGraph />) })
    expect(screen.getByText(/Failed to build network policy graph/)).toBeDefined()
  })

  it('handles null groups without crashing', async () => {
    mockBuildNetworkGraph.mockResolvedValue({ groups: null, edges: [] } as unknown as NetworkGraph)

    await act(async () => { render(<NetworkPolicyGraph />) })
    expect(screen.getByText('0 network edges')).toBeDefined()
  })

  it('handles missing groups field without crashing', async () => {
    mockBuildNetworkGraph.mockResolvedValue({ edges: [] } as unknown as NetworkGraph)

    await act(async () => { render(<NetworkPolicyGraph />) })
    expect(screen.getByText('0 network edges')).toBeDefined()
  })
})
