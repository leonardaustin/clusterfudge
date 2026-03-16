import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: vi.fn(() => ({
      group: 'cert-manager.io',
      resource: 'certificates',
      name: 'certificates.cert-manager.io',
    })),
  }
})

vi.mock('@/stores/clusterStore', () => ({
  useClusterStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({ selectedNamespace: '' })
  ),
}))

vi.mock('@/wailsjs/go/handlers/ResourceHandler', () => ({
  GetResource: vi.fn().mockImplementation((group: string) => {
    if (group === 'apiextensions.k8s.io') {
      return Promise.resolve({
        name: 'certificates.cert-manager.io',
        namespace: '',
        labels: null,
        spec: null,
        status: null,
        raw: {
          metadata: { creationTimestamp: '2025-01-01T00:00:00Z' },
          spec: {
            group: 'cert-manager.io',
            names: { kind: 'Certificate', plural: 'certificates' },
            scope: 'Namespaced',
            versions: [
              {
                name: 'v1',
                served: true,
                storage: true,
                schema: {
                  openAPIV3Schema: {
                    type: 'object',
                    properties: {
                      spec: { type: 'object' },
                    },
                  },
                },
              },
            ],
          },
          status: {
            conditions: [
              { type: 'Established', status: 'True' },
              { type: 'NamesAccepted', status: 'True' },
            ],
          },
        },
      })
    }
    return Promise.reject(new Error('not found'))
  }),
  ListResources: vi.fn().mockResolvedValue([
    {
      name: 'my-cert',
      namespace: 'default',
      labels: null,
      spec: null,
      status: null,
      raw: { metadata: { creationTimestamp: '2025-06-01T00:00:00Z' } },
    },
    {
      name: 'tls-cert',
      namespace: 'production',
      labels: null,
      spec: null,
      status: null,
      raw: { metadata: { creationTimestamp: '2025-07-01T00:00:00Z' } },
    },
  ]),
}))

import { GetResource, ListResources } from '@/wailsjs/go/handlers/ResourceHandler'
import { CRDDetail } from '@/pages/CRDDetail'

const mockGetResource = vi.mocked(GetResource)
const mockListResources = vi.mocked(ListResources)

beforeEach(() => {
  vi.clearAllMocks()
  mockGetResource.mockImplementation((group: string) => {
    if (group === 'apiextensions.k8s.io') {
      return Promise.resolve({
        name: 'certificates.cert-manager.io',
        namespace: '',
        labels: null,
        spec: null,
        status: null,
        raw: {
          metadata: { creationTimestamp: '2025-01-01T00:00:00Z' },
          spec: {
            group: 'cert-manager.io',
            names: { kind: 'Certificate', plural: 'certificates' },
            scope: 'Namespaced',
            versions: [
              {
                name: 'v1',
                served: true,
                storage: true,
                schema: {
                  openAPIV3Schema: {
                    type: 'object',
                    properties: {
                      spec: { type: 'object' },
                    },
                  },
                },
              },
            ],
          },
          status: {
            conditions: [
              { type: 'Established', status: 'True' },
              { type: 'NamesAccepted', status: 'True' },
            ],
          },
        },
      })
    }
    return Promise.reject(new Error('not found'))
  })
  mockListResources.mockResolvedValue([
    {
      name: 'my-cert',
      namespace: 'default',
      labels: null,
      spec: null,
      status: null,
      raw: { metadata: { creationTimestamp: '2025-06-01T00:00:00Z' } },
    },
    {
      name: 'tls-cert',
      namespace: 'production',
      labels: null,
      spec: null,
      status: null,
      raw: { metadata: { creationTimestamp: '2025-07-01T00:00:00Z' } },
    },
  ])
})

function renderCRDDetail() {
  return render(
    <MemoryRouter>
      <CRDDetail />
    </MemoryRouter>
  )
}

describe('CRDDetail', () => {
  it('renders loading state initially', () => {
    mockGetResource.mockReturnValue(new Promise(() => {}))
    renderCRDDetail()
    expect(screen.getAllByText('Loading...').length).toBeGreaterThan(0)
  })

  it('renders CRD metadata after loading', async () => {
    await act(async () => { renderCRDDetail() })
    expect(screen.getByText('certificates.cert-manager.io')).toBeDefined()
    expect(screen.getAllByText('cert-manager.io').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Certificate').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Namespaced').length).toBeGreaterThan(0)
  })

  it('shows instances tab by default', async () => {
    await act(async () => { renderCRDDetail() })
    // Should show instance count
    expect(screen.getByText('2 instances')).toBeDefined()
    // Should show instance names
    expect(screen.getByText('my-cert')).toBeDefined()
    expect(screen.getByText('tls-cert')).toBeDefined()
  })

  it('switches to schema tab', async () => {
    await act(async () => { renderCRDDetail() })

    const schemaTab = screen.getByText('Schema')
    await act(async () => {
      fireEvent.click(schemaTab)
    })

    const schemaContent = screen.getByTestId('schema-content')
    expect(schemaContent.textContent).toContain('"type": "object"')
    expect(schemaContent.textContent).toContain('"properties"')
  })

  it('shows error state when fetch fails', async () => {
    mockGetResource.mockRejectedValue(new Error('CRD not found'))
    await act(async () => { renderCRDDetail() })
    expect(screen.getByText(/CRD not found/)).toBeDefined()
    expect(screen.getAllByText('Back to CRDs').length).toBeGreaterThan(0)
  })

  it('shows no instances message when list is empty', async () => {
    mockListResources.mockResolvedValue([])
    await act(async () => { renderCRDDetail() })
    expect(screen.getByText('No instances found.')).toBeDefined()
  })

  it('lists CRD instances with correct columns', async () => {
    await act(async () => { renderCRDDetail() })
    expect(screen.getByText('my-cert')).toBeDefined()
    expect(screen.getByText('default')).toBeDefined()
    expect(screen.getByText('tls-cert')).toBeDefined()
    expect(screen.getByText('production')).toBeDefined()
  })

  it('calls ListResources with correct group/version/plural', async () => {
    await act(async () => { renderCRDDetail() })
    expect(mockListResources).toHaveBeenCalledWith('cert-manager.io', 'v1', 'certificates', '')
  })
})
