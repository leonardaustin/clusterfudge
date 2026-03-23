import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchInput } from '@/components/table/SearchInput'

describe('SearchInput', () => {
  it('renders with placeholder', () => {
    render(<SearchInput value="" onChange={() => {}} />)
    expect(screen.getByPlaceholderText('Filter resources...')).toBeTruthy()
  })

  it('renders custom placeholder', () => {
    render(<SearchInput value="" onChange={() => {}} placeholder="Search pods..." />)
    expect(screen.getByPlaceholderText('Search pods...')).toBeTruthy()
  })

  it('calls onChange on input', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<SearchInput value="" onChange={onChange} />)
    await user.type(screen.getByPlaceholderText('Filter resources...'), 'nginx')
    expect(onChange).toHaveBeenCalled()
  })

  it('shows clear button when value is not empty', () => {
    const { container } = render(<SearchInput value="nginx" onChange={() => {}} />)
    const buttons = container.querySelectorAll('button')
    expect(buttons.length).toBe(1)
  })

  it('hides clear button when value is empty', () => {
    const { container } = render(<SearchInput value="" onChange={() => {}} />)
    const buttons = container.querySelectorAll('button')
    expect(buttons.length).toBe(0)
  })

  it('calls onChange with empty string on clear', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { container } = render(<SearchInput value="nginx" onChange={onChange} />)
    const clearBtn = container.querySelector('button')!
    await user.click(clearBtn)
    expect(onChange).toHaveBeenCalledWith('')
  })
})
