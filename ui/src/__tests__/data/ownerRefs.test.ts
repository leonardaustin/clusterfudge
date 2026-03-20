import { describe, it, expect } from 'vitest'
import { getOwner, resolveTopOwnerFromRaw } from '@/data/ownerRefs'

describe('getOwner', () => {
  it('returns route /workloads/deployments for Deployment owner', () => {
    const result = getOwner([{ kind: 'Deployment', name: 'my-deploy', uid: 'uid-1' }])
    expect(result).toEqual({ kind: 'Deployment', name: 'my-deploy', route: '/workloads/deployments' })
  })

  it('returns route /workloads/replicasets for ReplicaSet owner', () => {
    const result = getOwner([{ kind: 'ReplicaSet', name: 'my-rs', uid: 'uid-2' }])
    expect(result).toEqual({ kind: 'ReplicaSet', name: 'my-rs', route: '/workloads/replicasets' })
  })

  it('returns route /workloads/statefulsets for StatefulSet owner', () => {
    const result = getOwner([{ kind: 'StatefulSet', name: 'my-ss', uid: 'uid-3' }])
    expect(result).toEqual({ kind: 'StatefulSet', name: 'my-ss', route: '/workloads/statefulsets' })
  })

  it('returns route /workloads/daemonsets for DaemonSet owner', () => {
    const result = getOwner([{ kind: 'DaemonSet', name: 'my-ds', uid: 'uid-4' }])
    expect(result).toEqual({ kind: 'DaemonSet', name: 'my-ds', route: '/workloads/daemonsets' })
  })

  it('returns route /workloads/jobs for Job owner', () => {
    const result = getOwner([{ kind: 'Job', name: 'my-job', uid: 'uid-5' }])
    expect(result).toEqual({ kind: 'Job', name: 'my-job', route: '/workloads/jobs' })
  })

  it('returns route /workloads/cronjobs for CronJob owner', () => {
    const result = getOwner([{ kind: 'CronJob', name: 'my-cron', uid: 'uid-6' }])
    expect(result).toEqual({ kind: 'CronJob', name: 'my-cron', route: '/workloads/cronjobs' })
  })

  it('returns route null for unknown kind', () => {
    const result = getOwner([{ kind: 'Node', name: 'node-1', uid: 'uid-7' }])
    expect(result).toEqual({ kind: 'Node', name: 'node-1', route: null })
  })

  it('returns null for empty array', () => {
    expect(getOwner([])).toBeNull()
  })

  it('returns null for undefined', () => {
    expect(getOwner(undefined)).toBeNull()
  })
})

describe('resolveTopOwnerFromRaw', () => {
  it('returns null for empty ownerRefs', () => {
    expect(resolveTopOwnerFromRaw([])).toBeNull()
  })

  it('returns null for undefined ownerRefs', () => {
    expect(resolveTopOwnerFromRaw(undefined)).toBeNull()
  })

  it('returns the immediate owner when no replicaSetItems provided', () => {
    const result = resolveTopOwnerFromRaw([{ kind: 'ReplicaSet', name: 'my-rs' }])
    expect(result).toEqual({ kind: 'ReplicaSet', name: 'my-rs', route: '/workloads/replicasets' })
  })

  it('walks ReplicaSet -> Deployment chain when RS items are provided', () => {
    const ownerRefs = [{ kind: 'ReplicaSet', name: 'my-deploy-abc123' }]
    const replicaSetItems = [
      {
        name: 'my-deploy-abc123',
        raw: {
          metadata: {
            ownerReferences: [{ kind: 'Deployment', name: 'my-deploy' }],
          },
        },
      },
    ]
    const result = resolveTopOwnerFromRaw(ownerRefs, replicaSetItems)
    expect(result).toEqual({ kind: 'Deployment', name: 'my-deploy', route: '/workloads/deployments' })
  })

  it('returns immediate RS owner when RS has no ownerReferences', () => {
    const ownerRefs = [{ kind: 'ReplicaSet', name: 'standalone-rs' }]
    const replicaSetItems = [
      {
        name: 'standalone-rs',
        raw: {
          metadata: {},
        },
      },
    ]
    const result = resolveTopOwnerFromRaw(ownerRefs, replicaSetItems)
    expect(result).toEqual({ kind: 'ReplicaSet', name: 'standalone-rs', route: '/workloads/replicasets' })
  })
})
