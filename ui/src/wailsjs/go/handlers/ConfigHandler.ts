import { wailsCall } from '../../call'

const H = 'ConfigHandler'

export interface WindowState {
  x: number
  y: number
  width: number
  height: number
  maximized: boolean
  sidebarWidth: number
  bottomTrayHeight: number
  bottomTrayVisible: boolean
  activeRoute: string
}

export interface AppConfig {
  defaultNamespace: string
  startupBehavior: string
  autoCheckUpdates: boolean
  theme: string
  accentColor: string
  fontSize: number
  kubeconfigPaths: string[]
  autoReloadKubeconfig: boolean
  editorTabSize: number
  editorWordWrap: boolean
  editorMinimap: boolean
  editorFontSize: number
  terminalFontSize: number
  terminalCursorStyle: string
  terminalCursorBlink: boolean
  terminalShell: string
  terminalCopyOnSelect: boolean
  terminalTheme: string
  k8sRequestTimeoutSec: number
  k8sQps: number
  k8sBurst: number
  cacheTtlSeconds: number
  maxLogLines: number
  maxConcurrentWatches: number
  debugMode: boolean
  keyBindings: Record<string, string>
  windowState: WindowState
  clusterColors: Record<string, string>
  clusterFavorites: string[]
  aiClaudeCodeEnabled: boolean
  aiClaudeCodePath: string
  aiGeminiCliEnabled: boolean
  aiGeminiCliPath: string
  aiChatgptCodexEnabled: boolean
  aiChatgptCodexPath: string
  betaFeatures: boolean
  skipUpdateVersion: string
}

export function GetConfig(): Promise<AppConfig> {
  return wailsCall(H, 'GetConfig')
}

export function UpdateConfig(partial: Record<string, unknown>): Promise<void> {
  return wailsCall(H, 'UpdateConfig', partial)
}

export function ResetConfig(): Promise<void> {
  return wailsCall(H, 'ResetConfig')
}

export function ExportConfig(): Promise<string> {
  return wailsCall(H, 'ExportConfig')
}

export function ImportConfig(jsonStr: string): Promise<void> {
  return wailsCall(H, 'ImportConfig', jsonStr)
}

export function ValidateFilePath(path: string): Promise<string> {
  return wailsCall(H, 'ValidateFilePath', path)
}

export function GetConfigPath(): Promise<string> {
  return wailsCall(H, 'GetConfigPath')
}

export function SaveToFile(path: string): Promise<void> {
  return wailsCall(H, 'SaveToFile', path)
}

export function LoadFromFile(path: string): Promise<void> {
  return wailsCall(H, 'LoadFromFile', path)
}
