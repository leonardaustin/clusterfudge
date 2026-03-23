import { wailsCall } from '../../call'

const H = 'WizardHandler'

export function PreviewDeployment(spec: Record<string, unknown>): Promise<string> {
  return wailsCall(H, 'PreviewDeployment', spec)
}

export function PreviewService(spec: Record<string, unknown>): Promise<string> {
  return wailsCall(H, 'PreviewService', spec)
}

export function PreviewConfigMap(spec: Record<string, unknown>): Promise<string> {
  return wailsCall(H, 'PreviewConfigMap', spec)
}

export function PreviewSecret(spec: Record<string, unknown>): Promise<string> {
  return wailsCall(H, 'PreviewSecret', spec)
}
