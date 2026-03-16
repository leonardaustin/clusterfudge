import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ShortcutHelpOverlay } from '@/components/shortcuts/ShortcutHelpOverlay'

describe('ShortcutHelpOverlay', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<ShortcutHelpOverlay open={false} onClose={vi.fn()} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders when open', () => {
    render(<ShortcutHelpOverlay open={true} onClose={vi.fn()} />)
    expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument()
    expect(screen.getByText('Navigation')).toBeInTheDocument()
    expect(screen.getByText('Interface')).toBeInTheDocument()
    expect(screen.getByText('Table Actions')).toBeInTheDocument()
  })

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn()
    render(<ShortcutHelpOverlay open={true} onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when ? is pressed', () => {
    const onClose = vi.fn()
    render(<ShortcutHelpOverlay open={true} onClose={onClose} />)
    fireEvent.keyDown(window, { key: '?' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when clicking backdrop', () => {
    const onClose = vi.fn()
    const { container } = render(<ShortcutHelpOverlay open={true} onClose={onClose} />)
    // Click the backdrop (outermost div)
    fireEvent.click(container.firstChild!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
