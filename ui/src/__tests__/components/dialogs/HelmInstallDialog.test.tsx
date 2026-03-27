import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { HelmInstallDialog } from '../../../components/dialogs/HelmInstallDialog'

const mockInstallChart = vi.fn()
vi.mock('@/wailsjs/go/handlers/HelmHandler', () => ({
  InstallChart: (...args: unknown[]) => mockInstallChart(...args),
}))

const mockAddToast = vi.fn()
vi.mock('@/stores/toastStore', () => ({
  useToastStore: (selector: (s: { addToast: typeof mockAddToast }) => unknown) =>
    selector({ addToast: mockAddToast }),
}))

vi.mock('@/stores/clusterStore', () => ({
  useClusterStore: (selector: (s: { namespaces: string[]; selectedNamespace: string }) => unknown) =>
    selector({ namespaces: ['default', 'kube-system', 'production'], selectedNamespace: 'default' }),
}))

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  chartName: 'nginx',
  chartVersion: '1.0.0',
  chartRepo: 'bitnami',
  onInstalled: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  mockInstallChart.mockResolvedValue(undefined)
})

describe('HelmInstallDialog', () => {
  it('renders with chart info', () => {
    render(<HelmInstallDialog {...defaultProps} />)
    expect(screen.getByText('Install Helm Chart')).toBeInTheDocument()
    expect(screen.getByText('nginx')).toBeInTheDocument()
  })

  it('pre-fills release name from chart name', () => {
    render(<HelmInstallDialog {...defaultProps} />)
    const input = screen.getByPlaceholderText('e.g. my-release') as HTMLInputElement
    expect(input.value).toBe('nginx')
  })

  it('pre-fills chart reference from repo/chart', () => {
    render(<HelmInstallDialog {...defaultProps} />)
    const input = screen.getByPlaceholderText('e.g. bitnami/nginx or oci://registry/chart') as HTMLInputElement
    expect(input.value).toBe('bitnami/nginx')
  })

  it('populates namespace dropdown from cluster store', () => {
    render(<HelmInstallDialog {...defaultProps} />)
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(3)
    expect(options[0]).toHaveTextContent('default')
    expect(options[1]).toHaveTextContent('kube-system')
  })

  it('disables Install button when release name is empty', () => {
    render(<HelmInstallDialog {...defaultProps} chartName="" />)
    expect(screen.getByText('Install')).toBeDisabled()
  })

  it('calls InstallChart on submit with correct params', async () => {
    render(<HelmInstallDialog {...defaultProps} />)
    fireEvent.click(screen.getByText('Install'))

    await waitFor(() => {
      expect(mockInstallChart).toHaveBeenCalledWith(
        'nginx',
        'default',
        'bitnami/nginx',
        '{}'
      )
    })
  })

  it('shows success toast on successful install', async () => {
    render(<HelmInstallDialog {...defaultProps} />)
    fireEvent.click(screen.getByText('Install'))

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'success', title: 'Installed nginx' })
      )
    })
  })

  it('calls onInstalled callback on success', async () => {
    render(<HelmInstallDialog {...defaultProps} />)
    fireEvent.click(screen.getByText('Install'))

    await waitFor(() => {
      expect(defaultProps.onInstalled).toHaveBeenCalled()
    })
  })

  it('shows error toast on failure', async () => {
    mockInstallChart.mockRejectedValue(new Error('chart not found'))
    render(<HelmInstallDialog {...defaultProps} />)
    fireEvent.click(screen.getByText('Install'))

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', title: 'Failed to install chart' })
      )
    })
  })

  it('shows error toast for invalid JSON values', async () => {
    render(<HelmInstallDialog {...defaultProps} />)
    const textarea = screen.getByPlaceholderText('{"key": "value"}')
    fireEvent.change(textarea, { target: { value: 'not valid json' } })
    fireEvent.click(screen.getByText('Install'))

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', title: 'Invalid values JSON' })
      )
    })
  })

  it('passes JSON values when provided', async () => {
    render(<HelmInstallDialog {...defaultProps} />)
    const textarea = screen.getByPlaceholderText('{"key": "value"}')
    fireEvent.change(textarea, { target: { value: '{"replicas": 3}' } })
    fireEvent.click(screen.getByText('Install'))

    await waitFor(() => {
      expect(mockInstallChart).toHaveBeenCalledWith(
        'nginx',
        'default',
        'bitnami/nginx',
        '{"replicas":3}'
      )
    })
  })

  it('shows Installing... while loading', async () => {
    mockInstallChart.mockImplementation(() => new Promise(() => {}))
    render(<HelmInstallDialog {...defaultProps} />)
    fireEvent.click(screen.getByText('Install'))

    await waitFor(() => {
      expect(screen.getByText('Installing...')).toBeInTheDocument()
    })
  })
})
