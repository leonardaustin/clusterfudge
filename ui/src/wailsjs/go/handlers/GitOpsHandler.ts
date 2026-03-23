import { wailsCall } from '../../call'

export interface DetectedProvider {
  provider: string
  version?: string
  namespace: string
  resources: string[]
}

export interface DetectionResult {
  providers: DetectedProvider[]
}

export function DetectProviders(apiGroups: string[]): Promise<DetectionResult> {
  return wailsCall('GitOpsHandler', 'DetectProviders', apiGroups)
}

export function DetectClusterProviders(): Promise<DetectionResult> {
  return wailsCall('GitOpsHandler', 'DetectClusterProviders')
}
