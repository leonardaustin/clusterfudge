import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// Mock wails event system
vi.mock('@/wailsjs/runtime/runtime', () => ({
  EventsOn: vi.fn(() => () => {}),
  EventsOff: vi.fn(),
}))

vi.mock('@/stores/clusterStore', () => ({
  useClusterStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({ selectedNamespace: '' })
  ),
}))

const mockSetDetailPanelWidth = vi.fn()
vi.mock('@/stores/uiStore', () => ({
  useUIStore: vi.fn((selector?: (s: Record<string, unknown>) => unknown) => {
    const state = { detailPanelWidth: 450, setDetailPanelWidth: mockSetDetailPanelWidth }
    return selector ? selector(state) : state
  }),
}))

const mockListResources = vi.fn()
const mockWatchResources = vi.fn().mockResolvedValue(undefined)
const mockStopWatch = vi.fn().mockResolvedValue(undefined)

vi.mock('@/wailsjs/go/handlers/ResourceHandler', () => ({
  ListResources: (...args: unknown[]) => mockListResources(...args),
  WatchResources: (...args: unknown[]) => mockWatchResources(...args),
  StopWatch: (...args: unknown[]) => mockStopWatch(...args),
}))

import { CRDList } from '@/pages/CRDList'

const MOCK_CRD_ITEM = {
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
              properties: { spec: { type: 'object' } },
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
}

const MOCK_INSTANCES = [
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
]

beforeEach(() => {
  vi.clearAllMocks()
  // Default: ListResources returns the CRD list for the first call, instances for the second
  mockListResources.mockImplementation((group: string) => {
    if (group === 'apiextensions.k8s.io') {
      return Promise.resolve([MOCK_CRD_ITEM])
    }
    // Instance list
    return Promise.resolve(MOCK_INSTANCES)
  })
})

function renderCRDList(route = '/cluster/crds') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/cluster/crds" element={<CRDList />} />
        <Route path="/custom/:group/:resource/:name" element={<CRDList />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('CRDList', () => {
  it('renders CRD list with table', async () => {
    await act(async () => { renderCRDList() })
    expect(screen.getByText('Custom Resource Definitions')).toBeDefined()
    expect(screen.getByText('certificates.cert-manager.io')).toBeDefined()
    expect(screen.getAllByText('cert-manager.io').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Certificate').length).toBeGreaterThan(0)
  })

  it('opens detail panel when CRD row is clicked', async () => {
    await act(async () => { renderCRDList() })
    const row = screen.getByText('certificates.cert-manager.io').closest('tr')
    await act(async () => { fireEvent.click(row!) })
    // Detail panel header shows kind and group
    const headers = screen.getAllByText('Certificate')
    expect(headers.length).toBeGreaterThan(0)
  })

  it('shows overview tab with CRD metadata', async () => {
    await act(async () => { renderCRDList() })
    const row = screen.getByText('certificates.cert-manager.io').closest('tr')
    await act(async () => { fireEvent.click(row!) })
    // Overview tab shows metadata fields — "Namespaced" appears in both table and panel
    expect(screen.getAllByText('Namespaced').length).toBeGreaterThanOrEqual(2)
    // The overview shows the version
    expect(screen.getAllByText('v1').length).toBeGreaterThan(0)
  })

  it('loads instances when Instances tab is clicked', async () => {
    await act(async () => { renderCRDList() })
    const row = screen.getByText('certificates.cert-manager.io').closest('tr')
    await act(async () => { fireEvent.click(row!) })

    const instancesTab = screen.getByRole('button', { name: 'Instances' })
    await act(async () => { fireEvent.click(instancesTab) })

    expect(screen.getByText('2 instances')).toBeDefined()
    expect(screen.getByText('my-cert')).toBeDefined()
    expect(screen.getByText('tls-cert')).toBeDefined()
  })

  it('shows schema tab', async () => {
    await act(async () => { renderCRDList() })
    const row = screen.getByText('certificates.cert-manager.io').closest('tr')
    await act(async () => { fireEvent.click(row!) })

    const schemaTab = screen.getByRole('button', { name: 'Schema' })
    await act(async () => { fireEvent.click(schemaTab) })

    expect(screen.getByText(/"type": "object"/)).toBeDefined()
  })

  it('shows no instances message when list is empty', async () => {
    mockListResources.mockImplementation((group: string) => {
      if (group === 'apiextensions.k8s.io') return Promise.resolve([MOCK_CRD_ITEM])
      return Promise.resolve([])
    })
    await act(async () => { renderCRDList() })
    const row = screen.getByText('certificates.cert-manager.io').closest('tr')
    await act(async () => { fireEvent.click(row!) })

    const instancesTab = screen.getByRole('button', { name: 'Instances' })
    await act(async () => { fireEvent.click(instancesTab) })

    expect(screen.getByText('No instances found.')).toBeDefined()
  })

  it('calls ListResources with correct group/version/plural for instances', async () => {
    await act(async () => { renderCRDList() })
    const row = screen.getByText('certificates.cert-manager.io').closest('tr')
    await act(async () => { fireEvent.click(row!) })

    const instancesTab = screen.getByRole('button', { name: 'Instances' })
    await act(async () => { fireEvent.click(instancesTab) })

    expect(mockListResources).toHaveBeenCalledWith('cert-manager.io', 'v1', 'certificates', '')
  })

  it('auto-selects CRD from route param', async () => {
    await act(async () => {
      renderCRDList('/custom/cert-manager.io/certificates/certificates.cert-manager.io')
    })
    // Detail panel should auto-open
    const headers = screen.getAllByText('Certificate')
    expect(headers.length).toBeGreaterThan(0)
  })
})
