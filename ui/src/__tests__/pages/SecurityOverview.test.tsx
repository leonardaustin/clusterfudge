import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

vi.mock('@/wailsjs/go/handlers/SecurityScanHandler', () => ({
  ScanAllPods: vi.fn().mockResolvedValue({ violations: [], podCount: 0 }),
}))

vi.mock('@/stores/toastStore', () => ({
  useToastStore: Object.assign(vi.fn(() => ({ addToast: vi.fn() })), {
    getState: vi.fn(() => ({ addToast: vi.fn() })),
  }),
}))

import { ScanAllPods, type ScanAllPodsResult } from '@/wailsjs/go/handlers/SecurityScanHandler'
import { SecurityOverview } from '@/pages/SecurityOverview'

const mockScanAllPods = vi.mocked(ScanAllPods)

beforeEach(() => {
  vi.clearAllMocks()
  mockScanAllPods.mockResolvedValue({ violations: [], podCount: 0 })
})

describe('SecurityOverview', () => {
  it('renders with title and shows scanning state', async () => {
    let resolvePromise!: (value: ScanAllPodsResult) => void
    mockScanAllPods.mockReturnValue(new Promise((resolve) => { resolvePromise = resolve }))

    await act(async () => { render(<SecurityOverview />) })
    expect(screen.getByText('Security Overview')).toBeDefined()
    expect(screen.getByText('Scanning pods...')).toBeDefined()

    await act(async () => { resolvePromise({ violations: [], podCount: 0 }) })
  })

  it('shows no violations message when clean', async () => {
    await act(async () => { render(<SecurityOverview />) })
    expect(screen.getByText('No security violations detected')).toBeDefined()
  })

  it('shows error state on failure', async () => {
    mockScanAllPods.mockRejectedValue(new Error('scan failed'))

    await act(async () => { render(<SecurityOverview />) })
    expect(screen.getByText(/Failed to run security scan/)).toBeDefined()
  })
})
