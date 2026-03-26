import { wailsCall } from '../../call'

const H = 'StreamHandler'

export interface LogOptions {
  namespace: string
  podName: string
  containerName: string
  follow: boolean
  tailLines: number
  previous: boolean
  timestamps: boolean
}

export interface ExecOptions {
  namespace: string
  podName: string
  containerName: string
  command: string[]
  tty: boolean
}

export interface PortForwardOptions {
  namespace: string
  podName: string
  podPort: number
  localPort: number
}

export interface PortForwardResult {
  localPort: number
  podPort: number
  podName: string
  namespace: string
}

export interface PortForwardInfo {
  localPort: number
  podName: string
  namespace: string
  podPort: number
  status: string       // "active" or "reconnecting"
  reconnectNum: number // current reconnect attempt (0 when active)
}

export interface LogLineEvent {
  content: string
  timestamp: string
  container: string
}

export function StreamLogs(opts: LogOptions): Promise<void> {
  return wailsCall(H, 'StreamLogs', opts)
}

export function StopLogStream(namespace: string, podName: string): Promise<void> {
  return wailsCall(H, 'StopLogStream', namespace, podName)
}

export function StartExec(opts: ExecOptions): Promise<string> {
  return wailsCall(H, 'StartExec', opts)
}

export function WriteExec(sessionID: string, data: string): Promise<void> {
  return wailsCall(H, 'WriteExec', sessionID, data)
}

export function CloseExec(sessionID: string): Promise<void> {
  return wailsCall(H, 'CloseExec', sessionID)
}

export function ResizeExec(sessionID: string, cols: number, rows: number): Promise<void> {
  return wailsCall(H, 'ResizeExec', sessionID, cols, rows)
}

export function StartPortForward(opts: PortForwardOptions): Promise<PortForwardResult> {
  return wailsCall(H, 'StartPortForward', opts)
}

export function StartServicePortForward(namespace: string, serviceName: string, servicePort: number, localPort: number): Promise<PortForwardResult> {
  return wailsCall(H, 'StartServicePortForward', namespace, serviceName, servicePort, localPort)
}

export function StopPortForward(localPort: number): Promise<void> {
  return wailsCall(H, 'StopPortForward', localPort)
}

export function ListPortForwards(): Promise<PortForwardInfo[]> {
  return wailsCall(H, 'ListPortForwards')
}

export interface DiscoveredForward {
  serviceName: string
  namespace: string
  servicePort: number
  localPort: number
  label: string
  autoStart: boolean
}

export function DiscoverPortForwards(namespace: string): Promise<DiscoveredForward[]> {
  return wailsCall(H, 'DiscoverPortForwards', namespace)
}

export function StartLocalTerminal(): Promise<string> {
  return wailsCall(H, 'StartLocalTerminal')
}

export function WriteLocalTerminal(sessionID: string, data: string): Promise<void> {
  return wailsCall(H, 'WriteLocalTerminal', sessionID, data)
}

export function ResizeLocalTerminal(sessionID: string, rows: number, cols: number): Promise<void> {
  return wailsCall(H, 'ResizeLocalTerminal', sessionID, rows, cols)
}

export function CloseLocalTerminal(sessionID: string): Promise<void> {
  return wailsCall(H, 'CloseLocalTerminal', sessionID)
}

export function DownloadLogs(opts: LogOptions): Promise<string> {
  return wailsCall(H, 'DownloadLogs', opts)
}

export function StreamAllContainerLogs(namespace: string, podName: string, containers: string[], tailLines: number): Promise<void> {
  return wailsCall(H, 'StreamAllContainerLogs', namespace, podName, containers, tailLines)
}

export function StopAllContainerLogs(namespace: string, podName: string): Promise<void> {
  return wailsCall(H, 'StopAllContainerLogs', namespace, podName)
}
