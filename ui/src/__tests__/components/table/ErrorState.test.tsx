import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ErrorState } from '@/components/table/ErrorState'

describe('ErrorState', () => {
  it('renders default title and message', () => {
    render(<ErrorState message="Connection refused" />)
    expect(screen.getByText('Failed to load resources')).toBeTruthy()
    expect(screen.getByText('Connection refused')).toBeTruthy()
  })

  it('renders custom title', () => {
    render(<ErrorState title="Network error" message="timeout" />)
    expect(screen.getByText('Network error')).toBeTruthy()
  })

  it('shows retry button when onRetry provided', () => {
    render(<ErrorState message="error" onRetry={() => {}} />)
    expect(screen.getByText('Retry')).toBeTruthy()
  })

  it('hides retry button when onRetry not provided', () => {
    render(<ErrorState message="error" />)
    expect(screen.queryByText('Retry')).toBeNull()
  })

  it('calls onRetry when retry button clicked', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    render(<ErrorState message="error" onRetry={onRetry} />)
    await user.click(screen.getByText('Retry'))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
