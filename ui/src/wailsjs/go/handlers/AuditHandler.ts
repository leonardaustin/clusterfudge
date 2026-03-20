import { wailsCall } from '../../call'

const H = 'AuditHandler'

export interface AuditEntry {
  id: string
  timestamp: string
  action: string
  kind: string
  name: string
  namespace: string
  user: string
  detail: string
}

export function GetAuditLog(filter: Record<string, string>): Promise<AuditEntry[]> {
  return wailsCall(H, 'GetAuditLog', filter)
}

export function GetAuditCount(): Promise<number> {
  return wailsCall(H, 'GetAuditCount')
}
