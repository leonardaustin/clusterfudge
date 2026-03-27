import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

vi.mock('@/wailsjs/go/handlers/TemplateHandler', () => ({
  ListTemplates: vi.fn().mockResolvedValue([]),
  RenderTemplate: vi.fn().mockResolvedValue({ yaml: '', resources: [], errors: [] }),
}))

vi.mock('@/stores/toastStore', () => ({
  useToastStore: Object.assign(vi.fn(() => ({ addToast: vi.fn() })), {
    getState: vi.fn(() => ({ addToast: vi.fn() })),
  }),
}))

import { ListTemplates } from '@/wailsjs/go/handlers/TemplateHandler'
import { Templates } from '@/pages/Templates'

const mockListTemplates = vi.mocked(ListTemplates)

beforeEach(() => {
  vi.clearAllMocks()
  mockListTemplates.mockResolvedValue([])
})

describe('Templates', () => {
  it('renders with title and template count', async () => {
    await act(async () => { render(<Templates />) })
    expect(screen.getByText('Templates')).toBeDefined()
    expect(screen.getByText('0 templates available')).toBeDefined()
  })

  it('shows "No templates available" when list is empty', async () => {
    await act(async () => { render(<Templates />) })
    expect(screen.getByText('No templates available')).toBeDefined()
  })

  it('displays templates when data is loaded', async () => {
    mockListTemplates.mockResolvedValue([
      { name: 'nginx-deployment', description: 'A basic nginx deployment', version: 1, variables: [], body: '', builtIn: false, createdAt: '2024-01-01' },
      { name: 'redis-statefulset', description: 'Redis with persistence', version: 1, variables: [{ name: 'replicas', type: 'number', required: true, description: 'Number of replicas', default: '3' }], body: '', builtIn: false, createdAt: '2024-01-01' },
    ])

    await act(async () => { render(<Templates />) })
    expect(screen.getByText('2 templates available')).toBeDefined()
    expect(screen.getByText('nginx-deployment')).toBeDefined()
    expect(screen.getByText('Redis with persistence')).toBeDefined()
  })
})
