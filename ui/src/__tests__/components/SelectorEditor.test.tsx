import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/wailsjs/go/handlers/ResourceHandler', () => ({
  PatchServiceSelector: vi.fn().mockResolvedValue(undefined),
}))

const mockAddToast = vi.fn()
vi.mock('@/stores/toastStore', () => ({
  useToastStore: Object.assign(vi.fn((selector: (s: { addToast: typeof mockAddToast }) => typeof mockAddToast) => selector({ addToast: mockAddToast })), {
    getState: vi.fn(() => ({ addToast: mockAddToast })),
  }),
}))

import { SelectorEditor } from '@/components/shared/SelectorEditor'
import { PatchServiceSelector } from '@/wailsjs/go/handlers/ResourceHandler'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SelectorEditor', () => {
  const defaultProps = {
    namespace: 'default',
    name: 'my-service',
    selectors: [
      { key: 'app', value: 'web' },
      { key: 'env', value: 'prod' },
    ],
  }

  it('renders existing selectors as chips', () => {
    render(<SelectorEditor {...defaultProps} />)
    expect(screen.getByText('app=web')).toBeDefined()
    expect(screen.getByText('env=prod')).toBeDefined()
  })

  it('shows "Selector" group title', () => {
    render(<SelectorEditor {...defaultProps} />)
    expect(screen.getByText('Selector')).toBeDefined()
  })

  it('shows add selector button', () => {
    render(<SelectorEditor {...defaultProps} />)
    expect(screen.getByText('+ Add selector')).toBeDefined()
  })

  it('shows add form when clicking add button', () => {
    render(<SelectorEditor {...defaultProps} />)
    fireEvent.click(screen.getByText('+ Add selector'))
    expect(screen.getByLabelText('Selector key')).toBeDefined()
    expect(screen.getByLabelText('Selector value')).toBeDefined()
    expect(screen.getByText('Save')).toBeDefined()
    expect(screen.getByText('Cancel')).toBeDefined()
  })

  it('removes selector when clicking x', async () => {
    render(<SelectorEditor {...defaultProps} />)
    const removeBtn = screen.getByLabelText('Remove selector app')
    fireEvent.click(removeBtn)
    await waitFor(() => {
      expect(PatchServiceSelector).toHaveBeenCalledWith('default', 'my-service', {
        app: null,
        env: 'prod',
      })
    })
  })

  it('adds a new selector', async () => {
    render(<SelectorEditor {...defaultProps} />)
    fireEvent.click(screen.getByText('+ Add selector'))
    const keyInput = screen.getByLabelText('Selector key')
    const valueInput = screen.getByLabelText('Selector value')
    fireEvent.change(keyInput, { target: { value: 'tier' } })
    fireEvent.change(valueInput, { target: { value: 'frontend' } })
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => {
      expect(PatchServiceSelector).toHaveBeenCalledWith('default', 'my-service', {
        app: 'web',
        env: 'prod',
        tier: 'frontend',
      })
    })
  })

  it('cancels adding when clicking Cancel', () => {
    render(<SelectorEditor {...defaultProps} />)
    fireEvent.click(screen.getByText('+ Add selector'))
    expect(screen.getByLabelText('Selector key')).toBeDefined()
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByLabelText('Selector key')).toBeNull()
  })
})
