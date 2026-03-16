package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sort"
	"strings"
	"sync"
	"time"

	"kubeviewer/internal/alerts"
	"kubeviewer/internal/audit"
	"kubeviewer/internal/cluster"
	"kubeviewer/internal/events"
	"kubeviewer/internal/resource"
	"kubeviewer/internal/troubleshoot"

	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	policyv1 "k8s.io/api/policy/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/dynamic"
	sigyaml "sigs.k8s.io/yaml"
)

// apiTimeout is the per-operation deadline for Kubernetes API calls.
const apiTimeout = 30 * time.Second

// drainTimeout is the overall deadline for node drain operations.
const drainTimeout = 5 * time.Minute

// maxConcurrentEvictions limits parallel pod evictions during node drain.
const maxConcurrentEvictions = 10

// watchKey is a collision-free map key for resource watches.
type watchKey struct {
	group, version, resource, namespace string
}

// ResourceHandler is a thin adapter that exposes resource CRUD operations
// for the frontend. It delegates to resource.Service using the active
// cluster connection from cluster.Manager.
type ResourceHandler struct {
	svc         *resource.Service
	manager     *cluster.Manager
	emitter     *events.Emitter
	rbacChecker *cluster.RBACChecker
	alertStore  *alerts.Store
	timeline    *troubleshoot.Timeline
	auditLogger *audit.Logger

	watchMu      sync.Mutex
	watchCancels map[watchKey]context.CancelFunc
}

// NewResourceHandler creates a ResourceHandler.
func NewResourceHandler(svc *resource.Service, mgr *cluster.Manager) *ResourceHandler {
	return &ResourceHandler{
		svc:          svc,
		manager:      mgr,
		rbacChecker:  cluster.NewRBACChecker(),
		watchCancels: make(map[watchKey]context.CancelFunc),
	}
}

// SetEmitter sets the event emitter for watch event broadcasting.
func (h *ResourceHandler) SetEmitter(emitter *events.Emitter) {
	h.emitter = emitter
}

// SetAlertStore sets the alert store for evaluating alert rules during watches.
func (h *ResourceHandler) SetAlertStore(store *alerts.Store) {
	h.alertStore = store
}

// SetTimeline sets the troubleshoot timeline for recording resource changes.
func (h *ResourceHandler) SetTimeline(tl *troubleshoot.Timeline) {
	h.timeline = tl
}

// SetAuditLogger sets the audit logger for recording mutating operations.
func (h *ResourceHandler) SetAuditLogger(logger *audit.Logger) {
	h.auditLogger = logger
}

// auditLog records an audit entry if the logger is configured.
func (h *ResourceHandler) auditLog(action, kind, namespace, name, details, status string, err error) {
	if h.auditLogger == nil {
		return
	}
	entry := audit.Entry{
		Action:    action,
		Kind:      kind,
		Namespace: namespace,
		Name:      name,
		Details:   details,
		Status:    status,
	}
	if err != nil {
		entry.Error = err.Error()
	}
	h.auditLogger.Log(entry)
}

func (h *ResourceHandler) query(group, version, res, namespace, name string) resource.ResourceQuery {
	return resource.ResourceQuery{
		Group:     group,
		Version:   version,
		Resource:  res,
		Namespace: namespace,
		Name:      name,
	}
}

