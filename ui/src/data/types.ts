export interface OwnerReference {
  kind: string
  name: string
  uid: string
}

export type PodStatus = 'Running' | 'Pending' | 'Failed' | 'Succeeded' | 'CrashLoopBackOff' | 'Completed' | 'Terminating' | 'Unknown'
export type DeploymentStatus = 'running' | 'progressing' | 'failed'
export type NodeStatus = 'ready' | 'running'
export type EventType = 'Normal' | 'Warning'

export interface Pod {
  name: string
  namespace: string
  status: PodStatus
  ready: string
  restarts: number
  node: string
  ip: string
  age: string
  containers?: number
  cpuUsage?: number    // millicores
  memoryUsage?: number // MiB
  cpuRequest?: number  // millicores
  cpuLimit?: number    // millicores
  memRequest?: number  // MiB
  memLimit?: number    // MiB
  ownerReferences?: OwnerReference[]
}

export interface Deployment {
  name: string
  namespace: string
  status: DeploymentStatus
  ready: string
  upToDate: number
  available: number
  strategy: string
  strategyColor: BadgeColor
  images: string
  age: string
}

export interface NodeCondition {
  type: string
  status: 'True' | 'False' | 'Unknown'
}

export interface NodeTaint {
  key: string
  value?: string
  effect: string
}

export interface NodeAddress {
  type: string
  address: string
}

export interface AllocatedResources {
  cpuRequests: string
  cpuLimits: string
  memoryRequests: string
  memoryLimits: string
}

export interface ClusterNode {
  name: string
  status: NodeStatus
  roles: string
  roleBadgeColor: BadgeColor
  version: string
  cpuCores: string
  memory: string
  pods: number
  osImage: string
  kernel: string
  containerRuntime: string
  age: string
  cpuUsage: { value: string; percent: number; color: BarColor }
  memoryUsage: { value: string; percent: number; color: BarColor }
  podUsage: { value: string; percent: number; color: BarColor }
  systemInfo: string
  cpuCoresNum?: number       // raw CPU cores count
  memoryGiB?: number         // raw memory in GiB
  cpuUsageMillicores?: number // actual CPU usage in millicores
  memoryUsageMiB?: number    // actual memory usage in MiB
  ephemeralStorageGiB?: number // ephemeral storage in GiB
  ephemeralUsageGiB?: number   // ephemeral storage usage in GiB
  conditions: NodeCondition[]
  taints: NodeTaint[]
  addresses: NodeAddress[]
  ephemeralStorage: string
  allocatedResources: AllocatedResources
}

export interface KubeEvent {
  type: EventType
  badgeColor: BadgeColor
  reason: string
  object: string
  message: string
  count: number
  lastSeen: string
  firstSeen?: string
  sourceComponent?: string
}

export interface WorkloadSummary {
  title: string
  count: number
  breakdown: { status?: string; label: string }[]
}

export interface Namespace {
  name: string
  status: string
  pods: number
  services: number
}

export interface MetricCard {
  label: string
  value: string
  valueColor?: string
  sub: string
  bar?: { percent: number; color: BarColor }
  valueStyle?: string
}

export interface RecentEvent {
  type: 'normal' | 'warning'
  reason: string
  object: string
  message: string
  time: string
  count: number
  isLast?: boolean
}

export interface HexPod {
  name: string
  namespace: string
  status: string
  containers: string
  cpuPercent: number
  memoryDisplay: string
  fill: string
  restarts?: number
}

export interface NodeHexGroup {
  name: string
  status: string
  podCount: number
  role: string
  cpuPercent: number
  rows: HexPod[][]
}

export interface PodDetailData {
  name: string
  namespace: string
  status: string
  ready: string
  node: string
  podIp: string
  serviceAccount: string
  qosClass: string
  created: string
  labels: { key: string; value: string }[]
  annotationCount: number
  containers: ContainerInfo[]
  conditions: { name: string; status: boolean }[]
  volumes: { name: string; source: string }[]
}

export interface ContainerInfo {
  name: string
  status: string
  image: string
  port?: string
  cpu: string
  memory: string
  started: string
  cpuUsage?: number    // actual usage in millicores
  memoryUsage?: number // actual usage in MiB
}

export interface NavItem {
  label: string
  href: string
  count?: number
  icon?: string
}

export interface NavSection {
  label: string
  items: NavItem[]
}

export type BadgeColor = 'green' | 'yellow' | 'red' | 'blue' | 'purple' | 'gray'
export type BarColor = 'green' | 'yellow' | 'red' | 'blue'

export interface ContextMenuItem {
  action: string
  label: string
  shortcut?: string
  icon: string
  danger?: boolean
  separator?: boolean
}

export type StatefulSetStatus = 'running' | 'progressing' | 'failed'

export interface StatefulSet {
  name: string
  namespace: string
  status: StatefulSetStatus
  ready: string
  current: number
  age: string
  replicas?: number
  serviceName?: string
  updateStrategy?: string
}

export type DaemonSetStatus = 'running' | 'progressing' | 'failed'

export interface DaemonSet {
  name: string
  namespace: string
  status: DaemonSetStatus
  desired: number
  current: number
  ready: number
  upToDate: number
  available: number
  age: string
  nodeSelector?: string
}

export type ReplicaSetStatus = 'running' | 'progressing' | 'failed'

export interface ReplicaSet {
  name: string
  namespace: string
  status: ReplicaSetStatus
  desired: number
  current: number
  ready: number
  age: string
  ownerReferences?: OwnerReference[]
  owner?: { kind: string; name: string }
}

export type JobStatus = 'complete' | 'running' | 'failed'

export interface Job {
  name: string
  namespace: string
  status: JobStatus
  completions: string
  duration: string
  age: string
  ownerReferences?: OwnerReference[]
  succeeded?: number
  images?: string[]
}

