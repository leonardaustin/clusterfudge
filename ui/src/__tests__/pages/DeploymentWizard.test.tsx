import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/wailsjs/go/handlers/WizardHandler', () => ({
  PreviewDeployment: vi.fn().mockResolvedValue(''),
}))

vi.mock('@/stores/toastStore', () => ({
  useToastStore: Object.assign(vi.fn(() => ({ addToast: vi.fn() })), {
    getState: vi.fn(() => ({ addToast: vi.fn() })),
  }),
}))

import { DeploymentWizard } from '@/pages/DeploymentWizard'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('DeploymentWizard', () => {
  it('renders with title and subtitle', () => {
    render(<DeploymentWizard />)
    expect(screen.getByText('Deployment Wizard')).toBeDefined()
    expect(screen.getByText('Create a new deployment step by step')).toBeDefined()
  })

  it('renders step indicators', () => {
    render(<DeploymentWizard />)
    expect(screen.getByText('Basic Info')).toBeDefined()
    expect(screen.getByText('Resources')).toBeDefined()
    expect(screen.getByText('Labels')).toBeDefined()
    expect(screen.getByText('Preview')).toBeDefined()
  })

  it('shows basic info form fields on first step', () => {
    render(<DeploymentWizard />)
    expect(screen.getByPlaceholderText('my-deployment')).toBeDefined()
    expect(screen.getByPlaceholderText('nginx:latest')).toBeDefined()
    expect(screen.getByText('Next')).toBeDefined()
  })
})
