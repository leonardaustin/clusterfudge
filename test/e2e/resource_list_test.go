//go:build e2e

package e2e

import (
	"context"
	"testing"
	"time"

	kvresource "clusterfudge/internal/resource"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// TC-RESLIST-001: List multiple Phase 5 resource types with correct fields
func TestResourceList_AllTypes(t *testing.T) {
	t.Parallel()

	// Create test resources
	depName := randName("e2e-reslist-dep")
	svcName := randName("e2e-reslist-svc")
	cmName := randName("e2e-reslist-cm")
	secName := randName("e2e-reslist-sec")

	createDeployment(t, testEnv.namespace, depName, 1)
	t.Cleanup(func() { deleteDeployment(t, testEnv.namespace, depName) })

	createService(t, testEnv.namespace, svcName, map[string]string{"app": depName}, 8080)
	t.Cleanup(func() { deleteService(t, testEnv.namespace, svcName) })

	createConfigMap(t, testEnv.namespace, cmName, map[string]string{"key": "val"})
	t.Cleanup(func() { deleteConfigMap(t, testEnv.namespace, cmName) })

	createSecret(t, testEnv.namespace, secName, map[string][]byte{"pw": []byte("s3cret")})
	t.Cleanup(func() { deleteSecret(t, testEnv.namespace, secName) })

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	tests := []struct {
		name  string
		query kvresource.ResourceQuery
		want  string
	}{
		{"deployments", deploymentsQuery(testEnv.namespace), depName},
		{"services", kvresource.ResourceQuery{Version: "v1", Resource: "services", Namespace: testEnv.namespace}, svcName},
		{"configmaps", configmapsQuery(testEnv.namespace), cmName},
		{"secrets", kvresource.ResourceQuery{Version: "v1", Resource: "secrets", Namespace: testEnv.namespace}, secName},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			items, err := testEnv.resourceSvc.List(ctx, testEnv.dynamic, tc.query)
			if err != nil {
				t.Fatalf("list %s: %v", tc.name, err)
			}

			found := findByName(items, tc.want)
			if found == nil {
				t.Fatalf("%s %q not found in list (%d items)", tc.name, tc.want, len(items))
			}

			// Verify ResourceItem has proper fields
			if found.Name == "" {
				t.Error("ResourceItem.Name is empty")
			}
			if found.Namespace != testEnv.namespace {
				t.Errorf("expected namespace %q, got %q", testEnv.namespace, found.Namespace)
			}
			if found.Raw == nil {
				t.Error("ResourceItem.Raw is nil")
			}
		})
	}
}

// TC-RESLIST-002: Verify ResourceItem Spec and Status populated for deployments
func TestResourceList_SpecAndStatus(t *testing.T) {
	t.Parallel()
	name := randName("e2e-reslist-spec")
	createDeployment(t, testEnv.namespace, name, 1)
	t.Cleanup(func() { deleteDeployment(t, testEnv.namespace, name) })
	waitForDeploymentReady(t, testEnv.namespace, name, 1, 90*time.Second)

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	items, err := testEnv.resourceSvc.List(ctx, testEnv.dynamic, deploymentsQuery(testEnv.namespace))
	if err != nil {
		t.Fatalf("list deployments: %v", err)
	}

	found := findByName(items, name)
	if found == nil {
		t.Fatalf("deployment %q not found", name)
	}

	if found.Spec == nil {
		t.Error("expected non-nil Spec for deployment")
	}
	if found.Status == nil {
		t.Error("expected non-nil Status for deployment")
	}
	// Labels may be nil if no metadata labels were set on the deployment itself
	// (only pod template labels are set by createDeployment)
}

// TC-RESLIST-003: Namespace filtering for resource list
func TestResourceList_NamespaceFilter(t *testing.T) {
	cmA := randName("e2e-reslist-ns-a")
	cmB := randName("e2e-reslist-ns-b")

	createConfigMap(t, testEnv.namespace, cmA, map[string]string{"env": "a"})
	t.Cleanup(func() { deleteConfigMap(t, testEnv.namespace, cmA) })

	createConfigMap(t, testEnv.namespaceB, cmB, map[string]string{"env": "b"})
	t.Cleanup(func() { deleteConfigMap(t, testEnv.namespaceB, cmB) })

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	// List namespace A — should see cmA, not cmB
	itemsA, err := testEnv.resourceSvc.List(ctx, testEnv.dynamic, configmapsQuery(testEnv.namespace))
	if err != nil {
		t.Fatalf("list configmaps in ns A: %v", err)
	}
	if findByName(itemsA, cmA) == nil {
		t.Errorf("configmap %q not found in namespace A", cmA)
	}
	if findByName(itemsA, cmB) != nil {
		t.Errorf("configmap %q from namespace B found in namespace A list", cmB)
	}

	// List namespace B — should see cmB, not cmA
	itemsB, err := testEnv.resourceSvc.List(ctx, testEnv.dynamic, configmapsQuery(testEnv.namespaceB))
	if err != nil {
		t.Fatalf("list configmaps in ns B: %v", err)
	}
	if findByName(itemsB, cmB) == nil {
		t.Errorf("configmap %q not found in namespace B", cmB)
	}
	if findByName(itemsB, cmA) != nil {
		t.Errorf("configmap %q from namespace A found in namespace B list", cmA)
	}
}

// TC-RESLIST-004: List RBAC resources
func TestResourceList_RBACResources(t *testing.T) {
	t.Parallel()
	roleName := randName("e2e-reslist-role")
	rbName := randName("e2e-reslist-rb")

	createRole(t, testEnv.namespace, roleName)
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		testEnv.typed.RbacV1().Roles(testEnv.namespace).Delete(ctx, roleName, metav1.DeleteOptions{})
	})

	createRoleBinding(t, testEnv.namespace, rbName, roleName, "default")
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		testEnv.typed.RbacV1().RoleBindings(testEnv.namespace).Delete(ctx, rbName, metav1.DeleteOptions{})
	})

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	roleQ := kvresource.ResourceQuery{Group: "rbac.authorization.k8s.io", Version: "v1", Resource: "roles", Namespace: testEnv.namespace}
	roles, err := testEnv.resourceSvc.List(ctx, testEnv.dynamic, roleQ)
	if err != nil {
		t.Fatalf("list roles: %v", err)
	}
	if findByName(roles, roleName) == nil {
		t.Errorf("role %q not found", roleName)
	}

	rbQ := kvresource.ResourceQuery{Group: "rbac.authorization.k8s.io", Version: "v1", Resource: "rolebindings", Namespace: testEnv.namespace}
	rbs, err := testEnv.resourceSvc.List(ctx, testEnv.dynamic, rbQ)
	if err != nil {
		t.Fatalf("list rolebindings: %v", err)
	}
	if findByName(rbs, rbName) == nil {
		t.Errorf("rolebinding %q not found", rbName)
	}
}
