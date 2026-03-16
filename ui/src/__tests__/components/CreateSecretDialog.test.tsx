import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@/wailsjs/go/handlers/WizardHandler', () => ({
  PreviewSecret: vi.fn().mockResolvedValue('apiVersion: v1\nkind: Secret'),
}))

vi.mock('@/wailsjs/go/handlers/ResourceHandler', () => ({
  ApplyResource: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/stores/toastStore', () => ({
  useToastStore: Object.assign(vi.fn(() => ({ addToast: vi.fn() })), {
    getState: vi.fn(() => ({ addToast: vi.fn() })),
  }),
}))

import { CreateSecretDialog } from '@/components/shared/CreateSecretDialog'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CreateSecretDialog', () => {
  const onClose = vi.fn()

  it('renders the dialog with title', () => {
    render(<CreateSecretDialog onClose={onClose} />)
    expect(screen.getByTestId('create-secret-dialog')).toBeDefined()
  })

  it('shows Docker Registry mode by default', () => {
    render(<CreateSecretDialog onClose={onClose} />)
    expect(screen.getByPlaceholderText('https://index.docker.io/v1/')).toBeDefined()
  })

  it('switches to TLS mode', () => {
    render(<CreateSecretDialog onClose={onClose} />)
    fireEvent.click(screen.getByTestId('mode-tls'))
    expect(screen.getByPlaceholderText('-----BEGIN CERTIFICATE-----')).toBeDefined()
    expect(screen.getByPlaceholderText('-----BEGIN PRIVATE KEY-----')).toBeDefined()
  })

  it('shows common fields in both modes', () => {
    render(<CreateSecretDialog onClose={onClose} />)
    expect(screen.getByPlaceholderText('my-secret')).toBeDefined()
  })

  it('has Preview YAML and Create Secret buttons', () => {
    render(<CreateSecretDialog onClose={onClose} />)
    expect(screen.getByText('Preview YAML')).toBeDefined()
    // "Create Secret" appears as both dialog title and button; verify both exist
    expect(screen.getAllByText('Create Secret').length).toBeGreaterThanOrEqual(2)
  })

  it('closes when clicking close button', () => {
    render(<CreateSecretDialog onClose={onClose} />)
    const closeBtn = screen.getByLabelText('Close')
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalled()
  })
})
