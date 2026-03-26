import type { OwnerReference } from './types'

/**
 * Maps a resource kind to its route path prefix (used to construct detail page URLs).
 */
function kindToRoute(kind: string): string | null {
  switch (kind) {
    case 'Deployment': return '/workloads/deployments'
    case 'ReplicaSet': return '/workloads/replicasets'
    case 'StatefulSet': return '/workloads/statefulsets'
    case 'DaemonSet': return '/workloads/daemonsets'
    case 'Job': return '/workloads/jobs'
    case 'CronJob': return '/workloads/cronjobs'
    default: return null
  }
}

export interface ResolvedOwner {
  kind: string
  name: string
  route: string | null
}

/**
 * Returns the immediate owner from ownerReferences.
 */
export function getOwner(ownerRefs?: OwnerReference[]): ResolvedOwner | null {
  if (!ownerRefs || ownerRefs.length === 0) return null
  const ref = ownerRefs[0]
  return {
    kind: ref.kind,
    name: ref.name,
    route: kindToRoute(ref.kind),
  }
}

/**
 * For a Pod, resolve the top-level owner by walking up the chain using raw data.
 * Pass in the full list of ReplicaSet raw items so we can look up the RS's owner.
 * e.g., Pod -> ReplicaSet -> Deployment returns the Deployment.
 */
export function resolveTopOwnerFromRaw(
  ownerRefs: Array<{ kind: string; name: string }> | undefined,
  replicaSetItems?: Array<{ name: string; raw: Record<string, unknown> | null }>
): ResolvedOwner | null {
  if (!ownerRefs || ownerRefs.length === 0) return null
  const immediate = ownerRefs[0]
  const resolved: ResolvedOwner = {
    kind: immediate.kind,
    name: immediate.name,
    route: kindToRoute(immediate.kind),
  }

  // If the immediate owner is a ReplicaSet, try to resolve its Deployment
  if (immediate.kind === 'ReplicaSet' && replicaSetItems) {
    const rs = replicaSetItems.find((r) => r.name === immediate.name)
    if (rs?.raw) {
      const meta = (rs.raw.metadata || {}) as Record<string, unknown>
      const rsOwners = (meta.ownerReferences || []) as Array<{ kind: string; name: string }>
      if (rsOwners.length > 0) {
        return {
          kind: rsOwners[0].kind,
          name: rsOwners[0].name,
          route: kindToRoute(rsOwners[0].kind),
        }
      }
    }
  }

  return resolved
}