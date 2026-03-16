package handlers

import (
	"context"
	"fmt"
	"time"

	"kubeviewer/internal/cluster"
	"kubeviewer/internal/rbacgraph"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

// RBACHandler exposes RBAC graph building to the frontend.
type RBACHandler struct {
	builder *rbacgraph.Builder
	manager *cluster.Manager
}

// NewRBACHandler creates an RBACHandler.
func NewRBACHandler(mgr *cluster.Manager) *RBACHandler {
	return &RBACHandler{builder: rbacgraph.NewBuilder(), manager: mgr}
}

// BuildRBACGraph constructs an RBAC graph from raw Kubernetes resources.
func (h *RBACHandler) BuildRBACGraph(roles, clusterRoles, bindings, clusterBindings []map[string]any) *rbacgraph.RBACGraph {
	return h.builder.BuildGraph(roles, clusterRoles, bindings, clusterBindings)
}

// BuildClusterRBACGraph fetches all RBAC resources from the cluster and builds a graph.
func (h *RBACHandler) BuildClusterRBACGraph() (*rbacgraph.RBACGraph, error) {
	bundle, err := h.manager.ActiveClients()
	if err != nil {
		return nil, fmt.Errorf("active clients: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	rbacGroup := "rbac.authorization.k8s.io"

	// List Roles (all namespaces)
	rolesGVR := schema.GroupVersionResource{Group: rbacGroup, Version: "v1", Resource: "roles"}
	rolesResult, err := bundle.Dynamic.Resource(rolesGVR).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list roles: %w", err)
	}
	roles := make([]map[string]any, 0, len(rolesResult.Items))
	for _, item := range rolesResult.Items {
		roles = append(roles, item.Object)
	}

	// List ClusterRoles
	clusterRolesGVR := schema.GroupVersionResource{Group: rbacGroup, Version: "v1", Resource: "clusterroles"}
	clusterRolesResult, err := bundle.Dynamic.Resource(clusterRolesGVR).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list cluster roles: %w", err)
	}
	clusterRoles := make([]map[string]any, 0, len(clusterRolesResult.Items))
	for _, item := range clusterRolesResult.Items {
		clusterRoles = append(clusterRoles, item.Object)
	}

	// List RoleBindings (all namespaces)
	bindingsGVR := schema.GroupVersionResource{Group: rbacGroup, Version: "v1", Resource: "rolebindings"}
	bindingsResult, err := bundle.Dynamic.Resource(bindingsGVR).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list role bindings: %w", err)
	}
	bindings := make([]map[string]any, 0, len(bindingsResult.Items))
	for _, item := range bindingsResult.Items {
		bindings = append(bindings, item.Object)
	}

	// List ClusterRoleBindings
	clusterBindingsGVR := schema.GroupVersionResource{Group: rbacGroup, Version: "v1", Resource: "clusterrolebindings"}
	clusterBindingsResult, err := bundle.Dynamic.Resource(clusterBindingsGVR).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list cluster role bindings: %w", err)
	}
	clusterBindings := make([]map[string]any, 0, len(clusterBindingsResult.Items))
	for _, item := range clusterBindingsResult.Items {
		clusterBindings = append(clusterBindings, item.Object)
	}

	return h.builder.BuildGraph(roles, clusterRoles, bindings, clusterBindings), nil
}
