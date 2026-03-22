import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EmptyState } from '@/components/table/EmptyState'

describe('EmptyState', () => {
  it('renders default title', () => {
    render(<EmptyState />)
    expect(screen.getByText('No resources found')).toBeTruthy()
  })

  it('renders custom title', () => {
    render(<EmptyState title="No pods" />)
    expect(screen.getByText('No pods')).toBeTruthy()
  })

  it('renders message when provided', () => {
    render(<EmptyState message="Try changing filters" />)
    expect(screen.getByText('Try changing filters')).toBeTruthy()
  })

  it('renders action when provided', () => {
    render(<EmptyState action={<button>Create</button>} />)
    expect(screen.getByText('Create')).toBeTruthy()
  })
})
