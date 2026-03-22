import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useKubeResources } from '../hooks/useKubeResource'
import { useClusterStore } from '../stores/clusterStore'
import type { ResourceItem } from '../wailsjs/go/handlers/ResourceHandler'
import { rawMetadata, rawStatus } from '../lib/k8sFormatters'
import { StatusDot } from '../components/shared/StatusDot'
import { ResourceHeader } from '../components/shared/ResourceHeader'
import { SearchInput } from '../components/shared/SearchInput'

interface TreeNode {
  kind: string
  name: string
  namespace: string
  status: string
  route: string
  children: TreeNode[]
}

function getOwnerRefs(item: ResourceItem): Array<{ kind: string; name: string }> {
  const meta = rawMetadata(item)
  return (meta.ownerReferences || []) as Array<{ kind: string; name: string }>
}

function getResourceStatus(item: ResourceItem): string {
  const status = rawStatus(item)
  const phase = (status.phase as string) || ''
  if (phase) return phase
  const conditions = (status.conditions || []) as Array<Record<string, unknown>>
  const available = conditions.find((c) => c.type === 'Available')
  if (available) return available.status === 'True' ? 'running' : 'failed'
  return 'running'
}

function buildTopology(
  deployments: ResourceItem[],
  replicasets: ResourceItem[],
  pods: ResourceItem[],
  statefulsets: ResourceItem[],
  daemonsets: ResourceItem[],
  cronjobs: ResourceItem[],
  jobs: ResourceItem[],
): TreeNode[] {
  const trees: TreeNode[] = []

  // Deployment -> ReplicaSet -> Pods
  for (const dep of deployments) {
    const depNode: TreeNode = {
      kind: 'Deployment',
      name: dep.name,
      namespace: dep.namespace,
      status: getResourceStatus(dep),
      route: `/workloads/deployments/${dep.namespace}/${dep.name}`,
      children: [],
    }

    const ownedRs = replicasets.filter((rs) =>
      rs.namespace === dep.namespace &&
      getOwnerRefs(rs).some((ref) => ref.kind === 'Deployment' && ref.name === dep.name)
    )

    for (const rs of ownedRs) {
      const rsNode: TreeNode = {
        kind: 'ReplicaSet',
        name: rs.name,
        namespace: rs.namespace,
        status: getResourceStatus(rs),
        route: '/workloads/replicasets',
        children: [],
      }

      const ownedPods = pods.filter((p) =>
        p.namespace === rs.namespace &&
        getOwnerRefs(p).some((ref) => ref.kind === 'ReplicaSet' && ref.name === rs.name)
      )

      for (const pod of ownedPods) {
        rsNode.children.push({
          kind: 'Pod',
          name: pod.name,
          namespace: pod.namespace,
          status: getResourceStatus(pod),
          route: `/workloads/pods/${pod.namespace}/${pod.name}`,
          children: [],
        })
      }

      depNode.children.push(rsNode)
    }

    trees.push(depNode)
  }

  // StatefulSet -> Pods
  for (const sts of statefulsets) {
    const stsNode: TreeNode = {
      kind: 'StatefulSet',
      name: sts.name,
      namespace: sts.namespace,
      status: getResourceStatus(sts),
      route: '/workloads/statefulsets',
      children: [],
    }

    const ownedPods = pods.filter((p) =>
      p.namespace === sts.namespace &&
      getOwnerRefs(p).some((ref) => ref.kind === 'StatefulSet' && ref.name === sts.name)
    )

    for (const pod of ownedPods) {
      stsNode.children.push({
        kind: 'Pod',
        name: pod.name,
        namespace: pod.namespace,
        status: getResourceStatus(pod),
        route: `/workloads/pods/${pod.namespace}/${pod.name}`,
        children: [],
      })
    }

    trees.push(stsNode)
  }

  // DaemonSet -> Pods
  for (const ds of daemonsets) {
    const dsNode: TreeNode = {
      kind: 'DaemonSet',
      name: ds.name,
      namespace: ds.namespace,
      status: getResourceStatus(ds),
      route: '/workloads/daemonsets',
      children: [],
    }

    const ownedPods = pods.filter((p) =>
      p.namespace === ds.namespace &&
      getOwnerRefs(p).some((ref) => ref.kind === 'DaemonSet' && ref.name === ds.name)
    )

    for (const pod of ownedPods) {
      dsNode.children.push({
        kind: 'Pod',
        name: pod.name,
        namespace: pod.namespace,
        status: getResourceStatus(pod),
        route: `/workloads/pods/${pod.namespace}/${pod.name}`,
        children: [],
      })
    }

    trees.push(dsNode)
  }

  // CronJob -> Jobs -> Pods
  for (const cj of cronjobs) {
    const cjNode: TreeNode = {
      kind: 'CronJob',
      name: cj.name,
      namespace: cj.namespace,
      status: getResourceStatus(cj),
      route: '/workloads/cronjobs',
      children: [],
    }

    const ownedJobs = jobs.filter((j) =>
      j.namespace === cj.namespace &&
      getOwnerRefs(j).some((ref) => ref.kind === 'CronJob' && ref.name === cj.name)
    )

    for (const job of ownedJobs) {
      const jobNode: TreeNode = {
        kind: 'Job',
        name: job.name,
        namespace: job.namespace,
        status: getResourceStatus(job),
        route: '/workloads/jobs',
        children: [],
      }

      const ownedPods = pods.filter((p) =>
        p.namespace === job.namespace &&
        getOwnerRefs(p).some((ref) => ref.kind === 'Job' && ref.name === job.name)
      )

      for (const pod of ownedPods) {
        jobNode.children.push({
          kind: 'Pod',
          name: pod.name,
          namespace: pod.namespace,
          status: getResourceStatus(pod),
          route: `/workloads/pods/${pod.namespace}/${pod.name}`,
          children: [],
        })
      }

      cjNode.children.push(jobNode)
    }

    trees.push(cjNode)
  }

  // Standalone Jobs -> Pods
  const standaloneJobs = jobs.filter((j) => {
    const refs = getOwnerRefs(j)
    return refs.length === 0
  })
  for (const job of standaloneJobs) {
    const jobNode: TreeNode = {
      kind: 'Job',
      name: job.name,
      namespace: job.namespace,
      status: getResourceStatus(job),
      route: '/workloads/jobs',
      children: [],
    }

    const ownedPods = pods.filter((p) =>
      p.namespace === job.namespace &&
      getOwnerRefs(p).some((ref) => ref.kind === 'Job' && ref.name === job.name)
    )

    for (const pod of ownedPods) {
      jobNode.children.push({
        kind: 'Pod',
        name: pod.name,
        namespace: pod.namespace,
        status: getResourceStatus(pod),
        route: `/workloads/pods/${pod.namespace}/${pod.name}`,
        children: [],
      })
    }

    trees.push(jobNode)
  }

  return trees
}

