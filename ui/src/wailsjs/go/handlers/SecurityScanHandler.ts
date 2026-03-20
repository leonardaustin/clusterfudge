import { wailsCall } from '../../call'

export interface SecurityIssue {
  severity: string
  category: string
  message: string
  field: string
  remediation: string
}

export interface PodSecurityCheck {
  podName: string
  namespace: string
  level: string
  violations: SecurityIssue[]
}

export function CheckPodSecurity(podSpec: Record<string, unknown>): Promise<PodSecurityCheck> {
  return wailsCall('SecurityScanHandler', 'CheckPodSecurity', podSpec)
}

export interface ScanAllPodsResult {
  violations: SecurityIssue[]
  podCount: number
}

export function ScanAllPods(namespace: string): Promise<ScanAllPodsResult> {
  return wailsCall('SecurityScanHandler', 'ScanAllPods', namespace)
}
