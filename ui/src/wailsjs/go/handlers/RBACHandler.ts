import { wailsCall } from '../../call'

export interface Subject {
  kind: string
  name: string
  namespace?: string
}

export interface PolicyRule {
  resources: string[]
  verbs: string[]
  apiGroups: string[]
}

export interface RoleNode {
  kind: string
  name: string
  namespace?: string
  rules: PolicyRule[]
}

export interface BindingEdge {
  bindingName: string
  bindingKind: string
  subject: Subject
  roleName: string
  roleKind: string
  namespace?: string
}

export interface RBACGraph {
  subjects: Subject[]
  roles: RoleNode[]
  bindings: BindingEdge[]
}

export function BuildRBACGraph(
  roles: Record<string, unknown>[],
  clusterRoles: Record<string, unknown>[],
  bindings: Record<string, unknown>[],
  clusterBindings: Record<string, unknown>[]
): Promise<RBACGraph> {
  return wailsCall('RBACHandler', 'BuildRBACGraph', roles, clusterRoles, bindings, clusterBindings)
}

export function BuildClusterRBACGraph(): Promise<RBACGraph> {
  return wailsCall('RBACHandler', 'BuildClusterRBACGraph')
}
