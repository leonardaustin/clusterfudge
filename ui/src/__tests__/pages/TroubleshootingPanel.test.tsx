import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/wailsjs/go/handlers/TroubleshootHandler', () => ({
  InvestigateResource: vi.fn().mockResolvedValue({ problem: '', rootCause: '', since: '', suggestions: [] }),
  GetTimeline: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/wailsjs/go/handlers/ResourceHandler', () => ({
  ListResources: vi.fn().mockResolvedValue([]),
  RestartDeployment: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/stores/toastStore', () => ({
  useToastStore: { getState: () => ({ addToast: vi.fn() }) },
}))

import { TroubleshootingPanel } from '@/pages/TroubleshootingPanel'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('TroubleshootingPanel', () => {
  it('renders with title and subtitle', () => {
    render(<MemoryRouter><TroubleshootingPanel /></MemoryRouter>)
    expect(screen.getByText('Troubleshooting')).toBeDefined()
    expect(screen.getByText('Investigate resource issues and view change timelines')).toBeDefined()
  })

  it('renders input fields and investigate button', () => {
    render(<MemoryRouter><TroubleshootingPanel /></MemoryRouter>)
    expect(screen.getByText('Kind')).toBeDefined()
    expect(screen.getByText('Namespace')).toBeDefined()
    expect(screen.getByText('Name')).toBeDefined()
    expect(screen.getByText('Investigate')).toBeDefined()
  })

  it('disables investigate button when name is empty', () => {
    render(<MemoryRouter><TroubleshootingPanel /></MemoryRouter>)
    const button = screen.getByText('Investigate')
    expect(button.hasAttribute('disabled') || (button as HTMLButtonElement).disabled).toBe(true)
  })
})
