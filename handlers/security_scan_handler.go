package handlers

import (
	"context"
	"fmt"
	"time"

	"kubeviewer/internal/cluster"
	"kubeviewer/internal/security"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

// ScanAllPodsResult aggregates security scan results across pods.
type ScanAllPodsResult struct {
	Violations []security.SecurityIssue `json:"violations"`
	PodCount   int                      `json:"podCount"`
}

// SecurityScanHandler exposes security scanning to the frontend.
type SecurityScanHandler struct {
	manager *cluster.Manager
}

// NewSecurityScanHandler creates a SecurityScanHandler.
func NewSecurityScanHandler(mgr *cluster.Manager) *SecurityScanHandler {
	return &SecurityScanHandler{manager: mgr}
}

// CheckPodSecurity evaluates a pod spec for security issues.
func (h *SecurityScanHandler) CheckPodSecurity(podSpec map[string]any) *security.PodSecurityCheck {
	return security.CheckPodSecurity(podSpec)
}

// ScanAllPods lists pods in the given namespace (or all namespaces if empty)
// and runs security checks on each pod spec.
func (h *SecurityScanHandler) ScanAllPods(namespace string) (*ScanAllPodsResult, error) {
	bundle, err := h.manager.ActiveClients()
	if err != nil {
		return nil, fmt.Errorf("active clients: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	gvr := schema.GroupVersionResource{Group: "", Version: "v1", Resource: "pods"}
	var result *unstructured.UnstructuredList
	if namespace != "" {
		result, err = bundle.Dynamic.Resource(gvr).Namespace(namespace).List(ctx, metav1.ListOptions{})
	} else {
		result, err = bundle.Dynamic.Resource(gvr).List(ctx, metav1.ListOptions{})
	}
	if err != nil {
		return nil, fmt.Errorf("list pods: %w", err)
	}

	scanResult := &ScanAllPodsResult{
		PodCount: len(result.Items),
	}

	for _, item := range result.Items {
		spec, _ := item.Object["spec"].(map[string]any)
		if spec == nil {
			continue
		}

		metadata, _ := item.Object["metadata"].(map[string]any)
		podName, _ := metadata["name"].(string)
		podNamespace, _ := metadata["namespace"].(string)

		check := security.CheckPodSecurity(spec)
		for _, v := range check.Violations {
			v.Field = fmt.Sprintf("%s/%s: %s", podNamespace, podName, v.Field)
			scanResult.Violations = append(scanResult.Violations, v)
		}
	}

	return scanResult, nil
}
