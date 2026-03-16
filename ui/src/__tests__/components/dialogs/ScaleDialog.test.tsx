import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ScaleDialog } from '../../../components/dialogs/ScaleDialog'

const mockScaleDeployment = vi.fn()
vi.mock('@/wailsjs/go/handlers/ResourceHandler', () => ({
  ScaleDeployment: (...args: unknown[]) => mockScaleDeployment(...args),
}))

const mockAddToast = vi.fn()
vi.mock('@/stores/toastStore', () => ({
  useToastStore: (selector: (s: { addToast: typeof mockAddToast }) => unknown) =>
    selector({ addToast: mockAddToast }),
}))

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  namespace: 'default',
  name: 'nginx',
  currentReplicas: 3,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockScaleDeployment.mockResolvedValue(undefined)
})

describe('ScaleDialog', () => {
  it('renders with the deployment name', () => {
    render(<ScaleDialog {...defaultProps} />)
    expect(screen.getByText('Scale Deployment')).toBeInTheDocument()
    expect(screen.getByText('nginx')).toBeInTheDocument()
  })

  it('shows current replica count in input', () => {
    render(<ScaleDialog {...defaultProps} />)
    const input = screen.getByLabelText('Replica count') as HTMLInputElement
    expect(input.value).toBe('3')
  })

  it('disables Scale button when count is unchanged', () => {
    render(<ScaleDialog {...defaultProps} />)
    const scaleBtn = screen.getByText('Scale')
    expect(scaleBtn).toBeDisabled()
  })

  it('enables Scale button when count changes', async () => {
    render(<ScaleDialog {...defaultProps} />)
    const incrementBtn = screen.getByLabelText('Increase replicas')
    fireEvent.click(incrementBtn)
    expect(screen.getByText('Scale')).not.toBeDisabled()
  })

  it('increments and decrements replicas', () => {
    render(<ScaleDialog {...defaultProps} />)
    const input = screen.getByLabelText('Replica count') as HTMLInputElement
    const incrementBtn = screen.getByLabelText('Increase replicas')
    const decrementBtn = screen.getByLabelText('Decrease replicas')

    fireEvent.click(incrementBtn)
    expect(input.value).toBe('4')

    fireEvent.click(decrementBtn)
    fireEvent.click(decrementBtn)
    expect(input.value).toBe('2')
  })

  it('does not decrement below zero', () => {
    render(<ScaleDialog {...defaultProps} currentReplicas={0} />)
    const input = screen.getByLabelText('Replica count') as HTMLInputElement
    const decrementBtn = screen.getByLabelText('Decrease replicas')

    fireEvent.click(decrementBtn)
    expect(input.value).toBe('0')
  })

  it('calls ScaleDeployment on submit', async () => {
    render(<ScaleDialog {...defaultProps} />)
    fireEvent.click(screen.getByLabelText('Increase replicas'))
    fireEvent.click(screen.getByText('Scale'))

    await waitFor(() => {
      expect(mockScaleDeployment).toHaveBeenCalledWith('default', 'nginx', 4)
    })
  })

  it('shows success toast on successful scale', async () => {
    render(<ScaleDialog {...defaultProps} />)
    fireEvent.click(screen.getByLabelText('Increase replicas'))
    fireEvent.click(screen.getByText('Scale'))

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'success' })
      )
    })
  })

  it('shows error toast on failure', async () => {
    mockScaleDeployment.mockRejectedValue(new Error('forbidden'))
    render(<ScaleDialog {...defaultProps} />)
    fireEvent.click(screen.getByLabelText('Increase replicas'))
    fireEvent.click(screen.getByText('Scale'))

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', description: 'forbidden' })
      )
    })
  })

  it('shows change summary when replicas differ', () => {
    render(<ScaleDialog {...defaultProps} />)
    fireEvent.click(screen.getByLabelText('Increase replicas'))
    expect(screen.getByText(/3 → 4 replicas/)).toBeInTheDocument()
  })

  it('allows typing a replica count directly', async () => {
    const user = userEvent.setup()
    render(<ScaleDialog {...defaultProps} />)
    const input = screen.getByLabelText('Replica count') as HTMLInputElement

    await user.clear(input)
    await user.type(input, '10')
    expect(input.value).toBe('10')
  })
})
