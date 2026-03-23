import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/wailsjs/go/handlers/WizardHandler', () => ({
  PreviewConfigMap: vi.fn().mockResolvedValue(''),
}))

vi.mock('@/wailsjs/go/handlers/ResourceHandler', () => ({
  ApplyResource: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/stores/toastStore', () => ({
  useToastStore: Object.assign(vi.fn(() => ({ addToast: vi.fn() })), {
    getState: vi.fn(() => ({ addToast: vi.fn() })),
  }),
}))

import { ConfigMapWizard } from '@/pages/ConfigMapWizard'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ConfigMapWizard', () => {
  it('renders with title and subtitle', () => {
    render(<ConfigMapWizard />)
    expect(screen.getByText('ConfigMap Wizard')).toBeDefined()
    expect(screen.getByText('Create a new ConfigMap step by step')).toBeDefined()
  })

  it('renders step indicators', () => {
    render(<ConfigMapWizard />)
    expect(screen.getByText('Basic Info')).toBeDefined()
    expect(screen.getByText('Data')).toBeDefined()
    expect(screen.getByText('Preview')).toBeDefined()
  })

  it('shows basic info form fields on first step', () => {
    render(<ConfigMapWizard />)
    expect(screen.getByPlaceholderText('my-configmap')).toBeDefined()
    expect(screen.getByText('Next')).toBeDefined()
  })
})
