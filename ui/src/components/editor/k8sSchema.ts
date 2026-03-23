/**
 * Basic Kubernetes field schemas for common resources.
 * Used for YAML validation (unknown top-level fields) and autocomplete.
 */

export interface K8sFieldDef {
  /** Human-readable description shown in autocomplete */
  description: string
  /** Suggested value snippet (Monaco insert text) */
  snippet?: string
}

/** Top-level fields shared by all K8s resources */
const commonFields: Record<string, K8sFieldDef> = {
  apiVersion: { description: 'API version (e.g. v1, apps/v1)', snippet: 'apiVersion: $1' },
  kind: { description: 'Resource kind (e.g. Deployment, Service)', snippet: 'kind: $1' },
  metadata: { description: 'Standard object metadata', snippet: 'metadata:\n  name: $1\n  namespace: ${2:default}' },
  spec: { description: 'Resource specification', snippet: 'spec:\n  $1' },
  status: { description: 'Resource status (read-only)' },
}

/** Per-kind allowed top-level fields (in addition to common) */
const kindSpecificFields: Record<string, Record<string, K8sFieldDef>> = {
  Deployment: {
    ...commonFields,
  },
  Service: {
    ...commonFields,
  },
  Pod: {
    ...commonFields,
  },
  ConfigMap: {
    ...commonFields,
    data: { description: 'Key-value data entries', snippet: 'data:\n  $1: $2' },
    binaryData: { description: 'Binary data entries (base64-encoded)' },
    immutable: { description: 'If true, this ConfigMap is immutable' },
  },
  Secret: {
    ...commonFields,
    data: { description: 'Base64-encoded secret data', snippet: 'data:\n  $1: $2' },
    stringData: { description: 'Plain-text secret data (auto-encoded)', snippet: 'stringData:\n  $1: $2' },
    type: { description: 'Secret type (e.g. Opaque, kubernetes.io/tls)', snippet: 'type: $1' },
    immutable: { description: 'If true, this Secret is immutable' },
  },
}

/** spec-level fields per kind for deeper autocomplete */
const specFields: Record<string, Record<string, K8sFieldDef>> = {
  Deployment: {
    replicas: { description: 'Number of desired pod replicas', snippet: 'replicas: $1' },
    selector: { description: 'Label selector for pods', snippet: 'selector:\n  matchLabels:\n    $1: $2' },
    template: { description: 'Pod template specification', snippet: 'template:\n  metadata:\n    labels:\n      $1: $2\n  spec:\n    containers:\n    - name: $3\n      image: $4' },
    strategy: { description: 'Deployment update strategy', snippet: 'strategy:\n  type: ${1|RollingUpdate,Recreate|}' },
    minReadySeconds: { description: 'Minimum seconds a pod is ready before available' },
    revisionHistoryLimit: { description: 'Number of old ReplicaSets to retain' },
    paused: { description: 'Indicates the deployment is paused' },
    progressDeadlineSeconds: { description: 'Max seconds for deployment to make progress' },
  },
  Service: {
    type: { description: 'Service type', snippet: 'type: ${1|ClusterIP,NodePort,LoadBalancer,ExternalName|}' },
    selector: { description: 'Label selector for target pods', snippet: 'selector:\n  $1: $2' },
    ports: { description: 'Service port definitions', snippet: 'ports:\n- port: $1\n  targetPort: $2\n  protocol: ${3:TCP}' },
    clusterIP: { description: 'Cluster-internal IP address' },
    externalIPs: { description: 'List of external IP addresses' },
    sessionAffinity: { description: 'Session affinity type (None or ClientIP)' },
    loadBalancerIP: { description: 'IP for LoadBalancer type' },
    externalTrafficPolicy: { description: 'External traffic routing policy' },
    internalTrafficPolicy: { description: 'Internal traffic routing policy' },
  },
  Pod: {
    containers: { description: 'List of containers in the pod', snippet: 'containers:\n- name: $1\n  image: $2' },
    initContainers: { description: 'Init containers run before app containers' },
    volumes: { description: 'Pod-level storage volumes', snippet: 'volumes:\n- name: $1' },
    restartPolicy: { description: 'Pod restart policy', snippet: 'restartPolicy: ${1|Always,OnFailure,Never|}' },
    serviceAccountName: { description: 'Name of the ServiceAccount' },
    nodeSelector: { description: 'Node selection constraints', snippet: 'nodeSelector:\n  $1: $2' },
    tolerations: { description: 'Pod tolerations for taints' },
    affinity: { description: 'Pod scheduling affinity rules' },
    dnsPolicy: { description: 'DNS policy for the pod' },
    hostNetwork: { description: 'Use the host network namespace' },
    securityContext: { description: 'Pod-level security context' },
    terminationGracePeriodSeconds: { description: 'Grace period for pod termination' },
  },
}

/** metadata-level fields for autocomplete */
const metadataFields: Record<string, K8sFieldDef> = {
  name: { description: 'Resource name', snippet: 'name: $1' },
  namespace: { description: 'Resource namespace', snippet: 'namespace: ${1:default}' },
  labels: { description: 'Key-value labels', snippet: 'labels:\n  $1: $2' },
  annotations: { description: 'Key-value annotations', snippet: 'annotations:\n  $1: $2' },
  generateName: { description: 'Name prefix for server-generated names' },
  finalizers: { description: 'List of finalizers' },
  ownerReferences: { description: 'Owner reference list' },
}

/**
 * Returns the set of valid top-level field names for a given kind.
 * Falls back to commonFields if the kind is unknown.
 */
export function getTopLevelFields(kind: string): Record<string, K8sFieldDef> {
  return kindSpecificFields[kind] ?? commonFields
}

/**
 * Returns spec-level fields for a given kind.
 */
export function getSpecFields(kind: string): Record<string, K8sFieldDef> {
  return specFields[kind] ?? {}
}

/**
 * Returns metadata-level fields.
 */
export function getMetadataFields(): Record<string, K8sFieldDef> {
  return metadataFields
}

/**
 * Given a YAML document string, extract the `kind` value.
 */
export function extractKind(yamlText: string): string {
  const match = yamlText.match(/^kind:\s*(\S+)/m)
  return match?.[1] ?? ''
}

/**
 * Validates top-level fields against the known schema for the document's kind.
 * Returns an array of diagnostics for unknown fields.
 */
export function validateTopLevelFields(
  yamlText: string
): { line: number; field: string }[] {
  const kind = extractKind(yamlText)
  if (!kind) return [] // Can't validate without a kind

  const validFields = getTopLevelFields(kind)
  const diagnostics: { line: number; field: string }[] = []
  const lines = yamlText.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Top-level field: starts at column 0, has format "fieldName:" (not indented, not a comment, not a separator)
    const match = line.match(/^([a-zA-Z][a-zA-Z0-9_]*):\s*/)
    if (match) {
      const fieldName = match[1]
      if (!(fieldName in validFields)) {
        diagnostics.push({ line: i + 1, field: fieldName })
      }
    }
  }

  return diagnostics
}
