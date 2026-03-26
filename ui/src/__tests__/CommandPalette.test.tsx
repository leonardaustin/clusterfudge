import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CommandPalette } from '../components/command-palette/CommandPalette'

// Polyfill ResizeObserver for cmdk
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

// Mock the hooks
vi.mock('../hooks/useCommandPalette', () => ({
  useCommandPalette: vi.fn(() => ({
    isOpen: true,
    closePalette: vi.fn(),
    openPalette: vi.fn(),
    togglePalette: vi.fn(),
  })),
}))

vi.mock('../hooks/useDebounce', () => ({
  useDebounce: (val: string) => val,
}))

vi.mock('../stores/clusterStore', () => ({
  useClusterStore: vi.fn(() => ({
    clusters: [],
    namespaces: [],
    connectCluster: vi.fn(),
    setNamespace: vi.fn(),
  })),
}))

vi.mock('../stores/uiStore', () => ({
  useUIStore: vi.fn(() => ({
    toggleSidebar: vi.fn(),
    toggleBottomTray: vi.fn(),
    setTheme: vi.fn(),
    theme: 'dark',
    setBottomTrayTab: vi.fn(),
  })),
}))

vi.mock('../stores/selectionStore', () => ({
  useSelectionStore: vi.fn(() => ({
    selectedResource: {
      kind: 'Deployment',
      name: 'nginx',
      namespace: 'default',
      path: '/workloads/deployments/default/nginx',
    },
  })),
}))

vi.mock('../stores/favoritesStore', () => ({
  useFavoritesStore: vi.fn(() => ({
    recentItems: [],
    addRecentItem: vi.fn(),
  })),
}))

describe('CommandPalette', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders when open', () => {
    render(
      <MemoryRouter>
        <CommandPalette />
      </MemoryRouter>
    )

    expect(screen.getByPlaceholderText(/Type a command/)).toBeInTheDocument()
  })

  it('shows context actions for selected deployment', () => {
    render(
      <MemoryRouter>
        <CommandPalette />
      </MemoryRouter>
    )

    // Should show deployment-specific actions
    expect(screen.getByText('Scale: nginx')).toBeInTheDocument()
    expect(screen.getByText('Restart: nginx')).toBeInTheDocument()
  })

  it('shows common actions for selected resource', () => {
    render(
      <MemoryRouter>
        <CommandPalette />
      </MemoryRouter>
    )

    expect(screen.getByText('View Logs: nginx')).toBeInTheDocument()
    expect(screen.getByText('Exec Shell: nginx')).toBeInTheDocument()
    expect(screen.getByText('Edit YAML: nginx')).toBeInTheDocument()
    expect(screen.getByText('Delete: nginx')).toBeInTheDocument()
  })

  it('shows keyboard shortcuts', () => {
    render(
      <MemoryRouter>
        <CommandPalette />
      </MemoryRouter>
    )

    // Navigation shortcuts
    expect(screen.getByText('ESC')).toBeInTheDocument()
  })

  it('shows navigation commands', () => {
    render(
      <MemoryRouter>
        <CommandPalette />
      </MemoryRouter>
    )

    expect(screen.getByText('Go to Overview')).toBeInTheDocument()
    expect(screen.getByText('Go to Pods')).toBeInTheDocument()
    expect(screen.getByText('Go to Helm Releases')).toBeInTheDocument()
  })
})
