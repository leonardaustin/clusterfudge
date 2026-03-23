import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ServiceAccountList } from '@/pages/ServiceAccountList'

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

describe('ServiceAccountList', () => {
  it('shows loading state', () => {
    mockUseKubeResources.mockReturnValue({
      data: [],
      isLoading: true,
      error: null,
    })

    render(<ServiceAccountList />)

    expect(screen.getByText('Loading service accounts...')).toBeDefined()
  })

  it('renders title and count when data is loaded', () => {
    mockUseKubeResources.mockReturnValue({
      data: [{
        name: 'default',
        namespace: 'default',
        labels: null,
        spec: null,
        status: null,
        raw: {
          metadata: { creationTimestamp: '2025-01-01T00:00:00Z', annotations: {} },
          secrets: [{ name: 'default-token-abc123' }],
          imagePullSecrets: [],
          automountServiceAccountToken: true,
        },
      }],
      isLoading: false,
      error: null,
    })

    render(<ServiceAccountList />)

    expect(screen.getByText('Service Accounts')).toBeDefined()
  })

  it('renders service account rows with secrets and automount info', () => {
    mockUseKubeResources.mockReturnValue({
      data: [{
        name: 'app-sa',
        namespace: 'production',
        labels: null,
        spec: null,
        status: null,
        raw: {
          metadata: {
            creationTimestamp: '2025-01-01T00:00:00Z',
            annotations: {
              'eks.amazonaws.com/role-arn': 'arn:aws:iam::123456:role/app-role',
            },
          },
          secrets: [{ name: 'app-token-xyz' }, { name: 'app-tls' }],
          imagePullSecrets: [{ name: 'dockerhub-secret' }],
          automountServiceAccountToken: false,
        },
      }],
      isLoading: false,
      error: null,
    })

    render(<ServiceAccountList />)

    expect(screen.getByText('app-sa')).toBeDefined()
    expect(screen.getByText('production')).toBeDefined()
    expect(screen.getByText('2')).toBeDefined()
    expect(screen.getByText('dockerhub-secret')).toBeDefined()
    expect(screen.getByText('false')).toBeDefined()
    expect(screen.getByText('arn:aws:iam::123456:role/app-role')).toBeDefined()
  })
})
