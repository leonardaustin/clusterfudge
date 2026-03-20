import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StorageClassList } from '@/pages/StorageClassList'

vi.mock('@/hooks/useKubeResource', () => ({
  useKubeResources: vi.fn(),
}))

import { useKubeResources } from '@/hooks/useKubeResource'

const mockUseKubeResources = vi.mocked(useKubeResources)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('StorageClassList', () => {
  it('shows loading state', () => {
    mockUseKubeResources.mockReturnValue({
      data: [],
      isLoading: true,
      error: null,
    })

    render(<StorageClassList />)

    expect(screen.getByText('Loading storage classes...')).toBeDefined()
  })

  it('renders title and count when data is loaded', () => {
    mockUseKubeResources.mockReturnValue({
      data: [{
        name: 'standard',
        namespace: '',
        labels: null,
        spec: null,
        status: null,
        raw: {
          metadata: { creationTimestamp: '2025-01-01T00:00:00Z' },
          provisioner: 'kubernetes.io/gce-pd',
          reclaimPolicy: 'Delete',
          volumeBindingMode: 'Immediate',
          allowVolumeExpansion: true,
        },
      }],
      isLoading: false,
      error: null,
    })

    render(<StorageClassList />)

    expect(screen.getByText('Storage Classes')).toBeDefined()
    expect(screen.getByText('1 storage classes')).toBeDefined()
  })

  it('renders storage class rows with provisioner and policies', () => {
    mockUseKubeResources.mockReturnValue({
      data: [
        {
          name: 'fast-ssd',
          namespace: '',
          labels: null,
          spec: null,
          status: null,
          raw: {
            metadata: { creationTimestamp: '2025-01-01T00:00:00Z' },
            provisioner: 'ebs.csi.aws.com',
            reclaimPolicy: 'Retain',
            volumeBindingMode: 'WaitForFirstConsumer',
            allowVolumeExpansion: false,
          },
        },
      ],
      isLoading: false,
      error: null,
    })

    render(<StorageClassList />)

    expect(screen.getByText('fast-ssd')).toBeDefined()
    expect(screen.getByText('ebs.csi.aws.com')).toBeDefined()
    expect(screen.getByText('Retain')).toBeDefined()
    expect(screen.getByText('WaitForFirstConsumer')).toBeDefined()
    expect(screen.getByText('false')).toBeDefined()
  })
})
