import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PVCList } from '@/pages/PVCList'

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

describe('PVCList', () => {
  it('shows loading state', () => {
    mockUseKubeResources.mockReturnValue({
      data: [],
      isLoading: true,
      error: null,
    })

    render(<PVCList />)

    expect(screen.getByText('Loading PVCs...')).toBeDefined()
  })

  it('renders title and count when data is loaded', () => {
    mockUseKubeResources.mockReturnValue({
      data: [{
        name: 'data-pvc',
        namespace: 'default',
        labels: null,
        spec: null,
        status: null,
        raw: {
          metadata: { creationTimestamp: '2025-01-01T00:00:00Z' },
          spec: {
            storageClassName: 'standard',
            resources: { requests: { storage: '5Gi' } },
            accessModes: ['ReadWriteOnce'],
            volumeName: 'pv-data-01',
          },
          status: { phase: 'Bound' },
        },
      }],
      isLoading: false,
      error: null,
    })

    render(<PVCList />)

    expect(screen.getByText('Persistent Volume Claims')).toBeDefined()
  })

  it('renders PVC rows with storage class, requested size, and volume', () => {
    mockUseKubeResources.mockReturnValue({
      data: [{
        name: 'postgres-data',
        namespace: 'production',
        labels: null,
        spec: null,
        status: null,
        raw: {
          metadata: { creationTimestamp: '2025-01-01T00:00:00Z' },
          spec: {
            storageClassName: 'ssd',
            resources: { requests: { storage: '20Gi' } },
            accessModes: ['ReadWriteOnce'],
            volumeName: 'pv-ssd-01',
          },
          status: { phase: 'Bound' },
        },
      }],
      isLoading: false,
      error: null,
    })

    render(<PVCList />)

    expect(screen.getByText('postgres-data')).toBeDefined()
    expect(screen.getByText('production')).toBeDefined()
    expect(screen.getByText('ssd')).toBeDefined()
    expect(screen.getByText('20Gi')).toBeDefined()
    expect(screen.getByText('ReadWriteOnce')).toBeDefined()
    expect(screen.getByText('pv-ssd-01')).toBeDefined()
  })
})
