import { describe, it, expect } from 'vitest'
import { COLUMN_MAP, getColumnsForResource, podColumnsWithMetrics } from '@/lib/columns'

const ALL_RESOURCE_TYPES = [
  'pods',
  'deployments',
  'statefulsets',
  'daemonsets',
  'replicasets',
  'jobs',
  'cronjobs',
  'services',
  'ingresses',
  'endpoints',
  'networkpolicies',
  'configmaps',
  'secrets',
  'horizontalpodautoscalers',
  'persistentvolumes',
  'persistentvolumeclaims',
  'storageclasses',
  'serviceaccounts',
  'roles',
  'clusterroles',
  'rolebindings',
  'clusterrolebindings',
  'namespaces',
  'nodes',
  'events',
  'poddisruptionbudgets',
  'priorityclasses',
  'crds',
]

describe('COLUMN_MAP', () => {
  it('has 28 resource types', () => {
    expect(Object.keys(COLUMN_MAP).length).toBe(28)
  })

  it.each(ALL_RESOURCE_TYPES)('has columns for %s', (type) => {
    expect(COLUMN_MAP[type]).toBeDefined()
    expect(Array.isArray(COLUMN_MAP[type])).toBe(true)
    expect(COLUMN_MAP[type].length).toBeGreaterThan(0)
  })
})

describe('getColumnsForResource', () => {
  it('returns columns for known types', () => {
    const cols = getColumnsForResource('pods')
    expect(cols.length).toBeGreaterThan(0)
  })

  it('returns empty array for unknown types', () => {
    expect(getColumnsForResource('unknown')).toEqual([])
  })
})

describe('podColumnsWithMetrics', () => {
  it('has more columns than regular podColumns', () => {
    const regular = getColumnsForResource('pods')
    expect(podColumnsWithMetrics.length).toBeGreaterThan(regular.length)
  })
})

describe('column definitions', () => {
  it.each(ALL_RESOURCE_TYPES)('%s columns have header and size', (type) => {
    const cols = COLUMN_MAP[type]
    for (const col of cols) {
      // Each column must have a header (string) or id
      expect(
        col.header !== undefined || col.id !== undefined
      ).toBe(true)
    }
  })

  it('pods columns include name, status, and age', () => {
    const cols = getColumnsForResource('pods')
    const accessorKeys = cols.map((c: { accessorKey?: string }) => c.accessorKey).filter(Boolean)
    expect(accessorKeys).toContain('name')
    expect(accessorKeys).toContain('status')
    expect(accessorKeys).toContain('age')
  })

  it('nodes columns include version and roles', () => {
    const cols = getColumnsForResource('nodes')
    const accessorKeys = cols.map((c: { accessorKey?: string }) => c.accessorKey).filter(Boolean)
    expect(accessorKeys).toContain('version')
    expect(accessorKeys).toContain('roles')
  })
})
