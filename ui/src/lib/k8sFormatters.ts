import type { ResourceItem } from '../wailsjs/go/handlers/ResourceHandler'
import type { BarColor, BadgeColor } from '../data/types'

/**
 * Convert a Kubernetes ISO timestamp to a human-readable age string.
 * e.g. "2024-01-15T10:00:00Z" -> "3d"
 */
export function formatAge(timestamp: string | undefined): string {
  if (!timestamp) return '-'
  const diff = Date.now() - new Date(timestamp).getTime()
  if (diff < 0) return '0s'
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

export function getBarColor(percent: number): BarColor {
  if (percent >= 80) return 'red'
  if (percent >= 50) return 'yellow'
  return 'green'
}

/** Safely access nested raw fields from a ResourceItem */
export function raw(item: ResourceItem): Record<string, unknown> {
  return (item.raw || {}) as Record<string, unknown>
}

export function rawSpec(item: ResourceItem): Record<string, unknown> {
  return (raw(item).spec || {}) as Record<string, unknown>
}

export function rawStatus(item: ResourceItem): Record<string, unknown> {
  return (raw(item).status || {}) as Record<string, unknown>
}

export function rawMetadata(item: ResourceItem): Record<string, unknown> {
  return (raw(item).metadata || {}) as Record<string, unknown>
}

export function creationTimestamp(item: ResourceItem): string {
  return (rawMetadata(item).creationTimestamp as string) || ''
}

export function labelsMap(item: ResourceItem): Record<string, string> {
  return (rawMetadata(item).labels || {}) as Record<string, string>
}

export function annotationsMap(item: ResourceItem): Record<string, string> {
  return (rawMetadata(item).annotations || {}) as Record<string, string>
}

/** Convert labels record to "key=value" pairs */
export function labelsToKV(labels: Record<string, string>): { key: string; value: string }[] {
  return Object.entries(labels).map(([key, value]) => ({ key, value }))
}

/** Get strategy badge color */
export function strategyColor(strategy: string): BadgeColor {
  return strategy === 'Recreate' ? 'purple' : 'blue'
}

/** Get service type badge color */
export function serviceTypeBadgeColor(type: string): BadgeColor {
  switch (type) {
    case 'LoadBalancer': return 'purple'
    case 'NodePort': return 'green'
    case 'ExternalName': return 'yellow'
    default: return 'blue'
  }
}

/** Parse Kubernetes CPU quantity to millicores */
export function parseCpu(val: unknown): number {
  if (typeof val === 'number') return val
  if (typeof val !== 'string') return 0
  if (val.endsWith('m')) return parseInt(val, 10)
  if (val.endsWith('n')) return Math.round(parseInt(val, 10) / 1_000_000)
  return Math.round(parseFloat(val) * 1000)
}

/** Parse Kubernetes memory quantity to MiB */
export function parseMemoryMiB(val: unknown): number {
  if (typeof val === 'number') return val
  if (typeof val !== 'string') return 0
  if (val.endsWith('Ki')) return Math.round(parseInt(val, 10) / 1024)
  if (val.endsWith('Mi')) return parseInt(val, 10)
  if (val.endsWith('Gi')) return parseInt(val, 10) * 1024
  if (val.endsWith('Ti')) return parseInt(val, 10) * 1024 * 1024
  // Plain bytes
  return Math.round(parseInt(val, 10) / (1024 * 1024))
}

/** Format ports array from a Service spec */
export function formatServicePorts(ports: unknown[]): string {
  if (!ports || ports.length === 0) return '<none>'
  return ports
    .map((p: unknown) => {
      const port = p as Record<string, unknown>
      const proto = port.protocol || 'TCP'
      const nodePort = port.nodePort ? `:${port.nodePort}` : ''
      return `${port.port}${nodePort}/${proto}`
    })
    .join(', ')
}

/** Format a selector map to "key=value" string */
export function formatSelector(selector: unknown): string {
  if (!selector || typeof selector !== 'object') return '<none>'
  const entries = Object.entries(selector as Record<string, string>)
  if (entries.length === 0) return '<none>'
  return entries.map(([k, v]) => `${k}=${v}`).join(', ')
}
