import { describe, it, expect, beforeEach } from 'vitest'
import { useUIStore } from '@/stores/uiStore'

const initialState = useUIStore.getState()

function resetStore() {
  useUIStore.setState(initialState, true)
}

describe('uiStore', () => {
  beforeEach(resetStore)

  it('has correct initial state', () => {
    const s = useUIStore.getState()
    expect(s.sidebarCollapsed).toBe(false)
    expect(s.sidebarWidth).toBe(220)
    expect(s.bottomTrayOpen).toBe(false)
    expect(s.bottomTrayHeight).toBe(250)
    expect(s.bottomTrayTab).toBe('logs')
    expect(s.theme).toBe('dark')
    expect(s.shortcutsEnabled).toBe(true)
  })

  it('toggleSidebar', () => {
    useUIStore.getState().toggleSidebar()
    expect(useUIStore.getState().sidebarCollapsed).toBe(true)

    useUIStore.getState().toggleSidebar()
    expect(useUIStore.getState().sidebarCollapsed).toBe(false)
  })

  it('setSidebarWidth with number', () => {
    useUIStore.getState().setSidebarWidth(300)
    expect(useUIStore.getState().sidebarWidth).toBe(300)
  })

  it('setSidebarWidth with function updater', () => {
    useUIStore.getState().setSidebarWidth((prev) => prev + 50)
    expect(useUIStore.getState().sidebarWidth).toBe(270)
  })

  it('toggleBottomTray', () => {
    useUIStore.getState().toggleBottomTray()
    expect(useUIStore.getState().bottomTrayOpen).toBe(true)

    useUIStore.getState().toggleBottomTray()
    expect(useUIStore.getState().bottomTrayOpen).toBe(false)
  })

  it('setBottomTrayTab also opens the tray', () => {
    expect(useUIStore.getState().bottomTrayOpen).toBe(false)
    useUIStore.getState().setBottomTrayTab('terminal')
    expect(useUIStore.getState().bottomTrayTab).toBe('terminal')
    expect(useUIStore.getState().bottomTrayOpen).toBe(true)
  })

  it('setTheme', () => {
    useUIStore.getState().setTheme('light')
    expect(useUIStore.getState().theme).toBe('light')
  })

  it('toggleTheme', () => {
    expect(useUIStore.getState().theme).toBe('dark')
    useUIStore.getState().toggleTheme()
    expect(useUIStore.getState().theme).toBe('light')
    useUIStore.getState().toggleTheme()
    expect(useUIStore.getState().theme).toBe('dark')
  })

  it('sections are open by default (collapsedSections is empty)', () => {
    const s = useUIStore.getState()
    expect(s.collapsedSections).toEqual({})
    expect(s.isSectionOpen('workloads')).toBe(true)
    expect(s.isSectionOpen('networking')).toBe(true)
  })

  it('toggleSection collapses an open section', () => {
    useUIStore.getState().toggleSection('workloads')
    expect(useUIStore.getState().collapsedSections).toEqual({ workloads: true })
    expect(useUIStore.getState().isSectionOpen('workloads')).toBe(false)
  })

  it('toggleSection twice reopens the section', () => {
    useUIStore.getState().toggleSection('workloads')
    expect(useUIStore.getState().isSectionOpen('workloads')).toBe(false)

    useUIStore.getState().toggleSection('workloads')
    expect(useUIStore.getState().collapsedSections).toEqual({})
    expect(useUIStore.getState().isSectionOpen('workloads')).toBe(true)
  })
})
