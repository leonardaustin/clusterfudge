import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CRDList } from '@/pages/CRDList'

vi.mock('@/hooks/useKubeResource', () => ({
  useKubeResources: vi.fn(),
}))

import { useKubeResources } from '@/hooks/useKubeResource'

const mockUseKubeResources = vi.mocked(useKubeResources)

beforeEach(() => {
  vi.clearAllMocks()
})

function renderCRDList() {
  return render(
    <MemoryRouter>
      <CRDList />
    </MemoryRouter>
  )
}

describe('CRDList', () => {
  it('shows loading state', () => {
    mockUseKubeResources.mockReturnValue({
      data: [],
      isLoading: true,
      error: null,
    })

    renderCRDList()

    expect(screen.getByText('Loading CRDs...')).toBeDefined()
  })

  it('renders title and count when data is loaded', () => {
    mockUseKubeResources.mockReturnValue({
      data: [{
        name: 'certificates.cert-manager.io',
        namespace: '',
        labels: null,
        spec: null,
        status: null,
        raw: {
          metadata: { creationTimestamp: '2025-01-01T00:00:00Z' },
          spec: {
            group: 'cert-manager.io',
            names: { kind: 'Certificate' },
            scope: 'Namespaced',
            versions: [{ name: 'v1' }],
          },
          status: {
            conditions: [
              { type: 'Established', status: 'True' },
              { type: 'NamesAccepted', status: 'True' },
            ],
          },
        },
      }],
      isLoading: false,
      error: null,
    })

    renderCRDList()

    expect(screen.getByText('Custom Resource Definitions')).toBeDefined()
    expect(screen.getByText('1 CRDs in the cluster')).toBeDefined()
  })

  it('renders CRD rows with group, kind, and scope', () => {
    mockUseKubeResources.mockReturnValue({
      data: [{
        name: 'virtualservices.networking.istio.io',
        namespace: '',
        labels: null,
        spec: null,
        status: null,
        raw: {
          metadata: { creationTimestamp: '2025-01-01T00:00:00Z' },
          spec: {
            group: 'networking.istio.io',
            names: { kind: 'VirtualService' },
            scope: 'Namespaced',
            versions: [{ name: 'v1alpha3' }, { name: 'v1beta1' }],
          },
          status: {
            conditions: [
              { type: 'Established', status: 'True' },
              { type: 'NamesAccepted', status: 'True' },
            ],
          },
        },
      }],
      isLoading: false,
      error: null,
    })

    renderCRDList()

    expect(screen.getByText('virtualservices.networking.istio.io')).toBeDefined()
    expect(screen.getByText('networking.istio.io')).toBeDefined()
    expect(screen.getByText('VirtualService')).toBeDefined()
    expect(screen.getByText('Namespaced')).toBeDefined()
    expect(screen.getByText('v1alpha3, v1beta1')).toBeDefined()
  })
})
