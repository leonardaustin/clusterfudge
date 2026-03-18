//go:build e2e

package e2e

import (
	"context"
	"testing"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"clusterfudge/handlers"
)

// TC-LABEL-001: PatchLabels add, modify, and remove labels
func TestPatchLabels_Lifecycle(t *testing.T) {
	t.Parallel()
	mgr := newClusterManager(t)
	rh := handlers.NewResourceHandler(testEnv.resourceSvc, mgr)

	name := randName("e2e-label")
	createConfigMap(t, testEnv.namespace, name, map[string]string{"data": "test"})
	t.Cleanup(func() { deleteConfigMap(t, testEnv.namespace, name) })

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Step 1: Add a label
	err := rh.PatchLabels(ctx, "", "v1", "configmaps", testEnv.namespace, name, map[string]any{
		"env": "staging",
	})
	if err != nil {
		t.Fatalf("PatchLabels (add): %v", err)
	}

	cm, err := testEnv.typed.CoreV1().ConfigMaps(testEnv.namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		t.Fatalf("get configmap after add: %v", err)
	}
	if cm.Labels["env"] != "staging" {
		t.Errorf("expected label env=staging, got %q", cm.Labels["env"])
	}

	// Step 2: Modify the label
	err = rh.PatchLabels(ctx, "", "v1", "configmaps", testEnv.namespace, name, map[string]any{
		"env": "production",
	})
	if err != nil {
		t.Fatalf("PatchLabels (modify): %v", err)
	}

	cm, err = testEnv.typed.CoreV1().ConfigMaps(testEnv.namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		t.Fatalf("get configmap after modify: %v", err)
	}
	if cm.Labels["env"] != "production" {
		t.Errorf("expected label env=production, got %q", cm.Labels["env"])
	}

	// Step 3: Remove the label (set to nil)
	err = rh.PatchLabels(ctx, "", "v1", "configmaps", testEnv.namespace, name, map[string]any{
		"env": nil,
	})
	if err != nil {
		t.Fatalf("PatchLabels (remove): %v", err)
	}

	cm, err = testEnv.typed.CoreV1().ConfigMaps(testEnv.namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		t.Fatalf("get configmap after remove: %v", err)
	}
	if _, exists := cm.Labels["env"]; exists {
		t.Errorf("expected label 'env' to be removed, but it still exists with value %q", cm.Labels["env"])
	}
}

// TC-LABEL-002: PatchLabels on deployment
func TestPatchLabels_Deployment(t *testing.T) {
	t.Parallel()
	mgr := newClusterManager(t)
	rh := handlers.NewResourceHandler(testEnv.resourceSvc, mgr)

	name := randName("e2e-label-dep")
	createDeployment(t, testEnv.namespace, name, 1)
	t.Cleanup(func() { deleteDeployment(t, testEnv.namespace, name) })

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	err := rh.PatchLabels(ctx, "apps", "v1", "deployments", testEnv.namespace, name, map[string]any{
		"team": "platform",
	})
	if err != nil {
		t.Fatalf("PatchLabels on deployment: %v", err)
	}

	dep, err := testEnv.typed.AppsV1().Deployments(testEnv.namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		t.Fatalf("get deployment after patch: %v", err)
	}
	if dep.Labels["team"] != "platform" {
		t.Errorf("expected label team=platform, got %q", dep.Labels["team"])
	}
}

// TC-LABEL-003: PatchLabels with empty name returns error
func TestPatchLabels_EmptyName(t *testing.T) {
	t.Parallel()
	mgr := newClusterManager(t)
	rh := handlers.NewResourceHandler(testEnv.resourceSvc, mgr)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	err := rh.PatchLabels(ctx, "", "v1", "configmaps", testEnv.namespace, "", map[string]any{
		"foo": "bar",
	})
	if err == nil {
		t.Fatal("expected error for empty resource name, got nil")
	}
}
