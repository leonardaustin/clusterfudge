import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DrainNodeDialog } from '../../../components/dialogs/DrainNodeDialog'

const mockDrainNode = vi.fn()
vi.mock('@/wailsjs/go/handlers/ResourceHandler', () => ({
  DrainNode: (...args: unknown[]) => mockDrainNode(...args),
}))

const mockAddToast = vi.fn()
vi.mock('@/stores/toastStore', () => ({
  useToastStore: (selector: (s: { addToast: typeof mockAddToast }) => unknown) =>
    selector({ addToast: mockAddToast }),
}))

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  nodeName: 'worker-01',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDrainNode.mockResolvedValue(undefined)
})

describe('DrainNodeDialog', () => {
  it('renders with node name', () => {
    render(<DrainNodeDialog {...defaultProps} />)
    expect(screen.getAllByText('Drain Node').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('worker-01')).toBeInTheDocument()
  })

  it('has Force checkbox (unchecked by default)', () => {
    render(<DrainNodeDialog {...defaultProps} />)
    const forceCheckbox = screen.getByText('Force').closest('label')?.querySelector('input')
    expect(forceCheckbox).not.toBeChecked()
  })

  it('has Ignore DaemonSets checkbox (checked by default)', () => {
    render(<DrainNodeDialog {...defaultProps} />)
    const dsCheckbox = screen.getByText('Ignore DaemonSets').closest('label')?.querySelector('input')
    expect(dsCheckbox).toBeChecked()
  })

  it('has grace period input defaulting to 30', () => {
    render(<DrainNodeDialog {...defaultProps} />)
    const input = screen.getByLabelText('Grace period') as HTMLInputElement
    expect(input.value).toBe('30')
  })

  it('calls DrainNode with default options', async () => {
    render(<DrainNodeDialog {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Drain Node' }))

    await waitFor(() => {
      expect(mockDrainNode).toHaveBeenCalledWith('worker-01', 30, false, true, false)
    })
  })

  it('calls DrainNode with force option', async () => {
    render(<DrainNodeDialog {...defaultProps} />)
    const forceCheckbox = screen.getByText('Force').closest('label')?.querySelector('input')
    fireEvent.click(forceCheckbox!)
    fireEvent.click(screen.getByRole('button', { name: 'Drain Node' }))

    await waitFor(() => {
      expect(mockDrainNode).toHaveBeenCalledWith('worker-01', 30, true, true, false)
    })
  })

  it('calls DrainNode with custom grace period', async () => {
    const user = userEvent.setup()
    render(<DrainNodeDialog {...defaultProps} />)
    const input = screen.getByLabelText('Grace period')

    await user.clear(input)
    await user.type(input, '60')
    fireEvent.click(screen.getByRole('button', { name: 'Drain Node' }))

    await waitFor(() => {
      expect(mockDrainNode).toHaveBeenCalledWith('worker-01', 60, false, true, false)
    })
  })

  it('shows success toast on drain', async () => {
    render(<DrainNodeDialog {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Drain Node' }))

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'success' })
      )
    })
  })

  it('has Delete EmptyDir Data checkbox (unchecked by default)', () => {
    render(<DrainNodeDialog {...defaultProps} />)
    const checkbox = screen.getByText('Delete EmptyDir Data').closest('label')?.querySelector('input')
    expect(checkbox).not.toBeChecked()
  })

  it('calls DrainNode with deleteEmptyDirData option', async () => {
    render(<DrainNodeDialog {...defaultProps} />)
    const checkbox = screen.getByText('Delete EmptyDir Data').closest('label')?.querySelector('input')
    fireEvent.click(checkbox!)
    fireEvent.click(screen.getByRole('button', { name: 'Drain Node' }))

    await waitFor(() => {
      expect(mockDrainNode).toHaveBeenCalledWith('worker-01', 30, false, true, true)
    })
  })

  it('shows error toast on failure', async () => {
    mockDrainNode.mockRejectedValue(new Error('eviction failed'))
    render(<DrainNodeDialog {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Drain Node' }))

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', description: 'eviction failed' })
      )
    })
  })
})
