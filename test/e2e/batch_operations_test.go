//go:build e2e

package e2e

import (
	"context"
	"testing"
	"time"

	k8serrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"clusterfudge/handlers"
	kvresource "clusterfudge/internal/resource"
)

// TC-BATCH-001: BatchDelete removes multiple ConfigMaps
func TestBatchDelete_ConfigMaps(t *testing.T) {
	t.Parallel()
	mgr := newClusterManager(t)
	rh := handlers.NewResourceHandler(testEnv.resourceSvc, mgr)

	const count = 3
	names := make([]string, count)
	for i := 0; i < count; i++ {
		names[i] = randName("e2e-batch-cm")
		createConfigMap(t, testEnv.namespace, names[i], map[string]string{"batch": "true"})
	}

	// Verify they exist
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	for _, name := range names {
		_, err := testEnv.typed.CoreV1().ConfigMaps(testEnv.namespace).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			t.Fatalf("configmap %q should exist before batch delete: %v", name, err)
		}
	}

	// Build batch delete queries
	queries := make([]handlers.BatchDeleteQuery, count)
	for i, name := range names {
		queries[i] = handlers.BatchDeleteQuery{
			Version:   "v1",
			Resource:  "configmaps",
			Namespace: testEnv.namespace,
			Name:      name,
		}
	}

	results := rh.BatchDelete(ctx, queries)
	if len(results) != count {
		t.Fatalf("expected %d results, got %d", count, len(results))
	}

	for _, r := range results {
		if r.Error != "" {
			t.Errorf("batch delete of %q returned error: %s", r.Name, r.Error)
		}
	}

	// Verify they are gone
	for _, name := range names {
		_, err := testEnv.typed.CoreV1().ConfigMaps(testEnv.namespace).Get(ctx, name, metav1.GetOptions{})
		if err == nil {
			t.Errorf("configmap %q still exists after batch delete", name)
		} else if !k8serrors.IsNotFound(err) {
			t.Errorf("unexpected error checking configmap %q: %v", name, err)
		}
	}
}

// TC-BATCH-002: BatchDelete handles mixed success/failure
func TestBatchDelete_MixedResults(t *testing.T) {
	t.Parallel()
	mgr := newClusterManager(t)
	rh := handlers.NewResourceHandler(testEnv.resourceSvc, mgr)

	existing := randName("e2e-batch-exists")
	createConfigMap(t, testEnv.namespace, existing, map[string]string{"test": "true"})

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	queries := []handlers.BatchDeleteQuery{
		{Version: "v1", Resource: "configmaps", Namespace: testEnv.namespace, Name: existing},
		{Version: "v1", Resource: "configmaps", Namespace: testEnv.namespace, Name: "nonexistent-cm-xyz-" + randName("x")},
	}

	results := rh.BatchDelete(ctx, queries)
	if len(results) != 2 {
		t.Fatalf("expected 2 results, got %d", len(results))
	}

	// First should succeed
	if results[0].Error != "" {
		t.Errorf("expected first delete to succeed, got error: %s", results[0].Error)
	}

	// Second should fail (not found)
	if results[1].Error == "" {
		t.Error("expected second delete to fail for non-existent resource")
	}
}

// TC-BATCH-003: BatchDelete via resource service directly
func TestBatchDelete_ViaService(t *testing.T) {
	t.Parallel()

	const count = 2
	names := make([]string, count)
	for i := 0; i < count; i++ {
		names[i] = randName("e2e-batch-svc")
		createConfigMap(t, testEnv.namespace, names[i], map[string]string{"svc-test": "true"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	// Delete via service
	for _, name := range names {
		q := kvresource.ResourceQuery{Version: "v1", Resource: "configmaps", Namespace: testEnv.namespace, Name: name}
		if err := testEnv.resourceSvc.Delete(ctx, testEnv.dynamic, q); err != nil {
			t.Errorf("delete %q: %v", name, err)
		}
	}

	// Verify gone
	for _, name := range names {
		_, err := testEnv.typed.CoreV1().ConfigMaps(testEnv.namespace).Get(ctx, name, metav1.GetOptions{})
		if !k8serrors.IsNotFound(err) {
			t.Errorf("configmap %q should be gone, err=%v", name, err)
		}
	}
}
