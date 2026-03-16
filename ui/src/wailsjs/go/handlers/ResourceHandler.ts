import { wailsCall } from '../../call'

const H = 'ResourceHandler'

export interface ResourceItem {
  name: string
  namespace: string
  labels: Record<string, string> | null
  spec: Record<string, unknown> | null
  status: Record<string, unknown> | null
  raw: Record<string, unknown> | null
}

export interface PodUsage {
  podName: string
  namespace: string
  cpuCores: number
  memoryMiB: number
}

export interface BatchDeleteQuery {
  group: string
  version: string
  resource: string
  namespace: string
  name: string
}

export interface BatchDeleteResult {
  name: string
  error?: string
}

export interface EventInfo {
  type: string
  reason: string
  message: string
  objectKind: string
  objectName: string
  objectNamespace: string
  count: number
  firstTimestamp: string
  lastTimestamp: string
}

export function ListResources(group: string, version: string, resource: string, namespace: string): Promise<ResourceItem[]> {
  return wailsCall(H, 'ListResources', group, version, resource, namespace)
}

export function GetResource(group: string, version: string, resource: string, namespace: string, name: string): Promise<ResourceItem> {
  return wailsCall(H, 'GetResource', group, version, resource, namespace, name)
}

export function ApplyResource(group: string, version: string, resource: string, namespace: string, data: number[]): Promise<void> {
  return wailsCall(H, 'ApplyResource', group, version, resource, namespace, data)
}

export function DryRunApply(group: string, version: string, resource: string, namespace: string, data: number[]): Promise<string> {
  return wailsCall(H, 'DryRunApply', group, version, resource, namespace, data)
}

export function DeleteResource(group: string, version: string, resource: string, namespace: string, name: string): Promise<void> {
  return wailsCall(H, 'DeleteResource', group, version, resource, namespace, name)
}

export function GetPodMetrics(namespace: string): Promise<PodUsage[]> {
  return wailsCall(H, 'GetPodMetrics', namespace)
}

export function PatchLabels(group: string, version: string, resource: string, namespace: string, name: string, labels: Record<string, unknown>): Promise<void> {
  return wailsCall(H, 'PatchLabels', group, version, resource, namespace, name, labels)
}

export function PatchServiceSelector(namespace: string, name: string, selector: Record<string, unknown>): Promise<void> {
  return wailsCall(H, 'PatchServiceSelector', namespace, name, selector)
}

export function BatchDelete(queries: BatchDeleteQuery[]): Promise<BatchDeleteResult[]> {
  return wailsCall(H, 'BatchDelete', queries)
}

export function WatchResources(group: string, version: string, resource: string, namespace: string): Promise<void> {
  return wailsCall(H, 'WatchResources', group, version, resource, namespace)
}

export function StopWatch(group: string, version: string, resource: string, namespace: string): Promise<void> {
  return wailsCall(H, 'StopWatch', group, version, resource, namespace)
}

export function ListEvents(namespace: string, limit: number): Promise<EventInfo[]> {
  return wailsCall(H, 'ListEvents', namespace, limit)
}

export function ScaleDeployment(namespace: string, name: string, replicas: number): Promise<void> {
  return wailsCall(H, 'ScaleDeployment', namespace, name, replicas)
}

export function RestartDeployment(namespace: string, name: string): Promise<void> {
  return wailsCall(H, 'RestartDeployment', namespace, name)
}

export function CordonNode(nodeName: string): Promise<void> {
  return wailsCall(H, 'CordonNode', nodeName)
}

export function UncordonNode(nodeName: string): Promise<void> {
  return wailsCall(H, 'UncordonNode', nodeName)
}

export function DrainNode(nodeName: string, gracePeriod: number, force: boolean, ignoreDaemonSets: boolean, deleteEmptyDirData: boolean): Promise<void> {
  return wailsCall(H, 'DrainNode', nodeName, gracePeriod, force, ignoreDaemonSets, deleteEmptyDirData)
}

export function PauseDeployment(namespace: string, name: string): Promise<void> {
  return wailsCall(H, 'PauseDeployment', namespace, name)
}

export function ResumeDeployment(namespace: string, name: string): Promise<void> {
  return wailsCall(H, 'ResumeDeployment', namespace, name)
}

export interface RolloutRevision {
  revision: number
  images: string[]
  changeCause: string
  created: string
}

export function GetRolloutHistory(namespace: string, name: string): Promise<RolloutRevision[]> {
  return wailsCall(H, 'GetRolloutHistory', namespace, name)
}

export function AddNodeTaint(nodeName: string, key: string, value: string, effect: string): Promise<void> {
  return wailsCall(H, 'AddNodeTaint', nodeName, key, value, effect)
}

export function RemoveNodeTaint(nodeName: string, key: string): Promise<void> {
  return wailsCall(H, 'RemoveNodeTaint', nodeName, key)
}

export function CreateJobFromCronJob(namespace: string, cronJobName: string, jobName: string): Promise<void> {
  return wailsCall(H, 'CreateJobFromCronJob', namespace, cronJobName, jobName)
}
