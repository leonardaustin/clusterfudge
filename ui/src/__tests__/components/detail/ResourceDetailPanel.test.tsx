import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ResourceDetailPanel } from '@/components/detail/ResourceDetailPanel'

const mockResource = {
  name: 'nginx-abc12',
  namespace: 'default',
  status: 'Running',
  ready: '2/2',
  restarts: 0,
  node: 'node-1',
  ip: '10.244.0.15',
  age: '3d',
}

describe('ResourceDetailPanel', () => {
  it('renders resource name', () => {
    render(
      <ResourceDetailPanel
        resource={mockResource}
        resourceType="pods"
        onClose={() => {}}
      />
    )
    expect(screen.getAllByText('nginx-abc12').length).toBeGreaterThan(0)
  })

  it('renders resource type and namespace', () => {
    render(
      <ResourceDetailPanel
        resource={mockResource}
        resourceType="pods"
        onClose={() => {}}
      />
    )
    expect(screen.getByText('pods in "default"')).toBeTruthy()
  })

  it('renders tabs', () => {
    render(
      <ResourceDetailPanel
        resource={mockResource}
        resourceType="pods"
        onClose={() => {}}
      />
    )
    expect(screen.getByText('Overview')).toBeTruthy()
    expect(screen.getByText('Events')).toBeTruthy()
    expect(screen.getByText('YAML')).toBeTruthy()
  })

  it('calls onClose when X button clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { container } = render(
      <ResourceDetailPanel
        resource={mockResource}
        resourceType="pods"
        onClose={onClose}
      />
    )
    // Click the X button in the header
    const closeBtn = container.querySelector('[data-testid="detail-panel"] button')!
    await user.click(closeBtn)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('shows YAML tab content when clicked', async () => {
    const user = userEvent.setup()
    render(
      <ResourceDetailPanel
        resource={mockResource}
        resourceType="pods"
        onClose={() => {}}
      />
    )
    await user.click(screen.getByText('YAML'))
    expect(screen.getByText(/"nginx-abc12"/)).toBeTruthy()
  })
})
