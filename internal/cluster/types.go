package cluster

import "time"

// ContextInfo is the frontend-friendly representation of a kubeconfig context.
type ContextInfo struct {
	Name         string `json:"name"`
	Cluster      string `json:"cluster"`
	Namespace    string `json:"namespace"`
	AuthInfo     string `json:"authInfo"`
	Server       string `json:"server"`
	IsCurrent    bool   `json:"isCurrent"`
	AuthType     string `json:"authType"`
	AuthProvider string `json:"authProvider"` // "eks", "gke", "aks", "minikube", "kind", "docker-desktop", "rancher-desktop", "generic"
}

// ClusterInfo holds display metadata about a cluster.
type ClusterInfo struct {
	Name     string `json:"name"`
	Context  string `json:"context"`
	Server   string `json:"server"`
	Platform string `json:"platform"` // "eks", "gke", "aks", "openshift", "k3s", "vanilla"
}

// ConnectionState represents the lifecycle state of a cluster connection.
type ConnectionState string

const (
	StateDisconnected ConnectionState = "disconnected"
	StateConnecting   ConnectionState = "connecting"
	StateConnected    ConnectionState = "connected"
	StateReconnecting ConnectionState = "reconnecting"
	StateError        ConnectionState = "error"
)

// ConnectionSnapshot is a JSON-safe snapshot of a ClusterConnection for the frontend.
type ConnectionSnapshot struct {
	Info        ClusterInfo     `json:"info"`
	State       ConnectionState `json:"state"`
	Error       string          `json:"error,omitempty"`
	Version     string          `json:"version,omitempty"`
	NodeCount   int             `json:"nodeCount"`
	Platform    string          `json:"platform"`
	EnabledAPIs []string        `json:"enabledAPIs"`
	ConnectedAt *time.Time      `json:"connectedAt,omitempty"`
	Latency     int64           `json:"latencyMs"`
}

// WatchEvent is emitted to the frontend when a resource changes.
type WatchEvent struct {
	ClusterID string      `json:"clusterId"`
	GVR       string      `json:"gvr"`
	Type      string      `json:"type"` // "ADDED", "MODIFIED", "DELETED"
	Object    interface{} `json:"object"`
}

// ResourceSummary is a trimmed, frontend-friendly representation of a K8s resource.
type ResourceSummary struct {
	Name              string            `json:"name"`
	Namespace         string            `json:"namespace"`
	Kind              string            `json:"kind"`
	APIVersion        string            `json:"apiVersion"`
	UID               string            `json:"uid"`
	ResourceVersion   string            `json:"resourceVersion"`
	CreationTimestamp string            `json:"creationTimestamp"`
	Labels            map[string]string `json:"labels,omitempty"`
	Annotations       map[string]string `json:"annotations,omitempty"`
	Status            map[string]interface{} `json:"status,omitempty"`
	Spec              map[string]interface{} `json:"spec,omitempty"`
	Raw               interface{}            `json:"raw,omitempty"`
	OwnerReferences   []OwnerRef             `json:"ownerReferences,omitempty"`
}

// OwnerRef is a simplified owner reference.
type OwnerRef struct {
	APIVersion string `json:"apiVersion"`
	Kind       string `json:"kind"`
	Name       string `json:"name"`
	UID        string `json:"uid"`
}

// HealthStatus represents the health of a cluster connection.
type HealthStatus string

const (
	HealthGreen  HealthStatus = "green"
	HealthYellow HealthStatus = "yellow"
	HealthRed    HealthStatus = "red"
)

// HealthEvent is emitted on every health check cycle.
type HealthEvent struct {
	ClusterID string       `json:"clusterId"`
	Status    HealthStatus `json:"status"`
	LatencyMs int64        `json:"latencyMs"`
	Error     string       `json:"error,omitempty"`
}

// MetricsSnapshot holds point-in-time CPU/memory metrics.
type MetricsSnapshot struct {
	Timestamp   time.Time            `json:"timestamp"`
	NodeMetrics []NodeMetricsSummary `json:"nodeMetrics"`
	PodMetrics  []PodMetricsSummary  `json:"podMetrics,omitempty"`
	ClusterCPU  ResourceUsage        `json:"clusterCPU"`
	ClusterMem  ResourceUsage        `json:"clusterMemory"`
}

// NodeMetricsSummary is a per-node metric snapshot.
type NodeMetricsSummary struct {
	Name       string        `json:"name"`
	CPU        ResourceUsage `json:"cpu"`
	Memory     ResourceUsage `json:"memory"`
	PodCount   int           `json:"podCount"`
	Conditions []string      `json:"conditions,omitempty"`
}

// PodMetricsSummary is a per-pod metric snapshot.
type PodMetricsSummary struct {
	Name       string                    `json:"name"`
	Namespace  string                    `json:"namespace"`
	Containers []ContainerMetricsSummary `json:"containers"`
}

// ContainerMetricsSummary is a per-container metric snapshot.
type ContainerMetricsSummary struct {
	Name   string `json:"name"`
	CPUm   int64  `json:"cpuMillicores"`
	MemMiB int64  `json:"memoryMiB"`
}

// ResourceUsage tracks used vs capacity for a resource dimension.
type ResourceUsage struct {
	UsedMillis     int64   `json:"usedMillis"`
	CapacityMillis int64   `json:"capacityMillis"`
	Percentage     float64 `json:"percentage"`
}

// RBACCheckResult holds the result of a permission check.
type RBACCheckResult struct {
	Allowed   bool   `json:"allowed"`
	Reason    string `json:"reason,omitempty"`
	Verb      string `json:"verb"`
	Resource  string `json:"resource"`
	Namespace string `json:"namespace,omitempty"`
}

// ClusterSummary is returned by the overview endpoint.
type ClusterSummary struct {
	NodeCount        int                `json:"nodeCount"`
	NodeReady        int                `json:"nodeReady"`
	PodCount         int                `json:"podCount"`
	PodRunning       int                `json:"podRunning"`
	DeploymentCount  int                `json:"deploymentCount"`
	DeploymentReady  int                `json:"deploymentReady"`
	ServiceCount     int                `json:"serviceCount"`
	ServiceLB        int                `json:"serviceLB"`
	NamespaceSummary []NamespaceSummary `json:"namespaceSummary"`
}

// NamespaceSummary holds per-namespace resource counts.
type NamespaceSummary struct {
	Name     string `json:"name"`
	PodCount int    `json:"podCount"`
}

// PodUsage holds aggregated CPU/memory usage for a pod.
type PodUsage struct {
	PodName   string  `json:"podName"`
	Namespace string  `json:"namespace"`
	CPUCores  float64 `json:"cpuCores"`
	MemoryMiB int64   `json:"memoryMiB"`
}

// NodeUsage holds aggregated CPU/memory usage for a node.
type NodeUsage struct {
	NodeName  string  `json:"nodeName"`
	CPUCores  float64 `json:"cpuCores"`
	MemoryMiB int64   `json:"memoryMiB"`
}

// ResourceRelationship represents a link between two resources.
type ResourceRelationship struct {
	SourceKind      string `json:"sourceKind"`
	SourceName      string `json:"sourceName"`
	SourceNamespace string `json:"sourceNamespace"`
	TargetKind      string `json:"targetKind"`
	TargetName      string `json:"targetName"`
	TargetNamespace string `json:"targetNamespace"`
	RelationType    string `json:"relationType"` // "owner", "selector", "mount", "binding"
}
