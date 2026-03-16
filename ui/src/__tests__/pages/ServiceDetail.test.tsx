import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: vi.fn(() => ({ namespace: 'default', name: 'my-service' })),
  }
})

vi.mock('@/hooks/useKubeResource', () => ({
  useKubeResources: vi.fn(() => ({ data: [], isLoading: false, error: null })),
}))

vi.mock('@/wailsjs/go/handlers/ResourceHandler', () => ({
  GetResource: vi.fn().mockImplementation((_g: string, _v: string, resource: string) => {
    if (resource === 'services') {
      return Promise.resolve({
        name: 'my-service',
        namespace: 'default',
        labels: null,
        spec: null,
        status: null,
        raw: {
          metadata: { creationTimestamp: '2024-01-01T00:00:00Z', labels: {}, annotations: {} },
          spec: {
            type: 'ClusterIP',
            clusterIP: '10.96.0.1',
            ports: [{ name: 'http', port: 80, targetPort: '8080', protocol: 'TCP' }],
            selector: { app: 'web' },
            sessionAffinity: 'None',
          },
          status: {},
        },
      })
    }
    // endpoints
    return Promise.reject(new Error('not found'))
  }),
}))

import { useKubeResources } from '@/hooks/useKubeResource'
import { GetResource } from '@/wailsjs/go/handlers/ResourceHandler'
import { ServiceDetail } from '@/pages/ServiceDetail'

const mockUseKubeResources = vi.mocked(useKubeResources)
const mockGetResource = vi.mocked(GetResource)

beforeEach(() => {
  vi.clearAllMocks()
  mockUseKubeResources.mockReturnValue({ data: [], isLoading: false, error: null })
})

function renderServiceDetail() {
  return render(
    <MemoryRouter>
      <ServiceDetail />
    </MemoryRouter>
  )
}

describe('ServiceDetail', () => {
  it('renders loading state initially', () => {
    mockUseKubeResources.mockReturnValue({ data: [], isLoading: true, error: null })
    renderServiceDetail()
    expect(screen.getByText('Loading...')).toBeDefined()
  })

  it('renders service detail after loading', async () => {
    await act(async () => { renderServiceDetail() })
    expect(screen.getAllByText('my-service').length).toBeGreaterThan(0)
    expect(screen.getByText(/Service in "default" namespace/)).toBeDefined()
  })

  it('shows error state when detail fetch fails', async () => {
    mockGetResource.mockRejectedValue(new Error('service not found'))
    await act(async () => { renderServiceDetail() })
    expect(screen.getByText(/service not found/)).toBeDefined()
    expect(screen.getByText('Back to list')).toBeDefined()
  })
})
