//go:build e2e

package e2e

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"clusterfudge/handlers"
	"clusterfudge/internal/config"
	"clusterfudge/internal/resource"
)

// ---------------------------------------------------------------------------
// 1. Pagination — resource.Service.List() returns all ConfigMaps (H2)
// ---------------------------------------------------------------------------

// TestPagination_ListAllConfigMaps creates 25 ConfigMaps and verifies that
// Service.List returns every single one. The pagination limit in Service.List
// is 500, so 25 items fit in a single page, but this confirms the pagination
// loop completes correctly for the common sub-page case.
func TestPagination_ListAllConfigMaps(t *testing.T) {
	t.Parallel()
	const count = 25

	prefix := randName("e2e-page")
	names := make([]string, count)
	for i := 0; i < count; i++ {
		names[i] = fmt.Sprintf("%s-%03d", prefix, i)
		createConfigMap(t, testEnv.namespace, names[i], map[string]string{"index": fmt.Sprintf("%d", i)})
	}
	t.Cleanup(func() {
		for _, n := range names {
			deleteConfigMap(t, testEnv.namespace, n)
		}
	})

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	items, err := testEnv.resourceSvc.List(ctx, testEnv.dynamic, configmapsQuery(testEnv.namespace))
	if err != nil {
		t.Fatalf("List configmaps: %v", err)
	}

	found := 0
	for _, n := range names {
		if findByName(items, n) != nil {
			found++
		}
	}
	if found != count {
		t.Errorf("expected all %d configmaps in list, found %d out of %d total items", count, found, len(items))
	}
}

// TestPagination_ListNamespacesViaPagination verifies that
// ClusterHandler.ListNamespaces returns the test namespaces, exercising
// the paginated namespace listing path.
func TestPagination_ListNamespacesViaPagination(t *testing.T) {
	mgr := newClusterManager(t)
	ch := handlers.NewClusterHandler(mgr)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	namespaces, err := ch.ListNamespaces(ctx)
	if err != nil {
		t.Fatalf("ListNamespaces: %v", err)
	}

	foundA, foundB := false, false
	for _, ns := range namespaces {
		if ns == testEnv.namespace {
			foundA = true
		}
		if ns == testEnv.namespaceB {
			foundB = true
		}
	}
	if !foundA {
		t.Errorf("test namespace %q not found in ListNamespaces result (%d namespaces)", testEnv.namespace, len(namespaces))
	}
	if !foundB {
		t.Errorf("test namespace %q not found in ListNamespaces result (%d namespaces)", testEnv.namespaceB, len(namespaces))
	}
}

// ---------------------------------------------------------------------------
// 2. Per-operation timeouts — GetClusterSummary completes normally (H3)
// ---------------------------------------------------------------------------

// TestPerOperationTimeout_GetClusterSummarySucceeds verifies that the
// per-operation timeouts inside GetClusterSummary do not interfere with
// normal operation under reasonable cluster load.
func TestPerOperationTimeout_GetClusterSummarySucceeds(t *testing.T) {
	mgr := newClusterManager(t)
	ch := handlers.NewClusterHandler(mgr)

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	start := time.Now()
	summary, err := ch.GetClusterSummary(ctx)
	elapsed := time.Since(start)

	if err != nil {
		t.Fatalf("GetClusterSummary: %v", err)
	}

	if summary.NodeCount < 1 {
		t.Errorf("expected at least 1 node, got %d", summary.NodeCount)
	}
	if summary.PodCount < 1 {
		t.Errorf("expected at least 1 pod, got %d", summary.PodCount)
	}

	// Per-operation timeout is 10s each; total should be well under 60s on a healthy cluster.
	if elapsed > 30*time.Second {
		t.Errorf("GetClusterSummary took %v — unexpectedly slow, possible timeout issue", elapsed)
	}
}

// ---------------------------------------------------------------------------
// 3. RBAC pre-flight — DeleteResource, ScaleDeployment, DrainNode (H5)
// ---------------------------------------------------------------------------

