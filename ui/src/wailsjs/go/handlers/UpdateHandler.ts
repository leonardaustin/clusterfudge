import { wailsCall } from '../../call'

const H = 'UpdateHandler'

export interface UpdateInfo {
  version: string
  releaseUrl: string
  assetUrl: string
  size: number
  releaseNotes: string
  publishedAt: string
}

export function CheckForUpdate(): Promise<UpdateInfo | null> {
  return wailsCall(H, 'CheckForUpdate')
}

export function SkipVersion(version: string): Promise<void> {
  return wailsCall(H, 'SkipVersion', version)
}

export function InstallSource(): Promise<string> {
  return wailsCall(H, 'InstallSource')
}
