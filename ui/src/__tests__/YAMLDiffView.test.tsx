import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { YAMLDiffView } from '../components/editor/YAMLDiffView'

// Mock @monaco-editor/react DiffEditor
vi.mock('@monaco-editor/react', () => ({
  default: ({ value }: { value: string }) => (
    <div data-testid="monaco-editor" data-value={value}>
      {value}
    </div>
  ),
  DiffEditor: ({
    original,
    modified,
  }: {
    original: string
    modified: string
  }) => (
    <div data-testid="monaco-diff-editor" data-original={original} data-modified={modified}>
      <div data-testid="diff-original">{original}</div>
      <div data-testid="diff-modified">{modified}</div>
    </div>
  ),
}))

describe('YAMLDiffView', () => {
  const originalYAML = 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: test'
  const modifiedYAML = 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: test\n  labels:\n    app: test'

  it('renders the diff editor with original and modified values', () => {
    render(
      <YAMLDiffView
        original={originalYAML}
        modified={modifiedYAML}
        onClose={vi.fn()}
      />
    )
    const diffEditor = screen.getByTestId('monaco-diff-editor')
    expect(diffEditor).toBeInTheDocument()
    expect(diffEditor).toHaveAttribute('data-original', originalYAML)
    expect(diffEditor).toHaveAttribute('data-modified', modifiedYAML)
  })

  it('shows diff preview label', () => {
    render(
      <YAMLDiffView
        original={originalYAML}
        modified={modifiedYAML}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('Diff Preview (dry-run)')).toBeInTheDocument()
  })

  it('shows live vs pending labels', () => {
    render(
      <YAMLDiffView
        original={originalYAML}
        modified={modifiedYAML}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('Live (left) vs Pending (right)')).toBeInTheDocument()
  })

  it('renders close button', () => {
    render(
      <YAMLDiffView
        original={originalYAML}
        modified={modifiedYAML}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('Close Diff')).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <YAMLDiffView
        original={originalYAML}
        modified={modifiedYAML}
        onClose={onClose}
      />
    )
    await user.click(screen.getByText('Close Diff'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('displays both original and modified content', () => {
    render(
      <YAMLDiffView
        original={originalYAML}
        modified={modifiedYAML}
        onClose={vi.fn()}
      />
    )
    // Content is set via data attributes on the parent element
    const diffEditor = screen.getByTestId('monaco-diff-editor')
    expect(diffEditor.getAttribute('data-original')).toBe(originalYAML)
    expect(diffEditor.getAttribute('data-modified')).toBe(modifiedYAML)
  })
})
