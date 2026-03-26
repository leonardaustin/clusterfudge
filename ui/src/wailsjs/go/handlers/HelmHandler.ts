import { wailsCall } from '../../call'

const H = 'HelmHandler'

export interface ReleaseInfo {
  name: string
  namespace: string
  revision: number
  status: string
  chart: string
  chartVersion: string
  appVersion: string
  updated: string
  notes: string
}

export interface ReleaseDetail extends ReleaseInfo {
  manifest: string
  values: string
}

export interface RepoInfo {
  name: string
  url: string
}

export interface ChartResult {
  name: string
  version: string
  appVersion: string
  description: string
  repo: string
}

export function AddChartRepo(name: string, url: string): Promise<void> {
  return wailsCall(H, 'AddChartRepo', name, url)
}

export function ListReleases(namespace: string): Promise<ReleaseInfo[]> {
  return wailsCall(H, 'ListReleases', namespace)
}

export function GetRelease(name: string, namespace: string): Promise<ReleaseDetail> {
  return wailsCall(H, 'GetRelease', name, namespace)
}

export function GetReleaseHistory(name: string, namespace: string): Promise<ReleaseInfo[]> {
  return wailsCall(H, 'GetReleaseHistory', name, namespace)
}

export function InstallChart(name: string, namespace: string, chartPath: string, values: string): Promise<void> {
  return wailsCall(H, 'InstallChart', name, namespace, chartPath, values)
}

export function ListChartRepos(): Promise<RepoInfo[]> {
  return wailsCall(H, 'ListChartRepos')
}

export function RemoveChartRepo(name: string): Promise<void> {
  return wailsCall(H, 'RemoveChartRepo', name)
}

export function UpgradeChart(name: string, namespace: string, chartPath: string, values: string): Promise<void> {
  return wailsCall(H, 'UpgradeChart', name, namespace, chartPath, values)
}

export function RollbackRelease(name: string, namespace: string, revision: number): Promise<void> {
  return wailsCall(H, 'RollbackRelease', name, namespace, revision)
}

export function SearchCharts(keyword: string): Promise<ChartResult[]> {
  return wailsCall(H, 'SearchCharts', keyword)
}

export function UninstallRelease(name: string, namespace: string): Promise<void> {
  return wailsCall(H, 'UninstallRelease', name, namespace)
}
