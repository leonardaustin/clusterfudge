import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Mock all the dependencies needed by AppShell
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    Outlet: () => <div data-testid="outlet">outlet</div>,
  }
})

vi.mock('@/components/sidebar/Sidebar', () => ({
  Sidebar: () => <div data-testid="sidebar">sidebar</div>,
}))

vi.mock('@/components/topbar/TitleBar', () => ({
  TitleBar: () => <div data-testid="title-bar">title</div>,
}))

vi.mock('@/components/topbar/Topbar', () => ({
  Topbar: () => <div data-testid="topbar">topbar</div>,
}))

vi.mock('@/components/bottom-tray/BottomTray', () => ({
  BottomTray: () => <div data-testid="bottom-tray">bottom-tray</div>,
}))

vi.mock('@/components/bottom-tray/StatusBar', () => ({
  StatusBar: () => <div data-testid="status-bar">status</div>,
}))

vi.mock('@/components/banners/ConnectionBanners', () => ({
  ConnectionBanners: () => null,
}))

vi.mock('@/components/command-palette/CommandPalette', () => ({
  CommandPalette: () => null,
}))

vi.mock('@/components/shortcuts/AppShellShortcuts', () => ({
  AppShellShortcuts: () => null,
}))

vi.mock('@/components/notifications/ToastContainer', () => ({
  ToastContainer: () => <div data-testid="toast-container">toasts</div>,
}))

vi.mock('@/components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/hooks/useClusterHealth', () => ({
  useClusterHealth: vi.fn(),
}))

vi.mock('@/hooks/useLayoutPersist', () => ({
  useLayoutPersist: vi.fn(),
}))

import { AppShell } from '@/layouts/AppShell'

describe('Accessibility: Skip-to-main link', () => {
  it('renders a skip-to-main-content link as the first focusable element', () => {
    render(<MemoryRouter><AppShell /></MemoryRouter>)
    const skipLink = screen.getByText('Skip to main content')
    expect(skipLink).toBeDefined()
    expect(skipLink.getAttribute('href')).toBe('#main-content')
  })

  it('has the main content area with id="main-content"', () => {
    const { container } = render(<MemoryRouter><AppShell /></MemoryRouter>)
    const main = container.querySelector('#main-content')
    expect(main).toBeDefined()
    expect(main?.tagName.toLowerCase()).toBe('main')
  })
})
