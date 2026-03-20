import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { YAMLEditor } from '../components/editor/YAMLEditor'

// Mock @monaco-editor/react since it requires browser APIs
vi.mock('@monaco-editor/react', () => ({
  default: ({
    value,
    options,
  }: {
    value: string
    options?: { readOnly?: boolean }
  }) => (
    <div data-testid="monaco-editor" data-value={value} data-readonly={options?.readOnly}>
      {value}
    </div>
  ),
}))

describe('YAMLEditor', () => {
  it('renders the editor with the given value', () => {
    render(<YAMLEditor value="apiVersion: v1" />)
    const editor = screen.getByTestId('monaco-editor')
    expect(editor).toBeInTheDocument()
    expect(editor).toHaveAttribute('data-value', 'apiVersion: v1')
  })

  it('shows toolbar in editable mode', () => {
    render(<YAMLEditor value="key: val" onApply={vi.fn()} />)
    expect(screen.getByText('Revert')).toBeInTheDocument()
    expect(screen.getByText('Apply')).toBeInTheDocument()
  })

  it('hides toolbar in readOnly mode', () => {
    render(<YAMLEditor value="key: val" readOnly />)
    expect(screen.queryByText('Revert')).not.toBeInTheDocument()
    expect(screen.queryByText('Apply')).not.toBeInTheDocument()
  })

  it('passes readOnly to the editor', () => {
    render(<YAMLEditor value="data: test" readOnly />)
    const editor = screen.getByTestId('monaco-editor')
    expect(editor).toHaveAttribute('data-readonly', 'true')
  })

  it('shows Preview button when onPreview is provided', () => {
    render(<YAMLEditor value="key: val" onApply={vi.fn()} onPreview={vi.fn()} />)
    expect(screen.getByText('Preview')).toBeInTheDocument()
  })

  it('does not show Preview button when onPreview is not provided', () => {
    render(<YAMLEditor value="key: val" onApply={vi.fn()} />)
    expect(screen.queryByText('Preview')).not.toBeInTheDocument()
  })

  it('does not show Preview button in readOnly mode', () => {
    render(<YAMLEditor value="key: val" readOnly onPreview={vi.fn()} />)
    expect(screen.queryByText('Preview')).not.toBeInTheDocument()
  })

  it('shows multi-doc tabs when document has --- separators', () => {
    const multiDoc = 'kind: Deployment\nmetadata:\n  name: web\n---\nkind: Service\nmetadata:\n  name: web-svc'
    render(<YAMLEditor value={multiDoc} />)
    const tabs = screen.getByTestId('multi-doc-tabs')
    expect(tabs).toBeInTheDocument()
    expect(screen.getByTestId('doc-tab-0')).toBeInTheDocument()
    expect(screen.getByTestId('doc-tab-1')).toBeInTheDocument()
  })

  it('shows kind and name in doc tab labels', () => {
    const multiDoc = 'kind: Deployment\nmetadata:\n  name: web\n---\nkind: Service\nmetadata:\n  name: web-svc'
    render(<YAMLEditor value={multiDoc} />)
    expect(screen.getByTestId('doc-tab-0').textContent).toContain('Deployment')
    expect(screen.getByTestId('doc-tab-0').textContent).toContain('web')
    expect(screen.getByTestId('doc-tab-1').textContent).toContain('Service')
    expect(screen.getByTestId('doc-tab-1').textContent).toContain('web-svc')
  })

  it('does not show multi-doc tabs for single document', () => {
    render(<YAMLEditor value="apiVersion: v1\nkind: Pod" />)
    expect(screen.queryByTestId('multi-doc-tabs')).not.toBeInTheDocument()
  })
})
