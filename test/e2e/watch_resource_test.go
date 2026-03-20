//go:build e2e

package e2e

import (
	"context"
	"testing"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
)

// TC-WATCHRES-001: Watch ConfigMaps — full lifecycle (ADDED, MODIFIED, DELETED)
func TestWatchResource_ConfigMapLifecycle(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	ch, err := testEnv.resourceSvc.Watch(ctx, testEnv.dynamic, configmapsQuery(testEnv.namespace))
	if err != nil {
		t.Fatalf("start watch: %v", err)
	}

	name := randName("e2e-watch-cm")

	// Create — expect ADDED
	createConfigMap(t, testEnv.namespace, name, map[string]string{"key": "v1"})
	assertEventReceived(t, ch, "ADDED", name, 15*time.Second)

	// Update — expect MODIFIED
	updatedCM := map[string]interface{}{
		"apiVersion": "v1",
		"kind":       "ConfigMap",
		"metadata":   map[string]interface{}{"name": name, "namespace": testEnv.namespace},
		"data":       map[string]interface{}{"key": "v2"},
	}
	updateCtx, updateCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer updateCancel()
	cmQ := configmapsQuery(testEnv.namespace)
	cmQ.Name = name
	if err := testEnv.resourceSvc.Apply(updateCtx, testEnv.dynamic, cmQ, marshalJSON(t, updatedCM)); err != nil {
		t.Fatalf("update configmap: %v", err)
	}
	assertEventReceived(t, ch, "MODIFIED", name, 15*time.Second)

	// Delete — expect DELETED
	deleteConfigMap(t, testEnv.namespace, name)
	assertEventReceived(t, ch, "DELETED", name, 15*time.Second)
}

// TC-WATCHRES-002: Watch Secrets — ADDED event
func TestWatchResource_SecretAdded(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	secQ := resourceListQuery("", "v1", "secrets", testEnv.namespace)
	ch, err := testEnv.resourceSvc.Watch(ctx, testEnv.dynamic, secQ)
	if err != nil {
		t.Fatalf("start watch: %v", err)
	}

	name := randName("e2e-watch-sec")
	createSecret(t, testEnv.namespace, name, map[string][]byte{"key": []byte("value")})
	t.Cleanup(func() { deleteSecret(t, testEnv.namespace, name) })

	assertEventReceived(t, ch, "ADDED", name, 15*time.Second)
}

// TC-WATCHRES-003: Watch Services — ADDED event
func TestWatchResource_ServiceAdded(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	svcQ := resourceListQuery("", "v1", "services", testEnv.namespace)
	ch, err := testEnv.resourceSvc.Watch(ctx, testEnv.dynamic, svcQ)
	if err != nil {
		t.Fatalf("start watch: %v", err)
	}

	name := randName("e2e-watch-svc")
	createService(t, testEnv.namespace, name, map[string]string{"app": "test"}, 9090)
	t.Cleanup(func() { deleteService(t, testEnv.namespace, name) })

	assertEventReceived(t, ch, "ADDED", name, 15*time.Second)
}

// TC-WATCHRES-004: Watch Deployments — MODIFIED event on scale
func TestWatchResource_DeploymentModified(t *testing.T) {
	t.Parallel()

	name := randName("e2e-watch-dep")
	createDeployment(t, testEnv.namespace, name, 1)
	t.Cleanup(func() { deleteDeployment(t, testEnv.namespace, name) })

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	ch, err := testEnv.resourceSvc.Watch(ctx, testEnv.dynamic, deploymentsQuery(testEnv.namespace))
	if err != nil {
		t.Fatalf("start watch: %v", err)
	}

	// Consume initial ADDED event
	assertEventReceived(t, ch, "ADDED", name, 15*time.Second)

	// Scale to 2 replicas via merge patch
	patchCtx, patchCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer patchCancel()
	_, err = testEnv.typed.AppsV1().Deployments(testEnv.namespace).Patch(
		patchCtx, name, types.MergePatchType,
		[]byte(`{"spec":{"replicas":2}}`), metav1.PatchOptions{},
	)
	if err != nil {
		t.Fatalf("scale deployment: %v", err)
	}

	assertEventReceived(t, ch, "MODIFIED", name, 15*time.Second)
}
