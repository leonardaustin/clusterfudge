import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: vi.fn(() => ({ namespace: 'default', name: 'test-pod' })),
  }
})

vi.mock('@/hooks/useKubeResource', () => ({
  useKubeResources: vi.fn(() => ({ data: [], isLoading: false, error: null })),
}))

vi.mock('@/wailsjs/go/handlers/ResourceHandler', () => ({
  GetResource: vi.fn().mockResolvedValue({
    name: 'test-pod',
    namespace: 'default',
    labels: { app: 'test' },
    spec: null,
    status: null,
    raw: {
      metadata: { creationTimestamp: '2024-01-01T00:00:00Z', labels: { app: 'test' }, annotations: {} },
      spec: {
        nodeName: 'node-1',
        serviceAccountName: 'default',
        containers: [
          { name: 'main', image: 'nginx:latest', ports: [{ containerPort: 80, protocol: 'TCP' }], resources: {} },
        ],
        volumes: [],
      },
      status: {
        phase: 'Running',
        podIP: '10.0.0.1',
        qosClass: 'BestEffort',
        containerStatuses: [{ name: 'main', ready: true, restartCount: 0, state: { running: { startedAt: '2024-01-01T00:00:00Z' } } }],
        conditions: [{ type: 'Ready', status: 'True' }],
      },
    },
  }),
}))

import { useKubeResources } from '@/hooks/useKubeResource'
import { GetResource } from '@/wailsjs/go/handlers/ResourceHandler'
import { PodDetail } from '@/pages/PodDetail'

const mockUseKubeResources = vi.mocked(useKubeResources)
const mockGetResource = vi.mocked(GetResource)

beforeEach(() => {
  vi.clearAllMocks()
  mockUseKubeResources.mockReturnValue({ data: [], isLoading: false, error: null })
  mockGetResource.mockResolvedValue({
    name: 'test-pod',
    namespace: 'default',
    labels: { app: 'test' },
    spec: null,
    status: null,
    raw: {
      metadata: { creationTimestamp: '2024-01-01T00:00:00Z', labels: { app: 'test' }, annotations: {} },
      spec: {
        nodeName: 'node-1', serviceAccountName: 'default',
        containers: [{ name: 'main', image: 'nginx:latest', ports: [{ containerPort: 80, protocol: 'TCP' }], resources: {} }],
        volumes: [],
      },
      status: {
        phase: 'Running', podIP: '10.0.0.1', qosClass: 'BestEffort',
        containerStatuses: [{ name: 'main', ready: true, restartCount: 0, state: { running: { startedAt: '2024-01-01T00:00:00Z' } } }],
        conditions: [{ type: 'Ready', status: 'True' }],
      },
    },
  })
})

function renderPodDetail() {
  return render(
    <MemoryRouter>
      <PodDetail />
    </MemoryRouter>
  )
}

describe('PodDetail', () => {
  it('renders loading state initially', () => {
    mockUseKubeResources.mockReturnValue({ data: [], isLoading: true, error: null })
    renderPodDetail()
    expect(screen.getByText('Loading...')).toBeDefined()
  })

  it('renders pod detail after loading', async () => {
    await act(async () => { renderPodDetail() })
    expect(screen.getByText(/Pod in "default" namespace/)).toBeDefined()
    expect(screen.getAllByText('test-pod').length).toBeGreaterThan(0)
  })

  it('shows error state when detail fetch fails', async () => {
    mockGetResource.mockRejectedValue(new Error('not found'))
    await act(async () => { renderPodDetail() })
    expect(screen.getByText(/not found/)).toBeDefined()
    expect(screen.getByText('Back to list')).toBeDefined()
  })
})
