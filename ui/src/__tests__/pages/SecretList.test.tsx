import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SecretList } from '@/pages/SecretList'

vi.mock('@/hooks/useKubeResource', () => ({
  useKubeResources: vi.fn(),
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
})

function renderSecretList() {
  return render(
    <MemoryRouter>
      <SecretList />
    </MemoryRouter>
  )
}

describe('SecretList', () => {
  it('shows loading state', () => {
    mockUseKubeResources.mockReturnValue({
      data: [],
      isLoading: true,
      error: null,
    })

    renderSecretList()

    expect(screen.getAllByText('Loading...').length).toBeGreaterThan(0)
  })

  it('renders title and count when data is loaded', () => {
    mockUseKubeResources.mockReturnValue({
      data: [{
        name: 'my-secret',
        namespace: 'default',
        labels: null,
        spec: null,
        status: null,
        raw: {
          metadata: { creationTimestamp: '2025-01-01T00:00:00Z' },
          type: 'kubernetes.io/tls',
          data: { 'tls.crt': 'Y2VydA==', 'tls.key': 'a2V5' },
        },
      }],
      isLoading: false,
      error: null,
    })

    renderSecretList()

    expect(screen.getByText('Secrets')).toBeDefined()
    expect(screen.getByText('1 secrets')).toBeDefined()
  })

  it('renders data rows with type and data count', () => {
    mockUseKubeResources.mockReturnValue({
      data: [
        {
          name: 'db-credentials',
          namespace: 'production',
          labels: null,
          spec: null,
          status: null,
          raw: {
            metadata: { creationTimestamp: '2025-01-01T00:00:00Z' },
            type: 'Opaque',
            data: { username: 'dXNlcg==', password: 'cGFzcw==' },
          },
        },
        {
          name: 'tls-cert',
          namespace: 'default',
          labels: null,
          spec: null,
          status: null,
          raw: {
            metadata: { creationTimestamp: '2025-01-01T00:00:00Z' },
            type: 'kubernetes.io/tls',
            data: { 'tls.crt': 'Y2VydA==' },
          },
        },
      ],
      isLoading: false,
      error: null,
    })

    renderSecretList()

    expect(screen.getByText('db-credentials')).toBeDefined()
    expect(screen.getByText('Opaque')).toBeDefined()
    expect(screen.getByText('production')).toBeDefined()

    expect(screen.getByText('tls-cert')).toBeDefined()
    expect(screen.getByText('kubernetes.io/tls')).toBeDefined()
  })
})
