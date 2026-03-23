import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/wailsjs/go/handlers/WizardHandler', () => ({
  PreviewService: vi.fn().mockResolvedValue(''),
}))

vi.mock('@/wailsjs/go/handlers/ResourceHandler', () => ({
  ApplyResource: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/stores/toastStore', () => ({
  useToastStore: Object.assign(vi.fn(() => ({ addToast: vi.fn() })), {
    getState: vi.fn(() => ({ addToast: vi.fn() })),
  }),
}))

import { ServiceWizard } from '@/pages/ServiceWizard'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ServiceWizard', () => {
  it('renders with title and subtitle', () => {
    render(<ServiceWizard />)
    expect(screen.getByText('Service Wizard')).toBeDefined()
    expect(screen.getByText('Create a new service step by step')).toBeDefined()
  })

  it('renders step indicators', () => {
    render(<ServiceWizard />)
    expect(screen.getByText('Basic Info')).toBeDefined()
    expect(screen.getByText('Ports')).toBeDefined()
    expect(screen.getByText('Selector')).toBeDefined()
    expect(screen.getByText('Preview')).toBeDefined()
  })

  it('shows basic info form fields on first step', () => {
    render(<ServiceWizard />)
    expect(screen.getByPlaceholderText('my-service')).toBeDefined()
    expect(screen.getByText('Next')).toBeDefined()
  })

  it('shows service type dropdown', () => {
    render(<ServiceWizard />)
    expect(screen.getByText('ClusterIP')).toBeDefined()
  })
})
