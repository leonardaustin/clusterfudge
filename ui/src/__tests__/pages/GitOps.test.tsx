import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

vi.mock('@/wailsjs/go/handlers/GitOpsHandler', () => ({
  DetectClusterProviders: vi.fn().mockResolvedValue({ providers: [] }),
}))

vi.mock('@/stores/toastStore', () => ({
  useToastStore: Object.assign(vi.fn(() => ({ addToast: vi.fn() })), {
    getState: vi.fn(() => ({ addToast: vi.fn() })),
  }),
}))

import { DetectClusterProviders, type DetectionResult } from '@/wailsjs/go/handlers/GitOpsHandler'
import { GitOps } from '@/pages/GitOps'

const mockDetectProviders = vi.mocked(DetectClusterProviders)

beforeEach(() => {
  vi.clearAllMocks()
  mockDetectProviders.mockResolvedValue({ providers: [] })
})

describe('GitOps', () => {
  it('renders with title and shows scanning state', async () => {
    let resolvePromise!: (value: DetectionResult) => void
    mockDetectProviders.mockReturnValue(new Promise((resolve) => { resolvePromise = resolve }))

    await act(async () => { render(<GitOps />) })
    expect(screen.getByText('GitOps')).toBeDefined()
    expect(screen.getByText('Scanning cluster...')).toBeDefined()

    await act(async () => { resolvePromise({ providers: [] }) })
  })

  it('shows no providers message when none detected', async () => {
    await act(async () => { render(<GitOps />) })
    expect(screen.getByText('No GitOps providers detected')).toBeDefined()
    expect(screen.getByText(/Install ArgoCD or Flux/)).toBeDefined()
  })

  it('shows error state on failure', async () => {
    mockDetectProviders.mockRejectedValue(new Error('no access'))

    await act(async () => { render(<GitOps />) })
    expect(screen.getByText(/Failed to scan for GitOps providers/)).toBeDefined()
  })

  it('handles null providers without crashing', async () => {
    mockDetectProviders.mockResolvedValue({ providers: null } as unknown as DetectionResult)

    await act(async () => { render(<GitOps />) })
    expect(screen.getByText('No GitOps providers detected')).toBeDefined()
  })

  it('handles missing providers field without crashing', async () => {
    mockDetectProviders.mockResolvedValue({} as unknown as DetectionResult)

    await act(async () => { render(<GitOps />) })
    expect(screen.getByText('No GitOps providers detected')).toBeDefined()
  })

  it('renders detected providers', async () => {
    mockDetectProviders.mockResolvedValue({
      providers: [{
        provider: 'argocd',
        namespace: 'argocd',
        version: '2.9.0',
        resources: ['Application', 'AppProject'],
      }],
    })

    await act(async () => { render(<GitOps />) })
    expect(screen.getAllByText('argocd').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('v2.9.0')).toBeDefined()
    expect(screen.getByText('Application')).toBeDefined()
    expect(screen.getByText('AppProject')).toBeDefined()
  })
})
