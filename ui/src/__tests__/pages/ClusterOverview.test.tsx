import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ClusterOverview } from '@/pages/ClusterOverview'

// Mock hooks
vi.mock('@/hooks/useClusterSummary', () => ({
  useClusterSummary: vi.fn(),
}))

vi.mock('@/hooks/useKubeResource', () => ({
  useKubeResources: vi.fn(),
}))

vi.mock('@/stores/clusterStore', () => ({
  useClusterStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      activeCluster: 'minikube',
      k8sVersion: 'v1.28.4',
    })
  ),
}))

import { useClusterSummary } from '@/hooks/useClusterSummary'
import { useKubeResources } from '@/hooks/useKubeResource'

const mockUseClusterSummary = vi.mocked(useClusterSummary)
const mockUseKubeResources = vi.mocked(useKubeResources)

beforeEach(() => {
  vi.clearAllMocks()
  mockUseKubeResources.mockReturnValue({
    data: [],
    isLoading: false,
    error: null,
  })
})

describe('ClusterOverview', () => {
  it('renders summary cards with live data', () => {
    mockUseClusterSummary.mockReturnValue({
      summary: {
        nodeCount: 3,
        nodeReady: 3,
        podCount: 82,
        podRunning: 78,
        deploymentCount: 12,
        deploymentReady: 12,
        serviceCount: 18,
        serviceLB: 4,
        namespaceSummary: [
          { name: 'default', podCount: 42 },
          { name: 'kube-system', podCount: 15 },
        ],
      },
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    })

    render(<ClusterOverview />)

    // Summary cards
    expect(screen.getByText('Nodes')).toBeDefined()
    expect(screen.getByText('3')).toBeDefined()
    expect(screen.getByText('3 ready')).toBeDefined()

    expect(screen.getByText('Pods')).toBeDefined()
    expect(screen.getByText('82')).toBeDefined()
    expect(screen.getByText('78 running')).toBeDefined()

    expect(screen.getByText('Deployments')).toBeDefined()
    expect(screen.getByText('12')).toBeDefined()

    expect(screen.getByText('Services')).toBeDefined()
    expect(screen.getByText('18')).toBeDefined()
    expect(screen.getByText('4 LoadBalancer')).toBeDefined()

    // Namespaces
    expect(screen.getByText('default')).toBeDefined()
    expect(screen.getByText('kube-system')).toBeDefined()
  })

  it('shows loading skeleton when loading', () => {
    mockUseClusterSummary.mockReturnValue({
      summary: null,
      isLoading: true,
      error: null,
      refresh: vi.fn(),
    })

    const { container } = render(<ClusterOverview />)

    // Should render 4 skeleton cards
    const skeletons = container.querySelectorAll('.metric-card')
    expect(skeletons.length).toBe(4)
  })

  it('shows error state message', () => {
    mockUseClusterSummary.mockReturnValue({
      summary: null,
      isLoading: false,
      error: 'not connected',
      refresh: vi.fn(),
    })

    render(<ClusterOverview />)

    expect(screen.getByText(/Unable to load cluster summary/)).toBeDefined()
  })

  it('shows empty state when no live events', () => {
    mockUseClusterSummary.mockReturnValue({
      summary: null,
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    })

    render(<ClusterOverview />)

    expect(screen.getByText('No recent events')).toBeDefined()
  })

  it('renders live events from cluster', () => {
    mockUseClusterSummary.mockReturnValue({
      summary: {
        nodeCount: 1, nodeReady: 1,
        podCount: 1, podRunning: 1,
        deploymentCount: 0, deploymentReady: 0,
        serviceCount: 0, serviceLB: 0,
        namespaceSummary: [],
      },
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    })

    mockUseKubeResources.mockReturnValue({
      data: [{
        name: 'test-event',
        namespace: 'default',
        labels: null,
        spec: null,
        status: null,
        raw: {
          type: 'Warning',
          reason: 'OOMKilled',
          message: 'Container exceeded memory limit',
          involvedObject: { kind: 'Pod', name: 'my-pod' },
          lastTimestamp: new Date().toISOString(),
          count: 3,
        },
      }],
      isLoading: false,
      error: null,
    })

    render(<ClusterOverview />)

    expect(screen.getByText('OOMKilled')).toBeDefined()
    expect(screen.getByText('Pod/my-pod')).toBeDefined()
    expect(screen.getByText('Container exceeded memory limit')).toBeDefined()
  })

  it('calls refresh when refresh button is clicked', async () => {
    const refreshFn = vi.fn()
    mockUseClusterSummary.mockReturnValue({
      summary: {
        nodeCount: 1, nodeReady: 1,
        podCount: 1, podRunning: 1,
        deploymentCount: 0, deploymentReady: 0,
        serviceCount: 0, serviceLB: 0,
        namespaceSummary: [],
      },
      isLoading: false,
      error: null,
      refresh: refreshFn,
    })

    render(<ClusterOverview />)

    const refreshButton = screen.getByText('Refresh')
    await userEvent.click(refreshButton)

    await waitFor(() => {
      expect(refreshFn).toHaveBeenCalled()
    })
  })

  it('shows cluster name and version in header', () => {
    mockUseClusterSummary.mockReturnValue({
      summary: {
        nodeCount: 1, nodeReady: 1,
        podCount: 0, podRunning: 0,
        deploymentCount: 0, deploymentReady: 0,
        serviceCount: 0, serviceLB: 0,
        namespaceSummary: [],
      },
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    })

    render(<ClusterOverview />)

    expect(screen.getByText(/minikube/)).toBeDefined()
    expect(screen.getByText(/v1\.28\.4/)).toBeDefined()
    expect(screen.getByText(/Connected/)).toBeDefined()
  })
})
