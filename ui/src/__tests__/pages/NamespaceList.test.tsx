import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NamespaceList } from '@/pages/NamespaceList'

vi.mock('@/hooks/useKubeResource', () => ({
  useKubeResources: vi.fn(),
}))

import { useKubeResources } from '@/hooks/useKubeResource'

const mockUseKubeResources = vi.mocked(useKubeResources)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('NamespaceList', () => {
  it('shows loading state', () => {
    mockUseKubeResources.mockReturnValue({
      data: [],
      isLoading: true,
      error: null,
    })

    render(<NamespaceList />)

    expect(screen.getByText('Loading namespaces...')).toBeDefined()
  })

  it('renders title and count when data is loaded', () => {
    mockUseKubeResources.mockReturnValue({
      data: [{
        name: 'default',
        namespace: '',
        labels: null,
        spec: null,
        status: null,
        raw: {
          metadata: { creationTimestamp: '2025-01-01T00:00:00Z', labels: {} },
          status: { phase: 'Active' },
        },
      }],
      isLoading: false,
      error: null,
    })

    render(<NamespaceList />)

    expect(screen.getByText('Namespaces')).toBeDefined()
    expect(screen.getByText('1 namespaces')).toBeDefined()
  })

  it('renders namespace rows with labels', () => {
    mockUseKubeResources.mockReturnValue({
      data: [
        {
          name: 'default',
          namespace: '',
          labels: null,
          spec: null,
          status: null,
          raw: {
            metadata: {
              creationTimestamp: '2025-01-01T00:00:00Z',
              labels: { 'kubernetes.io/metadata.name': 'default' },
            },
            status: { phase: 'Active' },
          },
        },
        {
          name: 'kube-system',
          namespace: '',
          labels: null,
          spec: null,
          status: null,
          raw: {
            metadata: {
              creationTimestamp: '2025-01-01T00:00:00Z',
              labels: { 'kubernetes.io/metadata.name': 'kube-system' },
            },
            status: { phase: 'Active' },
          },
        },
      ],
      isLoading: false,
      error: null,
    })

    render(<NamespaceList />)

    expect(screen.getByText('default')).toBeDefined()
    expect(screen.getByText('kube-system')).toBeDefined()
  })
})
