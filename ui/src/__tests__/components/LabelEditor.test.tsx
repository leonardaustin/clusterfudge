import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LabelEditor } from '@/components/shared/LabelEditor'

vi.mock('@/wailsjs/go/handlers/ResourceHandler', () => ({
  PatchLabels: vi.fn(),
}))

vi.mock('@/stores/toastStore', () => ({
  useToastStore: vi.fn((selector) => {
    const store = { addToast: vi.fn() }
    return selector(store)
  }),
}))

import { PatchLabels } from '@/wailsjs/go/handlers/ResourceHandler'

const mockPatchLabels = vi.mocked(PatchLabels)

const defaultProps = {
  group: '',
  version: 'v1',
  resource: 'pods',
  namespace: 'default',
  name: 'test-pod',
  labels: [
    { key: 'app', value: 'web' },
    { key: 'env', value: 'prod' },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('LabelEditor', () => {
  it('renders existing labels as chips', () => {
    render(<LabelEditor {...defaultProps} />)
    expect(screen.getByText('app=web')).toBeDefined()
    expect(screen.getByText('env=prod')).toBeDefined()
  })

  it('shows Add label button', () => {
    render(<LabelEditor {...defaultProps} />)
    expect(screen.getByText('+ Add label')).toBeDefined()
  })

  it('shows key/value inputs when Add label is clicked', () => {
    render(<LabelEditor {...defaultProps} />)
    fireEvent.click(screen.getByText('+ Add label'))
    expect(screen.getByPlaceholderText('key')).toBeDefined()
    expect(screen.getByPlaceholderText('value')).toBeDefined()
  })

  it('calls PatchLabels when removing a label', async () => {
    mockPatchLabels.mockResolvedValue()
    render(<LabelEditor {...defaultProps} />)

    const removeButtons = screen.getAllByText('x')
    fireEvent.click(removeButtons[0]) // Remove first label

    await waitFor(() => {
      expect(mockPatchLabels).toHaveBeenCalledWith(
        '', 'v1', 'pods', 'default', 'test-pod',
        { app: null, env: 'prod' }
      )
    })
  })

  it('calls PatchLabels when adding a label', async () => {
    mockPatchLabels.mockResolvedValue()
    render(<LabelEditor {...defaultProps} />)

    fireEvent.click(screen.getByText('+ Add label'))

    const keyInput = screen.getByPlaceholderText('key')
    const valueInput = screen.getByPlaceholderText('value')

    fireEvent.change(keyInput, { target: { value: 'tier' } })
    fireEvent.change(valueInput, { target: { value: 'frontend' } })
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => {
      expect(mockPatchLabels).toHaveBeenCalledWith(
        '', 'v1', 'pods', 'default', 'test-pod',
        { app: 'web', env: 'prod', tier: 'frontend' }
      )
    })
  })

  it('hides the add form when Cancel is clicked', () => {
    render(<LabelEditor {...defaultProps} />)
    fireEvent.click(screen.getByText('+ Add label'))
    expect(screen.getByPlaceholderText('key')).toBeDefined()

    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByPlaceholderText('key')).toBeNull()
  })

  it('has aria-labels on remove buttons', () => {
    render(<LabelEditor {...defaultProps} />)
    expect(screen.getByLabelText('Remove label app')).toBeDefined()
    expect(screen.getByLabelText('Remove label env')).toBeDefined()
  })
})
