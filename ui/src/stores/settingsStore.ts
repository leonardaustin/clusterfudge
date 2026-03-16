import { create } from 'zustand'
import { GetConfig, UpdateConfig, ResetConfig } from '@/wailsjs/go/handlers/ConfigHandler'

// Keys that can be updated via the settings UI.
// This prevents overwriting internal state (loaded) or store actions (load/update/reset).
type SettingsKey =
  | 'defaultNamespace' | 'startupBehavior' | 'autoCheckUpdates'
  | 'theme' | 'accentColor' | 'fontSize'
  | 'kubeconfigPaths' | 'autoReloadKubeconfig'
  | 'editorTabSize' | 'editorWordWrap' | 'editorMinimap' | 'editorFontSize'
  | 'terminalFontSize' | 'terminalCursorStyle' | 'terminalCursorBlink' | 'terminalShell' | 'terminalCopyOnSelect' | 'terminalTheme'
  | 'k8sRequestTimeoutSec' | 'k8sQps' | 'k8sBurst'
  | 'clusterFavorites'
  | 'aiClaudeCodeEnabled' | 'aiClaudeCodePath'
  | 'aiGeminiCliEnabled' | 'aiGeminiCliPath'
  | 'aiChatgptCodexEnabled' | 'aiChatgptCodexPath'
  | 'betaFeatures'

const SETTINGS_KEYS: ReadonlySet<string> = new Set<SettingsKey>([
  'defaultNamespace', 'startupBehavior', 'autoCheckUpdates',
  'theme', 'accentColor', 'fontSize',
  'kubeconfigPaths', 'autoReloadKubeconfig',
  'editorTabSize', 'editorWordWrap', 'editorMinimap', 'editorFontSize',
  'terminalFontSize', 'terminalCursorStyle', 'terminalCursorBlink', 'terminalShell', 'terminalCopyOnSelect', 'terminalTheme',
  'k8sRequestTimeoutSec', 'k8sQps', 'k8sBurst',
  'clusterFavorites',
  'aiClaudeCodeEnabled', 'aiClaudeCodePath',
  'aiGeminiCliEnabled', 'aiGeminiCliPath',
  'aiChatgptCodexEnabled', 'aiChatgptCodexPath',
  'betaFeatures',
])

interface SettingsState {
  loaded: boolean

  // General
  defaultNamespace: string
  startupBehavior: string
  autoCheckUpdates: boolean

  // Appearance
  theme: string
  accentColor: string
  fontSize: number

  // Kubeconfig
  kubeconfigPaths: string[]
  autoReloadKubeconfig: boolean

  // Editor
  editorTabSize: number
  editorWordWrap: boolean
  editorMinimap: boolean
  editorFontSize: number

  // Terminal
  terminalFontSize: number
  terminalCursorStyle: string
  terminalCursorBlink: boolean
  terminalShell: string
  terminalCopyOnSelect: boolean
  terminalTheme: string

  // K8s tuning
  k8sRequestTimeoutSec: number
  k8sQps: number
  k8sBurst: number

  // Cluster preferences
  clusterFavorites: string[]

  // AI Providers
  aiClaudeCodeEnabled: boolean
  aiClaudeCodePath: string
  aiGeminiCliEnabled: boolean
  aiGeminiCliPath: string
  aiChatgptCodexEnabled: boolean
  aiChatgptCodexPath: string

  // Beta
  betaFeatures: boolean

  // Actions
  load: () => Promise<void>
  update: <K extends SettingsKey>(key: K, value: SettingsState[K]) => void
  reset: () => Promise<void>
}

export type { SettingsKey }

// Map backend config to store state — shared between load() and reset().
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function configToState(cfg: Record<string, any>): Partial<SettingsState> {
  return {
    defaultNamespace: cfg.defaultNamespace,
    startupBehavior: cfg.startupBehavior,
    autoCheckUpdates: cfg.autoCheckUpdates,
    theme: cfg.theme,
    accentColor: cfg.accentColor,
    fontSize: cfg.fontSize,
    kubeconfigPaths: cfg.kubeconfigPaths?.length > 0 ? cfg.kubeconfigPaths : ['~/.kube/config'],
    autoReloadKubeconfig: cfg.autoReloadKubeconfig,
    editorTabSize: cfg.editorTabSize,
    editorWordWrap: cfg.editorWordWrap,
    editorMinimap: cfg.editorMinimap,
    editorFontSize: cfg.editorFontSize,
    terminalFontSize: cfg.terminalFontSize,
    terminalCursorStyle: cfg.terminalCursorStyle,
    terminalCursorBlink: cfg.terminalCursorBlink,
    terminalShell: cfg.terminalShell,
    terminalCopyOnSelect: cfg.terminalCopyOnSelect,
    terminalTheme: cfg.terminalTheme || 'dark',
    k8sRequestTimeoutSec: cfg.k8sRequestTimeoutSec ?? 15,
    k8sQps: cfg.k8sQps ?? 50,
    k8sBurst: cfg.k8sBurst ?? 100,
    clusterFavorites: cfg.clusterFavorites ?? [],
    aiClaudeCodeEnabled: cfg.aiClaudeCodeEnabled ?? false,
    aiClaudeCodePath: cfg.aiClaudeCodePath || '/usr/local/bin/claude',
    aiGeminiCliEnabled: cfg.aiGeminiCliEnabled ?? false,
    aiGeminiCliPath: cfg.aiGeminiCliPath || '/usr/local/bin/gemini',
    aiChatgptCodexEnabled: cfg.aiChatgptCodexEnabled ?? false,
    aiChatgptCodexPath: cfg.aiChatgptCodexPath || '/usr/local/bin/codex',
    betaFeatures: cfg.betaFeatures ?? false,
  }
}

export const useSettingsStore = create<SettingsState>()((set) => ({
  loaded: false,

  defaultNamespace: 'default',
  startupBehavior: 'welcome',
  autoCheckUpdates: true,
  theme: 'dark',
  accentColor: '#7C3AED',
  fontSize: 14,
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
  terminalTheme: 'dark',
  k8sRequestTimeoutSec: 15,
  k8sQps: 50,
  k8sBurst: 100,
  clusterFavorites: [],
  aiClaudeCodeEnabled: false,
  aiClaudeCodePath: '/usr/local/bin/claude',
  aiGeminiCliEnabled: false,
  aiGeminiCliPath: '/usr/local/bin/gemini',
  aiChatgptCodexEnabled: false,
  aiChatgptCodexPath: '/usr/local/bin/codex',
  betaFeatures: false,

  load: async () => {
    try {
      const cfg = await GetConfig()
      set({ loaded: true, ...configToState(cfg) })
    } catch (err) {
      console.warn('[SettingsStore] Failed to load config:', err)
      set({ loaded: true })
    }
  },

  update: (key, value) => {
    if (!SETTINGS_KEYS.has(key)) return
    set({ [key]: value } as Partial<SettingsState>)
    UpdateConfig({ [key]: value }).catch((err) =>
      console.warn('[SettingsStore] Failed to persist setting:', err)
    )
  },

  reset: async () => {
    try {
      await ResetConfig()
      const cfg = await GetConfig()
      set(configToState(cfg))
    } catch (err) {
      const { useToastStore } = await import('./toastStore')
      useToastStore.getState().addToast({ type: 'error', title: 'Failed to reset settings', description: err instanceof Error ? err.message : String(err) })
    }
  },
}))
