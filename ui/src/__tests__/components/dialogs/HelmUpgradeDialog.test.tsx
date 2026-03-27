import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { HelmUpgradeDialog } from '../../../components/dialogs/HelmUpgradeDialog'

const mockUpgradeChart = vi.fn()
vi.mock('@/wailsjs/go/handlers/HelmHandler', () => ({
  UpgradeChart: (...args: unknown[]) => mockUpgradeChart(...args),
}))

const mockAddToast = vi.fn()
vi.mock('@/stores/toastStore', () => ({
  useToastStore: (selector: (s: { addToast: typeof mockAddToast }) => unknown) =>
    selector({ addToast: mockAddToast }),
}))

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  releaseName: 'my-nginx',
  namespace: 'default',
  currentChart: 'bitnami/nginx',
  onUpgraded: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUpgradeChart.mockResolvedValue(undefined)
})

describe('HelmUpgradeDialog', () => {
  it('renders with release info', () => {
    render(<HelmUpgradeDialog {...defaultProps} />)
    expect(screen.getByText('Upgrade Release')).toBeInTheDocument()
    expect(screen.getByText('my-nginx')).toBeInTheDocument()
    expect(screen.getByText('default')).toBeInTheDocument()
  })

  it('pre-fills chart reference from current chart', () => {
    render(<HelmUpgradeDialog {...defaultProps} />)
    const input = screen.getByPlaceholderText('e.g. bitnami/nginx or oci://registry/chart') as HTMLInputElement
    expect(input.value).toBe('bitnami/nginx')
  })

  it('disables Upgrade button when chart reference is empty', () => {
    render(<HelmUpgradeDialog {...defaultProps} currentChart="" />)
    expect(screen.getByText('Upgrade')).toBeDisabled()
  })

  it('calls UpgradeChart on submit with correct params', async () => {
    render(<HelmUpgradeDialog {...defaultProps} />)
    fireEvent.click(screen.getByText('Upgrade'))

    await waitFor(() => {
      expect(mockUpgradeChart).toHaveBeenCalledWith(
        'my-nginx',
        'default',
        'bitnami/nginx',
        '{}'
      )
    })
  })

  it('shows success toast on successful upgrade', async () => {
    render(<HelmUpgradeDialog {...defaultProps} />)
    fireEvent.click(screen.getByText('Upgrade'))

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'success', title: 'Upgraded my-nginx' })
      )
    })
  })

  it('calls onUpgraded callback on success', async () => {
    render(<HelmUpgradeDialog {...defaultProps} />)
    fireEvent.click(screen.getByText('Upgrade'))

    await waitFor(() => {
      expect(defaultProps.onUpgraded).toHaveBeenCalled()
    })
  })

  it('shows error toast on failure', async () => {
    mockUpgradeChart.mockRejectedValue(new Error('release not found'))
    render(<HelmUpgradeDialog {...defaultProps} />)
    fireEvent.click(screen.getByText('Upgrade'))

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', title: 'Failed to upgrade release' })
      )
    })
  })

  it('shows error toast for invalid JSON values', async () => {
    render(<HelmUpgradeDialog {...defaultProps} />)
    const textarea = screen.getByPlaceholderText('{"key": "value"}')
    fireEvent.change(textarea, { target: { value: '{bad json' } })
    fireEvent.click(screen.getByText('Upgrade'))

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', title: 'Invalid values JSON' })
      )
    })
  })

  it('passes JSON values when provided', async () => {
    render(<HelmUpgradeDialog {...defaultProps} />)
    const textarea = screen.getByPlaceholderText('{"key": "value"}')
    fireEvent.change(textarea, { target: { value: '{"image": "nginx:latest"}' } })
    fireEvent.click(screen.getByText('Upgrade'))

    await waitFor(() => {
      expect(mockUpgradeChart).toHaveBeenCalledWith(
        'my-nginx',
        'default',
        'bitnami/nginx',
        '{"image":"nginx:latest"}'
      )
    })
  })

  it('shows Upgrading... while loading', async () => {
    mockUpgradeChart.mockImplementation(() => new Promise(() => {}))
    render(<HelmUpgradeDialog {...defaultProps} />)
    fireEvent.click(screen.getByText('Upgrade'))

    await waitFor(() => {
      expect(screen.getByText('Upgrading...')).toBeInTheDocument()
    })
  })
})
