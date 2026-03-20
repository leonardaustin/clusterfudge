import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ConfigMapList } from '@/pages/ConfigMapList'

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

describe('ConfigMapList', () => {
  it('shows loading state', () => {
    mockUseKubeResources.mockReturnValue({
      data: [],
      isLoading: true,
      error: null,
    })

    render(<ConfigMapList />)

    expect(screen.getAllByText('Loading...').length).toBeGreaterThan(0)
  })

  it('renders title and count when data is loaded', () => {
    mockUseKubeResources.mockReturnValue({
      data: [{
        name: 'my-config',
        namespace: 'default',
        labels: null,
        spec: null,
        status: null,
        raw: {
          metadata: { creationTimestamp: '2025-01-01T00:00:00Z' },
          data: { key1: 'val1', key2: 'val2' },
        },
      }],
      isLoading: false,
      error: null,
    })

    render(<ConfigMapList />)

    expect(screen.getByText('ConfigMaps')).toBeDefined()
    expect(screen.getByText('1 configmaps')).toBeDefined()
  })

  it('renders data rows correctly', () => {
    mockUseKubeResources.mockReturnValue({
      data: [
        {
          name: 'app-config',
          namespace: 'production',
          labels: null,
          spec: null,
          status: null,
          raw: {
            metadata: { creationTimestamp: '2025-01-01T00:00:00Z' },
            data: { DB_HOST: 'localhost', DB_PORT: '5432', DB_NAME: 'mydb' },
          },
        },
        {
          name: 'kube-root-ca.crt',
          namespace: 'kube-system',
          labels: null,
          spec: null,
          status: null,
          raw: {
            metadata: { creationTimestamp: '2025-01-01T00:00:00Z' },
            data: { 'ca.crt': 'cert-data' },
          },
        },
      ],
      isLoading: false,
      error: null,
    })

    render(<ConfigMapList />)

    expect(screen.getByText('app-config')).toBeDefined()
    expect(screen.getByText('production')).toBeDefined()
    expect(screen.getByText('3')).toBeDefined()

    expect(screen.getByText('kube-root-ca.crt')).toBeDefined()
    expect(screen.getByText('kube-system')).toBeDefined()
    expect(screen.getByText('1')).toBeDefined()
  })
})
