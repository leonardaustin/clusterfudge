import { wailsCall } from '../../call'

const H = 'AlertHandler'

export interface Alert {
  id: string
  severity: string
  title: string
  message: string
  resource: string
  namespace: string
  timestamp: string
  acknowledged: boolean
}

export interface AlertRule {
  name: string
  condition: string
  severity: string
  enabled: boolean
}

export function ListAlerts(): Promise<Alert[]> {
  return wailsCall(H, 'ListAlerts')
}

export function AcknowledgeAlert(id: string): Promise<boolean> {
  return wailsCall(H, 'AcknowledgeAlert', id)
}

export function GetRules(): Promise<AlertRule[]> {
  return wailsCall(H, 'GetRules')
}

export function ActiveAlertCount(): Promise<number> {
  return wailsCall(H, 'ActiveAlertCount')
}
