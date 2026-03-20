import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BatchActionBar } from '@/components/table/BatchActionBar'

describe('BatchActionBar', () => {
  it('renders nothing when selectedCount is 0', () => {
    const { container } = render(
      <BatchActionBar selectedCount={0} actions={[]} onClear={() => {}} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows selected count', () => {
    render(
      <BatchActionBar
        selectedCount={5}
        actions={[]}
        onClear={() => {}}
      />
    )
    expect(screen.getByText('5')).toBeTruthy()
    expect(screen.getByText('selected')).toBeTruthy()
  })

  it('renders action buttons', () => {
    render(
      <BatchActionBar
        selectedCount={2}
        actions={[
          { label: 'Delete', onClick: () => {}, variant: 'danger' },
          { label: 'Restart', onClick: () => {} },
        ]}
        onClear={() => {}}
      />
    )
    expect(screen.getByText('Delete')).toBeTruthy()
    expect(screen.getByText('Restart')).toBeTruthy()
  })

  it('calls action onClick', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <BatchActionBar
        selectedCount={1}
        actions={[{ label: 'Delete', onClick }]}
        onClear={() => {}}
      />
    )
    await user.click(screen.getByText('Delete'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('calls onClear when close button clicked', async () => {
    const user = userEvent.setup()
    const onClear = vi.fn()
    const { container } = render(
      <BatchActionBar selectedCount={1} actions={[]} onClear={onClear} />
    )
    // The clear button is the last button
    const buttons = container.querySelectorAll('button')
    await user.click(buttons[buttons.length - 1])
    expect(onClear).toHaveBeenCalledOnce()
  })
})
