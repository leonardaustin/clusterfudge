import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RestartDialog } from '../../../components/dialogs/RestartDialog'

const mockRestartDeployment = vi.fn()
vi.mock('@/wailsjs/go/handlers/ResourceHandler', () => ({
  RestartDeployment: (...args: unknown[]) => mockRestartDeployment(...args),
}))

const mockAddToast = vi.fn()
vi.mock('@/stores/toastStore', () => ({
  useToastStore: (selector: (s: { addToast: typeof mockAddToast }) => unknown) =>
    selector({ addToast: mockAddToast }),
}))

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  namespace: 'production',
  name: 'api-server',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRestartDeployment.mockResolvedValue(undefined)
})

describe('RestartDialog', () => {
  it('renders with deployment info', () => {
    render(<RestartDialog {...defaultProps} />)
    expect(screen.getByText('Restart Deployment')).toBeInTheDocument()
    expect(screen.getByText('api-server')).toBeInTheDocument()
    expect(screen.getByText('production')).toBeInTheDocument()
  })

  it('has an enabled Restart button', () => {
    render(<RestartDialog {...defaultProps} />)
    expect(screen.getByText('Restart')).not.toBeDisabled()
  })

  it('calls RestartDeployment on confirm', async () => {
    render(<RestartDialog {...defaultProps} />)
    fireEvent.click(screen.getByText('Restart'))

    await waitFor(() => {
      expect(mockRestartDeployment).toHaveBeenCalledWith('production', 'api-server')
    })
  })

  it('shows success toast on restart', async () => {
    render(<RestartDialog {...defaultProps} />)
    fireEvent.click(screen.getByText('Restart'))

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'success' })
      )
    })
  })

  it('shows error toast on failure', async () => {
    mockRestartDeployment.mockRejectedValue(new Error('timeout'))
    render(<RestartDialog {...defaultProps} />)
    fireEvent.click(screen.getByText('Restart'))

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', description: 'timeout' })
      )
    })
  })

  it('mentions rolling restart in description', () => {
    render(<RestartDialog {...defaultProps} />)
    expect(screen.getByText(/rolling restart/i)).toBeInTheDocument()
  })

  it('has a Cancel button', () => {
    render(<RestartDialog {...defaultProps} />)
    expect(screen.getByText('Cancel')).toBeInTheDocument()
  })
})
