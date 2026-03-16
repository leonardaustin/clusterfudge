import { wailsCall } from '../../call'

export interface ResourceResult {
  kind: string
  name: string
  namespace?: string
  path: string
}

export function ConnectCluster(name: string): Promise<void> {
  return wailsCall('ClusterHandler', 'Connect', name)
}

export function SearchResources(query: string): Promise<ResourceResult[]> {
  return wailsCall('App', 'SearchResources', query)
}

export function GetVersion(): Promise<string> {
  return wailsCall('App', 'GetVersion')
}

export function SaveFileDialog(defaultFilename: string, content: string): Promise<string> {
  return wailsCall('App', 'SaveFileDialog', defaultFilename, content)
}
