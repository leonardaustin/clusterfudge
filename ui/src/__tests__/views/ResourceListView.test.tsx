import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ResourceListView } from '@/views/ResourceListView'

// Mock virtualizer
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 36,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, i) => ({
        index: i,
        start: i * 36,
        size: 36,
        key: i,
      })),
    scrollToIndex: vi.fn(),
  }),
}))

const testData = [
  { name: 'pod-alpha', namespace: 'default', status: 'Running', ready: '1/1', restarts: 0, node: 'node-1', ip: '10.0.0.1', age: '3d' },
  { name: 'pod-beta', namespace: 'default', status: 'Pending', ready: '0/1', restarts: 0, node: 'node-2', ip: '10.0.0.2', age: '1h' },
]

function renderWithRouter(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('ResourceListView', () => {
  it('renders header with resource name', () => {
    renderWithRouter(
      <ResourceListView resourceType="pods" data={testData} />
    )
    expect(screen.getByText('Pods')).toBeTruthy()
  })

  it('shows resource count', () => {
    renderWithRouter(
      <ResourceListView resourceType="pods" data={testData} />
    )
    expect(screen.getByText(/2 pods/)).toBeTruthy()
  })

  it('renders search input', () => {
    renderWithRouter(
      <ResourceListView resourceType="pods" data={testData} />
    )
    expect(screen.getByPlaceholderText('Filter resources...')).toBeTruthy()
  })

  it('shows error state for unknown resource type', () => {
    renderWithRouter(
      <ResourceListView resourceType="unknownresource" data={[]} />
    )
    expect(screen.getByText('Unknown resource type')).toBeTruthy()
  })

  it('shows error state when error prop is set', () => {
    renderWithRouter(
      <ResourceListView
        resourceType="pods"
        data={[]}
        error="Connection refused"
      />
    )
    expect(screen.getByText('Connection refused')).toBeTruthy()
  })

  it('renders table rows', () => {
    renderWithRouter(
      <ResourceListView resourceType="pods" data={testData} />
    )
    expect(screen.getByText('pod-alpha')).toBeTruthy()
    expect(screen.getByText('pod-beta')).toBeTruthy()
  })
})
