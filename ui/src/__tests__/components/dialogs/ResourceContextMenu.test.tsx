import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ResourceContextMenu } from '../../../components/dialogs/ResourceContextMenu'

// Radix context menu requires pointer events and is hard to test in jsdom.
// We test that the component renders its trigger content and mounts without error.
// Integration tests with actual right-click interaction would need a real browser.

const defaultActions = {
  onViewDetails: vi.fn(),
  onViewLogs: vi.fn(),
  onExecShell: vi.fn(),
  onEditYAML: vi.fn(),
  onScale: vi.fn(),
  onRestart: vi.fn(),
  onDelete: vi.fn(),
  onCordon: vi.fn(),
  onUncordon: vi.fn(),
  onDrain: vi.fn(),
  onPortForward: vi.fn(),
}

describe('ResourceContextMenu', () => {
  it('renders the trigger children', () => {
    render(
      <ResourceContextMenu kind="Pod" name="nginx-abc" actions={defaultActions}>
        <div data-testid="trigger">Pod Row</div>
      </ResourceContextMenu>
    )
    expect(screen.getByTestId('trigger')).toBeInTheDocument()
    expect(screen.getByText('Pod Row')).toBeInTheDocument()
  })

  it('renders without crashing for Deployment kind', () => {
    const { container } = render(
      <ResourceContextMenu kind="Deployment" name="api" actions={defaultActions}>
        <div>Deployment Row</div>
      </ResourceContextMenu>
    )
    expect(container).toBeDefined()
  })

  it('renders without crashing for Node kind', () => {
    const { container } = render(
      <ResourceContextMenu kind="Node" name="worker-01" isCordoned actions={defaultActions}>
        <div>Node Row</div>
      </ResourceContextMenu>
    )
    expect(container).toBeDefined()
  })

  it('renders without crashing for generic resource kind', () => {
    const { container } = render(
      <ResourceContextMenu kind="ConfigMap" name="config" actions={defaultActions}>
        <div>ConfigMap Row</div>
      </ResourceContextMenu>
    )
    expect(container).toBeDefined()
  })
})