// checkRBAC performs a pre-flight RBAC permission check.
// Returns an error if the user lacks permission; returns nil (allowing the
// operation to proceed) if the RBAC API is unavailable or on check errors.
func (h *ResourceHandler) checkRBAC(verb, group, res, namespace string) error {
	bundle, err := h.manager.ActiveClients()
	if err != nil {
		return nil // can't check; the operation will fail with a better error
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	result, err := h.rbacChecker.CheckAccess(ctx, bundle.Typed, verb, group, res, namespace)
	if err != nil {
		slog.Debug("RBAC pre-flight check failed", "verb", verb, "resource", res, "error", err)
		return nil // RBAC API error; let the operation proceed and fail naturally
	}
	if !result.Allowed {
		reason := result.Reason
		if reason == "" {
			reason = "forbidden by cluster RBAC policy"
		}
		return fmt.Errorf("permission denied: cannot %s %s in namespace %q: %s",
			verb, res, namespace, reason)
	}
	return nil
}

// ListResources lists resources of the given type.
func (h *ResourceHandler) ListResources(group, version, res, namespace string) ([]resource.ResourceItem, error) {
	cs, err := h.manager.ActiveClient()
	if err != nil {
		return nil, fmt.Errorf("list resources: %w", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), apiTimeout)
	defer cancel()
	return h.svc.List(ctx, cs.Dynamic, h.query(group, version, res, namespace, ""))
}

// GetResource gets a single resource.
func (h *ResourceHandler) GetResource(group, version, res, namespace, name string) (*resource.ResourceItem, error) {
	if name == "" {
		return nil, fmt.Errorf("resource name is required")
	}
	cs, err := h.manager.ActiveClient()
	if err != nil {
		return nil, fmt.Errorf("get resource: %w", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), apiTimeout)
	defer cancel()
	return h.svc.Get(ctx, cs.Dynamic, h.query(group, version, res, namespace, name))
}

// ApplyResource creates or updates a resource.
func (h *ResourceHandler) ApplyResource(group, version, res, namespace string, data []byte) error {
	if len(data) == 0 {
		return fmt.Errorf("resource data is required")
	}
	cs, err := h.manager.ActiveClient()
	if err != nil {
		return fmt.Errorf("apply resource: %w", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), apiTimeout)
	defer cancel()
	err = h.svc.Apply(ctx, cs.Dynamic, h.query(group, version, res, namespace, ""), data)
	status := "success"
	if err != nil {
		status = "failed"
	}
	h.auditLog("apply", res, namespace, "", "", status, err)
	return err
}

// DryRunApply performs a server-side dry-run update and returns the live YAML
// and the dry-run result YAML separated by a sentinel string so the frontend
// can display a diff view.
func (h *ResourceHandler) DryRunApply(group, version, res, namespace string, data []byte) (string, error) {
	if len(data) == 0 {
		return "", fmt.Errorf("resource data is required")
	}
	cs, err := h.manager.ActiveClient()
	if err != nil {
		return "", fmt.Errorf("dry-run apply: %w", err)
	}

	// Parse the YAML/JSON to get the resource object.
	var obj map[string]interface{}
	if err := sigyaml.Unmarshal(data, &obj); err != nil {
		return "", fmt.Errorf("parse YAML: %w", err)
	}
	metadata, _ := obj["metadata"].(map[string]interface{})
	name, _ := metadata["name"].(string)
	if name == "" {
		return "", fmt.Errorf("resource name is required in YAML metadata")
	}

	// Fetch the current live resource.
	gvr := schema.GroupVersionResource{Group: group, Version: version, Resource: res}
	ctx, cancel := context.WithTimeout(context.Background(), apiTimeout)
	defer cancel()

	rc := cs.Dynamic.Resource(gvr)
	// Use namespace-scoped client for namespaced resources, root client for cluster-scoped.
	var client dynamic.ResourceInterface = rc
	if namespace != "" {
		client = rc.Namespace(namespace)
	}

	liveObj, err := client.Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return "", fmt.Errorf("get live resource: %w", err)
	}
	liveYAML, err := sigyaml.Marshal(liveObj.Object)
	if err != nil {
		return "", fmt.Errorf("marshal live resource: %w", err)
	}

	// Server-side dry run using Update.
	unstructuredObj := &unstructured.Unstructured{Object: obj}
	// Copy resourceVersion from the live object so the update is valid.
	unstructuredObj.SetResourceVersion(liveObj.GetResourceVersion())
	dryRunObj, err := client.Update(
		ctx, unstructuredObj,
		metav1.UpdateOptions{DryRun: []string{metav1.DryRunAll}},
	)
	if err != nil {
		return "", fmt.Errorf("dry-run apply: %w", err)
	}
	dryRunYAML, err := sigyaml.Marshal(dryRunObj.Object)
	if err != nil {
		return "", fmt.Errorf("marshal dry-run result: %w", err)
	}

	return string(liveYAML) + "\n---SEPARATOR---\n" + string(dryRunYAML), nil
}

// DeleteResource deletes a resource after an RBAC pre-flight check.
func (h *ResourceHandler) DeleteResource(group, version, res, namespace, name string) error {
	if name == "" {
		return fmt.Errorf("resource name is required")
	}
	if err := h.checkRBAC("delete", group, res, namespace); err != nil {
		return err
	}
	cs, err := h.manager.ActiveClient()
	if err != nil {
		return fmt.Errorf("delete resource: %w", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), apiTimeout)
	defer cancel()
	err = h.svc.Delete(ctx, cs.Dynamic, h.query(group, version, res, namespace, name))
	status := "success"
	if err != nil {
		status = "failed"
	}
	h.auditLog("delete", res, namespace, name, "", status, err)
	return err
}

// GetPodMetrics returns aggregated CPU/memory metrics for pods in a namespace.
func (h *ResourceHandler) GetPodMetrics(namespace string) ([]cluster.PodUsage, error) {
	bundle, err := h.manager.ActiveClients()
	if err != nil {
		return nil, fmt.Errorf("pod metrics: %w", err)
	}
	if !bundle.HasMetrics() {
		return nil, nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), apiTimeout)
	defer cancel()
	podMetrics, err := bundle.Metrics.MetricsV1beta1().PodMetricses(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		slog.Warn("metrics API error", "namespace", namespace, "error", err)
		return nil, nil //nolint:nilerr // metrics are optional; log and continue
	}

	result := make([]cluster.PodUsage, 0, len(podMetrics.Items))
	for _, pm := range podMetrics.Items {
		var cpuMillis int64
		var memBytes int64
		for _, c := range pm.Containers {
			cpuMillis += c.Usage.Cpu().MilliValue()
			memBytes += c.Usage.Memory().Value()
		}
		result = append(result, cluster.PodUsage{
			PodName:   pm.Name,
			Namespace: pm.Namespace,
			CPUCores:  float64(cpuMillis) / 1000.0,
			MemoryMiB: memBytes / (1024 * 1024),
		})
	}
	return result, nil
}