// TestRBACPreflight_DeleteResourceSucceeds verifies that the RBAC pre-flight
// check in DeleteResource does not block a permitted delete operation.
func TestRBACPreflight_DeleteResourceSucceeds(t *testing.T) {
	t.Parallel()
	mgr := newClusterManager(t)
	h := handlers.NewResourceHandler(resource.NewService(), mgr)

	cmName := randName("e2e-rbac-del")
	createConfigMap(t, testEnv.namespace, cmName, map[string]string{"rbac": "test"})

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if err := h.DeleteResource(ctx, "", "v1", "configmaps", testEnv.namespace, cmName); err != nil {
		t.Fatalf("DeleteResource with RBAC check: %v", err)
	}

	// Verify it is gone.
	_, err := h.GetResource(ctx, "", "v1", "configmaps", testEnv.namespace, cmName)
	if err == nil {
		t.Fatal("expected error getting deleted configmap, got nil")
	}
}

// TestRBACPreflight_ScaleDeploymentSucceeds verifies that the RBAC
// pre-flight check in ScaleDeployment allows a permitted scale operation.
func TestRBACPreflight_ScaleDeploymentSucceeds(t *testing.T) {
	t.Parallel()
	mgr := newClusterManager(t)
	h := handlers.NewResourceHandler(resource.NewService(), mgr)

	depName := randName("e2e-rbac-scale")
	createDeployment(t, testEnv.namespace, depName, 1)
	t.Cleanup(func() { deleteDeployment(t, testEnv.namespace, depName) })
	waitForDeploymentReady(t, testEnv.namespace, depName, 1, 90*time.Second)

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if err := h.ScaleDeployment(ctx, testEnv.namespace, depName, 2); err != nil {
		t.Fatalf("ScaleDeployment with RBAC check: %v", err)
	}

	waitForDeploymentReady(t, testEnv.namespace, depName, 2, 90*time.Second)

	// Verify the replica count.
	getCtx, getCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer getCancel()
	dep, err := testEnv.typed.AppsV1().Deployments(testEnv.namespace).Get(getCtx, depName, metav1.GetOptions{})
	if err != nil {
		t.Fatalf("get deployment: %v", err)
	}
	if dep.Spec.Replicas == nil || *dep.Spec.Replicas != 2 {
		t.Errorf("expected 2 replicas, got %v", dep.Spec.Replicas)
	}
}

// TestRBACPreflight_DrainNodeMethodExists verifies that DrainNode is callable
// and the RBAC pre-flight check passes for the test cluster admin user.
// We call it on a non-existent node to avoid actually disrupting the cluster,
// expecting an error about the node not being found rather than an RBAC error.
func TestRBACPreflight_DrainNodeMethodExists(t *testing.T) {
	mgr := newClusterManager(t)
	h := handlers.NewResourceHandler(resource.NewService(), mgr)

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	_ = ctx // ensure context is used
	err := h.DrainNode("nonexistent-e2e-node-xyz", 30, false, true, false)
	if err == nil {
		t.Fatal("expected error draining non-existent node, got nil")
	}
	// The error should be about the node, not about RBAC.
	errMsg := err.Error()
	if strings.Contains(errMsg, "permission denied") {
		t.Errorf("unexpected RBAC denial (test user should be admin): %v", err)
	}
}

// ---------------------------------------------------------------------------
// 4. Config file size limit (L4)
// ---------------------------------------------------------------------------

// TestConfigFileSizeLimit creates a config file larger than 1 MiB and verifies
// that LoadFromFile rejects it with a "too large" error.
func TestConfigFileSizeLimit(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	storePath := filepath.Join(tmpDir, "store-config.json")
	store, err := config.NewStoreWithPath(storePath)
	if err != nil {
		t.Fatalf("NewStoreWithPath: %v", err)
	}
	h := handlers.NewConfigHandler(store)

	// Create a file larger than 1 MiB (1<<20 = 1048576 bytes).
	bigFile := filepath.Join(tmpDir, "big.json")
	data := make([]byte, (1<<20)+1)
	// Fill with valid-looking JSON to rule out parse errors.
	data[0] = '{'
	for i := 1; i < len(data)-1; i++ {
		data[i] = ' '
	}
	data[len(data)-1] = '}'
	if err := os.WriteFile(bigFile, data, 0640); err != nil {
		t.Fatalf("write big file: %v", err)
	}

	err = h.LoadFromFile(bigFile)
	if err == nil {
		t.Fatal("expected error loading oversized config file, got nil")
	}
	if !strings.Contains(err.Error(), "too large") {
		t.Errorf("expected error containing 'too large', got %q", err.Error())
	}
}

