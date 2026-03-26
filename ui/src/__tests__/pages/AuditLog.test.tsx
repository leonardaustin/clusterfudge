import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

vi.mock('@/wailsjs/go/handlers/AuditHandler', () => ({
  GetAuditLog: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/stores/toastStore', () => ({
  useToastStore: Object.assign(vi.fn(() => ({ addToast: vi.fn() })), {
    getState: vi.fn(() => ({ addToast: vi.fn() })),
  }),
}))

import { GetAuditLog, type AuditEntry } from '@/wailsjs/go/handlers/AuditHandler'
import { AuditLog } from '@/pages/AuditLog'

const mockGetAuditLog = vi.mocked(GetAuditLog)

beforeEach(() => {
  vi.clearAllMocks()
  mockGetAuditLog.mockResolvedValue([])
})

describe('AuditLog', () => {
  it('renders with title and shows loading state', async () => {
    let resolvePromise!: (value: AuditEntry[]) => void
    mockGetAuditLog.mockReturnValue(new Promise((resolve) => { resolvePromise = resolve }))

    await act(async () => { render(<AuditLog />) })
    expect(screen.getByText('Audit Log')).toBeDefined()
    expect(screen.getByText('Loading audit log...')).toBeDefined()

    await act(async () => { resolvePromise([]) })
  })

  it('displays entries when data is loaded', async () => {
    mockGetAuditLog.mockResolvedValue([
      { id: '1', timestamp: '2024-01-01T00:00:00Z', action: 'create', kind: 'Deployment', name: 'web-app', namespace: 'default', user: 'admin', detail: 'Created deployment' },
    ])

    await act(async () => { render(<AuditLog />) })
    expect(screen.getByText('1 entries')).toBeDefined()
    expect(screen.getByText('web-app')).toBeDefined()
    expect(screen.getByText('create')).toBeDefined()
  })

  it('shows error message on load failure', async () => {
    mockGetAuditLog.mockRejectedValue(new Error('audit not available'))

    await act(async () => { render(<AuditLog />) })
    expect(screen.getByText(/Failed to load audit log/)).toBeDefined()
  })
})