// PatchLabels patches the labels on a resource using a strategic merge patch.
func (h *ResourceHandler) PatchLabels(group, version, res, namespace, name string, labels map[string]any) error {
	if name == "" {
		return fmt.Errorf("resource name is required")
	}
	cs, err := h.manager.ActiveClient()
	if err != nil {
		return fmt.Errorf("patch labels: %w", err)
	}

	patch := map[string]any{
		"metadata": map[string]any{
			"labels": labels,
		},
	}
	patchBytes, err := json.Marshal(patch)
	if err != nil {
		return fmt.Errorf("marshal patch: %w", err)
	}

	q := h.query(group, version, res, namespace, name)
	ctx, cancel := context.WithTimeout(context.Background(), apiTimeout)
	defer cancel()
	return h.svc.Patch(ctx, cs.Dynamic, q, types.MergePatchType, patchBytes)
}

// PatchServiceSelector patches the spec.selector on a Service using a merge patch.
func (h *ResourceHandler) PatchServiceSelector(namespace, name string, selector map[string]any) error {
	if name == "" {
		return fmt.Errorf("service name is required")
	}
	cs, err := h.manager.ActiveClient()
	if err != nil {
		return fmt.Errorf("patch service selector: %w", err)
	}

	patch := map[string]any{
		"spec": map[string]any{
			"selector": selector,
		},
	}
	patchBytes, err := json.Marshal(patch)
	if err != nil {
		return fmt.Errorf("marshal patch: %w", err)
	}

	q := h.query("", "v1", "services", namespace, name)
	ctx, cancel := context.WithTimeout(context.Background(), apiTimeout)
	defer cancel()
	return h.svc.Patch(ctx, cs.Dynamic, q, types.MergePatchType, patchBytes)
}

// BatchDeleteQuery is a JSON-friendly query for BatchDelete.
type BatchDeleteQuery struct {
	Group     string `json:"group"`
	Version   string `json:"version"`
	Resource  string `json:"resource"`
	Namespace string `json:"namespace"`
	Name      string `json:"name"`
}

// BatchDeleteResult holds the result of a single delete in a batch.
type BatchDeleteResult struct {
	Name  string `json:"name"`
	Error string `json:"error,omitempty"`
}

