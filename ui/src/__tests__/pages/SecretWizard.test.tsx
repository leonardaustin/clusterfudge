import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/wailsjs/go/handlers/WizardHandler', () => ({
  PreviewSecret: vi.fn().mockResolvedValue(''),
}))

vi.mock('@/wailsjs/go/handlers/ResourceHandler', () => ({
  ApplyResource: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/stores/toastStore', () => ({
  useToastStore: Object.assign(vi.fn(() => ({ addToast: vi.fn() })), {
    getState: vi.fn(() => ({ addToast: vi.fn() })),
  }),
}))

import { SecretWizard } from '@/pages/SecretWizard'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SecretWizard', () => {
  it('renders with title and subtitle', () => {
    render(<SecretWizard />)
    expect(screen.getByText('Secret Wizard')).toBeDefined()
    expect(screen.getByText('Create a new Secret step by step')).toBeDefined()
  })

  it('renders step indicators', () => {
    render(<SecretWizard />)
    expect(screen.getByText('Basic Info')).toBeDefined()
    expect(screen.getByText('Data')).toBeDefined()
    expect(screen.getByText('Preview')).toBeDefined()
  })

  it('shows basic info form fields on first step', () => {
    render(<SecretWizard />)
    expect(screen.getByPlaceholderText('my-secret')).toBeDefined()
    expect(screen.getByText('Next')).toBeDefined()
  })
})
