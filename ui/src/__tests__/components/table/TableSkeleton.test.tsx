import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { TableSkeleton } from '@/components/table/TableSkeleton'

describe('TableSkeleton', () => {
  it('renders without crashing', () => {
    const { container } = render(<TableSkeleton />)
    expect(container.firstChild).toBeTruthy()
  })

  it('has animate-pulse class', () => {
    const { container } = render(<TableSkeleton />)
    expect(container.firstChild).toHaveClass('animate-pulse')
  })

  it('renders correct number of row skeletons', () => {
    const { container } = render(<TableSkeleton rows={5} columns={3} />)
    // Header + 5 rows = 6 direct div children
    const rowDivs = container.firstChild!.childNodes
    expect(rowDivs.length).toBe(6) // 1 header + 5 rows
  })
})
