import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mockAddToast = vi.fn()

vi.mock('../wailsjs/go/handlers/HelmHandler', () => ({
  ListReleases: vi.fn().mockResolvedValue([
    {
      name: 'nginx-ingress',
      namespace: 'ingress-nginx',
      revision: 3,
      status: 'deployed',
      chart: 'ingress-nginx',
      chartVersion: '4.9.0',
      appVersion: '1.9.5',
      updated: '2026-02-20 14:30:00',
      notes: '',
    },
    {
      name: 'postgresql',
      namespace: 'default',
      revision: 1,
      status: 'failed',
      chart: 'postgresql',
      chartVersion: '14.0.5',
      appVersion: '16.1.0',
      updated: '2026-02-28 08:30:00',
      notes: '',
    },
  ]),
  UninstallRelease: vi.fn().mockResolvedValue(undefined),
  RollbackRelease: vi.fn().mockResolvedValue(undefined),
  ListChartRepos: vi.fn().mockResolvedValue([
    { name: 'bitnami', url: 'https://charts.bitnami.com/bitnami' },
    { name: 'stable', url: 'https://charts.helm.sh/stable' },
  ]),
  AddChartRepo: vi.fn().mockResolvedValue(undefined),
  RemoveChartRepo: vi.fn().mockResolvedValue(undefined),
  SearchCharts: vi.fn().mockResolvedValue([
    {
      name: 'nginx',
      version: '15.0.0',
      appVersion: '1.25.0',
      description: 'NGINX web server',
      repo: 'bitnami',
    },
  ]),
}))

vi.mock('../stores/clusterStore', () => ({
  useClusterStore: vi.fn((selector: (s: { selectedNamespace: string }) => unknown) =>
    selector({ selectedNamespace: '' })
  ),
}))

vi.mock('../stores/toastStore', () => ({
  useToastStore: vi.fn((selector: (s: { addToast: typeof mockAddToast }) => unknown) =>
    selector({ addToast: mockAddToast })
  ),
}))

import { HelmReleaseList } from '../pages/HelmReleaseList'

describe('HelmReleaseList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders releases from API', async () => {
    render(
      <MemoryRouter>
        <HelmReleaseList />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('nginx-ingress')).toBeInTheDocument()
      expect(screen.getAllByText('postgresql').length).toBeGreaterThan(0)
    })
  })

  it('shows status indicators for each release', async () => {
    render(
      <MemoryRouter>
        <HelmReleaseList />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('nginx-ingress')).toBeInTheDocument()
    })

    // Deployed release (revision > 1) should show Rollback button
    expect(screen.getByText('Rollback')).toBeInTheDocument()

    // All releases should show Uninstall button
    const uninstallButtons = screen.getAllByText('Uninstall')
    expect(uninstallButtons).toHaveLength(2)
  })

  it('shows release count in subtitle', async () => {
    render(
      <MemoryRouter>
        <HelmReleaseList />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/2 releases/)).toBeInTheDocument()
    })
  })

  // Tab navigation tests

  it('shows tab bar with Releases, Repositories, and Search tabs', async () => {
    render(
      <MemoryRouter>
        <HelmReleaseList />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('helm-tab-releases')).toBeInTheDocument()
      expect(screen.getByTestId('helm-tab-repositories')).toBeInTheDocument()
      expect(screen.getByTestId('helm-tab-search')).toBeInTheDocument()
    })
  })

  it('switches to repositories tab and shows repos', async () => {
    render(
      <MemoryRouter>
        <HelmReleaseList />
      </MemoryRouter>
    )

    // Wait for initial render
    await waitFor(() => {
      expect(screen.getByTestId('helm-tab-repositories')).toBeInTheDocument()
    })

    // Click repositories tab
    await act(async () => {
      fireEvent.click(screen.getByTestId('helm-tab-repositories'))
    })

    // Wait for repos to load
    await waitFor(() => {
      expect(screen.getByText('bitnami')).toBeInTheDocument()
      expect(screen.getByText('https://charts.bitnami.com/bitnami')).toBeInTheDocument()
    })
  })

  it('shows add repo form on repositories tab', async () => {
    render(
      <MemoryRouter>
        <HelmReleaseList />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('helm-tab-repositories')).toBeInTheDocument()
    })

    await act(async () => {
      fireEvent.click(screen.getByTestId('helm-tab-repositories'))
    })

    await waitFor(() => {
      expect(screen.getByTestId('add-repo-form')).toBeInTheDocument()
      expect(screen.getByTestId('add-repo-button')).toBeInTheDocument()
    })
  })

  it('switches to search tab and shows search input', async () => {
    render(
      <MemoryRouter>
        <HelmReleaseList />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('helm-tab-search')).toBeInTheDocument()
    })

    await act(async () => {
      fireEvent.click(screen.getByTestId('helm-tab-search'))
    })

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search charts by name or description...')).toBeInTheDocument()
      expect(screen.getByTestId('chart-search-button')).toBeInTheDocument()
    })
  })
})
