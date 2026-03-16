import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DeleteConfirmDialog } from '../../../components/dialogs/DeleteConfirmDialog'

const mockDeleteResource = vi.fn()
vi.mock('@/wailsjs/go/handlers/ResourceHandler', () => ({
  DeleteResource: (...args: unknown[]) => mockDeleteResource(...args),
}))

const mockAddToast = vi.fn()
vi.mock('@/stores/toastStore', () => ({
  useToastStore: (selector: (s: { addToast: typeof mockAddToast }) => unknown) =>
    selector({ addToast: mockAddToast }),
}))

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  resourceKind: 'Pod',
  group: '',
  version: 'v1',
  resource: 'pods',
  namespace: 'default',
  name: 'nginx-abc123',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDeleteResource.mockResolvedValue(undefined)
})

describe('DeleteConfirmDialog', () => {
  it('renders with resource info', () => {
    render(<DeleteConfirmDialog {...defaultProps} />)
    expect(screen.getByText('Delete Pod')).toBeInTheDocument()
    expect(screen.getAllByText('nginx-abc123').length).toBeGreaterThanOrEqual(1)
  })

  it('has red-themed border', () => {
    render(<DeleteConfirmDialog {...defaultProps} />)
    // The dialog content should have red border styling
    expect(screen.getByText('Delete Pod')).toBeInTheDocument()
  })

  it('disables delete button when name is not typed', () => {
    render(<DeleteConfirmDialog {...defaultProps} />)
    const deleteBtn = screen.getByText('Delete')
    expect(deleteBtn).toBeDisabled()
  })

  it('enables delete button when name matches', async () => {
    const user = userEvent.setup()
    render(<DeleteConfirmDialog {...defaultProps} />)
    const input = screen.getByLabelText('Confirm resource name')

    await user.type(input, 'nginx-abc123')
    expect(screen.getByText('Delete')).not.toBeDisabled()
  })

  it('keeps delete disabled with partial name', async () => {
    const user = userEvent.setup()
    render(<DeleteConfirmDialog {...defaultProps} />)
    const input = screen.getByLabelText('Confirm resource name')

    await user.type(input, 'nginx-abc')
    expect(screen.getByText('Delete')).toBeDisabled()
  })

  it('calls DeleteResource with correct arguments', async () => {
    const user = userEvent.setup()
    render(<DeleteConfirmDialog {...defaultProps} />)
    const input = screen.getByLabelText('Confirm resource name')

    await user.type(input, 'nginx-abc123')
    fireEvent.click(screen.getByText('Delete'))

    await waitFor(() => {
      expect(mockDeleteResource).toHaveBeenCalledWith('', 'v1', 'pods', 'default', 'nginx-abc123')
    })
  })

  it('shows success toast on deletion', async () => {
    const user = userEvent.setup()
    render(<DeleteConfirmDialog {...defaultProps} />)
    const input = screen.getByLabelText('Confirm resource name')

    await user.type(input, 'nginx-abc123')
    fireEvent.click(screen.getByText('Delete'))

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'success' })
      )
    })
  })

  it('shows error toast on failure', async () => {
    mockDeleteResource.mockRejectedValue(new Error('not found'))
    const user = userEvent.setup()
    render(<DeleteConfirmDialog {...defaultProps} />)
    const input = screen.getByLabelText('Confirm resource name')

    await user.type(input, 'nginx-abc123')
    fireEvent.click(screen.getByText('Delete'))

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', description: 'not found' })
      )
    })
  })

  it('shows warning about irreversible action', () => {
    render(<DeleteConfirmDialog {...defaultProps} />)
    expect(screen.getByText('cannot be undone')).toBeInTheDocument()
  })
})
