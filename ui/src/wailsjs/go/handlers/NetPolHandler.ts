import { wailsCall } from '../../call'

export interface PodGroup {
  id: string
  name: string
  namespace: string
  labels: Record<string, string>
  podCount: number
  isolated: boolean
}

export interface NetworkEdge {
  from: string
  to: string
  port: number
  protocol: string
  allowed: boolean
  policyRef: string
}

export interface NetworkGraph {
  groups: PodGroup[]
  edges: NetworkEdge[]
}

export function BuildNetworkGraph(policies: Record<string, unknown>[], pods: Record<string, unknown>[]): Promise<NetworkGraph> {
  return wailsCall('NetPolHandler', 'BuildNetworkGraph', policies, pods)
}

export function BuildClusterNetworkGraph(namespace: string): Promise<NetworkGraph> {
  return wailsCall('NetPolHandler', 'BuildClusterNetworkGraph', namespace)
}
