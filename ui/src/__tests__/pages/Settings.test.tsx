import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Settings } from '@/pages/Settings'

vi.mock('@/wailsjs/go/main/App', () => ({
  GetVersion: vi.fn().mockResolvedValue('v1.2.3'),
}))

vi.mock('@/wailsjs/go/handlers/ConfigHandler', () => ({
  GetConfig: vi.fn().mockResolvedValue({
    defaultNamespace: 'default',
    startupBehavior: 'welcome',
    autoCheckUpdates: true,
    theme: 'dark',
    accentColor: '#7C3AED',
    fontSize: 13,
    kubeconfigPaths: ['~/.kube/config'],
    autoReloadKubeconfig: true,
    editorTabSize: 2,
    editorWordWrap: false,
    editorMinimap: true,
    editorFontSize: 13,
    terminalFontSize: 13,
    terminalCursorStyle: 'block',
    terminalCursorBlink: true,
    terminalShell: '',
    terminalCopyOnSelect: true,
  }),
  UpdateConfig: vi.fn().mockResolvedValue(undefined),
  ResetConfig: vi.fn().mockResolvedValue(undefined),
  ExportConfig: vi.fn().mockResolvedValue('{}'),
  ImportConfig: vi.fn().mockResolvedValue(undefined),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Settings', () => {
  it('renders settings page with header', async () => {
    await act(async () => { render(<Settings />) })
    expect(screen.getByText('Settings')).toBeDefined()
    expect(screen.getByText('Application preferences')).toBeDefined()
  })

  it('renders all navigation items', async () => {
    let container!: HTMLElement;
    await act(async () => {
      container = render(<Settings />).container
    })
    const navItems = container.querySelectorAll('.settings-nav-item')
    const labels = Array.from(navItems).map((el) => el.textContent)
    expect(labels).toEqual(['General', 'Appearance', 'Kubeconfig', 'AI', 'Editor', 'Terminal', 'Shortcuts', 'Advanced', 'About', 'Clusters', 'Setup Guides', 'Troubleshooting'])
  })

  it('shows General section by default', async () => {
    await act(async () => { render(<Settings />) })
    expect(screen.getByText('Default namespace')).toBeDefined()
    expect(screen.getByText('Startup behavior')).toBeDefined()
    expect(screen.getByText('Check for updates automatically')).toBeDefined()
  })

  it('switches sections when nav items are clicked', async () => {
    await act(async () => { render(<Settings />) })
    const user = userEvent.setup()

    await user.click(screen.getByText('Appearance'))
    expect(screen.getByText('Accent color')).toBeDefined()

    await user.click(screen.getByText('Editor'))
    expect(screen.getByText('Tab size')).toBeDefined()
    expect(screen.getByText('Word wrap')).toBeDefined()

    await user.click(screen.getByText('Terminal'))
    expect(screen.getByText('Cursor style')).toBeDefined()

    await user.click(screen.getByText('Shortcuts'))
    expect(screen.getByText('Command Palette')).toBeDefined()

    await user.click(screen.getByText('About'))
    expect(screen.getByText('Clusterfudge')).toBeDefined()
    expect(screen.getByText('v1.2.3')).toBeDefined()
  })

  it('renders toggle switches with correct aria roles', async () => {
    await act(async () => { render(<Settings />) })
    const toggles = screen.getAllByRole('switch')
    expect(toggles.length).toBeGreaterThan(0)
  })

  it('renders Advanced section with action buttons', async () => {
    await act(async () => { render(<Settings />) })
    const user = userEvent.setup()

    await user.click(screen.getByText('Advanced'))
    expect(screen.getByText('Export settings')).toBeDefined()
    expect(screen.getByText('Import settings')).toBeDefined()
    expect(screen.getByText('Reset all settings')).toBeDefined()
  })
})
