import { wailsCall } from '../../call'

const H = 'TroubleshootHandler'

export interface FieldDiff {
  path: string
  oldValue: string
  newValue: string
}

export interface OwnerRef {
  kind: string
  name: string
}

export interface ChangeRecord {
  timestamp: string
  kind: string
  namespace: string
  name: string
  changeType: string
  fieldDiffs?: FieldDiff[]
  ownerChain: OwnerRef[]
}

export interface Suggestion {
  title: string
  description: string
  actionType: string
  actionRef: string
}

export interface Check {
  name: string
  status: string
  detail: string
}

export interface Investigation {
  resourceKind: string
  resourceName: string
  namespace: string
  problem: string
  since: string
  rootCause?: string
  relatedChanges: ChangeRecord[]
  suggestions: Suggestion[]
  checks: Check[]
  rawStatus?: Record<string, unknown>
}

export function Investigate(kind: string, namespace: string, name: string, status: Record<string, unknown>): Promise<Investigation> {
  return wailsCall(H, 'Investigate', kind, namespace, name, status)
}

export function InvestigateResource(kind: string, namespace: string, name: string): Promise<Investigation> {
  return wailsCall(H, 'InvestigateResource', kind, namespace, name)
}

export function GetTimeline(kind: string, namespace: string, name: string): Promise<ChangeRecord[]> {
  return wailsCall(H, 'GetTimeline', kind, namespace, name)
}
