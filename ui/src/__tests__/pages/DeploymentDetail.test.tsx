import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: vi.fn(() => ({ namespace: 'default', name: 'web-app' })),
  }
})

vi.mock('@/hooks/useKubeResource', () => ({
  useKubeResources: vi.fn(() => ({ data: [], isLoading: false, error: null })),
}))

vi.mock('@/stores/toastStore', () => ({
  useToastStore: Object.assign(vi.fn(() => ({ addToast: vi.fn() })), {
    getState: vi.fn(() => ({ addToast: vi.fn() })),
  }),
}))

vi.mock('@/wailsjs/go/handlers/ResourceHandler', () => ({
  GetResource: vi.fn().mockResolvedValue({
    name: 'web-app',
    namespace: 'default',
    labels: { app: 'web' },
    spec: null,
    status: null,
    raw: {
      metadata: { creationTimestamp: '2024-01-01T00:00:00Z', labels: { app: 'web' }, annotations: {} },
      spec: {
        replicas: 3,
        strategy: { type: 'RollingUpdate', rollingUpdate: { maxSurge: '25%', maxUnavailable: '25%' } },
        selector: { matchLabels: { app: 'web' } },
        template: {
          spec: {
            containers: [{ name: 'web', image: 'nginx:1.25', ports: [{ containerPort: 80 }], resources: {} }],
          },
        },
      },
      status: {
        replicas: 3,
        readyReplicas: 3,
        updatedReplicas: 3,
        availableReplicas: 3,
        conditions: [
          { type: 'Available', status: 'True', reason: 'MinimumReplicasAvailable' },
          { type: 'Progressing', status: 'True', reason: 'NewReplicaSetAvailable' },
        ],
      },
    },
  }),
  ApplyResource: vi.fn().mockResolvedValue(undefined),
}))

import { useKubeResources } from '@/hooks/useKubeResource'
import { GetResource } from '@/wailsjs/go/handlers/ResourceHandler'
import { DeploymentDetail } from '@/pages/DeploymentDetail'

const mockUseKubeResources = vi.mocked(useKubeResources)
const mockGetResource = vi.mocked(GetResource)

beforeEach(() => {
  vi.clearAllMocks()
  mockUseKubeResources.mockReturnValue({ data: [], isLoading: false, error: null })
})

function renderDeploymentDetail() {
  return render(
    <MemoryRouter>
      <DeploymentDetail />
    </MemoryRouter>
  )
}

describe('DeploymentDetail', () => {
  it('renders loading state initially', () => {
    mockUseKubeResources.mockReturnValue({ data: [], isLoading: true, error: null })
    renderDeploymentDetail()
    expect(screen.getByText('Loading...')).toBeDefined()
  })

  it('renders deployment detail after loading', async () => {
    await act(async () => { renderDeploymentDetail() })
    expect(screen.getAllByText('web-app').length).toBeGreaterThan(0)
    expect(screen.getByText(/Deployment in "default" namespace/)).toBeDefined()
  })

  it('shows error state when detail fetch fails', async () => {
    mockGetResource.mockRejectedValue(new Error('forbidden'))
    await act(async () => { renderDeploymentDetail() })
    expect(screen.getByText(/forbidden/)).toBeDefined()
    expect(screen.getByText('Back to list')).toBeDefined()
  })
})
