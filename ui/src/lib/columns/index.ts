import { podColumns, podColumnsWithMetrics } from './pods'
import { deploymentColumns } from './deployments'
import { statefulSetColumns } from './statefulsets'
import { daemonSetColumns } from './daemonsets'
import { replicaSetColumns } from './replicasets'
import { jobColumns } from './jobs'
import { cronJobColumns } from './cronjobs'
import { serviceColumns } from './services'
import { ingressColumns } from './ingresses'
import { endpointColumns } from './endpoints'
import { networkPolicyColumns } from './networkpolicies'
import { configMapColumns } from './configmaps'
import { secretColumns } from './secrets'
import { hpaColumns } from './hpas'
import { pvColumns } from './pvs'
import { pvcColumns } from './pvcs'
import { storageClassColumns } from './storageclasses'
import { serviceAccountColumns } from './serviceaccounts'
import { roleColumns } from './roles'
import { clusterRoleColumns } from './clusterroles'
import { roleBindingColumns } from './rolebindings'
import { clusterRoleBindingColumns } from './clusterrolebindings'
import { namespaceColumns } from './namespaces'
import { nodeColumns } from './nodes'
import { eventColumns } from './events'
import { pdbColumns } from './pdbs'
import { priorityClassColumns } from './priorityclasses'
import { crdColumns } from './crds'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const COLUMN_MAP: Record<string, any[]> = {
  pods: podColumns,
  deployments: deploymentColumns,
  statefulsets: statefulSetColumns,
  daemonsets: daemonSetColumns,
  replicasets: replicaSetColumns,
  jobs: jobColumns,
  cronjobs: cronJobColumns,
  services: serviceColumns,
  ingresses: ingressColumns,
  endpoints: endpointColumns,
  networkpolicies: networkPolicyColumns,
  configmaps: configMapColumns,
  secrets: secretColumns,
  horizontalpodautoscalers: hpaColumns,
  persistentvolumes: pvColumns,
  persistentvolumeclaims: pvcColumns,
  storageclasses: storageClassColumns,
  serviceaccounts: serviceAccountColumns,
  roles: roleColumns,
  clusterroles: clusterRoleColumns,
  rolebindings: roleBindingColumns,
  clusterrolebindings: clusterRoleBindingColumns,
  namespaces: namespaceColumns,
  nodes: nodeColumns,
  events: eventColumns,
  poddisruptionbudgets: pdbColumns,
  priorityclasses: priorityClassColumns,
  crds: crdColumns,
}

export function getColumnsForResource(resource: string) {
  return COLUMN_MAP[resource] ?? []
}

export { podColumnsWithMetrics }
