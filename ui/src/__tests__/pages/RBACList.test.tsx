import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RBACList } from '@/pages/RBACList'

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
  // RBACList calls useKubeResources 4 times (roles, clusterRoles, roleBindings, clusterRoleBindings)
  mockUseKubeResources.mockReturnValue({
    data: [],
    isLoading: false,
    error: null,
  })
})

describe('RBACList', () => {
  it('renders title and subtitle', () => {
    render(<MemoryRouter><RBACList /></MemoryRouter>)

    expect(screen.getByText('RBAC')).toBeDefined()
    expect(screen.getByText('Roles, bindings, and access control')).toBeDefined()
  })

  it('renders tab buttons for all RBAC resource types', () => {
    render(<MemoryRouter><RBACList /></MemoryRouter>)

    expect(screen.getByText('Roles')).toBeDefined()
    expect(screen.getByText('ClusterRoles')).toBeDefined()
    expect(screen.getByText('RoleBindings')).toBeDefined()
    expect(screen.getByText('ClusterRoleBindings')).toBeDefined()
  })

  it('renders role data in the default Roles tab', () => {
    mockUseKubeResources.mockImplementation((opts) => {
      if (opts.resource === 'roles') {
        return {
          data: [{
            name: 'pod-reader',
            namespace: 'default',
            labels: null,
            spec: null,
            status: null,
            raw: {
              metadata: { creationTimestamp: '2025-01-01T00:00:00Z' },
              rules: [
                {
                  apiGroups: [''],
                  resources: ['pods'],
                  verbs: ['get', 'list', 'watch'],
                },
              ],
            },
          }],
          isLoading: false,
          error: null,
        }
      }
      return { data: [], isLoading: false, error: null }
    })

    render(<MemoryRouter><RBACList /></MemoryRouter>)

    expect(screen.getByText('pod-reader')).toBeDefined()
    expect(screen.getByText('default')).toBeDefined()
  })
})
