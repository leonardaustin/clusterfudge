# Phase 3 — Core Kubernetes Backend

## Goal

Fully functional Go backend that connects to real clusters, lists/watches all resource types, parses kubeconfig files with all auth mechanisms, maintains a shared informer cache, checks RBAC permissions, fetches metrics, and maps resource relationships. Every section below contains complete, runnable code — no stubs.

---

## Table of Contents

1. [Kubeconfig Parsing & Context Management](#31--kubeconfig-parsing--context-management)
2. [Cluster Connection Manager](#32--cluster-connection-manager)
3. [Error Types & Handling](#33--error-types--handling)
4. [SharedInformer Cache Layer](#34--sharedinformer-cache-layer)
5. [Dynamic Client for CRDs](#35--dynamic-client-for-crds)
6. [Resource Relationship Mapping](#36--resource-relationship-mapping)
7. [RBAC Permission Checking](#37--rbac-permission-checking)
8. [Metrics Integration](#38--metrics-integration)
9. [Resource CRUD Operations](#39--resource-crud-operations)
10. [Event System](#310--event-system)
11. [Unit Tests](#311--unit-tests)

---

## 3.1 — Kubeconfig Parsing & Context Management

### Overview

The kubeconfig subsystem is responsible for discovering, loading, merging, and
watching kubeconfig files. It must handle:

- `$KUBECONFIG` environment variable with multiple colon-separated paths
- Default `~/.kube/config` fallback
- In-cluster service account token detection
- All authentication mechanisms: certificates, tokens, exec plugins (EKS, GKE),
  OIDC, basic auth
- Atomic file renames from editors and `kubectl`
- Live reloading when kubeconfig changes on disk

### `internal/cluster/types.go`

```go
package cluster

import "time"

// ContextInfo is the frontend-friendly representation of a kubeconfig context.
type ContextInfo struct {
	Name      string `json:"name"`
	Cluster   string `json:"cluster"`
	Namespace string `json:"namespace"`
	AuthInfo  string `json:"authInfo"`
	Server    string `json:"server"`
	IsCurrent bool   `json:"isCurrent"`
	// AuthType: "exec", "oidc", "gcp", "azure", "certificate", "token", "basic", "unknown"
	AuthType string `json:"authType"`
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
	Latency     int64           `json:"latencyMs"` // last health-check round-trip ms
}

// WatchEvent is emitted to the frontend when a resource changes.
type WatchEvent struct {
	ClusterID string      `json:"clusterId"`
	GVR       string      `json:"gvr"` // "apps/v1/deployments"
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
	// Status is a kind-specific flattened status summary.
	Status map[string]interface{} `json:"status,omitempty"`
	// Spec is a kind-specific flattened spec summary.
	Spec map[string]interface{} `json:"spec,omitempty"`
	// Raw is the full unstructured object, included only when explicitly requested.
	Raw interface{} `json:"raw,omitempty"`
	// OwnerReferences for relationship mapping.
	OwnerReferences []OwnerRef `json:"ownerReferences,omitempty"`
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
	Timestamp    time.Time            `json:"timestamp"`
	NodeMetrics  []NodeMetricsSummary `json:"nodeMetrics"`
	PodMetrics   []PodMetricsSummary  `json:"podMetrics,omitempty"`
	ClusterCPU   ResourceUsage        `json:"clusterCPU"`
	ClusterMem   ResourceUsage        `json:"clusterMemory"`
}

// NodeMetricsSummary is a per-node metric snapshot.
type NodeMetricsSummary struct {
	Name      string        `json:"name"`
	CPU       ResourceUsage `json:"cpu"`
	Memory    ResourceUsage `json:"memory"`
	PodCount  int           `json:"podCount"`
	Conditions []string     `json:"conditions,omitempty"`
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
	Allowed bool   `json:"allowed"`
	Reason  string `json:"reason,omitempty"`
	Verb    string `json:"verb"`
	Resource string `json:"resource"`
	Namespace string `json:"namespace,omitempty"`
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
```

### `internal/cluster/kubeconfig.go`

```go
package cluster

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"
)

// KubeconfigLoader discovers, merges, and parses kubeconfig files.
// Precedence: $KUBECONFIG entries (left-to-right) -> ~/.kube/config -> in-cluster.
type KubeconfigLoader struct {
	paths []string
}

// NewKubeconfigLoader discovers all kubeconfig file paths.
func NewKubeconfigLoader() *KubeconfigLoader {
	return &KubeconfigLoader{paths: kubeconfigPaths()}
}

// NewKubeconfigLoaderFromPaths creates a loader with explicit paths.
// Used when the user adds a custom kubeconfig file via the UI.
func NewKubeconfigLoaderFromPaths(paths []string) *KubeconfigLoader {
	return &KubeconfigLoader{paths: paths}
}

// Paths returns the list of kubeconfig file paths being used.
func (l *KubeconfigLoader) Paths() []string {
	return l.paths
}

// AddPath appends a kubeconfig file path and reloads.
func (l *KubeconfigLoader) AddPath(path string) {
	for _, existing := range l.paths {
		if existing == path {
			return
		}
	}
	l.paths = append(l.paths, path)
}

// kubeconfigPaths returns an ordered list of kubeconfig files to merge.
// If $KUBECONFIG is set, it is split on the OS path-list separator.
// Otherwise the default ~/.kube/config is used.
func kubeconfigPaths() []string {
	if env := os.Getenv("KUBECONFIG"); env != "" {
		parts := strings.Split(env, string(os.PathListSeparator))
		var valid []string
		for _, p := range parts {
			p = strings.TrimSpace(p)
			if p != "" {
				valid = append(valid, p)
			}
		}
		if len(valid) > 0 {
			return valid
		}
	}
	home, _ := os.UserHomeDir()
	return []string{filepath.Join(home, ".kube", "config")}
}

// Load merges all kubeconfig files using the standard client-go merge rules:
//  1. Leftmost file wins for conflicting keys.
//  2. currentContext from the first file that sets it wins.
func (l *KubeconfigLoader) Load() (*api.Config, error) {
	rules := &clientcmd.ClientConfigLoadingRules{
		Precedence:     l.paths,
		MigrationRules: clientcmd.NewDefaultClientConfigLoadingRules().MigrationRules,
	}
	cfg, err := rules.Load()
	if err != nil {
		return nil, fmt.Errorf("kubeconfig load: %w", err)
	}
	return cfg, nil
}

// ListContexts returns all contexts from the merged kubeconfig.
func (l *KubeconfigLoader) ListContexts() ([]ContextInfo, error) {
	cfg, err := l.Load()
	if err != nil {
		return nil, err
	}

	var out []ContextInfo
	for name, ctx := range cfg.Contexts {
		server := ""
		if cluster, ok := cfg.Clusters[ctx.Cluster]; ok {
			server = cluster.Server
		}
		authType := authTypeFor(cfg, ctx.AuthInfo)
		out = append(out, ContextInfo{
			Name:      name,
			Cluster:   ctx.Cluster,
			Namespace: ctx.Namespace,
			AuthInfo:  ctx.AuthInfo,
			Server:    server,
			IsCurrent: name == cfg.CurrentContext,
			AuthType:  authType,
		})
	}
	return out, nil
}

// authTypeFor classifies the auth mechanism used by an authInfo entry.
func authTypeFor(cfg *api.Config, authName string) string {
	ai, ok := cfg.AuthInfos[authName]
	if !ok {
		return "unknown"
	}
	switch {
	case ai.Exec != nil:
		return "exec"
	case ai.AuthProvider != nil:
		return ai.AuthProvider.Name // "oidc", "gcp", "azure", etc.
	case ai.Token != "" || ai.TokenFile != "":
		return "token"
	case ai.ClientCertificate != "" || len(ai.ClientCertificateData) > 0:
		return "certificate"
	case ai.Username != "":
		return "basic"
	}
	return "unknown"
}

// RestConfigForContext creates a rest.Config for a specific context, supporting
// all auth mechanisms: exec plugins (aws-iam-authenticator, gke-gcloud-auth-plugin),
// OIDC (auto-refreshed by client-go), certificates, tokens, basic auth.
func (l *KubeconfigLoader) RestConfigForContext(contextName string) (*rest.Config, error) {
	rules := &clientcmd.ClientConfigLoadingRules{Precedence: l.paths}
	overrides := &clientcmd.ConfigOverrides{
		CurrentContext: contextName,
	}
	cc := clientcmd.NewNonInteractiveDeferringClientConfig(rules, overrides)
	cfg, err := cc.ClientConfig()
	if err != nil {
		return nil, fmt.Errorf("build rest.Config for context %q: %w", contextName, err)
	}
	// 0 means no global timeout; use per-request contexts instead.
	cfg.Timeout = 0
	// Increase QPS/Burst for informer-heavy workloads.
	cfg.QPS = 50
	cfg.Burst = 100
	return cfg, nil
}

// RestConfigForContextWithRateLimits creates a rest.Config with custom rate limits.
// Use this when you need fine-grained control, such as for background polling
// goroutines that should not starve interactive requests.
func (l *KubeconfigLoader) RestConfigForContextWithRateLimits(
	contextName string, qps float32, burst int,
) (*rest.Config, error) {
	cfg, err := l.RestConfigForContext(contextName)
	if err != nil {
		return nil, err
	}
	cfg.QPS = qps
	cfg.Burst = burst
	return cfg, nil
}

// InClusterRestConfig returns a rest.Config using the pod's mounted service-account token.
// Returns an error if not running inside a Kubernetes pod.
func InClusterRestConfig() (*rest.Config, error) {
	cfg, err := rest.InClusterConfig()
	if err != nil {
		return nil, fmt.Errorf("in-cluster config: %w", err)
	}
	cfg.QPS = 50
	cfg.Burst = 100
	return cfg, nil
}

// IsRunningInCluster returns true when the process is inside a Kubernetes pod.
func IsRunningInCluster() bool {
	_, errToken := os.Stat("/var/run/secrets/kubernetes.io/serviceaccount/token")
	_, errCA := os.Stat("/var/run/secrets/kubernetes.io/serviceaccount/ca.crt")
	return errToken == nil && errCA == nil
}

// ValidateContext checks that a context's cluster and user entries are present
// and returns a descriptive error if anything is missing.
func (l *KubeconfigLoader) ValidateContext(contextName string) error {
	cfg, err := l.Load()
	if err != nil {
		return err
	}
	ctx, ok := cfg.Contexts[contextName]
	if !ok {
		return fmt.Errorf("context %q not found in kubeconfig", contextName)
	}
	if ctx.Cluster == "" {
		return fmt.Errorf("context %q has no cluster reference", contextName)
	}
	cluster, ok := cfg.Clusters[ctx.Cluster]
	if !ok {
		return fmt.Errorf("cluster %q referenced by context %q not found", ctx.Cluster, contextName)
	}
	if cluster.Server == "" {
		return fmt.Errorf("cluster %q has no server URL", ctx.Cluster)
	}
	if ctx.AuthInfo != "" {
		if _, ok := cfg.AuthInfos[ctx.AuthInfo]; !ok {
			return fmt.Errorf("user %q referenced by context %q not found", ctx.AuthInfo, contextName)
		}
	}
	return nil
}

// DetectExecPlugin returns the exec plugin command name for the given context,
// or "" if it does not use exec-based auth.
// This is useful for showing the user which external tool is being called
// (e.g., "aws-iam-authenticator", "gke-gcloud-auth-plugin").
func (l *KubeconfigLoader) DetectExecPlugin(contextName string) (string, error) {
	cfg, err := l.Load()
	if err != nil {
		return "", err
	}
	ctx, ok := cfg.Contexts[contextName]
	if !ok {
		return "", fmt.Errorf("context %q not found", contextName)
	}
	ai, ok := cfg.AuthInfos[ctx.AuthInfo]
	if !ok || ai.Exec == nil {
		return "", nil
	}
	return ai.Exec.Command, nil
}
```

### `internal/cluster/kubeconfig_watcher.go`

```go
package cluster

import (
	"context"
	"fmt"
	"log/slog"
	"path/filepath"
	"time"

	"github.com/fsnotify/fsnotify"
	"k8s.io/client-go/tools/clientcmd/api"
)

// KubeconfigWatcher watches kubeconfig files for changes and triggers a reload.
// It debounces rapid writes (editors often do a write+rename atomically).
type KubeconfigWatcher struct {
	loader   *KubeconfigLoader
	watcher  *fsnotify.Watcher
	onChange func(*api.Config)
}

// NewKubeconfigWatcher creates a watcher that calls onChange whenever any
// kubeconfig file (or its parent directory) changes.
func NewKubeconfigWatcher(loader *KubeconfigLoader, onChange func(*api.Config)) (*KubeconfigWatcher, error) {
	w, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, fmt.Errorf("create fsnotify watcher: %w", err)
	}

	added := map[string]bool{}
	for _, path := range loader.paths {
		// Watch the file itself (works when it exists).
		if err := w.Add(path); err == nil {
			added[path] = true
		}
		// Also watch the parent directory to catch atomic renames used by editors
		// and kubectl. kubectl writes to a temp file then renames it.
		dir := filepath.Dir(path)
		if !added[dir] {
			if err := w.Add(dir); err == nil {
				added[dir] = true
			}
		}
	}

	return &KubeconfigWatcher{loader: loader, watcher: w, onChange: onChange}, nil
}

// Start begins watching in a background goroutine. It stops when ctx is cancelled.
func (w *KubeconfigWatcher) Start(ctx context.Context) {
	go func() {
		defer w.watcher.Close()

		// Debounce timer -- reset each time we see a relevant event.
		debounce := time.NewTimer(0)
		<-debounce.C // drain the initial zero-duration tick

		for {
			select {
			case <-ctx.Done():
				debounce.Stop()
				return

			case event, ok := <-w.watcher.Events:
				if !ok {
					return
				}
				if event.Op&(fsnotify.Write|fsnotify.Create|fsnotify.Rename|fsnotify.Remove) != 0 {
					if w.isWatchedPath(event.Name) {
						if !debounce.Stop() {
							select {
							case <-debounce.C:
							default:
							}
						}
						debounce.Reset(250 * time.Millisecond)
					}
				}

			case err, ok := <-w.watcher.Errors:
				if !ok {
					return
				}
				slog.Warn("kubeconfig watcher error", "err", err)

			case <-debounce.C:
				cfg, err := w.loader.Load()
				if err != nil {
					slog.Warn("kubeconfig reload failed", "err", err)
					continue
				}
				slog.Info("kubeconfig reloaded")
				w.onChange(cfg)
			}
		}
	}()
}

// isWatchedPath returns true if the given filesystem path corresponds to one
// of the kubeconfig files we are monitoring.
func (w *KubeconfigWatcher) isWatchedPath(name string) bool {
	for _, p := range w.loader.paths {
		if name == p || filepath.Dir(name) == filepath.Dir(p) {
			return true
		}
	}
	return false
}
```

---

## 3.2 — Cluster Connection Manager

### Overview

The Cluster Manager is the central hub for all cluster connections. It manages
the full lifecycle state machine:

```
disconnected --> connecting --> connected --> (error) --> reconnecting --> connected
                     |                            |                          |
                     v                            v                          v
                   error                    disconnected              disconnected
```

Each cluster connection holds:
- A `ClientBundle` with typed, dynamic, discovery, and metrics clients
- A background health-check goroutine with exponential backoff
- Metadata about the cluster (version, platform, node count, API groups)
- A cancel function to cleanly tear down all goroutines

### `internal/cluster/client_bundle.go`

```go
package cluster

import (
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	metricsv "k8s.io/metrics/pkg/client/clientset/versioned"
)

// ClientBundle holds all client variants for a single cluster connection.
// All fields except Metrics are guaranteed to be non-nil when the connection
// is in StateConnected. Metrics is nil if metrics-server is not available.
type ClientBundle struct {
	// Typed provides strongly typed access to core and extension API groups.
	Typed kubernetes.Interface

	// Dynamic provides unstructured access to any API resource, including CRDs.
	Dynamic dynamic.Interface

	// Discovery provides access to server API group and resource discovery.
	Discovery discovery.DiscoveryInterface

	// Metrics provides access to the metrics.k8s.io API (metrics-server).
	// This is nil if metrics-server is not installed in the cluster.
	Metrics metricsv.Interface

	// Config is the underlying REST configuration. Useful for building
	// additional clients (e.g., for SPDY exec streams).
	Config *rest.Config
}

// HasMetrics returns true if the metrics-server client is available.
func (b *ClientBundle) HasMetrics() bool {
	return b.Metrics != nil
}
```

### `internal/cluster/connection.go`

```go
package cluster

import (
	"context"
	"sync"
	"time"
)

// ClusterConnection is the full runtime state for one connected cluster.
type ClusterConnection struct {
	mu          sync.RWMutex
	Info        ClusterInfo     `json:"info"`
	State       ConnectionState `json:"state"`
	Error       string          `json:"error,omitempty"`
	Version     string          `json:"version,omitempty"`
	NodeCount   int             `json:"nodeCount"`
	Platform    string          `json:"platform"`
	EnabledAPIs []string        `json:"enabledAPIs"`
	ConnectedAt *time.Time      `json:"connectedAt,omitempty"`
	LastLatency int64           `json:"lastLatencyMs"`
	clients     *ClientBundle
	cancelFn    context.CancelFunc
}

// GetClients safely returns the ClientBundle.
func (c *ClusterConnection) GetClients() *ClientBundle {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.clients
}

// setState updates the connection state and optional error message.
func (c *ClusterConnection) setState(state ConnectionState, errMsg string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.State = state
	c.Error = errMsg
}

// Snapshot returns a copy of the connection state safe for JSON serialization.
func (c *ClusterConnection) Snapshot() ConnectionSnapshot {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return ConnectionSnapshot{
		Info:        c.Info,
		State:       c.State,
		Error:       c.Error,
		Version:     c.Version,
		NodeCount:   c.NodeCount,
		Platform:    c.Platform,
		EnabledAPIs: c.EnabledAPIs,
		ConnectedAt: c.ConnectedAt,
		Latency:     c.LastLatency,
	}
}
```

### `internal/cluster/manager.go`

```go
package cluster

import (
	"context"
	"fmt"
	"log/slog"
	"math"
	"strings"
	"sync"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	metricsv "k8s.io/metrics/pkg/client/clientset/versioned"
)

// Manager tracks multiple cluster connections concurrently.
type Manager struct {
	mu          sync.RWMutex
	loader      *KubeconfigLoader
	connections map[string]*ClusterConnection // keyed by context name
	active      string
	onUpdate    func(string, ConnectionSnapshot) // (contextName, snapshot)
}

// NewManager creates a Manager with an auto-detected kubeconfig loader.
func NewManager() *Manager {
	return &Manager{
		loader:      NewKubeconfigLoader(),
		connections: make(map[string]*ClusterConnection),
	}
}

// NewManagerWithLoader creates a Manager with a specific kubeconfig loader.
func NewManagerWithLoader(loader *KubeconfigLoader) *Manager {
	return &Manager{
		loader:      loader,
		connections: make(map[string]*ClusterConnection),
	}
}

// Loader returns the underlying KubeconfigLoader.
func (m *Manager) Loader() *KubeconfigLoader {
	return m.loader
}

// SetUpdateCallback registers a callback invoked on every state change.
// The callback receives a snapshot copy (safe to read without locking).
func (m *Manager) SetUpdateCallback(fn func(string, ConnectionSnapshot)) {
	m.onUpdate = fn
}

// ActiveContext returns the name of the currently active context.
func (m *Manager) ActiveContext() string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.active
}

// Connect establishes a connection to the named kubeconfig context.
// The call blocks until the initial connection attempt completes.
// A background goroutine then monitors health and reconnects on failure.
func (m *Manager) Connect(ctx context.Context, contextName string) error {
	if err := m.loader.ValidateContext(contextName); err != nil {
		return fmt.Errorf("invalid context: %w", err)
	}

	connCtx, cancel := context.WithCancel(context.Background())

	conn := &ClusterConnection{
		Info:     ClusterInfo{Name: contextName, Context: contextName},
		State:    StateConnecting,
		cancelFn: cancel,
	}

	m.mu.Lock()
	// If an existing connection exists, stop it first.
	if old, ok := m.connections[contextName]; ok {
		old.cancelFn()
	}
	m.connections[contextName] = conn
	m.active = contextName
	m.mu.Unlock()

	m.notify(contextName, conn)

	bundle, meta, err := m.buildClients(ctx, contextName)
	if err != nil {
		conn.setState(StateError, err.Error())
		m.notify(contextName, conn)
		cancel()
		return err
	}

	now := time.Now()
	conn.mu.Lock()
	conn.clients = bundle
	conn.State = StateConnected
	conn.Version = meta.version
	conn.NodeCount = meta.nodeCount
	conn.Platform = meta.platform
	conn.EnabledAPIs = meta.enabledAPIs
	conn.Info.Server = meta.server
	conn.Info.Platform = meta.platform
	conn.ConnectedAt = &now
	conn.mu.Unlock()

	m.notify(contextName, conn)
	slog.Info("cluster connected",
		"context", contextName,
		"version", meta.version,
		"platform", meta.platform,
		"nodes", meta.nodeCount,
	)

	// Start background health-check loop.
	go m.healthLoop(connCtx, contextName, conn)

	return nil
}

// clusterMeta holds discovered metadata fetched during connect.
type clusterMeta struct {
	version     string
	server      string
	nodeCount   int
	platform    string
	enabledAPIs []string
}

// buildClients creates all client types for the given context.
func (m *Manager) buildClients(ctx context.Context, contextName string) (*ClientBundle, clusterMeta, error) {
	cfg, err := m.loader.RestConfigForContext(contextName)
	if err != nil {
		return nil, clusterMeta{}, fmt.Errorf("rest.Config: %w", err)
	}

	typed, err := kubernetes.NewForConfig(cfg)
	if err != nil {
		return nil, clusterMeta{}, fmt.Errorf("typed client: %w", err)
	}

	dyn, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return nil, clusterMeta{}, fmt.Errorf("dynamic client: %w", err)
	}

	// Probe server version -- this is the connectivity check.
	probeCtx, probeCancel := context.WithTimeout(ctx, 15*time.Second)
	defer probeCancel()

	sv, err := typed.Discovery().ServerVersion()
	if err != nil {
		return nil, clusterMeta{}, fmt.Errorf("server version check: %w", err)
	}

	meta := clusterMeta{
		version:  sv.GitVersion,
		server:   cfg.Host,
		platform: detectPlatform(sv.GitVersion),
	}

	// Count nodes.
	nodeList, err := typed.CoreV1().Nodes().List(probeCtx, metav1.ListOptions{Limit: 1000})
	if err == nil {
		meta.nodeCount = len(nodeList.Items)
	}

	// Discover enabled API groups.
	groups, _, _ := typed.Discovery().ServerGroupsAndResources()
	for _, g := range groups {
		meta.enabledAPIs = append(meta.enabledAPIs, g.Name)
	}

	// Try to build a metrics client (optional -- metrics-server may not be installed).
	metricsClient, _ := metricsv.NewForConfig(cfg)

	bundle := &ClientBundle{
		Typed:     typed,
		Dynamic:   dyn,
		Discovery: typed.Discovery(),
		Metrics:   metricsClient,
		Config:    cfg,
	}

	return bundle, meta, nil
}

// detectPlatform inspects the server version string to classify the cluster.
func detectPlatform(gitVersion string) string {
	v := strings.ToLower(gitVersion)
	switch {
	case strings.Contains(v, "-eks-"):
		return "eks"
	case strings.Contains(v, "-gke."):
		return "gke"
	case strings.Contains(v, "aks"):
		return "aks"
	case strings.Contains(v, "+k3s"):
		return "k3s"
	case strings.Contains(v, "+rke"):
		return "rke"
	case strings.Contains(v, "+openshift"):
		return "openshift"
	}
	return "vanilla"
}

// healthLoop runs a periodic API server ping and triggers reconnection on failure.
func (m *Manager) healthLoop(connCtx context.Context, contextName string, conn *ClusterConnection) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-connCtx.Done():
			return
		case <-ticker.C:
			clients := conn.GetClients()
			if clients == nil {
				continue
			}
			checkCtx, checkCancel := context.WithTimeout(connCtx, 10*time.Second)
			start := time.Now()
			_, err := clients.Typed.Discovery().ServerVersion()
			latency := time.Since(start).Milliseconds()
			checkCancel()

			if err != nil {
				slog.Warn("cluster health check failed",
					"context", contextName, "err", err, "latencyMs", latency)
				conn.setState(StateReconnecting, err.Error())
				m.notify(contextName, conn)
				m.reconnectWithBackoff(connCtx, contextName, conn)
				return // reconnectWithBackoff starts a new healthLoop on success
			}

			// Update latency on the connection.
			conn.mu.Lock()
			conn.LastLatency = latency
			conn.mu.Unlock()
		}
	}
}

// reconnectWithBackoff attempts to reconnect using exponential backoff.
// Backoff: 2s, 4s, 8s, ... up to 5 minutes. Stops when connCtx is cancelled.
func (m *Manager) reconnectWithBackoff(connCtx context.Context, contextName string, conn *ClusterConnection) {
	const maxBackoff = 5 * time.Minute

	for attempt := 0; ; attempt++ {
		delay := time.Duration(math.Min(
			float64(maxBackoff),
			float64(2*time.Second)*math.Pow(2, float64(attempt)),
		))
		slog.Info("reconnect attempt",
			"context", contextName, "attempt", attempt+1, "delay", delay)

		select {
		case <-connCtx.Done():
			conn.setState(StateDisconnected, "")
			m.notify(contextName, conn)
			return
		case <-time.After(delay):
		}

		bundle, meta, err := m.buildClients(connCtx, contextName)
		if err != nil {
			slog.Warn("reconnect failed",
				"context", contextName, "attempt", attempt+1, "err", err)
			conn.setState(StateReconnecting, err.Error())
			m.notify(contextName, conn)
			continue
		}

		now := time.Now()
		conn.mu.Lock()
		conn.clients = bundle
		conn.State = StateConnected
		conn.Version = meta.version
		conn.NodeCount = meta.nodeCount
		conn.Platform = meta.platform
		conn.Error = ""
		conn.ConnectedAt = &now
		conn.mu.Unlock()

		m.notify(contextName, conn)
		slog.Info("cluster reconnected", "context", contextName)

		// Start a fresh health-check loop for the new connection.
		go m.healthLoop(connCtx, contextName, conn)
		return
	}
}

// Disconnect closes the connection to a cluster and cancels all watchers.
func (m *Manager) Disconnect(contextName string) {
	m.mu.Lock()
	conn, ok := m.connections[contextName]
	if ok {
		delete(m.connections, contextName)
		if m.active == contextName {
			m.active = ""
		}
	}
	m.mu.Unlock()

	if ok && conn.cancelFn != nil {
		conn.cancelFn()
		conn.setState(StateDisconnected, "")
		m.notify(contextName, conn)
		slog.Info("cluster disconnected", "context", contextName)
	}
}

// SwitchContext changes the active context without disconnecting others.
func (m *Manager) SwitchContext(contextName string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.connections[contextName]; !ok {
		return fmt.Errorf("context %q is not connected", contextName)
	}
	m.active = contextName
	return nil
}

// ActiveClients returns the ClientBundle for the currently active cluster.
func (m *Manager) ActiveClients() (*ClientBundle, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.active == "" {
		return nil, fmt.Errorf("no active cluster")
	}
	conn, ok := m.connections[m.active]
	if !ok {
		return nil, fmt.Errorf("active cluster %q not found", m.active)
	}
	conn.mu.RLock()
	state := conn.State
	clients := conn.clients
	conn.mu.RUnlock()
	if state != StateConnected || clients == nil {
		return nil, fmt.Errorf("cluster %q is not connected (state: %s)", m.active, state)
	}
	return clients, nil
}

// ClientsFor returns the ClientBundle for a specific cluster (may not be active).
func (m *Manager) ClientsFor(contextName string) (*ClientBundle, error) {
	m.mu.RLock()
	conn, ok := m.connections[contextName]
	m.mu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("context %q is not connected", contextName)
	}
	conn.mu.RLock()
	state := conn.State
	clients := conn.clients
	conn.mu.RUnlock()
	if state != StateConnected || clients == nil {
		return nil, fmt.Errorf("cluster %q is not connected (state: %s)", contextName, state)
	}
	return clients, nil
}

// ConnectionFor returns the connection snapshot for a specific context.
func (m *Manager) ConnectionFor(contextName string) (ConnectionSnapshot, error) {
	m.mu.RLock()
	conn, ok := m.connections[contextName]
	m.mu.RUnlock()
	if !ok {
		return ConnectionSnapshot{}, fmt.Errorf("context %q is not connected", contextName)
	}
	return conn.Snapshot(), nil
}

// ListConnections returns a snapshot of all tracked connections.
func (m *Manager) ListConnections() []ConnectionSnapshot {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]ConnectionSnapshot, 0, len(m.connections))
	for _, conn := range m.connections {
		out = append(out, conn.Snapshot())
	}
	return out
}

// IsConnected returns true if the named context is connected.
func (m *Manager) IsConnected(contextName string) bool {
	m.mu.RLock()
	conn, ok := m.connections[contextName]
	m.mu.RUnlock()
	if !ok {
		return false
	}
	conn.mu.RLock()
	defer conn.mu.RUnlock()
	return conn.State == StateConnected
}

// Shutdown gracefully disconnects all clusters.
func (m *Manager) Shutdown() {
	m.mu.Lock()
	names := make([]string, 0, len(m.connections))
	for name := range m.connections {
		names = append(names, name)
	}
	m.mu.Unlock()
	for _, name := range names {
		m.Disconnect(name)
	}
	slog.Info("cluster manager shut down", "disconnected", len(names))
}

// notify sends a snapshot of the connection state to the registered callback.
func (m *Manager) notify(contextName string, conn *ClusterConnection) {
	if m.onUpdate == nil {
		return
	}
	m.onUpdate(contextName, conn.Snapshot())
}
```

---

## 3.3 — Error Types & Handling

### Overview

Every error that crosses the Go-to-frontend boundary must be structured and
user-friendly. The `apierrors` package wraps all Kubernetes API errors, network
errors, and internal errors into a consistent `AppError` type with a machine-
readable code and a human-readable message.

Error codes:
- `CONNECTION_ERROR` — cannot reach the API server (network, DNS, TLS)
- `AUTH_ERROR` — 401 Unauthorized (bad credentials, expired token)
- `FORBIDDEN` — 403 Forbidden (insufficient RBAC permissions)
- `NOT_FOUND` — 404 (resource does not exist)
- `CONFLICT` — 409 (resource version conflict on update)
- `TIMEOUT` — context deadline exceeded or cancelled
- `VALIDATION_ERROR` — 422 Unprocessable Entity (invalid spec)
- `SERVER_ERROR` — 5xx from the API server
- `UNKNOWN` — anything else

### `internal/apierrors/errors.go`

```go
package apierrors

import (
	"context"
	"errors"
	"fmt"
	"net"
	"strings"

	k8serrors "k8s.io/apimachinery/pkg/api/errors"
)

// ErrorCode classifies API errors into categories the frontend understands.
type ErrorCode string

const (
	ErrConnection  ErrorCode = "CONNECTION_ERROR"
	ErrAuth        ErrorCode = "AUTH_ERROR"
	ErrForbidden   ErrorCode = "FORBIDDEN"
	ErrNotFound    ErrorCode = "NOT_FOUND"
	ErrConflict    ErrorCode = "CONFLICT"
	ErrTimeout     ErrorCode = "TIMEOUT"
	ErrValidation  ErrorCode = "VALIDATION_ERROR"
	ErrServer      ErrorCode = "SERVER_ERROR"
	ErrRateLimited ErrorCode = "RATE_LIMITED"
	ErrUnknown     ErrorCode = "UNKNOWN"
)

// AppError is the structured error type returned to the frontend via Wails.
type AppError struct {
	Code    ErrorCode `json:"code"`
	Message string    `json:"message"`
	Detail  string    `json:"detail,omitempty"`
	// Retryable indicates whether the frontend should offer a retry option.
	Retryable bool `json:"retryable"`
}

func (e *AppError) Error() string {
	if e.Detail != "" {
		return fmt.Sprintf("[%s] %s: %s", e.Code, e.Message, e.Detail)
	}
	return fmt.Sprintf("[%s] %s", e.Code, e.Message)
}

// Wrap converts any error into an *AppError with a descriptive code and message.
// Returns nil if err is nil.
func Wrap(err error) *AppError {
	if err == nil {
		return nil
	}

	// Kubernetes Status errors (4xx, 5xx from API server).
	var statusErr *k8serrors.StatusError
	if errors.As(err, &statusErr) {
		code := statusErr.ErrStatus.Code
		message := statusErr.ErrStatus.Message
		reason := string(statusErr.ErrStatus.Reason)
		switch {
		case code == 401:
			return &AppError{
				Code:      ErrAuth,
				Message:   "Authentication failed -- check your kubeconfig credentials",
				Detail:    message,
				Retryable: true,
			}
		case code == 403:
			return &AppError{
				Code:    ErrForbidden,
				Message: fmt.Sprintf("Permission denied (%s)", reason),
				Detail:  message,
			}
		case code == 404:
			return &AppError{
				Code:    ErrNotFound,
				Message: fmt.Sprintf("Resource not found (%s)", reason),
				Detail:  message,
			}
		case code == 409:
			return &AppError{
				Code:      ErrConflict,
				Message:   "Resource version conflict -- someone else modified this resource",
				Detail:    message,
				Retryable: true,
			}
		case code == 422:
			return &AppError{
				Code:    ErrValidation,
				Message: "Invalid resource specification",
				Detail:  message,
			}
		case code == 429:
			return &AppError{
				Code:      ErrRateLimited,
				Message:   "Too many requests -- the API server is rate limiting",
				Detail:    message,
				Retryable: true,
			}
		case code >= 500:
			return &AppError{
				Code:      ErrServer,
				Message:   "Kubernetes API server error",
				Detail:    message,
				Retryable: true,
			}
		}
	}

	// Context cancellation / deadline.
	if errors.Is(err, context.DeadlineExceeded) {
		return &AppError{
			Code:      ErrTimeout,
			Message:   "Request timed out -- the cluster may be slow or unreachable",
			Retryable: true,
		}
	}
	if errors.Is(err, context.Canceled) {
		return &AppError{
			Code:    ErrTimeout,
			Message: "Request was cancelled",
		}
	}

	// Network errors -> connection problem.
	var netOpErr *net.OpError
	if errors.As(err, &netOpErr) {
		return &AppError{
			Code:      ErrConnection,
			Message:   "Cannot reach the cluster API server",
			Detail:    netOpErr.Error(),
			Retryable: true,
		}
	}

	// DNS errors.
	var dnsErr *net.DNSError
	if errors.As(err, &dnsErr) {
		return &AppError{
			Code:      ErrConnection,
			Message:   fmt.Sprintf("DNS lookup failed for %q", dnsErr.Name),
			Detail:    dnsErr.Error(),
			Retryable: true,
		}
	}

	// TLS certificate errors.
	errStr := err.Error()
	if strings.Contains(errStr, "x509:") || strings.Contains(errStr, "certificate") {
		return &AppError{
			Code:    ErrConnection,
			Message: "TLS certificate error -- the cluster certificate may be invalid or expired",
			Detail:  errStr,
		}
	}

	// Exec plugin errors (common with EKS/GKE).
	if strings.Contains(errStr, "exec plugin") || strings.Contains(errStr, "unable to connect to the server") {
		return &AppError{
			Code:      ErrAuth,
			Message:   "Authentication plugin failed -- check that your cloud CLI is configured and logged in",
			Detail:    errStr,
			Retryable: true,
		}
	}

	return &AppError{
		Code:    ErrUnknown,
		Message: "An unexpected error occurred",
		Detail:  err.Error(),
	}
}

// WrapWithContext adds contextual information to the error message.
func WrapWithContext(err error, operation string) *AppError {
	appErr := Wrap(err)
	if appErr == nil {
		return nil
	}
	appErr.Message = fmt.Sprintf("%s: %s", operation, appErr.Message)
	return appErr
}

// IsNotFound returns true if err is a Kubernetes 404 or an AppError with ErrNotFound code.
func IsNotFound(err error) bool {
	var appErr *AppError
	if errors.As(err, &appErr) {
		return appErr.Code == ErrNotFound
	}
	return k8serrors.IsNotFound(err)
}

// IsUnauthorized returns true if the error indicates an auth failure.
func IsUnauthorized(err error) bool {
	var appErr *AppError
	if errors.As(err, &appErr) {
		return appErr.Code == ErrAuth || appErr.Code == ErrForbidden
	}
	return k8serrors.IsUnauthorized(err) || k8serrors.IsForbidden(err)
}

// IsForbidden returns true if the error is specifically a 403 Forbidden.
func IsForbidden(err error) bool {
	var appErr *AppError
	if errors.As(err, &appErr) {
		return appErr.Code == ErrForbidden
	}
	return k8serrors.IsForbidden(err)
}

// IsConflict returns true if the error is a 409 resource version conflict.
func IsConflict(err error) bool {
	var appErr *AppError
	if errors.As(err, &appErr) {
		return appErr.Code == ErrConflict
	}
	return k8serrors.IsConflict(err)
}

// IsRetryable returns true if the error is worth retrying.
func IsRetryable(err error) bool {
	var appErr *AppError
	if errors.As(err, &appErr) {
		return appErr.Retryable
	}
	return false
}
```

### `internal/apierrors/retry.go`

```go
package apierrors

import (
	"context"
	"math"
	"math/rand"
	"time"
)

// RetryConfig configures the retry behavior for operations.
type RetryConfig struct {
	MaxAttempts int           // Maximum number of attempts (including the first).
	BaseDelay   time.Duration // Initial delay before the first retry.
	MaxDelay    time.Duration // Maximum delay between retries.
	JitterPct   float64       // Jitter as a percentage (0.0 to 1.0) of the delay.
}

// DefaultRetryConfig returns a sensible default retry configuration.
func DefaultRetryConfig() RetryConfig {
	return RetryConfig{
		MaxAttempts: 3,
		BaseDelay:   500 * time.Millisecond,
		MaxDelay:    30 * time.Second,
		JitterPct:   0.2,
	}
}

// RetryWithBackoff executes fn with exponential backoff and jitter.
// It only retries if the error is retryable (connection, timeout, server error).
// Returns the last error if all attempts fail.
func RetryWithBackoff(ctx context.Context, cfg RetryConfig, fn func() error) error {
	var lastErr error
	for attempt := 0; attempt < cfg.MaxAttempts; attempt++ {
		lastErr = fn()
		if lastErr == nil {
			return nil
		}

		// Only retry retryable errors.
		if !IsRetryable(lastErr) {
			return lastErr
		}

		// Do not retry if this was the last attempt.
		if attempt == cfg.MaxAttempts-1 {
			break
		}

		// Calculate delay with exponential backoff and jitter.
		delay := float64(cfg.BaseDelay) * math.Pow(2, float64(attempt))
		if delay > float64(cfg.MaxDelay) {
			delay = float64(cfg.MaxDelay)
		}
		// Add jitter: +/- JitterPct of the delay.
		jitter := delay * cfg.JitterPct * (2*rand.Float64() - 1)
		finalDelay := time.Duration(delay + jitter)

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(finalDelay):
		}
	}
	return lastErr
}
```

---

## 3.4 — SharedInformer Cache Layer

### Overview

The SharedInformer cache layer is the backbone of Clusterfudge's real-time data.
Instead of polling the API server, we use `client-go`'s SharedInformerFactory
to maintain an in-memory cache that is kept current via watch streams.

Key concepts:
- **SharedInformerFactory**: Creates informers that share a single HTTP/2 connection.
- **SharedIndexInformer**: Maintains a thread-safe in-memory store with custom indexes.
- **Event Handlers**: OnAdd, OnUpdate, OnDelete callbacks that propagate changes to the frontend.
- **Resync Period**: Periodic full reconciliation (default 5 minutes) to catch any missed events.
- **Resource Version**: Efficient watch resumption after reconnection.

The InformerManager creates one SharedInformerFactory per cluster and manages
informers for all core Kubernetes resource types.

### `internal/k8s/informer_manager.go`

```go
package k8s

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/dynamic/dynamicinformer"
	"k8s.io/client-go/informers"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/cache"
)

// DefaultResyncPeriod is how often informers perform a full re-list from the API server
// to ensure cache consistency. 5 minutes balances freshness against API load.
const DefaultResyncPeriod = 5 * time.Minute

// ResourceEventType classifies a watch event.
type ResourceEventType string

const (
	EventAdded    ResourceEventType = "ADDED"
	EventModified ResourceEventType = "MODIFIED"
	EventDeleted  ResourceEventType = "DELETED"
)

// ResourceEvent is emitted when a watched resource changes.
type ResourceEvent struct {
	Type      ResourceEventType
	GVR       schema.GroupVersionResource
	Object    interface{}
	OldObject interface{} // Only set for EventModified.
}

// EventHandler is a callback for resource events.
type EventHandler func(event ResourceEvent)

// InformerSet tracks informers for a single cluster.
type InformerSet struct {
	mu              sync.RWMutex
	clusterID       string
	typedFactory    informers.SharedInformerFactory
	dynamicFactory  dynamicinformer.DynamicSharedInformerFactory
	stopCh          chan struct{}
	started         bool
	handlers        []EventHandler
	activeInformers map[schema.GroupVersionResource]cache.SharedIndexInformer
}

// InformerManager creates and manages SharedInformerFactory instances per cluster.
type InformerManager struct {
	mu       sync.RWMutex
	clusters map[string]*InformerSet // keyed by context name
}

// NewInformerManager creates a new InformerManager.
func NewInformerManager() *InformerManager {
	return &InformerManager{
		clusters: make(map[string]*InformerSet),
	}
}

// Register creates informer factories for a cluster. Call this after connecting.
func (im *InformerManager) Register(
	clusterID string,
	typed kubernetes.Interface,
	dyn dynamic.Interface,
) *InformerSet {
	im.mu.Lock()
	defer im.mu.Unlock()

	// If we already have an InformerSet for this cluster, stop it first.
	if existing, ok := im.clusters[clusterID]; ok {
		existing.Stop()
	}

	set := &InformerSet{
		clusterID:       clusterID,
		typedFactory:    informers.NewSharedInformerFactory(typed, DefaultResyncPeriod),
		dynamicFactory:  dynamicinformer.NewDynamicSharedInformerFactory(dyn, DefaultResyncPeriod),
		stopCh:          make(chan struct{}),
		activeInformers: make(map[schema.GroupVersionResource]cache.SharedIndexInformer),
	}

	im.clusters[clusterID] = set
	return set
}

// RegisterWithNamespace creates informer factories scoped to a specific namespace.
func (im *InformerManager) RegisterWithNamespace(
	clusterID string,
	typed kubernetes.Interface,
	dyn dynamic.Interface,
	namespace string,
) *InformerSet {
	im.mu.Lock()
	defer im.mu.Unlock()

	if existing, ok := im.clusters[clusterID]; ok {
		existing.Stop()
	}

	set := &InformerSet{
		clusterID: clusterID,
		typedFactory: informers.NewSharedInformerFactoryWithOptions(
			typed, DefaultResyncPeriod,
			informers.WithNamespace(namespace),
		),
		dynamicFactory: dynamicinformer.NewFilteredDynamicSharedInformerFactory(
			dyn, DefaultResyncPeriod, namespace, nil,
		),
		stopCh:          make(chan struct{}),
		activeInformers: make(map[schema.GroupVersionResource]cache.SharedIndexInformer),
	}

	im.clusters[clusterID] = set
	return set
}

// Get returns the InformerSet for a cluster.
func (im *InformerManager) Get(clusterID string) (*InformerSet, bool) {
	im.mu.RLock()
	defer im.mu.RUnlock()
	set, ok := im.clusters[clusterID]
	return set, ok
}

// Unregister stops and removes the InformerSet for a cluster.
func (im *InformerManager) Unregister(clusterID string) {
	im.mu.Lock()
	set, ok := im.clusters[clusterID]
	if ok {
		delete(im.clusters, clusterID)
	}
	im.mu.Unlock()

	if ok {
		set.Stop()
		slog.Info("informer set unregistered", "cluster", clusterID)
	}
}

// ShutdownAll stops all informer sets.
func (im *InformerManager) ShutdownAll() {
	im.mu.Lock()
	clusters := make(map[string]*InformerSet, len(im.clusters))
	for k, v := range im.clusters {
		clusters[k] = v
	}
	im.clusters = make(map[string]*InformerSet)
	im.mu.Unlock()

	for id, set := range clusters {
		set.Stop()
		slog.Info("informer set stopped", "cluster", id)
	}
}

// AddEventHandler registers a callback for resource events on this cluster.
func (s *InformerSet) AddEventHandler(handler EventHandler) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.handlers = append(s.handlers, handler)
}

// emitEvent sends an event to all registered handlers.
func (s *InformerSet) emitEvent(event ResourceEvent) {
	s.mu.RLock()
	handlers := make([]EventHandler, len(s.handlers))
	copy(handlers, s.handlers)
	s.mu.RUnlock()

	for _, h := range handlers {
		h(event)
	}
}

// StartCoreInformers starts informers for all core Kubernetes resource types.
// This is the primary method to call after Register().
func (s *InformerSet) StartCoreInformers(ctx context.Context) error {
	s.mu.Lock()
	if s.started {
		s.mu.Unlock()
		return fmt.Errorf("informers already started for cluster %s", s.clusterID)
	}
	s.started = true
	s.mu.Unlock()

	// Register event handlers for all core resource types using the typed factory.
	// Core v1 resources.
	s.registerTypedInformer(GVRPods, s.typedFactory.Core().V1().Pods().Informer())
	s.registerTypedInformer(GVRServices, s.typedFactory.Core().V1().Services().Informer())
	s.registerTypedInformer(GVRConfigMaps, s.typedFactory.Core().V1().ConfigMaps().Informer())
	s.registerTypedInformer(GVRSecrets, s.typedFactory.Core().V1().Secrets().Informer())
	s.registerTypedInformer(GVRNamespaces, s.typedFactory.Core().V1().Namespaces().Informer())
	s.registerTypedInformer(GVRNodes, s.typedFactory.Core().V1().Nodes().Informer())
	s.registerTypedInformer(GVRPersistentVolumes, s.typedFactory.Core().V1().PersistentVolumes().Informer())
	s.registerTypedInformer(GVRPersistentVolumeClaims, s.typedFactory.Core().V1().PersistentVolumeClaims().Informer())
	s.registerTypedInformer(GVRServiceAccounts, s.typedFactory.Core().V1().ServiceAccounts().Informer())
	s.registerTypedInformer(GVREvents, s.typedFactory.Core().V1().Events().Informer())
	s.registerTypedInformer(GVREndpoints, s.typedFactory.Core().V1().Endpoints().Informer())
	s.registerTypedInformer(GVRResourceQuotas, s.typedFactory.Core().V1().ResourceQuotas().Informer())
	s.registerTypedInformer(GVRLimitRanges, s.typedFactory.Core().V1().LimitRanges().Informer())

	// Apps v1 resources.
	s.registerTypedInformer(GVRDeployments, s.typedFactory.Apps().V1().Deployments().Informer())
	s.registerTypedInformer(GVRStatefulSets, s.typedFactory.Apps().V1().StatefulSets().Informer())
	s.registerTypedInformer(GVRDaemonSets, s.typedFactory.Apps().V1().DaemonSets().Informer())
	s.registerTypedInformer(GVRReplicaSets, s.typedFactory.Apps().V1().ReplicaSets().Informer())

	// Batch v1 resources.
	s.registerTypedInformer(GVRJobs, s.typedFactory.Batch().V1().Jobs().Informer())
	s.registerTypedInformer(GVRCronJobs, s.typedFactory.Batch().V1().CronJobs().Informer())

	// Networking v1 resources.
	s.registerTypedInformer(GVRIngresses, s.typedFactory.Networking().V1().Ingresses().Informer())
	s.registerTypedInformer(GVRNetworkPolicies, s.typedFactory.Networking().V1().NetworkPolicies().Informer())

	// RBAC v1 resources.
	s.registerTypedInformer(GVRRoles, s.typedFactory.Rbac().V1().Roles().Informer())
	s.registerTypedInformer(GVRRoleBindings, s.typedFactory.Rbac().V1().RoleBindings().Informer())
	s.registerTypedInformer(GVRClusterRoles, s.typedFactory.Rbac().V1().ClusterRoles().Informer())
	s.registerTypedInformer(GVRClusterRoleBindings, s.typedFactory.Rbac().V1().ClusterRoleBindings().Informer())

	// Autoscaling v2 resources.
	s.registerTypedInformer(GVRHPAs, s.typedFactory.Autoscaling().V2().HorizontalPodAutoscalers().Informer())

	// Policy v1 resources.
	s.registerTypedInformer(GVRPDBs, s.typedFactory.Policy().V1().PodDisruptionBudgets().Informer())

	// Storage v1 resources.
	s.registerTypedInformer(GVRStorageClasses, s.typedFactory.Storage().V1().StorageClasses().Informer())

	// Start the typed factory (non-blocking -- spawns goroutines internally).
	s.typedFactory.Start(s.stopCh)

	// Wait for initial cache sync with a timeout.
	syncCtx, syncCancel := context.WithTimeout(ctx, 60*time.Second)
	defer syncCancel()

	syncs := s.typedFactory.WaitForCacheSync(syncCtx.Done())
	for informerType, synced := range syncs {
		if !synced {
			slog.Warn("informer cache sync failed",
				"cluster", s.clusterID, "type", informerType)
		}
	}

	slog.Info("core informers started",
		"cluster", s.clusterID,
		"informerCount", len(s.activeInformers),
	)
	return nil
}

// registerTypedInformer adds event handlers to a typed informer and tracks it.
func (s *InformerSet) registerTypedInformer(
	gvr schema.GroupVersionResource,
	informer cache.SharedIndexInformer,
) {
	informer.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc: func(obj interface{}) {
			s.emitEvent(ResourceEvent{
				Type:   EventAdded,
				GVR:    gvr,
				Object: obj,
			})
		},
		UpdateFunc: func(oldObj, newObj interface{}) {
			s.emitEvent(ResourceEvent{
				Type:      EventModified,
				GVR:       gvr,
				Object:    newObj,
				OldObject: oldObj,
			})
		},
		DeleteFunc: func(obj interface{}) {
			// Handle DeletedFinalStateUnknown (tombstone).
			if d, ok := obj.(cache.DeletedFinalStateUnknown); ok {
				obj = d.Obj
			}
			s.emitEvent(ResourceEvent{
				Type:   EventDeleted,
				GVR:    gvr,
				Object: obj,
			})
		},
	})

	s.mu.Lock()
	s.activeInformers[gvr] = informer
	s.mu.Unlock()
}

// StartDynamicInformer starts a dynamic informer for a custom resource (CRD).
func (s *InformerSet) StartDynamicInformer(gvr schema.GroupVersionResource) (cache.SharedIndexInformer, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Check if we already have this informer.
	if existing, ok := s.activeInformers[gvr]; ok {
		return existing, nil
	}

	informer := s.dynamicFactory.ForResource(gvr).Informer()
	informer.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc: func(obj interface{}) {
			s.emitEvent(ResourceEvent{Type: EventAdded, GVR: gvr, Object: obj})
		},
		UpdateFunc: func(oldObj, newObj interface{}) {
			s.emitEvent(ResourceEvent{Type: EventModified, GVR: gvr, Object: newObj, OldObject: oldObj})
		},
		DeleteFunc: func(obj interface{}) {
			if d, ok := obj.(cache.DeletedFinalStateUnknown); ok {
				obj = d.Obj
			}
			s.emitEvent(ResourceEvent{Type: EventDeleted, GVR: gvr, Object: obj})
		},
	})

	s.activeInformers[gvr] = informer

	// Start just this informer (the factory handles dedup internally).
	s.dynamicFactory.Start(s.stopCh)
	s.dynamicFactory.WaitForCacheSync(s.stopCh)

	slog.Info("dynamic informer started",
		"cluster", s.clusterID,
		"gvr", gvr.String(),
	)
	return informer, nil
}

// GetInformer returns the informer for a specific GVR, or nil if not registered.
func (s *InformerSet) GetInformer(gvr schema.GroupVersionResource) cache.SharedIndexInformer {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.activeInformers[gvr]
}

// GetStore returns the cache store for a specific GVR.
// Returns nil if the informer is not registered.
func (s *InformerSet) GetStore(gvr schema.GroupVersionResource) cache.Store {
	informer := s.GetInformer(gvr)
	if informer == nil {
		return nil
	}
	return informer.GetStore()
}

// ListFromCache returns all objects from the informer cache for the given GVR.
func (s *InformerSet) ListFromCache(gvr schema.GroupVersionResource) ([]interface{}, error) {
	store := s.GetStore(gvr)
	if store == nil {
		return nil, fmt.Errorf("no informer registered for %s", gvr.String())
	}
	return store.List(), nil
}

// GetFromCache returns a single object from the informer cache by namespace/name key.
func (s *InformerSet) GetFromCache(gvr schema.GroupVersionResource, namespace, name string) (interface{}, bool, error) {
	store := s.GetStore(gvr)
	if store == nil {
		return nil, false, fmt.Errorf("no informer registered for %s", gvr.String())
	}
	key := name
	if namespace != "" {
		key = namespace + "/" + name
	}
	item, exists, err := store.GetByKey(key)
	return item, exists, err
}

// HasSynced returns true if all active informers have completed their initial list.
func (s *InformerSet) HasSynced() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, informer := range s.activeInformers {
		if !informer.HasSynced() {
			return false
		}
	}
	return true
}

// Stop shuts down all informers for this cluster.
func (s *InformerSet) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.started {
		return
	}
	close(s.stopCh)
	s.started = false
	s.activeInformers = make(map[schema.GroupVersionResource]cache.SharedIndexInformer)
	slog.Info("informer set stopped", "cluster", s.clusterID)
}
```

### `internal/k8s/gvr.go`

This file defines all the GroupVersionResource constants used throughout the application.

```go
package k8s

import "k8s.io/apimachinery/pkg/runtime/schema"

// Core v1 resources.
var (
	GVRPods                  = schema.GroupVersionResource{Group: "", Version: "v1", Resource: "pods"}
	GVRServices              = schema.GroupVersionResource{Group: "", Version: "v1", Resource: "services"}
	GVRConfigMaps            = schema.GroupVersionResource{Group: "", Version: "v1", Resource: "configmaps"}
	GVRSecrets               = schema.GroupVersionResource{Group: "", Version: "v1", Resource: "secrets"}
	GVRNamespaces            = schema.GroupVersionResource{Group: "", Version: "v1", Resource: "namespaces"}
	GVRNodes                 = schema.GroupVersionResource{Group: "", Version: "v1", Resource: "nodes"}
	GVRPersistentVolumes     = schema.GroupVersionResource{Group: "", Version: "v1", Resource: "persistentvolumes"}
	GVRPersistentVolumeClaims = schema.GroupVersionResource{Group: "", Version: "v1", Resource: "persistentvolumeclaims"}
	GVRServiceAccounts       = schema.GroupVersionResource{Group: "", Version: "v1", Resource: "serviceaccounts"}
	GVREvents                = schema.GroupVersionResource{Group: "", Version: "v1", Resource: "events"}
	GVREndpoints             = schema.GroupVersionResource{Group: "", Version: "v1", Resource: "endpoints"}
	GVRResourceQuotas        = schema.GroupVersionResource{Group: "", Version: "v1", Resource: "resourcequotas"}
	GVRLimitRanges           = schema.GroupVersionResource{Group: "", Version: "v1", Resource: "limitranges"}
)

// Apps v1 resources.
var (
	GVRDeployments  = schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "deployments"}
	GVRStatefulSets = schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "statefulsets"}
	GVRDaemonSets   = schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "daemonsets"}
	GVRReplicaSets  = schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "replicasets"}
)

// Batch v1 resources.
var (
	GVRJobs     = schema.GroupVersionResource{Group: "batch", Version: "v1", Resource: "jobs"}
	GVRCronJobs = schema.GroupVersionResource{Group: "batch", Version: "v1", Resource: "cronjobs"}
)

// Networking v1 resources.
var (
	GVRIngresses      = schema.GroupVersionResource{Group: "networking.k8s.io", Version: "v1", Resource: "ingresses"}
	GVRNetworkPolicies = schema.GroupVersionResource{Group: "networking.k8s.io", Version: "v1", Resource: "networkpolicies"}
	GVRIngressClasses = schema.GroupVersionResource{Group: "networking.k8s.io", Version: "v1", Resource: "ingressclasses"}
)

// RBAC v1 resources.
var (
	GVRRoles               = schema.GroupVersionResource{Group: "rbac.authorization.k8s.io", Version: "v1", Resource: "roles"}
	GVRRoleBindings        = schema.GroupVersionResource{Group: "rbac.authorization.k8s.io", Version: "v1", Resource: "rolebindings"}
	GVRClusterRoles        = schema.GroupVersionResource{Group: "rbac.authorization.k8s.io", Version: "v1", Resource: "clusterroles"}
	GVRClusterRoleBindings = schema.GroupVersionResource{Group: "rbac.authorization.k8s.io", Version: "v1", Resource: "clusterrolebindings"}
)

// Autoscaling v2 resources.
var (
	GVRHPAs = schema.GroupVersionResource{Group: "autoscaling", Version: "v2", Resource: "horizontalpodautoscalers"}
)

// Policy v1 resources.
var (
	GVRPDBs = schema.GroupVersionResource{Group: "policy", Version: "v1", Resource: "poddisruptionbudgets"}
)

// Storage v1 resources.
var (
	GVRStorageClasses = schema.GroupVersionResource{Group: "storage.k8s.io", Version: "v1", Resource: "storageclasses"}
)

// CRD discovery.
var (
	GVRCRDs = schema.GroupVersionResource{Group: "apiextensions.k8s.io", Version: "v1", Resource: "customresourcedefinitions"}
)

// AllCoreGVRs returns all GVRs that the application watches by default.
func AllCoreGVRs() []schema.GroupVersionResource {
	return []schema.GroupVersionResource{
		GVRPods, GVRServices, GVRConfigMaps, GVRSecrets,
		GVRNamespaces, GVRNodes,
		GVRPersistentVolumes, GVRPersistentVolumeClaims,
		GVRServiceAccounts, GVREvents, GVREndpoints,
		GVRResourceQuotas, GVRLimitRanges,
		GVRDeployments, GVRStatefulSets, GVRDaemonSets, GVRReplicaSets,
		GVRJobs, GVRCronJobs,
		GVRIngresses, GVRNetworkPolicies,
		GVRRoles, GVRRoleBindings, GVRClusterRoles, GVRClusterRoleBindings,
		GVRHPAs, GVRPDBs, GVRStorageClasses,
	}
}

// GVRDisplayName returns a human-friendly name for a GVR.
func GVRDisplayName(gvr schema.GroupVersionResource) string {
	names := map[string]string{
		"pods":                       "Pods",
		"services":                   "Services",
		"configmaps":                 "ConfigMaps",
		"secrets":                    "Secrets",
		"namespaces":                 "Namespaces",
		"nodes":                      "Nodes",
		"persistentvolumes":          "Persistent Volumes",
		"persistentvolumeclaims":     "Persistent Volume Claims",
		"serviceaccounts":            "Service Accounts",
		"events":                     "Events",
		"endpoints":                  "Endpoints",
		"resourcequotas":             "Resource Quotas",
		"limitranges":                "Limit Ranges",
		"deployments":                "Deployments",
		"statefulsets":               "StatefulSets",
		"daemonsets":                 "DaemonSets",
		"replicasets":                "ReplicaSets",
		"jobs":                       "Jobs",
		"cronjobs":                   "CronJobs",
		"ingresses":                  "Ingresses",
		"networkpolicies":            "Network Policies",
		"roles":                      "Roles",
		"rolebindings":               "Role Bindings",
		"clusterroles":               "Cluster Roles",
		"clusterrolebindings":        "Cluster Role Bindings",
		"horizontalpodautoscalers":   "Horizontal Pod Autoscalers",
		"poddisruptionbudgets":       "Pod Disruption Budgets",
		"storageclasses":             "Storage Classes",
		"customresourcedefinitions":  "Custom Resource Definitions",
	}
	if name, ok := names[gvr.Resource]; ok {
		return name
	}
	return gvr.Resource
}

// IsNamespaced returns true if the given GVR is namespace-scoped.
func IsNamespaced(gvr schema.GroupVersionResource) bool {
	clusterScoped := map[string]bool{
		"namespaces":                true,
		"nodes":                     true,
		"persistentvolumes":         true,
		"clusterroles":              true,
		"clusterrolebindings":       true,
		"storageclasses":            true,
		"customresourcedefinitions": true,
		"ingressclasses":            true,
	}
	return !clusterScoped[gvr.Resource]
}

// ParseGVR parses a string like "apps/v1/deployments" into a GVR.
func ParseGVR(s string) (schema.GroupVersionResource, error) {
	parts := strings.Split(s, "/")
	switch len(parts) {
	case 2:
		// "v1/pods" -> group="", version="v1", resource="pods"
		return schema.GroupVersionResource{
			Group: "", Version: parts[0], Resource: parts[1],
		}, nil
	case 3:
		// "apps/v1/deployments" -> group="apps", version="v1", resource="deployments"
		return schema.GroupVersionResource{
			Group: parts[0], Version: parts[1], Resource: parts[2],
		}, nil
	default:
		return schema.GroupVersionResource{}, fmt.Errorf("invalid GVR string %q: expected group/version/resource", s)
	}
}
```
