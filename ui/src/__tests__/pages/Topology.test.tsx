import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/hooks/useKubeResource', () => ({
  useKubeResources: vi.fn(() => ({ data: [], isLoading: false, error: null })),
}))

vi.mock('@/stores/clusterStore', () => ({
  useClusterStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({ selectedNamespace: '' })
  ),
}))

import { Topology } from '@/pages/Topology'

beforeEach(() => {
  vi.clearAllMocks()
})

function renderTopology() {
  return render(
    <MemoryRouter>
      <Topology />
    </MemoryRouter>
  )
}

describe('Topology', () => {
  it('renders with title', () => {
    renderTopology()
    expect(screen.getByText('Resource Topology')).toBeDefined()
  })

  it('shows empty state when no resources', () => {
    renderTopology()
    expect(screen.getByText('No resources match the filter.')).toBeDefined()
  })

  it('shows resource count in subtitle', () => {
    renderTopology()
    expect(screen.getByText(/0 resources across 0 top-level workloads/)).toBeDefined()
  })
})
