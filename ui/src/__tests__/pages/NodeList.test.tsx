import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { NodeList } from '@/pages/NodeList'

vi.mock('@/hooks/useKubeResource', () => ({
  useKubeResources: vi.fn(),
}))

vi.mock('@/hooks/usePodMetrics', () => ({
  usePodMetrics: vi.fn(() => ({ metrics: new Map() })),
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
  // Default: nodes call and pods call both return empty
  mockUseKubeResources.mockReturnValue({
    data: [],
    isLoading: false,
    error: null,
  })
})

describe('NodeList', () => {
  it('renders title when data is loaded', () => {
    render(
      <MemoryRouter>
        <NodeList />
      </MemoryRouter>
    )

    expect(screen.getByText('Nodes')).toBeDefined()
    expect(screen.getByText(/0 nodes/)).toBeDefined()
  })

  it('shows loading state', () => {
    mockUseKubeResources.mockReturnValue({
      data: [],
      isLoading: true,
      error: null,
    })

    render(
      <MemoryRouter>
        <NodeList />
      </MemoryRouter>
    )

    expect(screen.getByText('Nodes')).toBeDefined()
    expect(screen.getByText('Loading...')).toBeDefined()
  })

  it('renders node data in hex view by default', () => {
    // First call: nodes, second call: pods
    mockUseKubeResources
      .mockReturnValueOnce({
        data: [
          {
            name: 'node-1',
            namespace: '',
            labels: null,
            spec: null,
            status: null,
            raw: {
              metadata: {
                creationTimestamp: '2025-01-01T00:00:00Z',
                labels: { 'node-role.kubernetes.io/control-plane': '' },
              },
              spec: { taints: [] },
              status: {
                nodeInfo: {
                  kubeletVersion: 'v1.28.4',
                  osImage: 'Ubuntu 22.04',
                  kernelVersion: '5.15.0',
                  containerRuntimeVersion: 'containerd://1.7.0',
                },
                allocatable: { cpu: '4', memory: '8Gi', pods: '110' },
                capacity: { cpu: '4', memory: '8Gi' },
                conditions: [
                  { type: 'Ready', status: 'True' },
                ],
                addresses: [
                  { type: 'InternalIP', address: '192.168.1.10' },
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
        <NodeList />
      </MemoryRouter>
    )

    expect(screen.getByText('Nodes')).toBeDefined()
    expect(screen.getByText(/1 nodes — 1 ready/)).toBeDefined()
    // Hex map is the default view; node name should appear in the hex group header
    expect(screen.getByText('node-1')).toBeDefined()
  })
})
