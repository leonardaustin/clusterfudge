//go:build e2e

package e2e

import (
	"context"
	"testing"
	"time"

	"kubeviewer/handlers"
)

// TC-SUMMARY-001: GetClusterSummary returns valid counts
func TestClusterSummary_BasicCounts(t *testing.T) {
	mgr := newClusterManager(t)
	ch := handlers.NewClusterHandler(mgr)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	summary, err := ch.GetClusterSummary(ctx)
	if err != nil {
		t.Fatalf("GetClusterSummary: %v", err)
	}

	if summary.NodeCount < 1 {
		t.Errorf("expected at least 1 node, got %d", summary.NodeCount)
	}
	if summary.NodeReady < 1 {
		t.Errorf("expected at least 1 ready node, got %d", summary.NodeReady)
	}
	if summary.PodCount < 1 {
		t.Errorf("expected at least 1 pod (system pods), got %d", summary.PodCount)
	}
	if summary.PodRunning < 1 {
		t.Errorf("expected at least 1 running pod, got %d", summary.PodRunning)
	}
	if summary.ServiceCount < 1 {
		t.Errorf("expected at least 1 service (kubernetes default), got %d", summary.ServiceCount)
	}
}

// TC-SUMMARY-002: Counts reflect actual resources
func TestClusterSummary_ReflectsCreatedResources(t *testing.T) {
	mgr := newClusterManager(t)
	ch := handlers.NewClusterHandler(mgr)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Get baseline counts
	before, err := ch.GetClusterSummary(ctx)
	if err != nil {
		t.Fatalf("GetClusterSummary (before): %v", err)
	}

	// Create a deployment
	depName := randName("e2e-summary-dep")
	createDeployment(t, testEnv.namespace, depName, 1)
	t.Cleanup(func() { deleteDeployment(t, testEnv.namespace, depName) })
	waitForDeploymentReady(t, testEnv.namespace, depName, 1, 90*time.Second)

	// Create a service
	svcName := randName("e2e-summary-svc")
	createService(t, testEnv.namespace, svcName, map[string]string{"app": depName}, 80)
	t.Cleanup(func() { deleteService(t, testEnv.namespace, svcName) })

	// Get updated counts
	after, err := ch.GetClusterSummary(ctx)
	if err != nil {
		t.Fatalf("GetClusterSummary (after): %v", err)
	}

	if after.DeploymentCount <= before.DeploymentCount {
		t.Errorf("expected deployment count to increase: before=%d after=%d", before.DeploymentCount, after.DeploymentCount)
	}
	if after.ServiceCount <= before.ServiceCount {
		t.Errorf("expected service count to increase: before=%d after=%d", before.ServiceCount, after.ServiceCount)
	}
}

// TC-SUMMARY-003: NamespaceSummary includes test namespace
func TestClusterSummary_NamespaceSummary(t *testing.T) {
	mgr := newClusterManager(t)
	ch := handlers.NewClusterHandler(mgr)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	summary, err := ch.GetClusterSummary(ctx)
	if err != nil {
		t.Fatalf("GetClusterSummary: %v", err)
	}

	if len(summary.NamespaceSummary) == 0 {
		t.Fatal("expected non-empty NamespaceSummary")
	}

	found := false
	for _, ns := range summary.NamespaceSummary {
		if ns.Name == testEnv.namespace {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("test namespace %q not found in NamespaceSummary", testEnv.namespace)
	}
}
