import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: vi.fn(() => ({ name: 'node-1' })),
  }
})

// Use stable array references to avoid infinite re-render loops in useMemo
const stableEmptyArray: never[] = []
const stableReturn = { data: stableEmptyArray, isLoading: false, error: null }
const stableLoadingReturn = { data: stableEmptyArray, isLoading: true, error: null }

vi.mock('@/hooks/useKubeResource', () => ({
  useKubeResources: vi.fn(() => stableReturn),
}))

const stableMetricsMap = new Map()
vi.mock('@/hooks/usePodMetrics', () => ({
  usePodMetrics: vi.fn(() => ({ metrics: stableMetricsMap })),
}))

vi.mock('@/wailsjs/go/handlers/ResourceHandler', () => ({
  GetResource: vi.fn().mockResolvedValue({
    name: 'node-1',
    namespace: '',
    labels: { 'node-role.kubernetes.io/control-plane': '' },
    spec: null,
    status: null,
    raw: {
      metadata: { creationTimestamp: '2024-01-01T00:00:00Z', labels: { 'node-role.kubernetes.io/control-plane': '' }, annotations: {} },
      spec: { taints: [] },
      status: {
        nodeInfo: {
          kubeletVersion: 'v1.28.4', osImage: 'Ubuntu 22.04', operatingSystem: 'linux',
          architecture: 'amd64', kernelVersion: '5.15.0', containerRuntimeVersion: 'containerd://1.7.0',
        },
        allocatable: { cpu: '4', memory: '8Gi', pods: '110', 'ephemeral-storage': '100Gi' },
        capacity: { cpu: '4', memory: '8Gi', pods: '110', 'ephemeral-storage': '100Gi' },
        conditions: [{ type: 'Ready', status: 'True', reason: 'KubeletReady' }],
        addresses: [{ type: 'InternalIP', address: '192.168.1.1' }],
      },
    },
  }),
}))

import { useKubeResources } from '@/hooks/useKubeResource'
import { GetResource } from '@/wailsjs/go/handlers/ResourceHandler'
import { NodeDetail } from '@/pages/NodeDetail'

const mockUseKubeResources = vi.mocked(useKubeResources)
const mockGetResource = vi.mocked(GetResource)

const nodeData = {
  name: 'node-1',
  namespace: '',
  labels: { 'node-role.kubernetes.io/control-plane': '' },
  spec: null,
  status: null,
  raw: {
    metadata: { creationTimestamp: '2024-01-01T00:00:00Z', labels: { 'node-role.kubernetes.io/control-plane': '' }, annotations: {} },
    spec: { taints: [] },
    status: {
      nodeInfo: {
        kubeletVersion: 'v1.28.4', osImage: 'Ubuntu 22.04', operatingSystem: 'linux',
        architecture: 'amd64', kernelVersion: '5.15.0', containerRuntimeVersion: 'containerd://1.7.0',
      },
      allocatable: { cpu: '4', memory: '8Gi', pods: '110', 'ephemeral-storage': '100Gi' },
      capacity: { cpu: '4', memory: '8Gi', pods: '110', 'ephemeral-storage': '100Gi' },
      conditions: [{ type: 'Ready', status: 'True', reason: 'KubeletReady' }],
      addresses: [{ type: 'InternalIP', address: '192.168.1.1' }],
    },
  },
}

beforeEach(() => {
  mockUseKubeResources.mockReturnValue(stableReturn)
  mockGetResource.mockResolvedValue(nodeData)
})

function renderNodeDetail() {
  return render(
    <MemoryRouter>
      <NodeDetail />
    </MemoryRouter>
  )
}

describe('NodeDetail', () => {
  it('renders loading state when list is loading', () => {
    mockUseKubeResources.mockReturnValue(stableLoadingReturn)
    renderNodeDetail()
    expect(screen.getByText('Loading...')).toBeDefined()
  })

  it('shows error state when detail fetch fails', async () => {
    mockGetResource.mockRejectedValue(new Error('node not found'))
    await act(async () => { renderNodeDetail() })
    expect(screen.getByText('Back to list')).toBeDefined()
  })

  it('renders node detail after loading', async () => {
    await act(async () => { renderNodeDetail() })
    expect(screen.getByText(/Node \(control-plane\)/)).toBeDefined()
  })
})
