import { wailsCall } from '../../call'

export interface ClusterSummary {
  nodeCount: number
  nodeReady: number
  podCount: number
  podRunning: number
  deploymentCount: number
  deploymentReady: number
  serviceCount: number
  serviceLB: number
  namespaceSummary: NamespaceSummary[]
}

export interface NamespaceSummary {
  name: string
  podCount: number
}

export interface ContextInfo {
  name: string
  cluster: string
  namespace: string
  authInfo: string
  server: string
  isCurrent: boolean
  authType: string
  authProvider: string
}

export function GetClusterSummary(): Promise<ClusterSummary> {
  return wailsCall('ClusterHandler', 'GetClusterSummary')
}

export function ListContexts(): Promise<string[]> {
  return wailsCall('ClusterHandler', 'ListContexts')
}

export function ListContextDetails(): Promise<ContextInfo[]> {
  return wailsCall('ClusterHandler', 'ListContextDetails')
}

export function Connect(contextName: string): Promise<void> {
  return wailsCall('ClusterHandler', 'Connect', contextName)
}

export function Disconnect(): Promise<void> {
  return wailsCall('ClusterHandler', 'Disconnect')
}

export function ListNamespaces(): Promise<string[]> {
  return wailsCall('ClusterHandler', 'ListNamespaces')
}

export interface PreflightResult {
  context: string
  reachable: boolean
  authenticated: boolean
  serverVersion?: string
  error?: string
  errorCode?: string
  authProvider?: string
}

export function PreflightCheck(contextName: string): Promise<PreflightResult> {
  return wailsCall('ClusterHandler', 'PreflightCheck', contextName)
}

export function GetMetrics(): Promise<unknown> {
  return wailsCall('ClusterHandler', 'GetMetrics')
}
