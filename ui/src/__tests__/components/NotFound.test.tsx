import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { NotFound } from '@/views/NotFound'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

describe('NotFound', () => {
  it('renders page not found text', () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>
    )
    expect(screen.getByText('Page Not Found')).toBeInTheDocument()
  })

  it('has a back to overview button', () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>
    )
    expect(screen.getByText('Back to Overview')).toBeInTheDocument()
  })

  it('navigates to /overview on button click', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>
    )
    await user.click(screen.getByText('Back to Overview'))
    expect(mockNavigate).toHaveBeenCalledWith('/overview')
  })
})
