import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PVList } from '@/pages/PVList'

vi.mock('@/hooks/useKubeResource', () => ({
  useKubeResources: vi.fn(),
}))

import { useKubeResources } from '@/hooks/useKubeResource'

const mockUseKubeResources = vi.mocked(useKubeResources)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PVList', () => {
  it('shows loading state', () => {
    mockUseKubeResources.mockReturnValue({
      data: [],
      isLoading: true,
      error: null,
    })

    render(<PVList />)

    expect(screen.getByText('Loading PVs...')).toBeDefined()
  })

  it('renders title and count when data is loaded', () => {
    mockUseKubeResources.mockReturnValue({
      data: [{
        name: 'pv-data-01',
        namespace: '',
        labels: null,
        spec: null,
        status: null,
        raw: {
          metadata: { creationTimestamp: '2025-01-01T00:00:00Z' },
          spec: {
            capacity: { storage: '10Gi' },
            accessModes: ['ReadWriteOnce'],
            persistentVolumeReclaimPolicy: 'Retain',
            storageClassName: 'standard',
            claimRef: { namespace: 'default', name: 'data-claim' },
          },
          status: { phase: 'Bound' },
        },
      }],
      isLoading: false,
      error: null,
    })

    render(<PVList />)

    expect(screen.getByText('Persistent Volumes')).toBeDefined()
    expect(screen.getByText('1 persistent volumes')).toBeDefined()
  })

  it('renders PV rows with capacity, access modes, and claim', () => {
    mockUseKubeResources.mockReturnValue({
      data: [{
        name: 'pv-nfs-01',
        namespace: '',
        labels: null,
        spec: null,
        status: null,
        raw: {
          metadata: { creationTimestamp: '2025-01-01T00:00:00Z' },
          spec: {
            capacity: { storage: '50Gi' },
            accessModes: ['ReadWriteMany'],
            persistentVolumeReclaimPolicy: 'Delete',
            storageClassName: 'nfs',
            claimRef: { namespace: 'production', name: 'shared-data' },
          },
          status: { phase: 'Bound' },
        },
      }],
      isLoading: false,
      error: null,
    })

    render(<PVList />)

    expect(screen.getByText('pv-nfs-01')).toBeDefined()
    expect(screen.getByText('50Gi')).toBeDefined()
    expect(screen.getByText('ReadWriteMany')).toBeDefined()
    expect(screen.getByText('Delete')).toBeDefined()
    expect(screen.getByText('nfs')).toBeDefined()
    expect(screen.getByText('production/shared-data')).toBeDefined()
  })
})