function countDescendants(node: TreeNode): number {
  let count = node.children.length
  for (const child of node.children) {
    count += countDescendants(child)
  }
  return count
}

function kindBadgeColor(kind: string): string {
  switch (kind) {
    case 'Deployment': return 'var(--blue)'
    case 'ReplicaSet': return 'var(--purple)'
    case 'StatefulSet': return 'var(--green)'
    case 'DaemonSet': return 'var(--yellow)'
    case 'CronJob': return 'var(--purple)'
    case 'Job': return 'var(--blue)'
    case 'Pod': return 'var(--text-tertiary)'
    default: return 'var(--text-tertiary)'
  }
}

function TreeNodeRow({
  node,
  depth,
  isLast,
}: {
  node: TreeNode
  depth: number
  isLast: boolean
}) {
  const [expanded, setExpanded] = useState(depth < 2)
  const hasChildren = node.children.length > 0
  const indent = depth * 20

  return (
    <>
      <div
        className="topo-node"
        style={{ paddingLeft: indent + 12 }}
      >
        {/* Tree connector line */}
        {depth > 0 && (
          <span
            className="topo-connector"
            style={{ left: indent - 8 }}
          >
            {isLast ? '\u2514' : '\u251C'}
          </span>
        )}

        {/* Expand/collapse toggle */}
        {hasChildren ? (
          <button
            className="topo-toggle"
            onClick={() => setExpanded(!expanded)}
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
              {expanded
                ? <polyline points="6 9 12 15 18 9" />
                : <polyline points="9 6 15 12 9 18" />
              }
            </svg>
          </button>
        ) : (
          <span className="topo-toggle-spacer" />
        )}

        {/* Status dot */}
        <StatusDot status={node.status} />

        {/* Kind badge */}
        <span
          className="topo-kind"
          style={{ color: kindBadgeColor(node.kind) }}
        >
          {node.kind}
        </span>

        {/* Name (clickable link) */}
        <Link to={node.route} className="topo-name">
          {node.name}
        </Link>

        {/* Namespace */}
        <span className="topo-ns">{node.namespace}</span>

        {/* Child count */}
        {hasChildren && (
          <span className="topo-count">
            {countDescendants(node)} resources
          </span>
        )}
      </div>

      {/* Children */}
      {expanded &&
        node.children.map((child, i) => (
          <TreeNodeRow
            key={`${child.kind}/${child.name}`}
            node={child}
            depth={depth + 1}
            isLast={i === node.children.length - 1}
          />
        ))}
    </>
  )
}

