import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { ViewSkeleton } from '@/components/skeletons/ViewSkeleton'

describe('ViewSkeleton', () => {
  it('renders without crashing', () => {
    const { container } = render(<ViewSkeleton />)
    expect(container.firstChild).toBeTruthy()
  })

  it('has animate-pulse class', () => {
    const { container } = render(<ViewSkeleton />)
    expect(container.firstChild).toHaveClass('animate-pulse')
  })
})
