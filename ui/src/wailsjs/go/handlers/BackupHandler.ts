import { wailsCall } from '../../call'

export function StripManifest(manifest: Record<string, unknown>): Promise<Record<string, unknown>> {
  return wailsCall('BackupHandler', 'StripManifest', manifest)
}

export function StripManifestFromString(input: string): Promise<string> {
  return wailsCall('BackupHandler', 'StripManifestFromString', input)
}
