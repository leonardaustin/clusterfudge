package main

import (
	"context"
	"testing"

	"clusterfudge/internal/cluster"
	"clusterfudge/internal/k8s"
)

func TestNewApp(t *testing.T) {
	mgr := cluster.NewManager()
	app := NewApp(mgr, nil)
	if app == nil {
		t.Fatal("NewApp returned nil")
	}
	if app.clusterMgr != mgr {
		t.Fatal("clusterMgr not set correctly")
	}
}

func TestNewAppNilPanics(t *testing.T) {
	defer func() {
		if r := recover(); r == nil {
			t.Fatal("expected panic for nil clusterMgr")
		}
	}()
	NewApp(nil, nil)
}

func TestGetVersion(t *testing.T) {
	mgr := cluster.NewManager()
	app := NewApp(mgr, nil)
	v := app.GetVersion()
	if v != "dev" {
		t.Fatalf("expected version dev, got %s", v)
	}
}

func TestStartup(t *testing.T) {
	mgr := cluster.NewManager()
	app := NewApp(mgr, nil)
	ctx := context.Background()
	app.startup(ctx)
	if app.ctx != ctx {
		t.Fatal("startup did not set ctx")
	}
}

func TestDomReady(t *testing.T) {
	mgr := cluster.NewManager()
	app := NewApp(mgr, nil)
	// domReady should not panic
	app.domReady(context.Background())
}

func TestShutdown(t *testing.T) {
	mgr := cluster.NewManager()
	mgr.SetClientForTest(&k8s.ClientSet{})
	app := NewApp(mgr, nil)

	if app.clusterMgr.ActiveConnection() == nil {
		t.Fatal("pre-condition failed: manager should be connected")
	}

	app.shutdown(context.Background())

	if app.clusterMgr.ActiveConnection() != nil {
		t.Fatal("manager should be disconnected after shutdown")
	}
}

func TestSingularDisplayName(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"Pods", "Pod"},
		{"Services", "Service"},
		{"Deployments", "Deployment"},
		{"StatefulSets", "StatefulSet"},
		{"DaemonSets", "DaemonSet"},
		{"ConfigMaps", "ConfigMap"},
		{"Ingresses", "Ingress"},
		{"Network Policies", "Network Policy"},
		{"Priority Classes", "Priority Class"},
		{"Storage Classes", "Storage Class"},
		{"Endpoint Slices", "Endpoint Slice"},
		{"Runtime Classes", "Runtime Class"},
		{"CSI Drivers", "CSI Driver"},
		{"Horizontal Pod Autoscalers", "Horizontal Pod Autoscaler"},
		{"Custom Resource Definitions", "Custom Resource Definition"},
		{"Endpoints", "Endpoint"},
		{"Events", "Event"},
		{"Namespaces", "Namespace"},
		{"Nodes", "Node"},
		{"Leases", "Lease"},
		{"CronJobs", "CronJob"},
		{"Jobs", "Job"},
	}

	for _, tc := range tests {
		t.Run(tc.input, func(t *testing.T) {
			got := singularDisplayName(tc.input)
			if got != tc.want {
				t.Errorf("singularDisplayName(%q) = %q, want %q", tc.input, got, tc.want)
			}
		})
	}
}

func TestSearchResources_QueryTooShort(t *testing.T) {
	mgr := cluster.NewManager()
	app := NewApp(mgr, nil)

	results, err := app.SearchResources("a")
	if err != nil {
		t.Fatalf("expected no error for short query, got %v", err)
	}
	if results != nil {
		t.Errorf("expected nil results for query < 2 chars, got %d results", len(results))
	}
}

func TestSearchResources_NoCluster(t *testing.T) {
	mgr := cluster.NewManager()
	app := NewApp(mgr, nil)

	_, err := app.SearchResources("nginx")
	if err == nil {
		t.Fatal("expected error when no cluster is connected")
	}
}
