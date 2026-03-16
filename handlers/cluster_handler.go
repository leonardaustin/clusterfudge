package handlers

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"

	"kubeviewer/internal/cluster"
)

// opTimeout is the per-operation deadline for cluster summary list calls.
// 30s accommodates large clusters that require many pagination rounds.
const opTimeout = 30 * time.Second

// listPageSize is the page size used for paginated Kubernetes list calls.
const listPageSize = int64(500)

// ClusterHandler wraps cluster.Manager to provide Wails-callable methods.
type ClusterHandler struct {
	manager     *cluster.Manager
	rbacChecker *cluster.RBACChecker
}

// NewClusterHandler creates a ClusterHandler backed by the given Manager.
func NewClusterHandler(mgr *cluster.Manager) *ClusterHandler {
	return &ClusterHandler{
		manager:     mgr,
		rbacChecker: cluster.NewRBACChecker(),
	}
}

// ListContexts returns all available kubeconfig context names sorted alphabetically.
// It uses the Manager's KubeconfigLoader which respects user-configured kubeconfig paths.
func (h *ClusterHandler) ListContexts() ([]string, error) {
	cfg, err := h.manager.Loader().Load()
	if err != nil {
		return nil, fmt.Errorf("load kubeconfig: %w", err)
	}

	names := make([]string, 0, len(cfg.Contexts))
	for name := range cfg.Contexts {
		names = append(names, name)
	}
	sort.Strings(names)
	return names, nil
}

// ListContextDetails returns detailed context info from the kubeconfig.
func (h *ClusterHandler) ListContextDetails() ([]cluster.ContextInfo, error) {
	return h.manager.Loader().ListContexts()
}

// Connect establishes a connection to the cluster identified by contextName.
func (h *ClusterHandler) Connect(contextName string) error {
	if contextName == "" {
		return fmt.Errorf("context name must not be empty")
	}
	h.rbacChecker.ClearCache()
	ctx, cancel := context.WithTimeout(context.Background(), opTimeout)
	defer cancel()
	return h.manager.Connect(ctx, contextName)
}

// Disconnect tears down the active connection.
func (h *ClusterHandler) Disconnect() {
	h.manager.Disconnect()
	h.rbacChecker.ClearCache()
}

// ActiveConnection returns info about the active connection, or nil if disconnected.
func (h *ClusterHandler) ActiveConnection() *cluster.Connection {
	return h.manager.ActiveConnection()
}

// GetConnectionSnapshot returns the full connection snapshot for the active context.
func (h *ClusterHandler) GetConnectionSnapshot() (*cluster.ConnectionSnapshot, error) {
	active := h.manager.ActiveContext()
	if active == "" {
		return nil, fmt.Errorf("no active cluster")
	}
	snap, err := h.manager.ConnectionFor(active)
	if err != nil {
		return nil, err
	}
	return &snap, nil
}

// ListConnections returns snapshots of all tracked connections.
func (h *ClusterHandler) ListConnections() []cluster.ConnectionSnapshot {
	return h.manager.ListConnections()
}

// SwitchContext changes the active context without disconnecting others.
func (h *ClusterHandler) SwitchContext(contextName string) error {
	if contextName == "" {
		return fmt.Errorf("context name must not be empty")
	}
	h.rbacChecker.ClearCache()
	return h.manager.SwitchContext(contextName)
}

// ListNamespaces returns all namespace names from the active cluster,
// paginating through large results.
func (h *ClusterHandler) ListNamespaces() ([]string, error) {
	bundle, err := h.manager.ActiveClients()
	if err != nil {
		return nil, fmt.Errorf("list namespaces: %w", err)
	}

	opCtx, opCancel := context.WithTimeout(context.Background(), opTimeout)
	defer opCancel()

	var names []string
	opts := metav1.ListOptions{Limit: listPageSize}
	for {
		nsList, err := bundle.Typed.CoreV1().Namespaces().List(opCtx, opts)
		if err != nil {
			return nil, fmt.Errorf("list namespaces: %w", err)
		}
		for _, ns := range nsList.Items {
			names = append(names, ns.Name)
		}
		if nsList.Continue == "" {
			break
		}
		opts.Continue = nsList.Continue
	}

	sort.Strings(names)
	return names, nil
}

