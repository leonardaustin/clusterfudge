//go:build e2e

package e2e

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	k8serrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	kvresource "clusterfudge/internal/resource"
)

// marshalJSON marshals v to JSON bytes, failing the test on error.
func marshalJSON(t *testing.T, v interface{}) []byte {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("marshal JSON: %v", err)
	}
	return b
}

// TC-CRUD-001: Create a deployment via YAML apply
func TestCRUD_CreateDeployment(t *testing.T) {
	t.Parallel()
	name := randName("e2e-create-dep")
	q := kvresource.ResourceQuery{
		Group: "apps", Version: "v1", Resource: "deployments",
		Namespace: testEnv.namespace, Name: name,
	}

	t.Cleanup(func() { deleteDeployment(t, testEnv.namespace, name) })

	dep := map[string]interface{}{
		"apiVersion": "apps/v1",
		"kind":       "Deployment",
		"metadata":   map[string]interface{}{"name": name, "namespace": testEnv.namespace},
		"spec": map[string]interface{}{
			"replicas": int64(1),
			"selector": map[string]interface{}{"matchLabels": map[string]interface{}{"app": name}},
			"template": map[string]interface{}{
				"metadata": map[string]interface{}{"labels": map[string]interface{}{"app": name}},
				"spec": map[string]interface{}{
					"containers": []interface{}{
						map[string]interface{}{"name": "nginx", "image": "nginx:latest"},
					},
				},
			},
		},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if err := testEnv.resourceSvc.Apply(ctx, testEnv.dynamic, q, marshalJSON(t, dep)); err != nil {
		t.Fatalf("apply deployment: %v", err)
	}

	// Verify it was created
	item, err := testEnv.resourceSvc.Get(ctx, testEnv.dynamic, q)
	if err != nil {
		t.Fatalf("get deployment after create: %v", err)
	}
	if item.Name != name {
		t.Errorf("expected name %q, got %q", name, item.Name)
	}
}

// TC-CRUD-002: Update a deployment — change replica count
func TestCRUD_UpdateDeploymentReplicas(t *testing.T) {
	t.Parallel()
	name := randName("e2e-update-dep")
	q := kvresource.ResourceQuery{
		Group: "apps", Version: "v1", Resource: "deployments",
		Namespace: testEnv.namespace, Name: name,
	}
	t.Cleanup(func() { deleteDeployment(t, testEnv.namespace, name) })

	createDeployment(t, testEnv.namespace, name, 1)
	waitForDeploymentReady(t, testEnv.namespace, name, 1, 90*time.Second)

	// Update to 2 replicas
	dep := map[string]interface{}{
		"apiVersion": "apps/v1",
		"kind":       "Deployment",
		"metadata":   map[string]interface{}{"name": name, "namespace": testEnv.namespace},
		"spec": map[string]interface{}{
			"replicas": int64(2),
			"selector": map[string]interface{}{"matchLabels": map[string]interface{}{"app": name}},
			"template": map[string]interface{}{
				"metadata": map[string]interface{}{"labels": map[string]interface{}{"app": name}},
				"spec": map[string]interface{}{
					"containers": []interface{}{
						map[string]interface{}{"name": "nginx", "image": "nginx:latest"},
					},
				},
			},
		},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if err := testEnv.resourceSvc.Apply(ctx, testEnv.dynamic, q, marshalJSON(t, dep)); err != nil {
		t.Fatalf("apply updated deployment: %v", err)
	}

	waitForDeploymentReady(t, testEnv.namespace, name, 2, 90*time.Second)

	item, err := testEnv.resourceSvc.Get(ctx, testEnv.dynamic, q)
	if err != nil {
		t.Fatalf("get deployment after update: %v", err)
	}
	replicas := item.Spec["replicas"]
	if replicas != int64(2) && replicas != float64(2) {
		t.Errorf("expected replicas=2, got %v", replicas)
	}
}

// TC-CRUD-003: Delete a deployment and verify it's gone
func TestCRUD_DeleteDeployment(t *testing.T) {
	t.Parallel()
	name := randName("e2e-delete-dep")
	q := kvresource.ResourceQuery{
		Group: "apps", Version: "v1", Resource: "deployments",
		Namespace: testEnv.namespace, Name: name,
	}

	createDeployment(t, testEnv.namespace, name, 1)

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if err := testEnv.resourceSvc.Delete(ctx, testEnv.dynamic, q); err != nil {
		t.Fatalf("delete deployment: %v", err)
	}

	// Wait for it to disappear
	deadline := time.Now().Add(30 * time.Second)
	for time.Now().Before(deadline) {
		_, err := testEnv.resourceSvc.Get(context.Background(), testEnv.dynamic, q)
		if err != nil && k8serrors.IsNotFound(err) {
			return // success
		}
		time.Sleep(2 * time.Second)
	}
	t.Fatalf("deployment %q still exists 30s after deletion", name)
}

// TC-CRUD-004: Create, update, and delete a configmap
func TestCRUD_ConfigMapLifecycle(t *testing.T) {
	t.Parallel()
	name := randName("e2e-cm-lifecycle")
	q := kvresource.ResourceQuery{
		Version: "v1", Resource: "configmaps",
		Namespace: testEnv.namespace, Name: name,
	}

	t.Cleanup(func() { deleteConfigMap(t, testEnv.namespace, name) })

	// Step 1: Create
	createConfigMap(t, testEnv.namespace, name, map[string]string{"key": "value1"})

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	item, err := testEnv.resourceSvc.Get(ctx, testEnv.dynamic, q)
	if err != nil {
		t.Fatalf("get configmap after create: %v", err)
	}
	data, ok := item.Raw["data"].(map[string]interface{})
	if !ok {
		t.Fatalf("configmap raw 'data' is not a map: %v (%T)", item.Raw["data"], item.Raw["data"])
	}
	if data["key"] != "value1" {
		t.Errorf("expected data[key]=value1, got %v", data["key"])
	}

	// Step 2: Update
	updatedCM := map[string]interface{}{
		"apiVersion": "v1",
		"kind":       "ConfigMap",
		"metadata":   map[string]interface{}{"name": name, "namespace": testEnv.namespace},
		"data":       map[string]interface{}{"key": "value2"},
	}
	if err := testEnv.resourceSvc.Apply(ctx, testEnv.dynamic, q, marshalJSON(t, updatedCM)); err != nil {
		t.Fatalf("update configmap: %v", err)
	}

	item, err = testEnv.resourceSvc.Get(ctx, testEnv.dynamic, q)
	if err != nil {
		t.Fatalf("get configmap after update: %v", err)
	}
	data, ok = item.Raw["data"].(map[string]interface{})
	if !ok {
		t.Fatalf("configmap raw 'data' after update is not a map: %v (%T)", item.Raw["data"], item.Raw["data"])
	}
	if data["key"] != "value2" {
		t.Errorf("expected data[key]=value2 after update, got %v", data["key"])
	}

	// Step 3: Delete
	if err := testEnv.resourceSvc.Delete(ctx, testEnv.dynamic, q); err != nil {
		t.Fatalf("delete configmap: %v", err)
	}

	deadline := time.Now().Add(15 * time.Second)
	for time.Now().Before(deadline) {
		_, err := testEnv.resourceSvc.Get(context.Background(), testEnv.dynamic, q)
		if k8serrors.IsNotFound(err) {
			return
		}
		time.Sleep(1 * time.Second)
	}
	t.Fatal("configmap still exists after deletion")
}

// TC-CRUD-005: Create secret and verify values are in the raw representation
func TestCRUD_SecretValues(t *testing.T) {
	t.Parallel()
	name := randName("e2e-sec-values")
	q := kvresource.ResourceQuery{
		Version: "v1", Resource: "secrets",
		Namespace: testEnv.namespace, Name: name,
	}
	t.Cleanup(func() { deleteSecret(t, testEnv.namespace, name) })

	createSecret(t, testEnv.namespace, name, map[string][]byte{"password": []byte("secret123")})

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	item, err := testEnv.resourceSvc.Get(ctx, testEnv.dynamic, q)
	if err != nil {
		t.Fatalf("get secret: %v", err)
	}

	if item.Raw == nil {
		t.Fatal("expected non-nil Raw field on secret")
	}

	// Verify the secret data contains base64-encoded values, not plaintext
	data, ok := item.Raw["data"].(map[string]interface{})
	if !ok {
		t.Fatalf("secret raw 'data' is not a map: %v (%T)", item.Raw["data"], item.Raw["data"])
	}
	passwordVal, ok := data["password"].(string)
	if !ok {
		t.Fatalf("secret data 'password' is not a string: %v (%T)", data["password"], data["password"])
	}
	// K8s returns secret data as base64-encoded strings; "secret123" should NOT appear as plaintext
	if passwordVal == "secret123" {
		t.Error("secret data 'password' is plaintext; expected base64-encoded value")
	}
	if passwordVal == "" {
		t.Error("secret data 'password' is empty")
	}
}

// TC-CRUD-006: Create and delete a namespace
func TestCRUD_NamespaceLifecycle(t *testing.T) {
	name := randName("e2e-ns-lifecycle")

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	// Create
	nsObj := map[string]interface{}{
		"apiVersion": "v1",
		"kind":       "Namespace",
		"metadata":   map[string]interface{}{"name": name},
	}
	q := kvresource.ResourceQuery{Version: "v1", Resource: "namespaces", Name: name}
	if err := testEnv.resourceSvc.Apply(ctx, testEnv.dynamic, q, marshalJSON(t, nsObj)); err != nil {
		t.Fatalf("create namespace: %v", err)
	}

	// Verify it appears in the list
	nsList, err := testEnv.resourceSvc.List(ctx, testEnv.dynamic, kvresource.ResourceQuery{Version: "v1", Resource: "namespaces"})
	if err != nil {
		t.Fatalf("list namespaces: %v", err)
	}
	if findByName(nsList, name) == nil {
		t.Errorf("namespace %q not found after creation", name)
	}

	// Delete
	if err := testEnv.resourceSvc.Delete(ctx, testEnv.dynamic, q); err != nil {
		t.Fatalf("delete namespace: %v", err)
	}

	// Wait for deletion
	deadline := time.Now().Add(30 * time.Second)
	for time.Now().Before(deadline) {
		_, err := testEnv.typed.CoreV1().Namespaces().Get(context.Background(), name, metav1.GetOptions{})
		if k8serrors.IsNotFound(err) {
			return
		}
		time.Sleep(2 * time.Second)
	}
	t.Fatalf("namespace %q still exists 30s after deletion", name)
}

// TC-CRUD-008: Apply invalid YAML — verify error
func TestCRUD_InvalidYAML(t *testing.T) {
	q := kvresource.ResourceQuery{
		Group: "apps", Version: "v1", Resource: "deployments",
		Namespace: testEnv.namespace, Name: "invalid",
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	err := testEnv.resourceSvc.Apply(ctx, testEnv.dynamic, q, []byte(`{"not": "valid": "kubernetes": resource}`))
	if err == nil {
		t.Fatal("expected error for invalid JSON, got nil")
	}
}

// TC-CRUD-010: Delete non-existent resource — verify 404
func TestCRUD_DeleteNonExistent(t *testing.T) {
	q := kvresource.ResourceQuery{
		Version: "v1", Resource: "pods",
		Namespace: testEnv.namespace, Name: "does-not-exist-pod-xyz",
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	err := testEnv.resourceSvc.Delete(ctx, testEnv.dynamic, q)
	if err == nil {
		t.Fatal("expected error deleting non-existent pod, got nil")
	}
	if !k8serrors.IsNotFound(err) {
		t.Errorf("expected NotFound error, got: %v", err)
	}
}
