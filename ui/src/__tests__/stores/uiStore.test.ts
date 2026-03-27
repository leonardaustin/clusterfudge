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

  it('toggleTheme cycles through all themes', () => {
    expect(useUIStore.getState().theme).toBe('dark')
    useUIStore.getState().toggleTheme()
    expect(useUIStore.getState().theme).toBe('light')
    useUIStore.getState().toggleTheme()
    expect(useUIStore.getState().theme).toBe('monokai')
    useUIStore.getState().toggleTheme()
    expect(useUIStore.getState().theme).toBe('solarized')
    useUIStore.getState().toggleTheme()
    expect(useUIStore.getState().theme).toBe('system')
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

  // ── AI session tests ──

  it('has empty aiSessions and null activeAISessionId initially', () => {
    const s = useUIStore.getState()
    expect(s.aiSessions).toEqual([])
    expect(s.activeAISessionId).toBeNull()
  })

  it('addAISession creates a session, sets it active, and opens tray to ai tab', () => {
    const id = useUIStore.getState().addAISession('default', 'nginx-pod', 'claude', 'Claude Code')
    const s = useUIStore.getState()
    expect(id).toMatch(/^ai-/)
    expect(s.aiSessions).toHaveLength(1)
    expect(s.aiSessions[0]).toEqual({ id, namespace: 'default', name: 'nginx-pod', providerID: 'claude', providerName: 'Claude Code' })
    expect(s.activeAISessionId).toBe(id)
    expect(s.bottomTrayOpen).toBe(true)
    expect(s.bottomTrayTab).toBe('ai')
  })

  it('addAISession can add multiple sessions', () => {
    const id1 = useUIStore.getState().addAISession('default', 'pod-a', 'claude', 'Claude Code')
    const id2 = useUIStore.getState().addAISession('kube-system', 'pod-b', 'gemini', 'Gemini CLI')
    const s = useUIStore.getState()
    expect(s.aiSessions).toHaveLength(2)
    expect(s.activeAISessionId).toBe(id2)
    expect(s.aiSessions[0].id).toBe(id1)
    expect(s.aiSessions[1].id).toBe(id2)
  })

  it('removeAISession removes a session and selects next active', () => {
    const id1 = useUIStore.getState().addAISession('default', 'pod-a', 'claude', 'Claude Code')
    const id2 = useUIStore.getState().addAISession('default', 'pod-b', 'claude', 'Claude Code')

    useUIStore.getState().removeAISession(id2)
    const s = useUIStore.getState()
    expect(s.aiSessions).toHaveLength(1)
    expect(s.aiSessions[0].id).toBe(id1)
    expect(s.activeAISessionId).toBe(id1)
  })

  it('removeAISession sets null when last session removed', () => {
    const id = useUIStore.getState().addAISession('default', 'pod-a', 'claude', 'Claude Code')
    useUIStore.getState().removeAISession(id)
    const s = useUIStore.getState()
    expect(s.aiSessions).toHaveLength(0)
    expect(s.activeAISessionId).toBeNull()
  })

  it('setActiveAISession switches active session', () => {
    const id1 = useUIStore.getState().addAISession('default', 'pod-a', 'claude', 'Claude Code')
    useUIStore.getState().addAISession('default', 'pod-b', 'gemini', 'Gemini CLI')
    useUIStore.getState().setActiveAISession(id1)
    expect(useUIStore.getState().activeAISessionId).toBe(id1)
  })

  it('setAITarget creates a new session', () => {
    useUIStore.getState().setAITarget({ namespace: 'prod', name: 'web-pod', providerID: 'claude', providerName: 'Claude Code' })
    const s = useUIStore.getState()
    expect(s.aiSessions).toHaveLength(1)
    expect(s.aiSessions[0].namespace).toBe('prod')
    expect(s.aiSessions[0].name).toBe('web-pod')
    expect(s.aiSessions[0].providerID).toBe('claude')
    expect(s.aiSessions[0].providerName).toBe('Claude Code')
    expect(s.activeAISessionId).toBe(s.aiSessions[0].id)
  })

  it('setAITarget with null does nothing', () => {
    useUIStore.getState().addAISession('default', 'pod-a', 'claude', 'Claude Code')
    useUIStore.getState().setAITarget(null)
    expect(useUIStore.getState().aiSessions).toHaveLength(1)
  })
})
