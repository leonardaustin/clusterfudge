package handlers

import (
	"context"
	"fmt"
	"time"

	"clusterfudge/internal/cluster"
	"clusterfudge/internal/netpol"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

// NetPolHandler exposes network policy graph building to the frontend.
type NetPolHandler struct {
	builder *netpol.Builder
	manager *cluster.Manager
}

// NewNetPolHandler creates a NetPolHandler.
func NewNetPolHandler(mgr *cluster.Manager) *NetPolHandler {
	return &NetPolHandler{builder: netpol.NewBuilder(), manager: mgr}
}

// BuildNetworkGraph constructs a network graph from raw policies and pods.
func (h *NetPolHandler) BuildNetworkGraph(policies, pods []map[string]any) *netpol.NetworkGraph {
	return h.builder.BuildGraph(policies, pods)
}

// BuildClusterNetworkGraph fetches NetworkPolicies and Pods from the cluster
// and builds a network graph.
func (h *NetPolHandler) BuildClusterNetworkGraph(namespace string) (*netpol.NetworkGraph, error) {
	bundle, err := h.manager.ActiveClients()
	if err != nil {
		return nil, fmt.Errorf("active clients: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// List NetworkPolicies
	netpolGVR := schema.GroupVersionResource{Group: "networking.k8s.io", Version: "v1", Resource: "networkpolicies"}
	var netpolResult *unstructured.UnstructuredList
	if namespace != "" {
		netpolResult, err = bundle.Dynamic.Resource(netpolGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
	} else {
		netpolResult, err = bundle.Dynamic.Resource(netpolGVR).List(ctx, metav1.ListOptions{})
	}
	if err != nil {
		return nil, fmt.Errorf("list network policies: %w", err)
	}

	policies := make([]map[string]any, 0, len(netpolResult.Items))
	for _, item := range netpolResult.Items {
		policies = append(policies, item.Object)
	}

	// List Pods
	podGVR := schema.GroupVersionResource{Group: "", Version: "v1", Resource: "pods"}
	var podResult *unstructured.UnstructuredList
	if namespace != "" {
		podResult, err = bundle.Dynamic.Resource(podGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
	} else {
		podResult, err = bundle.Dynamic.Resource(podGVR).List(ctx, metav1.ListOptions{})
	}
	if err != nil {
		return nil, fmt.Errorf("list pods: %w", err)
	}

	pods := make([]map[string]any, 0, len(podResult.Items))
	for _, item := range podResult.Items {
		pods = append(pods, item.Object)
	}

	return h.builder.BuildGraph(policies, pods), nil
}