// TestConfigFileSizeLimit_ValidSizeAccepted verifies that a config file under
// the size limit is accepted by LoadFromFile.
func TestConfigFileSizeLimit_ValidSizeAccepted(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	storePath := filepath.Join(tmpDir, "store-config.json")
	store, err := config.NewStoreWithPath(storePath)
	if err != nil {
		t.Fatalf("NewStoreWithPath: %v", err)
	}
	h := handlers.NewConfigHandler(store)

	// Create a valid small config file.
	smallFile := filepath.Join(tmpDir, "small.json")
	if err := os.WriteFile(smallFile, []byte(`{"theme":"light","fontSize":14}`), 0640); err != nil {
		t.Fatalf("write small file: %v", err)
	}

	if err := h.LoadFromFile(smallFile); err != nil {
		t.Fatalf("LoadFromFile should accept small file: %v", err)
	}

	cfg := h.GetConfig()
	if cfg.Theme != "light" {
		t.Errorf("expected theme light after import, got %q", cfg.Theme)
	}
}

// ---------------------------------------------------------------------------
// 6. Watch key fix (M7) + StopWatch (M2)
// ---------------------------------------------------------------------------

// TestWatchAndStopWatch verifies:
// - WatchResources delivers events when resources are created.
// - StopWatch cancels the watch so no further events are delivered.
// Because WatchResources emits events via an Emitter (not returned directly),
// we test the lower-level Service.Watch + context cancellation which StopWatch
// uses internally.
func TestWatchAndStopWatch(t *testing.T) {
	t.Parallel()

	watchCtx, watchCancel := context.WithCancel(context.Background())
	defer watchCancel()

	ch, err := testEnv.resourceSvc.Watch(watchCtx, testEnv.dynamic, configmapsQuery(testEnv.namespace))
	if err != nil {
		t.Fatalf("start watch: %v", err)
	}

	// Create a configmap — should receive an ADDED event.
	cmName := randName("e2e-stopwatch")
	createConfigMap(t, testEnv.namespace, cmName, map[string]string{"test": "watch"})
	t.Cleanup(func() { deleteConfigMap(t, testEnv.namespace, cmName) })

	assertEventReceived(t, ch, "ADDED", cmName, 15*time.Second)

	// Cancel the watch context (simulates StopWatch behavior).
	watchCancel()

	// Wait briefly for the goroutine to notice the cancellation.
	time.Sleep(1 * time.Second)

	// Create another configmap — should NOT receive an event on the old channel.
	cmName2 := randName("e2e-stopwatch-after")
	createConfigMap(t, testEnv.namespace, cmName2, map[string]string{"test": "stopped"})
	t.Cleanup(func() { deleteConfigMap(t, testEnv.namespace, cmName2) })

	assertNoEventReceived(t, ch, cmName2, 5*time.Second)
}

// TestWatchKeyDuplicateReplace verifies that starting a new watch for the
// same resource type via ResourceHandler.WatchResources replaces the old
// watch rather than leaking it. We use the struct-key approach (M7 fix).
func TestWatchKeyDuplicateReplace(t *testing.T) {
	t.Parallel()
	mgr := newClusterManager(t)
	h := handlers.NewResourceHandler(resource.NewService(), mgr)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Start a watch.
	if err := h.WatchResources(ctx, "", "v1", "configmaps", testEnv.namespace); err != nil {
		t.Fatalf("first WatchResources: %v", err)
	}

	// Start a second watch for the same key — should replace, not error.
	if err := h.WatchResources(ctx, "", "v1", "configmaps", testEnv.namespace); err != nil {
		t.Fatalf("second WatchResources (should replace): %v", err)
	}

	// StopWatch should cleanly stop the active watch.
	h.StopWatch("", "v1", "configmaps", testEnv.namespace)

	// A subsequent StopWatch on the same key should be a no-op (no panic).
	h.StopWatch("", "v1", "configmaps", testEnv.namespace)
}