// CheckRBACPermission checks if the current user can perform a verb on a resource.
func (h *ClusterHandler) CheckRBACPermission(verb, group, resource, namespace string) (cluster.RBACCheckResult, error) {
	bundle, err := h.manager.ActiveClients()
	if err != nil {
		return cluster.RBACCheckResult{}, fmt.Errorf("RBAC check: %w", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return h.rbacChecker.CheckAccess(ctx, bundle.Typed, verb, group, resource, namespace)
}

// CheckRBACPermissions checks multiple verbs for the same resource.
func (h *ClusterHandler) CheckRBACPermissions(verbs []string, group, resource, namespace string) ([]cluster.RBACCheckResult, error) {
	bundle, err := h.manager.ActiveClients()
	if err != nil {
		return nil, fmt.Errorf("RBAC bulk check: %w", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return h.rbacChecker.BulkCheck(ctx, bundle.Typed, verbs, group, resource, namespace)
}

// GetClusterSummary returns aggregate resource counts for the cluster overview dashboard.
// Each resource list call has a per-operation timeout and uses pagination.
func (h *ClusterHandler) GetClusterSummary() (*cluster.ClusterSummary, error) {
	bundle, err := h.manager.ActiveClients()
	if err != nil {
		return nil, fmt.Errorf("cluster summary: %w", err)
	}

	ctx := context.Background()
	summary := &cluster.ClusterSummary{}

	// Nodes
	nodeCtx, nodeCancel := context.WithTimeout(ctx, opTimeout)
	defer nodeCancel()
	nodeOpts := metav1.ListOptions{Limit: listPageSize}
	for {
		nodes, err := bundle.Typed.CoreV1().Nodes().List(nodeCtx, nodeOpts)
		if err != nil {
			return nil, fmt.Errorf("list nodes: %w", err)
		}
		summary.NodeCount += len(nodes.Items)
		for _, n := range nodes.Items {
			for _, c := range n.Status.Conditions {
				if c.Type == "Ready" && c.Status == "True" {
					summary.NodeReady++
					break
				}
			}
		}
		if nodes.Continue == "" {
			break
		}
		nodeOpts.Continue = nodes.Continue
	}

	// Pods (all namespaces)
	podCtx, podCancel := context.WithTimeout(ctx, opTimeout)
	defer podCancel()
	nsPodCounts := make(map[string]int)
	podOpts := metav1.ListOptions{Limit: listPageSize}
	for {
		pods, err := bundle.Typed.CoreV1().Pods("").List(podCtx, podOpts)
		if err != nil {
			return nil, fmt.Errorf("list pods: %w", err)
		}
		summary.PodCount += len(pods.Items)
		for _, p := range pods.Items {
			if p.Status.Phase == "Running" {
				summary.PodRunning++
			}
			nsPodCounts[p.Namespace]++
		}
		if pods.Continue == "" {
			break
		}
		podOpts.Continue = pods.Continue
	}

	// Deployments (all namespaces)
	depCtx, depCancel := context.WithTimeout(ctx, opTimeout)
	defer depCancel()
	depOpts := metav1.ListOptions{Limit: listPageSize}
	for {
		deploys, err := bundle.Typed.AppsV1().Deployments("").List(depCtx, depOpts)
		if err != nil {
			return nil, fmt.Errorf("list deployments: %w", err)
		}
		summary.DeploymentCount += len(deploys.Items)
		for _, d := range deploys.Items {
			replicas := int32(1)
			if d.Spec.Replicas != nil {
				replicas = *d.Spec.Replicas
			}
			if d.Status.ReadyReplicas == replicas {
				summary.DeploymentReady++
			}
		}
		if deploys.Continue == "" {
			break
		}
		depOpts.Continue = deploys.Continue
	}

	// Services (all namespaces)
	svcCtx, svcCancel := context.WithTimeout(ctx, opTimeout)
	defer svcCancel()
	svcOpts := metav1.ListOptions{Limit: listPageSize}
	for {
		services, err := bundle.Typed.CoreV1().Services("").List(svcCtx, svcOpts)
		if err != nil {
			return nil, fmt.Errorf("list services: %w", err)
		}
		summary.ServiceCount += len(services.Items)
		for _, s := range services.Items {
			if s.Spec.Type == "LoadBalancer" {
				summary.ServiceLB++
			}
		}
		if services.Continue == "" {
			break
		}
		svcOpts.Continue = services.Continue
	}

	// Namespace summary
	nsCtx, nsCancel := context.WithTimeout(ctx, opTimeout)
	defer nsCancel()
	nsOpts := metav1.ListOptions{Limit: listPageSize}
	for {
		namespaces, err := bundle.Typed.CoreV1().Namespaces().List(nsCtx, nsOpts)
		if err != nil {
			return nil, fmt.Errorf("list namespaces: %w", err)
		}
		for _, ns := range namespaces.Items {
			summary.NamespaceSummary = append(summary.NamespaceSummary, cluster.NamespaceSummary{
				Name:     ns.Name,
				PodCount: nsPodCounts[ns.Name],
			})
		}
		if namespaces.Continue == "" {
			break
		}
		nsOpts.Continue = namespaces.Continue
	}

	return summary, nil
}

// PreflightResult holds the outcome of a pre-connection health check.
type PreflightResult struct {
	Context       string `json:"context"`
	Reachable     bool   `json:"reachable"`
	Authenticated bool   `json:"authenticated"`
	ServerVersion string `json:"serverVersion,omitempty"`
	Error         string `json:"error,omitempty"`
	ErrorCode     string `json:"errorCode,omitempty"`    // matches cluster.ErrorCode
	AuthProvider  string `json:"authProvider,omitempty"` // "eks", "gke", "aks", etc.
}

// PreflightCheck validates that a kubeconfig context can reach its API server
// and authenticate. It uses a short timeout so the UI stays responsive.
func (h *ClusterHandler) PreflightCheck(contextName string) (*PreflightResult, error) {
	if contextName == "" {
		return nil, fmt.Errorf("context name must not be empty")
	}

	result := &PreflightResult{Context: contextName}

	// Detect auth provider from kubeconfig (uses same Load() call as ValidateContext below).
	if cfg, loadErr := h.manager.Loader().Load(); loadErr == nil {
		result.AuthProvider = h.manager.Loader().DetectProvider(cfg, contextName)
	}

	// Validate context exists in kubeconfig.
	if err := h.manager.Loader().ValidateContext(contextName); err != nil {
		result.Error = fmt.Sprintf("Invalid kubeconfig context: %v", err)
		result.ErrorCode = string(cluster.ErrValidation)
		return result, nil
	}

	// Build a rest.Config and try a quick server version check.
	cfg, err := h.manager.Loader().RestConfigForContext(contextName)
	if err != nil {
		result.Error = fmt.Sprintf("Failed to load kubeconfig: %v", err)
		result.ErrorCode = string(cluster.ErrConnection)
		return result, nil
	}

	// Short timeout for preflight — don't block the UI.
	cfg.Timeout = 5 * time.Second

	typed, err := kubernetes.NewForConfig(cfg)
	if err != nil {
		result.Error = fmt.Sprintf("Failed to create client: %v", err)
		result.ErrorCode = string(cluster.ErrConnection)
		return result, nil
	}

	sv, err := typed.Discovery().ServerVersion()
	if err != nil {
		wrapped := cluster.WrapKubeError(err)
		var ke *cluster.KubeError
		if errors.As(wrapped, &ke) {
			result.Error = ke.Message
			if ke.Detail != "" {
				result.Error = ke.Message + ": " + ke.Detail
			}
			result.ErrorCode = string(ke.Code)
		} else {
			result.Error = err.Error()
			result.ErrorCode = string(cluster.ErrUnknown)
		}
		// Distinguish auth vs connectivity.
		var authErr *cluster.AuthError
		if errors.As(wrapped, &authErr) {
			result.Reachable = true // server responded with 401
		}
		return result, nil
	}

	result.Reachable = true
	result.Authenticated = true
	result.ServerVersion = sv.GitVersion
	return result, nil
}

// GetMetrics returns cluster metrics (CPU/memory) from the metrics-server.
func (h *ClusterHandler) GetMetrics() (cluster.MetricsSnapshot, error) {
	bundle, err := h.manager.ActiveClients()
	if err != nil {
		return cluster.MetricsSnapshot{}, fmt.Errorf("get metrics: %w", err)
	}
	collector := cluster.NewMetricsCollector(bundle.Typed.CoreV1().RESTClient())
	ctx, cancel := context.WithTimeout(context.Background(), opTimeout)
	defer cancel()
	return collector.CollectSnapshot(ctx, bundle.Typed)
}
