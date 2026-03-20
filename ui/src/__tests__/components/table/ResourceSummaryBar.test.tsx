import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ResourceSummaryBar } from '@/components/table/ResourceSummaryBar'

describe('ResourceSummaryBar', () => {
  it('renders title and total', () => {
    render(
      <ResourceSummaryBar title="Pods" total={82} items={[]} />
    )
    expect(screen.getByText('Pods')).toBeTruthy()
    expect(screen.getByText(/82 pods/i)).toBeTruthy()
  })

  it('shows namespace when provided', () => {
    render(
      <ResourceSummaryBar
        title="Pods"
        total={42}
        namespace="default"
        items={[]}
      />
    )
    expect(screen.getByText(/in namespace "default"/)).toBeTruthy()
  })

  it('renders summary items', () => {
    render(
      <ResourceSummaryBar
        title="Pods"
        total={82}
        items={[
          { label: 'Running', count: 78, status: 'running' },
          { label: 'Failed', count: 4, status: 'failed' },
        ]}
      />
    )
    expect(screen.getByText('78')).toBeTruthy()
    expect(screen.getByText('Running')).toBeTruthy()
    expect(screen.getByText('4')).toBeTruthy()
    expect(screen.getByText('Failed')).toBeTruthy()
  })
})