// ---------------------------------------------------------------------------
// 7. Concurrent drain (L6) — DrainNode uses bounded concurrency
// ---------------------------------------------------------------------------

// TestDrainNode_BoundedConcurrency verifies that DrainNode runs to completion
// without panicking. We test on an actual node but immediately uncordon it to
// restore cluster state. This exercises the concurrent eviction path (L6).
func TestDrainNode_BoundedConcurrency(t *testing.T) {
	mgr := newClusterManager(t)
	h := handlers.NewResourceHandler(resource.NewService(), mgr)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Get the node name.
	nodes, err := testEnv.typed.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil || len(nodes.Items) == 0 {
		t.Fatalf("list nodes: %v (count: %d)", err, len(nodes.Items))
	}
	nodeName := nodes.Items[0].Name

	// Ensure uncordoned at end.
	t.Cleanup(func() {
		if uncordErr := h.UncordonNode(context.Background(), nodeName); uncordErr != nil {
			t.Errorf("CRITICAL: failed to uncordon node %q: %v", nodeName, uncordErr)
		}
	})

	// DrainNode with ignoreDaemonSets=true, force=true, short grace period.
	// On k3s with system pods, some evictions may fail, but the bounded
	// concurrency path is exercised regardless.
	err = h.DrainNode(nodeName, 5, true, true, false)
	// We accept either success or an error about evictions — the important
	// thing is no panic from the concurrent goroutine pool.
	if err != nil {
		t.Logf("DrainNode returned error (expected on system pods): %v", err)
	}

	// Verify the node was cordoned (DrainNode cordons first).
	nodeAfter, err := testEnv.typed.CoreV1().Nodes().Get(ctx, nodeName, metav1.GetOptions{})
	if err != nil {
		t.Fatalf("get node after drain: %v", err)
	}
	if !nodeAfter.Spec.Unschedulable {
		t.Error("expected node to be unschedulable after DrainNode")
	}
}

// ---------------------------------------------------------------------------
// ClusterHandler.GetClusterSummary pagination integration
// ---------------------------------------------------------------------------

// TestGetClusterSummary_PaginatedCounts creates resources and verifies that
// GetClusterSummary aggregates them correctly, exercising the paginated list
// loops in the handler.
func TestGetClusterSummary_PaginatedCounts(t *testing.T) {
	mgr := newClusterManager(t)
	ch := handlers.NewClusterHandler(mgr)

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	// Baseline.
	before, err := ch.GetClusterSummary(ctx)
	if err != nil {
		t.Fatalf("GetClusterSummary (before): %v", err)
	}

	// Create configmaps (these don't directly appear in the summary counts,
	// but we create a deployment + service to verify deployment/service counts).
	depName := randName("e2e-summary-page")
	createDeployment(t, testEnv.namespace, depName, 1)
	t.Cleanup(func() { deleteDeployment(t, testEnv.namespace, depName) })
	waitForDeploymentReady(t, testEnv.namespace, depName, 1, 90*time.Second)

	svcName := randName("e2e-summary-svc-page")
	createService(t, testEnv.namespace, svcName, map[string]string{"app": depName}, 8080)
	t.Cleanup(func() { deleteService(t, testEnv.namespace, svcName) })

	after, err := ch.GetClusterSummary(ctx)
	if err != nil {
		t.Fatalf("GetClusterSummary (after): %v", err)
	}

	if after.DeploymentCount <= before.DeploymentCount {
		t.Errorf("deployment count did not increase: before=%d after=%d",
			before.DeploymentCount, after.DeploymentCount)
	}
	if after.ServiceCount <= before.ServiceCount {
		t.Errorf("service count did not increase: before=%d after=%d",
			before.ServiceCount, after.ServiceCount)
	}
	if after.PodCount <= before.PodCount {
		t.Errorf("pod count did not increase (deployment creates pods): before=%d after=%d",
			before.PodCount, after.PodCount)
	}
}
