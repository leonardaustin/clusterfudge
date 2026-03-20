import { wailsCall } from '../../call'

const H = 'SecretHandler'

export interface MaskedSecret {
  name: string
  namespace: string
  type: string
  data: Record<string, string>
}

export function GetSecret(namespace: string, name: string): Promise<MaskedSecret> {
  return wailsCall(H, 'GetSecret', namespace, name)
}

export function RevealSecretKey(namespace: string, name: string, key: string): Promise<string> {
  return wailsCall(H, 'RevealSecretKey', namespace, name, key)
}
