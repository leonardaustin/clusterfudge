import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: vi.fn(() => ({ namespace: 'default', name: 'my-release' })),
    useNavigate: vi.fn(() => mockNavigate),
  }
})

const stableAddToast = vi.fn()
vi.mock('@/stores/toastStore', () => ({
  useToastStore: Object.assign(
    vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
      selector({ addToast: stableAddToast })
    ),
    { getState: vi.fn(() => ({ addToast: stableAddToast })) }
  ),
}))

const releasePayload = {
  name: 'my-release',
  namespace: 'default',
  status: 'deployed',
  revision: 3,
  chart: 'nginx',
  chartVersion: '1.2.0',
  appVersion: '1.25.0',
  updated: '2024-01-01 00:00:00',
  values: 'replicas: 2',
  manifest: 'apiVersion: apps/v1',
  notes: 'Release notes here',
}

vi.mock('@/wailsjs/go/handlers/HelmHandler', () => ({
  GetRelease: vi.fn().mockResolvedValue({
    name: 'my-release', namespace: 'default', status: 'deployed', revision: 3,
    chart: 'nginx', chartVersion: '1.2.0', appVersion: '1.25.0',
    updated: '2024-01-01 00:00:00', values: 'replicas: 2',
    manifest: 'apiVersion: apps/v1', notes: 'Release notes here',
  }),
  GetReleaseHistory: vi.fn().mockResolvedValue([
    { name: 'my-release', namespace: 'default', revision: 3, status: 'deployed', chart: 'nginx', chartVersion: '1.2.0', appVersion: '1.25.0', updated: '2024-01-01', notes: '' },
    { name: 'my-release', namespace: 'default', revision: 2, status: 'superseded', chart: 'nginx', chartVersion: '1.1.0', appVersion: '1.24.0', updated: '2023-12-01', notes: '' },
  ]),
  RollbackRelease: vi.fn().mockResolvedValue(undefined),
}))

import { GetRelease, GetReleaseHistory } from '@/wailsjs/go/handlers/HelmHandler'
import { HelmReleaseDetail } from '@/pages/HelmReleaseDetail'

const mockGetRelease = vi.mocked(GetRelease)
const mockGetReleaseHistory = vi.mocked(GetReleaseHistory)

beforeEach(() => {
  stableAddToast.mockClear()
  mockNavigate.mockClear()
  // Re-set resolved values since clearAllMocks would clear them
  mockGetRelease.mockResolvedValue(releasePayload)
  mockGetReleaseHistory.mockResolvedValue([
    { name: 'my-release', namespace: 'default', revision: 3, status: 'deployed', chart: 'nginx', chartVersion: '1.2.0', appVersion: '1.25.0', updated: '2024-01-01', notes: '' },
    { name: 'my-release', namespace: 'default', revision: 2, status: 'superseded', chart: 'nginx', chartVersion: '1.1.0', appVersion: '1.24.0', updated: '2023-12-01', notes: '' },
  ])
})

describe('HelmReleaseDetail', () => {
  it('renders release detail after loading', async () => {
    await act(async () => { render(<HelmReleaseDetail />) })
    expect(screen.getAllByText('my-release').length).toBeGreaterThan(0)
    expect(screen.getByText(/Helm Release in "default" namespace/)).toBeDefined()
  })

  it('shows not found state when release is null', async () => {
    mockGetRelease.mockResolvedValue(null as never)

    await act(async () => { render(<HelmReleaseDetail />) })
    expect(screen.getByText(/Release "my-release" not found/)).toBeDefined()
    expect(screen.getByText('Back to list')).toBeDefined()
  })

  it('shows deployed status badge', async () => {
    await act(async () => { render(<HelmReleaseDetail />) })
    expect(screen.getAllByText('deployed').length).toBeGreaterThan(0)
    expect(screen.getByText('Rev 3')).toBeDefined()
  })
})
