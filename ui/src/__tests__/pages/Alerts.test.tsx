import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

vi.mock('@/wailsjs/go/handlers/AlertHandler', () => ({
  ListAlerts: vi.fn().mockResolvedValue([]),
  AcknowledgeAlert: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/stores/toastStore', () => ({
  useToastStore: Object.assign(vi.fn(() => ({ addToast: vi.fn() })), {
    getState: vi.fn(() => ({ addToast: vi.fn() })),
  }),
}))

import { ListAlerts } from '@/wailsjs/go/handlers/AlertHandler'
import { Alerts } from '@/pages/Alerts'

const mockListAlerts = vi.mocked(ListAlerts)

beforeEach(() => {
  vi.clearAllMocks()
  mockListAlerts.mockResolvedValue([])
})

describe('Alerts', () => {
  it('renders with title and subtitle', async () => {
    await act(async () => { render(<Alerts />) })
    expect(screen.getByText('Alerts')).toBeDefined()
    expect(screen.getByText('0 active alerts')).toBeDefined()
  })

  it('displays alerts when data is loaded', async () => {
    mockListAlerts.mockResolvedValue([
      { id: '1', severity: 'critical', title: 'OOM Kill detected', message: 'Container OOM killed', resource: 'pod/my-pod', namespace: 'default', timestamp: '2m ago', acknowledged: false },
      { id: '2', severity: 'warning', title: 'High CPU', message: 'CPU above 90%', resource: 'deploy/api', namespace: 'prod', timestamp: '5m ago', acknowledged: true },
    ])

    await act(async () => { render(<Alerts />) })
    expect(screen.getByText('1 active alerts')).toBeDefined()
    expect(screen.getByText('OOM Kill detected')).toBeDefined()
    expect(screen.getByText('High CPU')).toBeDefined()
    expect(screen.getByText('pod/my-pod')).toBeDefined()
  })

  it('shows error message on load failure', async () => {
    mockListAlerts.mockRejectedValue(new Error('connection refused'))

    await act(async () => { render(<Alerts />) })
    expect(screen.getByText(/Failed to load alerts/)).toBeDefined()
    expect(screen.getByText(/connection refused/)).toBeDefined()
  })
})