// BatchDelete deletes multiple resources and returns per-item results.
func (h *ResourceHandler) BatchDelete(queries []BatchDeleteQuery) []BatchDeleteResult {
	cs, err := h.manager.ActiveClient()
	if err != nil {
		results := make([]BatchDeleteResult, len(queries))
		for i, q := range queries {
			results[i] = BatchDeleteResult{Name: q.Name, Error: err.Error()}
		}
		return results
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	results := make([]BatchDeleteResult, len(queries))
	for i, q := range queries {
		rq := h.query(q.Group, q.Version, q.Resource, q.Namespace, q.Name)
		if delErr := h.svc.Delete(ctx, cs.Dynamic, rq); delErr != nil {
			results[i] = BatchDeleteResult{Name: q.Name, Error: delErr.Error()}
		} else {
			results[i] = BatchDeleteResult{Name: q.Name}
		}
	}
	return results
}

// WatchResources starts a watch for the given resource type and emits events
// via the event emitter in the format: resource-watch:{resourceType}.
func (h *ResourceHandler) WatchResources(group, version, res, namespace string) error {
	cs, err := h.manager.ActiveClient()
	if err != nil {
		return fmt.Errorf("watch resources: %w", err)
	}

	key := watchKey{group: group, version: version, resource: res, namespace: namespace}

	h.watchMu.Lock()
	// Cancel any existing watch for the same key.
	if cancel, ok := h.watchCancels[key]; ok {
		cancel()
		delete(h.watchCancels, key)
	}
	watchCtx, cancel := context.WithCancel(context.Background())
	h.watchCancels[key] = cancel
	h.watchMu.Unlock()

	q := h.query(group, version, res, namespace, "")
	ch, err := h.svc.Watch(watchCtx, cs.Dynamic, q)
	if err != nil {
		cancel()
		return fmt.Errorf("start watch: %w", err)
	}

	topic := fmt.Sprintf("resource-watch:%s", res)
	go func() {
		for evt := range ch {
			if h.emitter != nil {
				h.emitter.Emit(topic, map[string]any{
					"type":     evt.Type,
					"resource": evt.Resource,
				})
			}

			// Record resource change to troubleshoot timeline.
			if h.timeline != nil {
				kind, _ := evt.Resource.Raw["kind"].(string)
				if kind == "" {
					kind = res
				}
				h.timeline.Record(troubleshoot.ChangeRecord{
					Timestamp:  time.Now(),
					Kind:       kind,
					Namespace:  evt.Resource.Namespace,
					Name:       evt.Resource.Name,
					ChangeType: strings.ToLower(evt.Type),
				})
			}

			// Evaluate alert rules against resource state.
			if h.alertStore != nil {
				h.evaluateAlertRules(evt, res)
			}
		}
	}()

	return nil
}

// StopWatch stops an active watch for the given resource type.
// The cancel function is called outside the lock to prevent potential deadlocks.
func (h *ResourceHandler) StopWatch(group, version, res, namespace string) {
	key := watchKey{group: group, version: version, resource: res, namespace: namespace}
	h.watchMu.Lock()
	cancel, ok := h.watchCancels[key]
	if ok {
		delete(h.watchCancels, key)
	}
	h.watchMu.Unlock()
	if ok {
		cancel()
	}
}

// evaluateAlertRules checks the resource against all enabled alert rules and fires matching alerts.
func (h *ResourceHandler) evaluateAlertRules(evt resource.WatchEvent, resourceType string) {
	status, _ := evt.Resource.Status["phase"].(string)

	// Extract container statuses for restart count and CrashLoopBackOff detection.
	var totalRestarts float64
	var hasCrashLoop bool
	if cs, ok := evt.Resource.Status["containerStatuses"].([]interface{}); ok {
		for _, c := range cs {
			cMap, _ := c.(map[string]interface{})
			if cMap == nil {
				continue
			}
			if rc, ok := cMap["restartCount"].(float64); ok {
				totalRestarts += rc
			}
			if waiting, ok := cMap["state"].(map[string]interface{}); ok {
				if w, ok := waiting["waiting"].(map[string]interface{}); ok {
					if reason, _ := w["reason"].(string); reason == "CrashLoopBackOff" {
						hasCrashLoop = true
					}
				}
			}
		}
	}

	// Check deployment availability.
	var unavailableReplicas float64
	if ur, ok := evt.Resource.Status["unavailableReplicas"].(float64); ok {
		unavailableReplicas = ur
	}
	var availableReplicas float64
	if ar, ok := evt.Resource.Status["availableReplicas"].(float64); ok {
		availableReplicas = ar
	}

	// Check node conditions for NotReady.
	var nodeNotReady bool
	if conditions, ok := evt.Resource.Status["conditions"].([]interface{}); ok {
		for _, c := range conditions {
			cMap, _ := c.(map[string]interface{})
			if cMap == nil {
				continue
			}
			if cMap["type"] == "Ready" && cMap["status"] != "True" {
				nodeNotReady = true
			}
		}
	}

	resourceID := fmt.Sprintf("%s/%s/%s", resourceType, evt.Resource.Namespace, evt.Resource.Name)
	if evt.Resource.Namespace == "" {
		resourceID = fmt.Sprintf("%s/%s", resourceType, evt.Resource.Name)
	}

	for _, rule := range alerts.DefaultRules() {
		if !rule.Enabled {
			continue
		}
		var matched bool
		switch rule.Condition {
		case "CrashLoopBackOff":
			matched = hasCrashLoop
		case "Pending":
			matched = status == "Pending"
		case "NotReady":
			matched = nodeNotReady
		case "Unavailable":
			matched = (resourceType == "deployments") && availableReplicas == 0 && unavailableReplicas > 0
		case "RestartCount>10":
			matched = totalRestarts > 10
		}
		if matched {
			h.alertStore.Fire(rule, resourceID, fmt.Sprintf("%s: %s", rule.Description, resourceID))
		}
	}
}

// EventInfo is the frontend-friendly representation of a Kubernetes event.
type EventInfo struct {
	Type           string `json:"type"`
	Reason         string `json:"reason"`
	Message        string `json:"message"`
	ObjectKind     string `json:"objectKind"`
	ObjectName     string `json:"objectName"`
	ObjectNS       string `json:"objectNamespace"`
	Count          int32  `json:"count"`
	FirstTimestamp string `json:"firstTimestamp"`
	LastTimestamp   string `json:"lastTimestamp"`
}

// ListEvents returns recent cluster events, sorted by last timestamp.
func (h *ResourceHandler) ListEvents(namespace string, limit int) ([]EventInfo, error) {
	cs, err := h.manager.ActiveClient()
	if err != nil {
		return nil, fmt.Errorf("list events: %w", err)
	}

	opts := metav1.ListOptions{}
	if limit > 0 {
		opts.Limit = int64(limit)
	}

	ctx, cancel := context.WithTimeout(context.Background(), apiTimeout)
	defer cancel()
	eventList, err := cs.Typed.CoreV1().Events(namespace).List(ctx, opts)
	if err != nil {
		return nil, fmt.Errorf("list events: %w", err)
	}

	// Sort by last timestamp, newest first
	sort.Slice(eventList.Items, func(i, j int) bool {
		return eventList.Items[i].LastTimestamp.After(eventList.Items[j].LastTimestamp.Time)
	})

	result := make([]EventInfo, 0, len(eventList.Items))
	for _, e := range eventList.Items {
		result = append(result, EventInfo{
			Type:           e.Type,
			Reason:         e.Reason,
			Message:        e.Message,
			ObjectKind:     e.InvolvedObject.Kind,
			ObjectName:     e.InvolvedObject.Name,
			ObjectNS:       e.InvolvedObject.Namespace,
			Count:          e.Count,
			FirstTimestamp: e.FirstTimestamp.Time.Format(time.RFC3339),
			LastTimestamp:   e.LastTimestamp.Time.Format(time.RFC3339),
		})
	}
	return result, nil
}

// ScaleDeployment patches the replicas field of a deployment after an RBAC pre-flight check.
func (h *ResourceHandler) ScaleDeployment(namespace, name string, replicas int32) error {
	if err := h.checkRBAC("patch", "apps", "deployments", namespace); err != nil {
		return err
	}
	cs, err := h.manager.ActiveClient()
	if err != nil {
		return fmt.Errorf("scale deployment: %w", err)
	}

	patchObj := map[string]any{"spec": map[string]any{"replicas": replicas}}
	patchBytes, err := json.Marshal(patchObj)
	if err != nil {
		return fmt.Errorf("marshal scale patch: %w", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), apiTimeout)
	defer cancel()
	_, err = cs.Typed.AppsV1().Deployments(namespace).Patch(ctx, name, types.StrategicMergePatchType, patchBytes, metav1.PatchOptions{})
	if err != nil {
		h.auditLog("scale", "Deployment", namespace, name, fmt.Sprintf("replicas=%d", replicas), "failed", err)
		return fmt.Errorf("scale deployment %s/%s: %w", namespace, name, err)
	}
	h.auditLog("scale", "Deployment", namespace, name, fmt.Sprintf("replicas=%d", replicas), "success", nil)
	return nil
}

// RestartDeployment triggers a rolling restart by patching the pod template annotation.
func (h *ResourceHandler) RestartDeployment(namespace, name string) error {
	if err := h.checkRBAC("patch", "apps", "deployments", namespace); err != nil {
		return err
	}
	cs, err := h.manager.ActiveClient()
	if err != nil {
		return fmt.Errorf("restart deployment: %w", err)
	}

	patchObj := map[string]any{
		"spec": map[string]any{
			"template": map[string]any{
				"metadata": map[string]any{
					"annotations": map[string]any{
						"kubectl.kubernetes.io/restartedAt": time.Now().UTC().Format(time.RFC3339),
					},
				},
			},
		},
	}
	patchBytes, err := json.Marshal(patchObj)
	if err != nil {
		return fmt.Errorf("marshal restart patch: %w", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), apiTimeout)
	defer cancel()
	_, err = cs.Typed.AppsV1().Deployments(namespace).Patch(ctx, name, types.StrategicMergePatchType, patchBytes, metav1.PatchOptions{})
	if err != nil {
		h.auditLog("restart", "Deployment", namespace, name, "", "failed", err)
		return fmt.Errorf("restart deployment %s/%s: %w", namespace, name, err)
	}
	h.auditLog("restart", "Deployment", namespace, name, "", "success", nil)
	return nil
}

// CordonNode marks a node as unschedulable.
func (h *ResourceHandler) CordonNode(nodeName string) error {
	cs, err := h.manager.ActiveClient()
	if err != nil {
		return fmt.Errorf("cordon node: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), apiTimeout)
	defer cancel()
	patch := []byte(`{"spec":{"unschedulable":true}}`)
	_, err = cs.Typed.CoreV1().Nodes().Patch(ctx, nodeName, types.StrategicMergePatchType, patch, metav1.PatchOptions{})
	if err != nil {
		h.auditLog("cordon", "Node", "", nodeName, "", "failed", err)
		return fmt.Errorf("cordon node %s: %w", nodeName, err)
	}
	h.auditLog("cordon", "Node", "", nodeName, "", "success", nil)
	return nil
}

// UncordonNode marks a node as schedulable.
func (h *ResourceHandler) UncordonNode(nodeName string) error {
	cs, err := h.manager.ActiveClient()
	if err != nil {
		return fmt.Errorf("uncordon node: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), apiTimeout)
	defer cancel()
	patch := []byte(`{"spec":{"unschedulable":false}}`)
	_, err = cs.Typed.CoreV1().Nodes().Patch(ctx, nodeName, types.StrategicMergePatchType, patch, metav1.PatchOptions{})
	if err != nil {
		h.auditLog("uncordon", "Node", "", nodeName, "", "failed", err)
		return fmt.Errorf("uncordon node %s: %w", nodeName, err)
	}
	h.auditLog("uncordon", "Node", "", nodeName, "", "success", nil)
	return nil
}

// DrainNode cordons a node and evicts all non-DaemonSet pods from it.
// Evictions run concurrently (up to maxConcurrentEvictions) for performance.
// When deleteEmptyDirData is true, pods using emptyDir volumes are also evicted.
func (h *ResourceHandler) DrainNode(nodeName string, gracePeriod int64, force, ignoreDaemonSets, deleteEmptyDirData bool) error {
	if err := h.checkRBAC("create", "policy", "evictions", ""); err != nil {
		return err
	}

	// Cordon the node first to prevent new pods from being scheduled.
	if err := h.CordonNode(nodeName); err != nil {
		return fmt.Errorf("cordon node for drain: %w", err)
	}

	cs, err := h.manager.ActiveClient()
	if err != nil {
		return fmt.Errorf("drain node: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), drainTimeout)
	defer cancel()

	// List pods on the node.
	pods, err := cs.Typed.CoreV1().Pods("").List(ctx, metav1.ListOptions{
		FieldSelector: fmt.Sprintf("spec.nodeName=%s", nodeName),
	})
	if err != nil {
		return fmt.Errorf("list pods on node %s: %w", nodeName, err)
	}

	// Filter pods to evict.
	var toEvict []*corev1.Pod
	for i := range pods.Items {
		pod := &pods.Items[i]
		if ignoreDaemonSets && isDaemonSetPod(pod) {
			continue
		}
		if _, ok := pod.Annotations["kubernetes.io/config.mirror"]; ok {
			continue
		}
		if !deleteEmptyDirData && hasEmptyDirVolume(pod) {
			continue
		}
		toEvict = append(toEvict, pod)
	}

	// Evict pods concurrently with a bounded semaphore.
	// When force=false, cancel remaining evictions on first error.
	evictCtx, evictCancel := context.WithCancel(ctx)
	defer evictCancel()

	var (
		wg   sync.WaitGroup
		mu   sync.Mutex
		errs []string
		sem  = make(chan struct{}, maxConcurrentEvictions)
	)

	for _, pod := range toEvict {
		pod := pod

		// Check if we should stop (force=false and an error occurred).
		if evictCtx.Err() != nil {
			break
		}

		sem <- struct{}{}
		wg.Add(1)
		go func() {
			defer wg.Done()
			defer func() { <-sem }()

			eviction := &policyv1.Eviction{
				ObjectMeta: metav1.ObjectMeta{
					Name:      pod.Name,
					Namespace: pod.Namespace,
				},
				DeleteOptions: &metav1.DeleteOptions{
					GracePeriodSeconds: &gracePeriod,
				},
			}
			if evErr := cs.Typed.CoreV1().Pods(pod.Namespace).EvictV1(evictCtx, eviction); evErr != nil {
				mu.Lock()
				errs = append(errs, fmt.Sprintf("%s/%s: %v", pod.Namespace, pod.Name, evErr))
				mu.Unlock()
				if !force {
					evictCancel() // signal all goroutines to stop
				}
			}
		}()
	}
	wg.Wait()

	if len(errs) > 0 {
		return fmt.Errorf("drain completed with errors: %s", strings.Join(errs, "; "))
	}
	return nil
}

// isDaemonSetPod checks if a pod is owned by a DaemonSet.
func isDaemonSetPod(pod *corev1.Pod) bool {
	for _, ref := range pod.OwnerReferences {
		if ref.Kind == "DaemonSet" {
			return true
		}
	}
	return false
}

// hasEmptyDirVolume checks if a pod uses any emptyDir volumes.
func hasEmptyDirVolume(pod *corev1.Pod) bool {
	for _, vol := range pod.Spec.Volumes {
		if vol.EmptyDir != nil {
			return true
		}
	}
	return false
}

// PauseDeployment pauses a deployment rollout by setting spec.paused to true.
func (h *ResourceHandler) PauseDeployment(namespace, name string) error {
	if name == "" {
		return fmt.Errorf("deployment name is required")
	}
	if err := h.checkRBAC("patch", "apps", "deployments", namespace); err != nil {
		return err
	}
	cs, err := h.manager.ActiveClient()
	if err != nil {
		return fmt.Errorf("pause deployment: %w", err)
	}

	patchObj := map[string]any{"spec": map[string]any{"paused": true}}
	patchBytes, err := json.Marshal(patchObj)
	if err != nil {
		return fmt.Errorf("marshal pause patch: %w", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), apiTimeout)
	defer cancel()
	_, err = cs.Typed.AppsV1().Deployments(namespace).Patch(ctx, name, types.StrategicMergePatchType, patchBytes, metav1.PatchOptions{})
	if err != nil {
		h.auditLog("pause", "Deployment", namespace, name, "", "failed", err)
		return fmt.Errorf("pause deployment %s/%s: %w", namespace, name, err)
	}
	h.auditLog("pause", "Deployment", namespace, name, "", "success", nil)
	return nil
}

// ResumeDeployment resumes a paused deployment rollout by setting spec.paused to false.
func (h *ResourceHandler) ResumeDeployment(namespace, name string) error {
	if name == "" {
		return fmt.Errorf("deployment name is required")
	}
	if err := h.checkRBAC("patch", "apps", "deployments", namespace); err != nil {
		return err
	}
	cs, err := h.manager.ActiveClient()
	if err != nil {
		return fmt.Errorf("resume deployment: %w", err)
	}

	patchObj := map[string]any{"spec": map[string]any{"paused": false}}
	patchBytes, err := json.Marshal(patchObj)
	if err != nil {
		return fmt.Errorf("marshal resume patch: %w", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), apiTimeout)
	defer cancel()
	_, err = cs.Typed.AppsV1().Deployments(namespace).Patch(ctx, name, types.StrategicMergePatchType, patchBytes, metav1.PatchOptions{})
	if err != nil {
		h.auditLog("resume", "Deployment", namespace, name, "", "failed", err)
		return fmt.Errorf("resume deployment %s/%s: %w", namespace, name, err)
	}
	h.auditLog("resume", "Deployment", namespace, name, "", "success", nil)
	return nil
}

// RolloutRevision represents a single revision in a deployment's rollout history.
type RolloutRevision struct {
	Revision    int64    `json:"revision"`
	Images      []string `json:"images"`
	ChangeCause string   `json:"changeCause"`
	Created     string   `json:"created"`
}

// GetRolloutHistory returns the rollout history for a deployment by querying
// its owned ReplicaSets and extracting revision annotations.
func (h *ResourceHandler) GetRolloutHistory(namespace, name string) ([]RolloutRevision, error) {
	if name == "" {
		return nil, fmt.Errorf("deployment name is required")
	}
	cs, err := h.manager.ActiveClient()
	if err != nil {
		return nil, fmt.Errorf("get rollout history: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), apiTimeout)
	defer cancel()

	// Get the deployment to read its label selector.
	deploy, err := cs.Typed.AppsV1().Deployments(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("get deployment %s/%s: %w", namespace, name, err)
	}

	// Build a label selector from the deployment's selector.
	var selectorParts []string
	if deploy.Spec.Selector != nil {
		for k, v := range deploy.Spec.Selector.MatchLabels {
			selectorParts = append(selectorParts, fmt.Sprintf("%s=%s", k, v))
		}
	}
	labelSelector := strings.Join(selectorParts, ",")

	// List ReplicaSets matching the deployment's selector.
	rsList, err := cs.Typed.AppsV1().ReplicaSets(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: labelSelector,
	})
	if err != nil {
		return nil, fmt.Errorf("list replicasets for %s/%s: %w", namespace, name, err)
	}

	// Filter to only ReplicaSets owned by this deployment.
	var revisions []RolloutRevision
	for _, rs := range rsList.Items {
		owned := false
		for _, ref := range rs.OwnerReferences {
			if ref.Kind == "Deployment" && ref.Name == name {
				owned = true
				break
			}
		}
		if !owned {
			continue
		}

		revStr := rs.Annotations["deployment.kubernetes.io/revision"]
		var rev int64
		if revStr != "" {
			_, _ = fmt.Sscanf(revStr, "%d", &rev)
		}

		var images []string
		for _, c := range rs.Spec.Template.Spec.Containers {
			images = append(images, c.Image)
		}

		changeCause := rs.Annotations["kubernetes.io/change-cause"]

		revisions = append(revisions, RolloutRevision{
			Revision:    rev,
			Images:      images,
			ChangeCause: changeCause,
			Created:     rs.CreationTimestamp.Format(time.RFC3339),
		})
	}

	// Sort by revision number descending (newest first).
	sort.Slice(revisions, func(i, j int) bool {
		return revisions[i].Revision > revisions[j].Revision
	})

	return revisions, nil
}

// AddNodeTaint adds a taint to a node.
// Valid effects: NoSchedule, PreferNoSchedule, NoExecute.
func (h *ResourceHandler) AddNodeTaint(nodeName, key, value, effect string) error {
	if nodeName == "" {
		return fmt.Errorf("node name is required")
	}
	if key == "" {
		return fmt.Errorf("taint key is required")
	}
	if effect != "NoSchedule" && effect != "PreferNoSchedule" && effect != "NoExecute" {
		return fmt.Errorf("invalid taint effect %q: must be NoSchedule, PreferNoSchedule, or NoExecute", effect)
	}
	if err := h.checkRBAC("patch", "", "nodes", ""); err != nil {
		return err
	}
	cs, err := h.manager.ActiveClient()
	if err != nil {
		return fmt.Errorf("add node taint: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), apiTimeout)
	defer cancel()

	// Get the current node to read existing taints.
	node, err := cs.Typed.CoreV1().Nodes().Get(ctx, nodeName, metav1.GetOptions{})
	if err != nil {
		return fmt.Errorf("get node %s: %w", nodeName, err)
	}

	// Check if taint already exists.
	newTaint := corev1.Taint{
		Key:    key,
		Value:  value,
		Effect: corev1.TaintEffect(effect),
	}
	for _, t := range node.Spec.Taints {
		if t.Key == key && t.Effect == newTaint.Effect {
			return fmt.Errorf("taint with key %q and effect %q already exists on node %s", key, effect, nodeName)
		}
	}

	node.Spec.Taints = append(node.Spec.Taints, newTaint)

	_, err = cs.Typed.CoreV1().Nodes().Update(ctx, node, metav1.UpdateOptions{})
	if err != nil {
		return fmt.Errorf("add taint to node %s: %w", nodeName, err)
	}
	return nil
}

// RemoveNodeTaint removes a taint from a node by key.
func (h *ResourceHandler) RemoveNodeTaint(nodeName, key string) error {
	if nodeName == "" {
		return fmt.Errorf("node name is required")
	}
	if key == "" {
		return fmt.Errorf("taint key is required")
	}
	if err := h.checkRBAC("patch", "", "nodes", ""); err != nil {
		return err
	}
	cs, err := h.manager.ActiveClient()
	if err != nil {
		return fmt.Errorf("remove node taint: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), apiTimeout)
	defer cancel()

	node, err := cs.Typed.CoreV1().Nodes().Get(ctx, nodeName, metav1.GetOptions{})
	if err != nil {
		return fmt.Errorf("get node %s: %w", nodeName, err)
	}

	var filtered []corev1.Taint
	found := false
	for _, t := range node.Spec.Taints {
		if t.Key == key {
			found = true
			continue
		}
		filtered = append(filtered, t)
	}
	if !found {
		return fmt.Errorf("taint with key %q not found on node %s", key, nodeName)
	}

	node.Spec.Taints = filtered

	_, err = cs.Typed.CoreV1().Nodes().Update(ctx, node, metav1.UpdateOptions{})
	if err != nil {
		return fmt.Errorf("remove taint from node %s: %w", nodeName, err)
	}
	return nil
}

// CreateJobFromCronJob creates a Job from a CronJob's jobTemplate.
// If jobName is empty, it auto-generates as "{cronJobName}-manual-{timestamp}".
func (h *ResourceHandler) CreateJobFromCronJob(namespace, cronJobName, jobName string) error {
	if cronJobName == "" {
		return fmt.Errorf("cronjob name is required")
	}
	if err := h.checkRBAC("create", "batch", "jobs", namespace); err != nil {
		return err
	}
	cs, err := h.manager.ActiveClient()
	if err != nil {
		return fmt.Errorf("create job from cronjob: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), apiTimeout)
	defer cancel()

	// Get the CronJob.
	cronJob, err := cs.Typed.BatchV1().CronJobs(namespace).Get(ctx, cronJobName, metav1.GetOptions{})
	if err != nil {
		return fmt.Errorf("get cronjob %s/%s: %w", namespace, cronJobName, err)
	}

	// Auto-generate job name if empty.
	if jobName == "" {
		jobName = fmt.Sprintf("%s-manual-%d", cronJobName, time.Now().Unix())
	}

	// Create the Job from the CronJob's jobTemplate.
	job := &batchv1.Job{
		ObjectMeta: metav1.ObjectMeta{
			Name:      jobName,
			Namespace: namespace,
			Labels:    cronJob.Spec.JobTemplate.Labels,
			Annotations: map[string]string{
				"cronjob.kubernetes.io/instantiate": "manual",
			},
		},
		Spec: cronJob.Spec.JobTemplate.Spec,
	}

	_, err = cs.Typed.BatchV1().Jobs(namespace).Create(ctx, job, metav1.CreateOptions{})
	if err != nil {
		h.auditLog("create", "Job", namespace, jobName, fmt.Sprintf("from-cronjob=%s", cronJobName), "failed", err)
		return fmt.Errorf("create job %s/%s: %w", namespace, jobName, err)
	}
	h.auditLog("create", "Job", namespace, jobName, fmt.Sprintf("from-cronjob=%s", cronJobName), "success", nil)
	return nil
}
