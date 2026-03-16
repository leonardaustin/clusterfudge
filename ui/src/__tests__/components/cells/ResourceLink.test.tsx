import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ResourceLink } from '@/components/cells/ResourceLink'

describe('ResourceLink', () => {
  it('renders the resource name', () => {
    render(<ResourceLink name="nginx-abc12" kind="Pod" />)
    expect(screen.getByText('nginx-abc12')).toBeTruthy()
  })

  it('calls onClick when clicked', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<ResourceLink name="nginx" kind="Pod" onClick={onClick} />)
    await user.click(screen.getByText('nginx'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('sets title with kind and name', () => {
    render(<ResourceLink name="nginx" kind="Pod" />)
    expect(screen.getByText('nginx').getAttribute('title')).toBe('Pod/nginx')
  })

  it('includes namespace in title when provided', () => {
    render(<ResourceLink name="nginx" kind="Pod" namespace="default" />)
    expect(screen.getByText('nginx').getAttribute('title')).toBe(
      'Pod/default/nginx'
    )
  })

  it('stops event propagation on click', async () => {
    const user = userEvent.setup()
    const parentClick = vi.fn()
    const onClick = vi.fn()

    render(
      <div onClick={parentClick}>
        <ResourceLink name="nginx" kind="Pod" onClick={onClick} />
      </div>
    )

    await user.click(screen.getByText('nginx'))
    expect(onClick).toHaveBeenCalledOnce()
    expect(parentClick).not.toHaveBeenCalled()
  })
})