export function Topology() {
  const [filter, setFilter] = useState('')
  const selectedNamespace = useClusterStore((s) => s.selectedNamespace)
  const namespace = selectedNamespace || ''

  const { data: deploymentItems } = useKubeResources({ group: 'apps', version: 'v1', resource: 'deployments', namespace })
  const { data: replicasetItems } = useKubeResources({ group: 'apps', version: 'v1', resource: 'replicasets', namespace })
  const { data: podItems } = useKubeResources({ group: '', version: 'v1', resource: 'pods', namespace })
  const { data: statefulsetItems } = useKubeResources({ group: 'apps', version: 'v1', resource: 'statefulsets', namespace })
  const { data: daemonsetItems } = useKubeResources({ group: 'apps', version: 'v1', resource: 'daemonsets', namespace })
  const { data: cronjobItems } = useKubeResources({ group: 'batch', version: 'v1', resource: 'cronjobs', namespace })
  const { data: jobItems } = useKubeResources({ group: 'batch', version: 'v1', resource: 'jobs', namespace })

  const topology = useMemo(
    () => buildTopology(deploymentItems, replicasetItems, podItems, statefulsetItems, daemonsetItems, cronjobItems, jobItems),
    [deploymentItems, replicasetItems, podItems, statefulsetItems, daemonsetItems, cronjobItems, jobItems]
  )

  const filtered = filter
    ? topology.filter((tree) => {
        const q = filter.toLowerCase()
        return (
          tree.name.toLowerCase().includes(q) ||
          tree.namespace.toLowerCase().includes(q) ||
          tree.kind.toLowerCase().includes(q) ||
          tree.children.some(
            (child) =>
              child.name.toLowerCase().includes(q) ||
              child.children.some((gc) => gc.name.toLowerCase().includes(q))
          )
        )
      })
    : topology

  const totalResources =
    podItems.length +
    replicasetItems.length +
    deploymentItems.length +
    statefulsetItems.length +
    daemonsetItems.length +
    cronjobItems.length +
    jobItems.length

  return (
    <div className="resource-view">
      <ResourceHeader
        title="Resource Topology"
        subtitle={`${totalResources} resources across ${filtered.length} top-level workloads`}
      >
        <SearchInput placeholder="Filter topology..." value={filter} onChange={setFilter} />
      </ResourceHeader>

      <div className="topo-tree">
        {filtered.map((node, i) => (
          <TreeNodeRow
            key={`${node.kind}/${node.namespace}/${node.name}`}
            node={node}
            depth={0}
            isLast={i === filtered.length - 1}
          />
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: 'var(--space-4)', color: 'var(--text-tertiary)' }}>
            No resources match the filter.
          </div>
        )}
      </div>
    </div>
  )
}
