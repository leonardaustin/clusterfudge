import type { ContainerInfo } from './types'

export interface DetailCondition {
  type: string
  status: boolean
  reason: string
  message: string
  lastTransitionTime: string
}

export interface DetailEvent {
  type: string
  reason: string
  message: string
  lastSeen: string
  count: number
}

export interface DeploymentDetailData {
  name: string
  namespace: string
  status: string
  paused: boolean
  strategy: string
  maxSurge: string
  maxUnavailable: string
  replicas: { desired: number; ready: number; updated: number; available: number }
  selector: { key: string; value: string }[]
  labels: { key: string; value: string }[]
  annotations: { key: string; value: string }[]
  created: string
  containers: (ContainerInfo & { env?: { name: string; value: string }[] })[]
  conditions: DetailCondition[]
  rolloutHistory: { revision: number; changeCause: string }[]
  events: DetailEvent[]
  yaml: string
}

export interface ServicePort {
  name: string
  port: number
  targetPort: string
  nodePort?: number
  protocol: string
}

export interface ServiceEndpointAddress {
  ip: string
  podName: string
  ready: boolean
}

export interface ServiceDetailData {
  name: string
  namespace: string
  status: string
  type: string
  clusterIP: string
  externalIP: string
  ports: ServicePort[]
  selector: { key: string; value: string }[]
  labels: { key: string; value: string }[]
  annotations: { key: string; value: string }[]
  sessionAffinity: string
  externalTrafficPolicy: string
  internalTrafficPolicy: string
  created: string
  endpoints: { addresses: ServiceEndpointAddress[] }
  events: DetailEvent[]
  yaml: string
}

export interface NodeResourceRow {
  capacity: string
  allocatable: string
  requests: string
  limits: string
  usage: string
  usagePercent: number
}

export interface NodeDetailData {
  name: string
  roles: string
  status: string
  version: string
  osImage: string
  os: string
  arch: string
  kernel: string
  containerRuntime: string
  addresses: { type: string; address: string }[]
  labels: { key: string; value: string }[]
  annotations: { key: string; value: string }[]
  created: string
  conditions: DetailCondition[]
  taints: { key: string; value: string; effect: string }[]
  resources: {
    cpu: NodeResourceRow
    memory: NodeResourceRow
    ephemeralStorage: { capacity: string; allocatable: string; usage: string; usagePercent: number }
    pods: { capacity: number; allocatable: number; running: number; usagePercent: number }
  }
  pods: { name: string; namespace: string; status: string; cpu: string; memory: string }[]
  events: DetailEvent[]
  yaml: string
}
