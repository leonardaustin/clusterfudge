import { wailsCall } from '../../call'

const H = 'AIHandler'

export interface AIProviderInfo {
  id: string
  name: string
}

export function StartAISession(namespace: string, name: string, providerID: string): Promise<string> {
  return wailsCall(H, 'StartAISession', namespace, name, providerID)
}

export function GetAIProviderName(): Promise<string> {
  return wailsCall(H, 'GetAIProviderName')
}

export function GetEnabledAIProviders(): Promise<AIProviderInfo[]> {
  return wailsCall(H, 'GetEnabledAIProviders')
}

export function WriteAISession(sessionID: string, data: string): Promise<void> {
  return wailsCall(H, 'WriteAISession', sessionID, data)
}

export function ResizeAISession(sessionID: string, rows: number, cols: number): Promise<void> {
  return wailsCall(H, 'ResizeAISession', sessionID, rows, cols)
}

export function CloseAISession(sessionID: string): Promise<void> {
  return wailsCall(H, 'CloseAISession', sessionID)
}

export function ValidateAIPath(path: string): Promise<string> {
  return wailsCall(H, 'ValidateAIPath', path)
}

export function FindAIPath(providerID: string): Promise<string> {
  return wailsCall(H, 'FindAIPath', providerID)
}