export type CronJobStatus = 'active' | 'suspended'

export interface CronJob {
  name: string
  namespace: string
  status: CronJobStatus
  schedule: string
  lastSchedule: string
  active: number
  age: string
  suspend?: boolean
}

export type ServiceStatus = 'running' | 'pending'

export interface Service {
  name: string
  namespace: string
  status: ServiceStatus
  type: string
  typeBadgeColor: BadgeColor
  clusterIP: string
  ports: string
  age: string
  externalIP: string
  selector: string
  endpointCount: number
}

export type IngressStatus = 'active' | 'warning'

export interface IngressTLS {
  hosts: string[]
  secretName: string
}

export interface IngressPathRule {
  host: string
  path: string
  pathType: string
  backend: string
}

export interface Ingress {
  name: string
  namespace: string
  status: IngressStatus
  class: string
  hosts: string | string[]
  address: string
  ports: string
  age: string
  tls: IngressTLS[]
  rules: IngressPathRule[]
  className?: string
  addresses?: string[]
}

export interface Endpoint {
  name: string
  namespace: string
  endpoints: string | string[]
  age: string
}

export interface NetworkPolicyPort {
  protocol: string
  port: number | string
}

export interface NetworkPolicyPeer {
  cidr?: string
  namespaceSelector?: string
  podSelector?: string
}

export interface NetworkPolicyRule {
  ports: NetworkPolicyPort[]
  peers: NetworkPolicyPeer[]
}

export interface NetworkPolicy {
  name: string
  namespace: string
  podSelector: string | Record<string, string>
  policyTypes: string | string[]
  age: string
  ingressRules: NetworkPolicyRule[]
  egressRules: NetworkPolicyRule[]
}

export interface ConfigMap {
  name: string
  namespace: string
  dataCount: number
  dataKeys?: number
  age: string
}

export interface Secret {
  name: string
  namespace: string
  type: string
  dataCount: number
  dataKeys?: number
  age: string
}

export type HPAStatus = 'running' | 'scaling' | 'limited'

export interface HPA {
  name: string
  namespace: string
  status: HPAStatus
  reference: string
  targets: string
  minPods: number
  maxPods: number
  replicas: number
  age: string
  minReplicas?: number
  maxReplicas?: number
  metrics?: string[]
}

export type PVCStatus = 'bound' | 'pending' | 'lost'

export interface PVC {
  name: string
  namespace: string
  status: PVCStatus
  storageClass: string
  size: string
  accessModes: string | string[]
  volume: string
  age: string
  requestedCapacity: string
  actualCapacity: string
  mountedBy: string[]
  capacity?: string
  volumeName?: string
}

export type PVStatus = 'bound' | 'available' | 'released' | 'failed'

export interface PV {
  name: string
  capacity: string
  accessModes: string | string[]
  reclaimPolicy: string
  status: PVStatus
  storageClass: string
  claim: string
  age: string
  claimRef?: { namespace: string; name: string }
}

export interface StorageClass {
  name: string
  provisioner: string
  reclaimPolicy: string
  volumeBindingMode: string
  allowExpansion: boolean
  age: string
  isDefault?: boolean
}

export type NamespaceItemStatus = 'active' | 'terminating'

export interface NamespaceItem {
  name: string
  status: NamespaceItemStatus
  labels: string | Record<string, string>
  age: string
}

export type HelmReleaseStatus = 'deployed' | 'failed' | 'pending-upgrade'

export interface HelmRelease {
  name: string
  namespace: string
  status: HelmReleaseStatus
  chart: string
  appVersion: string
  revision: number
  updated: string
  age: string
}

export interface RBACRule {
  apiGroups: string[]
  resources: string[]
  verbs: string[]
  resourceNames?: string[]
}

export interface Role {
  name: string
  namespace: string
  age: string
  rules: RBACRule[]
  ruleCount?: number
}

export interface ClusterRole {
  name: string
  age: string
  rules: RBACRule[]
  ruleCount?: number
}

export interface RoleBinding {
  name: string
  namespace: string
  role: string
  subjects: string | Array<{ kind: string; name: string }>
  age: string
  roleRef?: { kind: string; name: string }
}

export interface ClusterRoleBinding {
  name: string
  role: string
  subjects: string | Array<{ kind: string; name: string }>
  age: string
  roleRef?: { kind: string; name: string }
}

export interface ServiceAccount {
  name: string
  namespace: string
  secrets: number
  imagePullSecrets: string
  automountToken: boolean
  iamRole: string
  age: string
}

export interface ResourceQuota {
  name: string
  namespace: string
  cpuHard: string
  cpuUsed: string
  cpuPercent: number
  memoryHard: string
  memoryUsed: string
  memoryPercent: number
  podsHard: number
  podsUsed: number
  podsPercent: number
  age: string
}

export type LimitRangeType = 'Container' | 'Pod' | 'PersistentVolumeClaim'

export interface LimitRange {
  name: string
  namespace: string
  type: LimitRangeType
  defaultLimit: string
  defaultRequest: string
  max: string
  min: string
  age: string
}

export type CRDScope = 'Namespaced' | 'Cluster'

export interface CRD {
  name: string
  group: string
  kind: string
  scope: CRDScope
  versions: string
  version?: string
  established: boolean
  namesAccepted: boolean
  age: string
}

export interface PDB {
  name: string
  namespace: string
  minAvailable: string
  maxUnavailable: string
  currentHealthy: number
  desiredHealthy: number
  disruptionsAllowed: number
  age: string
  allowedDisruptions?: number
}

export interface PriorityClass {
  name: string
  value: number
  globalDefault: boolean
  description: string
  age: string
}
