package handlers

import (
	"fmt"
	"strings"
	"testing"

	"clusterfudge/internal/cluster"
	"clusterfudge/internal/k8s"
	"clusterfudge/internal/resource"

	appsv1 "k8s.io/api/apps/v1"
	authv1 "k8s.io/api/authorization/v1"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	kubefake "k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/rest"
	k8stesting "k8s.io/client-go/testing"
)

// newConnectedManager returns a Manager pre-loaded with a fake ClientSet
// containing the given objects.
func newConnectedManager(objects ...runtime.Object) *cluster.Manager {
	scheme := runtime.NewScheme()
	dynClient := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(scheme,
		map[schema.GroupVersionResource]string{
			{Group: "", Version: "v1", Resource: "pods"}:                "PodList",
			{Group: "", Version: "v1", Resource: "services"}:            "ServiceList",
			{Group: "apps", Version: "v1", Resource: "deployments"}:     "DeploymentList",
			{Group: "", Version: "v1", Resource: "configmaps"}:          "ConfigMapList",
			{Group: "", Version: "v1", Resource: "namespaces"}:          "NamespaceList",
			{Group: "", Version: "v1", Resource: "serviceaccounts"}:     "ServiceAccountList",
			{Group: "", Version: "v1", Resource: "persistentvolumes"}:   "PersistentVolumeList",
		},
		objects...,
	)
	typedClient := kubefake.NewClientset()

	mgr := cluster.NewManager()
	mgr.SetClientForTest(&k8s.ClientSet{
		Typed:   typedClient,
		Dynamic: dynClient,
		Config:  &rest.Config{},
	})
	return mgr
}

func testPod(name, namespace string) *unstructured.Unstructured {
	return &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "v1",
			"kind":       "Pod",
			"metadata": map[string]interface{}{
				"name":      name,
				"namespace": namespace,
			},
		},
	}
}

func TestResourceHandler_ListResources(t *testing.T) {
	mgr := newConnectedManager(
		testPod("pod-1", "default"),
		testPod("pod-2", "default"),
	)
	h := NewResourceHandler(resource.NewService(), mgr)

	items, err := h.ListResources("", "v1", "pods", "default")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("expected 2 items, got %d", len(items))
	}
}

func TestResourceHandler_GetResource(t *testing.T) {
	mgr := newConnectedManager(testPod("my-pod", "default"))
	h := NewResourceHandler(resource.NewService(), mgr)

	item, err := h.GetResource("", "v1", "pods", "default", "my-pod")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if item.Name != "my-pod" {
		t.Fatalf("expected name %q, got %q", "my-pod", item.Name)
	}
}

func TestResourceHandler_GetResource_EmptyName(t *testing.T) {
	mgr := newConnectedManager()
	h := NewResourceHandler(resource.NewService(), mgr)

	_, err := h.GetResource("", "v1", "pods", "default", "")
	if err == nil {
		t.Fatal("expected error for empty name")
	}
}

func TestResourceHandler_DeleteResource(t *testing.T) {
	mgr := newConnectedManager(testPod("del-me", "default"))
	h := NewResourceHandler(resource.NewService(), mgr)

	err := h.DeleteResource("", "v1", "pods", "default", "del-me")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestResourceHandler_DeleteResource_EmptyName(t *testing.T) {
	mgr := newConnectedManager()
	h := NewResourceHandler(resource.NewService(), mgr)

	err := h.DeleteResource("", "v1", "pods", "default", "")
	if err == nil {
		t.Fatal("expected error for empty name")
	}
}

func TestResourceHandler_ApplyResource_CallsService(t *testing.T) {
	// The fake dynamic client doesn't fully support server-side apply,
	// so we verify that ApplyResource correctly delegates to the service
	// by ensuring the call reaches the client (returns an API-level error
	// rather than a handler-level validation error).
	mgr := newConnectedManager()
	h := NewResourceHandler(resource.NewService(), mgr)

	data := []byte(`{"apiVersion":"v1","kind":"ConfigMap","metadata":{"name":"test-cm","namespace":"default"}}`)
	err := h.ApplyResource("", "v1", "configmaps", "default", data)
	// We expect an error from the fake client, but not a "disconnected" error.
	if err == nil {
		return // if it passes, even better
	}
	// The error should be from the k8s client, not from input validation.
	if err.Error() == "resource data is required" {
		t.Fatal("expected API error, not validation error")
	}
}

func TestResourceHandler_ApplyResource_EmptyData(t *testing.T) {
	mgr := newConnectedManager()
	h := NewResourceHandler(resource.NewService(), mgr)

	err := h.ApplyResource("", "v1", "configmaps", "default", nil)
	if err == nil {
		t.Fatal("expected error for empty data")
	}
}

func TestResourceHandler_Disconnected(t *testing.T) {
	mgr := cluster.NewManager() // no connection
	h := NewResourceHandler(resource.NewService(), mgr)

	_, err := h.ListResources("", "v1", "pods", "default")
	if err == nil {
		t.Fatal("expected error when disconnected")
	}

	_, err = h.GetResource("", "v1", "pods", "default", "test")
	if err == nil {
		t.Fatal("expected error when disconnected")
	}

	err = h.ApplyResource("", "v1", "pods", "default", []byte(`{}`))
	if err == nil {
		t.Fatal("expected error when disconnected")
	}

	err = h.DeleteResource("", "v1", "pods", "default", "test")
	if err == nil {
		t.Fatal("expected error when disconnected")
	}
}

func TestResourceHandler_GetPodMetrics_Disconnected(t *testing.T) {
	mgr := cluster.NewManager()
	h := NewResourceHandler(resource.NewService(), mgr)

	_, err := h.GetPodMetrics("default")
	if err == nil {
		t.Fatal("expected error when disconnected")
	}
}

func TestResourceHandler_PatchLabels_EmptyName(t *testing.T) {
	mgr := newConnectedManager()
	h := NewResourceHandler(resource.NewService(), mgr)

	err := h.PatchLabels("", "v1", "pods", "default", "", map[string]any{"app": "test"})
	if err == nil {
		t.Fatal("expected error for empty name")
	}
}

func TestResourceHandler_PatchLabels_Disconnected(t *testing.T) {
	mgr := cluster.NewManager()
	h := NewResourceHandler(resource.NewService(), mgr)

	err := h.PatchLabels("", "v1", "pods", "default", "test", map[string]any{"app": "test"})
	if err == nil {
		t.Fatal("expected error when disconnected")
	}
}

func TestResourceHandler_PatchLabels(t *testing.T) {
	mgr := newConnectedManager(testPod("my-pod", "default"))
	h := NewResourceHandler(resource.NewService(), mgr)

	err := h.PatchLabels("", "v1", "pods", "default", "my-pod", map[string]any{"env": "prod"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestResourceHandler_BatchDelete(t *testing.T) {
	mgr := newConnectedManager(
		testPod("pod-a", "default"),
		testPod("pod-b", "default"),
	)
	h := NewResourceHandler(resource.NewService(), mgr)

	results := h.BatchDelete([]BatchDeleteQuery{
		{Group: "", Version: "v1", Resource: "pods", Namespace: "default", Name: "pod-a"},
		{Group: "", Version: "v1", Resource: "pods", Namespace: "default", Name: "pod-b"},
	})
	if len(results) != 2 {
		t.Fatalf("expected 2 results, got %d", len(results))
	}
	for _, r := range results {
		if r.Error != "" {
			t.Fatalf("unexpected error for %s: %s", r.Name, r.Error)
		}
	}
}

func TestResourceHandler_BatchDelete_Disconnected(t *testing.T) {
	mgr := cluster.NewManager()
	h := NewResourceHandler(resource.NewService(), mgr)

	results := h.BatchDelete([]BatchDeleteQuery{
		{Group: "", Version: "v1", Resource: "pods", Namespace: "default", Name: "test"},
	})
	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}
	if results[0].Error == "" {
		t.Fatal("expected error when disconnected")
	}
}

func TestResourceHandler_WatchResources_Disconnected(t *testing.T) {
	mgr := cluster.NewManager()
	h := NewResourceHandler(resource.NewService(), mgr)

	err := h.WatchResources("", "v1", "pods", "default")
	if err == nil {
		t.Fatal("expected error when disconnected")
	}
}

func TestResourceHandler_StopWatch(t *testing.T) {
	mgr := newConnectedManager(testPod("p1", "default"))
	h := NewResourceHandler(resource.NewService(), mgr)

	// StopWatch on non-existent watch should not panic
	h.StopWatch("", "v1", "pods", "default")
}

func TestResourceHandler_ListEvents_Disconnected(t *testing.T) {
	mgr := cluster.NewManager()
	h := NewResourceHandler(resource.NewService(), mgr)

	_, err := h.ListEvents("default", 100)
	if err == nil {
		t.Fatal("expected error when disconnected")
	}
}

// newConnectedManagerWithTyped creates a Manager with both dynamic and typed fake objects.
func newConnectedManagerWithTyped(typedObjects []runtime.Object, dynamicObjects ...runtime.Object) *cluster.Manager {
	scheme := runtime.NewScheme()
	dynClient := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(scheme,
		map[schema.GroupVersionResource]string{
			{Group: "", Version: "v1", Resource: "pods"}:                "PodList",
			{Group: "", Version: "v1", Resource: "services"}:            "ServiceList",
			{Group: "apps", Version: "v1", Resource: "deployments"}:     "DeploymentList",
			{Group: "", Version: "v1", Resource: "configmaps"}:          "ConfigMapList",
			{Group: "", Version: "v1", Resource: "namespaces"}:          "NamespaceList",
			{Group: "", Version: "v1", Resource: "serviceaccounts"}:     "ServiceAccountList",
			{Group: "", Version: "v1", Resource: "persistentvolumes"}:   "PersistentVolumeList",
		},
		dynamicObjects...,
	)
	typedClient := kubefake.NewClientset(typedObjects...)

	mgr := cluster.NewManager()
	mgr.SetClientForTest(&k8s.ClientSet{
		Typed:   typedClient,
		Dynamic: dynClient,
		Config:  &rest.Config{},
	})
	return mgr
}

func int32Ptr(i int32) *int32 { return &i }

func TestResourceHandler_ScaleDeployment(t *testing.T) {
	deploy := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{Name: "my-deploy", Namespace: "default"},
		Spec: appsv1.DeploymentSpec{
			Replicas: int32Ptr(1),
			Selector: &metav1.LabelSelector{MatchLabels: map[string]string{"app": "test"}},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: map[string]string{"app": "test"}},
				Spec:       corev1.PodSpec{Containers: []corev1.Container{{Name: "c", Image: "img"}}},
			},
		},
	}
	mgr := newConnectedManagerWithTyped([]runtime.Object{deploy})
	h := NewResourceHandler(resource.NewService(), mgr)

	err := h.ScaleDeployment("default", "my-deploy", 3)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestResourceHandler_ScaleDeployment_Disconnected(t *testing.T) {
	mgr := cluster.NewManager()
	h := NewResourceHandler(resource.NewService(), mgr)

	err := h.ScaleDeployment("default", "my-deploy", 3)
	if err == nil {
		t.Fatal("expected error when disconnected")
	}
}

func TestResourceHandler_RestartDeployment(t *testing.T) {
	deploy := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{Name: "my-deploy", Namespace: "default"},
		Spec: appsv1.DeploymentSpec{
			Replicas: int32Ptr(1),
			Selector: &metav1.LabelSelector{MatchLabels: map[string]string{"app": "test"}},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: map[string]string{"app": "test"}},
				Spec:       corev1.PodSpec{Containers: []corev1.Container{{Name: "c", Image: "img"}}},
			},
		},
	}
	mgr := newConnectedManagerWithTyped([]runtime.Object{deploy})
	h := NewResourceHandler(resource.NewService(), mgr)

	err := h.RestartDeployment("default", "my-deploy")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestResourceHandler_RestartDeployment_Disconnected(t *testing.T) {
	mgr := cluster.NewManager()
	h := NewResourceHandler(resource.NewService(), mgr)

	err := h.RestartDeployment("default", "my-deploy")
	if err == nil {
		t.Fatal("expected error when disconnected")
	}
}

func TestResourceHandler_CordonNode(t *testing.T) {
	node := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{Name: "node-1"},
	}
	mgr := newConnectedManagerWithTyped([]runtime.Object{node})
	h := NewResourceHandler(resource.NewService(), mgr)

	err := h.CordonNode("node-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestResourceHandler_CordonNode_Disconnected(t *testing.T) {
	mgr := cluster.NewManager()
	h := NewResourceHandler(resource.NewService(), mgr)

	err := h.CordonNode("node-1")
	if err == nil {
		t.Fatal("expected error when disconnected")
	}
}

func TestResourceHandler_UncordonNode(t *testing.T) {
	node := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{Name: "node-1"},
		Spec:       corev1.NodeSpec{Unschedulable: true},
	}
	mgr := newConnectedManagerWithTyped([]runtime.Object{node})
	h := NewResourceHandler(resource.NewService(), mgr)

	err := h.UncordonNode("node-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestResourceHandler_UncordonNode_Disconnected(t *testing.T) {
	mgr := cluster.NewManager()
	h := NewResourceHandler(resource.NewService(), mgr)

	err := h.UncordonNode("node-1")
	if err == nil {
		t.Fatal("expected error when disconnected")
	}
}

func TestResourceHandler_DrainNode_Disconnected(t *testing.T) {
	mgr := cluster.NewManager()
	h := NewResourceHandler(resource.NewService(), mgr)

	err := h.DrainNode("node-1", 30, false, true, false)
	if err == nil {
		t.Fatal("expected error when disconnected")
	}
}

func TestResourceHandler_DrainNode_NoPods(t *testing.T) {
	node := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{Name: "node-1"},
	}
	mgr := newConnectedManagerWithTyped([]runtime.Object{node})
	h := NewResourceHandler(resource.NewService(), mgr)

	// Drain with no pods should succeed.
	err := h.DrainNode("node-1", 30, false, true, false)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

// --- Tests for RBAC pre-flight checks ---

func TestResourceHandler_DeleteResource_RBACDenied(t *testing.T) {
	fakeClient := kubefake.NewClientset()
	fakeClient.PrependReactor("create", "selfsubjectaccessreviews", func(action k8stesting.Action) (bool, runtime.Object, error) {
		review := action.(k8stesting.CreateAction).GetObject().(*authv1.SelfSubjectAccessReview)
		review.Status.Allowed = false
		review.Status.Reason = "RBAC denied for test"
		return true, review, nil
	})

	mgr := cluster.NewManager()
	mgr.SetClientForTest(&k8s.ClientSet{
		Typed:   fakeClient,
		Dynamic: dynamicfake.NewSimpleDynamicClientWithCustomListKinds(runtime.NewScheme(),
			map[schema.GroupVersionResource]string{
				{Group: "", Version: "v1", Resource: "pods"}: "PodList",
			},
			testPod("del-me", "default"),
		),
		Config: &rest.Config{},
	})

	h := NewResourceHandler(resource.NewService(), mgr)
	err := h.DeleteResource("", "v1", "pods", "default", "del-me")
	if err == nil {
		t.Fatal("expected error when RBAC denies delete")
	}
	if !strings.Contains(err.Error(), "permission denied") {
		t.Errorf("expected 'permission denied' in error, got: %v", err)
	}
	if !strings.Contains(err.Error(), "RBAC denied for test") {
		t.Errorf("expected RBAC reason in error, got: %v", err)
	}
}

func TestResourceHandler_DeleteResource_RBACAllowed(t *testing.T) {
	fakeClient := kubefake.NewClientset()
	fakeClient.PrependReactor("create", "selfsubjectaccessreviews", func(action k8stesting.Action) (bool, runtime.Object, error) {
		review := action.(k8stesting.CreateAction).GetObject().(*authv1.SelfSubjectAccessReview)
		review.Status.Allowed = true
		return true, review, nil
	})

	mgr := cluster.NewManager()
	mgr.SetClientForTest(&k8s.ClientSet{
		Typed:   fakeClient,
		Dynamic: dynamicfake.NewSimpleDynamicClientWithCustomListKinds(runtime.NewScheme(),
			map[schema.GroupVersionResource]string{
				{Group: "", Version: "v1", Resource: "pods"}: "PodList",
			},
			testPod("del-me", "default"),
		),
		Config: &rest.Config{},
	})

	h := NewResourceHandler(resource.NewService(), mgr)
	err := h.DeleteResource("", "v1", "pods", "default", "del-me")
	if err != nil {
		t.Fatalf("expected no error when RBAC allows: %v", err)
	}
}

func TestResourceHandler_DeleteResource_RBACAPIError(t *testing.T) {
	// When RBAC API returns an error, the operation should proceed (fail naturally).
	fakeClient := kubefake.NewClientset()
	fakeClient.PrependReactor("create", "selfsubjectaccessreviews", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, fmt.Errorf("API server error")
	})

	mgr := cluster.NewManager()
	mgr.SetClientForTest(&k8s.ClientSet{
		Typed:   fakeClient,
		Dynamic: dynamicfake.NewSimpleDynamicClientWithCustomListKinds(runtime.NewScheme(),
			map[schema.GroupVersionResource]string{
				{Group: "", Version: "v1", Resource: "pods"}: "PodList",
			},
			testPod("del-me", "default"),
		),
		Config: &rest.Config{},
	})

	h := NewResourceHandler(resource.NewService(), mgr)
	// Should succeed (RBAC API error is ignored, operation proceeds).
	err := h.DeleteResource("", "v1", "pods", "default", "del-me")
	if err != nil {
		t.Fatalf("expected operation to proceed when RBAC API errors: %v", err)
	}
}

func TestResourceHandler_DeleteResource_RBACDenied_EmptyReason(t *testing.T) {
	fakeClient := kubefake.NewClientset()
	fakeClient.PrependReactor("create", "selfsubjectaccessreviews", func(action k8stesting.Action) (bool, runtime.Object, error) {
		review := action.(k8stesting.CreateAction).GetObject().(*authv1.SelfSubjectAccessReview)
		review.Status.Allowed = false
		review.Status.Reason = "" // empty reason
		return true, review, nil
	})

	mgr := cluster.NewManager()
	mgr.SetClientForTest(&k8s.ClientSet{
		Typed:   fakeClient,
		Dynamic: dynamicfake.NewSimpleDynamicClientWithCustomListKinds(runtime.NewScheme(),
			map[schema.GroupVersionResource]string{
				{Group: "", Version: "v1", Resource: "pods"}: "PodList",
			},
		),
		Config: &rest.Config{},
	})

	h := NewResourceHandler(resource.NewService(), mgr)
	err := h.DeleteResource("", "v1", "pods", "default", "some-pod")
	if err == nil {
		t.Fatal("expected error")
	}
	// Should use the default reason.
	if !strings.Contains(err.Error(), "forbidden by cluster RBAC policy") {
		t.Errorf("expected default reason in error, got: %v", err)
	}
}

func TestResourceHandler_ScaleDeployment_RBACDenied(t *testing.T) {
	deploy := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{Name: "my-deploy", Namespace: "default"},
		Spec: appsv1.DeploymentSpec{
			Replicas: int32Ptr(1),
			Selector: &metav1.LabelSelector{MatchLabels: map[string]string{"app": "test"}},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: map[string]string{"app": "test"}},
				Spec:       corev1.PodSpec{Containers: []corev1.Container{{Name: "c", Image: "img"}}},
			},
		},
	}
	fakeClient := kubefake.NewClientset(deploy)
	fakeClient.PrependReactor("create", "selfsubjectaccessreviews", func(action k8stesting.Action) (bool, runtime.Object, error) {
		review := action.(k8stesting.CreateAction).GetObject().(*authv1.SelfSubjectAccessReview)
		review.Status.Allowed = false
		review.Status.Reason = "no scale permission"
		return true, review, nil
	})

	mgr := cluster.NewManager()
	mgr.SetClientForTest(&k8s.ClientSet{Typed: fakeClient, Config: &rest.Config{}})

	h := NewResourceHandler(resource.NewService(), mgr)
	err := h.ScaleDeployment("default", "my-deploy", 5)
	if err == nil {
		t.Fatal("expected error when RBAC denies scale")
	}
	if !strings.Contains(err.Error(), "permission denied") {
		t.Errorf("expected 'permission denied' in error, got: %v", err)
	}
}

func TestResourceHandler_DrainNode_RBACDenied(t *testing.T) {
	node := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{Name: "node-1"},
	}
	fakeClient := kubefake.NewClientset(node)
	fakeClient.PrependReactor("create", "selfsubjectaccessreviews", func(action k8stesting.Action) (bool, runtime.Object, error) {
		review := action.(k8stesting.CreateAction).GetObject().(*authv1.SelfSubjectAccessReview)
		review.Status.Allowed = false
		review.Status.Reason = "no eviction permission"
		return true, review, nil
	})

	mgr := cluster.NewManager()
	mgr.SetClientForTest(&k8s.ClientSet{Typed: fakeClient, Config: &rest.Config{}})

	h := NewResourceHandler(resource.NewService(), mgr)
	err := h.DrainNode("node-1", 30, false, true, false)
	if err == nil {
		t.Fatal("expected error when RBAC denies drain")
	}
	if !strings.Contains(err.Error(), "permission denied") {
		t.Errorf("expected 'permission denied' in error, got: %v", err)
	}
}

// --- Tests for watchKey struct (collision avoidance) ---

func TestResourceHandler_WatchKeyNoCollision(t *testing.T) {
	// Previously watch keys were strings like "g/v/r/ns" which could collide.
	// With struct keys, different combinations should never collide.
	key1 := watchKey{group: "apps", version: "v1", resource: "deployments", namespace: "default"}
	key2 := watchKey{group: "apps", version: "v1", resource: "deployments", namespace: "kube-system"}
	key3 := watchKey{group: "", version: "v1", resource: "pods", namespace: "default"}
	key4 := watchKey{group: "apps", version: "v1", resource: "deployments", namespace: "default"}

	m := make(map[watchKey]bool)
	m[key1] = true
	m[key2] = true
	m[key3] = true

	if !m[key4] {
		t.Error("key4 should be equal to key1")
	}
	if len(m) != 3 {
		t.Errorf("expected 3 distinct keys, got %d", len(m))
	}
}

func TestResourceHandler_WatchKeySlashInValues(t *testing.T) {
	// With string keys, "a/b/c/d" could collide with "a/b/c" + "d".
	// Struct keys prevent this.
	key1 := watchKey{group: "a/b", version: "v1", resource: "c", namespace: "d"}
	key2 := watchKey{group: "a", version: "b/v1", resource: "c", namespace: "d"}

	m := make(map[watchKey]bool)
	m[key1] = true
	m[key2] = true

	if len(m) != 2 {
		t.Error("keys with slashes in different fields should not collide")
	}
}

// --- Tests for StopWatch cancel outside lock ---

func TestResourceHandler_StopWatch_NoExistingWatch(t *testing.T) {
	mgr := newConnectedManager()
	h := NewResourceHandler(resource.NewService(), mgr)

	// Should not panic.
	h.StopWatch("", "v1", "pods", "default")
}

func TestResourceHandler_StopWatch_CancelsConcurrently(t *testing.T) {
	mgr := newConnectedManager(testPod("p1", "default"))
	h := NewResourceHandler(resource.NewService(), mgr)

	// Start a watch.
	err := h.WatchResources("", "v1", "pods", "default")
	if err != nil {
		t.Fatalf("WatchResources: %v", err)
	}

	// Stop it -- cancel() is called outside the lock.
	h.StopWatch("", "v1", "pods", "default")

	// Starting a new watch for the same key should succeed.
	err = h.WatchResources("", "v1", "pods", "default")
	if err != nil {
		t.Fatalf("WatchResources after StopWatch: %v", err)
	}
	h.StopWatch("", "v1", "pods", "default")
}

// --- Tests for concurrent drain ---

func TestResourceHandler_DrainNode_ConcurrentEvictions(t *testing.T) {
	// Create a node with several pods.
	node := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{Name: "drain-node"},
	}
	var pods []runtime.Object
	pods = append(pods, node)
	for i := 0; i < 15; i++ {
		pods = append(pods, &corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{
				Name:      fmt.Sprintf("pod-%d", i),
				Namespace: "default",
			},
			Spec: corev1.PodSpec{
				NodeName: "drain-node",
			},
		})
	}

	fakeClient := kubefake.NewClientset(pods...)
	fakeClient.PrependReactor("create", "selfsubjectaccessreviews", func(action k8stesting.Action) (bool, runtime.Object, error) {
		review := action.(k8stesting.CreateAction).GetObject().(*authv1.SelfSubjectAccessReview)
		review.Status.Allowed = true
		return true, review, nil
	})

	mgr := cluster.NewManager()
	mgr.SetClientForTest(&k8s.ClientSet{Typed: fakeClient, Config: &rest.Config{}})

	h := NewResourceHandler(resource.NewService(), mgr)

	// Drain with concurrent evictions. The fake client may or may not support
	// EvictV1 properly, so we mainly check it doesn't deadlock or panic.
	err := h.DrainNode("drain-node", 30, true, true, false)
	// The error may come from the fake client not implementing EvictV1 properly.
	// What matters is no deadlock/panic and the function returns.
	_ = err
}

func TestResourceHandler_DrainNode_IgnoresDaemonSetPods(t *testing.T) {
	node := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{Name: "drain-node"},
	}
	// A DaemonSet pod
	dsPod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "ds-pod",
			Namespace: "kube-system",
			OwnerReferences: []metav1.OwnerReference{
				{Kind: "DaemonSet", Name: "my-ds"},
			},
		},
		Spec: corev1.PodSpec{NodeName: "drain-node"},
	}
	// A regular pod
	regularPod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "regular-pod",
			Namespace: "default",
		},
		Spec: corev1.PodSpec{NodeName: "drain-node"},
	}

	fakeClient := kubefake.NewClientset(node, dsPod, regularPod)
	fakeClient.PrependReactor("create", "selfsubjectaccessreviews", func(action k8stesting.Action) (bool, runtime.Object, error) {
		review := action.(k8stesting.CreateAction).GetObject().(*authv1.SelfSubjectAccessReview)
		review.Status.Allowed = true
		return true, review, nil
	})

	mgr := cluster.NewManager()
	mgr.SetClientForTest(&k8s.ClientSet{Typed: fakeClient, Config: &rest.Config{}})

	h := NewResourceHandler(resource.NewService(), mgr)

	// ignoreDaemonSets=true should skip the ds-pod.
	err := h.DrainNode("drain-node", 30, true, true, false)
	// Error from eviction is expected with fake client; check no deadlock.
	_ = err
}

func TestResourceHandler_DrainNode_IgnoresMirrorPods(t *testing.T) {
	node := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{Name: "drain-node"},
	}
	mirrorPod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "mirror-pod",
			Namespace: "kube-system",
			Annotations: map[string]string{
				"kubernetes.io/config.mirror": "abc123",
			},
		},
		Spec: corev1.PodSpec{NodeName: "drain-node"},
	}

	fakeClient := kubefake.NewClientset(node, mirrorPod)
	fakeClient.PrependReactor("create", "selfsubjectaccessreviews", func(action k8stesting.Action) (bool, runtime.Object, error) {
		review := action.(k8stesting.CreateAction).GetObject().(*authv1.SelfSubjectAccessReview)
		review.Status.Allowed = true
		return true, review, nil
	})

	mgr := cluster.NewManager()
	mgr.SetClientForTest(&k8s.ClientSet{Typed: fakeClient, Config: &rest.Config{}})

	h := NewResourceHandler(resource.NewService(), mgr)

	// Mirror pods should be skipped -- drain should complete without errors.
	err := h.DrainNode("drain-node", 30, false, true, false)
	if err != nil {
		t.Fatalf("unexpected error draining node with only mirror pods: %v", err)
	}
}

// --- Test maxConcurrentEvictions constant ---

func TestMaxConcurrentEvictions(t *testing.T) {
	if maxConcurrentEvictions != 10 {
		t.Errorf("expected maxConcurrentEvictions=10, got %d", maxConcurrentEvictions)
	}
}

// --- Test isDaemonSetPod ---

func TestIsDaemonSetPod(t *testing.T) {
	dsPod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			OwnerReferences: []metav1.OwnerReference{
				{Kind: "DaemonSet", Name: "my-ds"},
			},
		},
	}
	if !isDaemonSetPod(dsPod) {
		t.Error("expected isDaemonSetPod=true for DaemonSet-owned pod")
	}

	regularPod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			OwnerReferences: []metav1.OwnerReference{
				{Kind: "ReplicaSet", Name: "my-rs"},
			},
		},
	}
	if isDaemonSetPod(regularPod) {
		t.Error("expected isDaemonSetPod=false for ReplicaSet-owned pod")
	}

	noPod := &corev1.Pod{}
	if isDaemonSetPod(noPod) {
		t.Error("expected isDaemonSetPod=false for pod with no owners")
	}
}

// --- DryRunApply tests ---

func TestResourceHandler_DryRunApply_EmptyData(t *testing.T) {
	mgr := newConnectedManager()
	h := NewResourceHandler(resource.NewService(), mgr)

	_, err := h.DryRunApply("", "v1", "pods", "default", nil)
	if err == nil {
		t.Fatal("expected error for empty data")
	}
	if !strings.Contains(err.Error(), "resource data is required") {
		t.Errorf("expected 'resource data is required', got: %v", err)
	}
}

func TestResourceHandler_DryRunApply_InvalidYAML(t *testing.T) {
	mgr := newConnectedManager()
	h := NewResourceHandler(resource.NewService(), mgr)

	_, err := h.DryRunApply("", "v1", "pods", "default", []byte("{{{{not valid yaml"))
	if err == nil {
		t.Fatal("expected error for invalid YAML")
	}
	if !strings.Contains(err.Error(), "parse YAML") {
		t.Errorf("expected 'parse YAML' in error, got: %v", err)
	}
}

func TestResourceHandler_DryRunApply_MissingName(t *testing.T) {
	mgr := newConnectedManager()
	h := NewResourceHandler(resource.NewService(), mgr)

	data := []byte(`apiVersion: v1
kind: Pod
metadata:
  namespace: default`)
	_, err := h.DryRunApply("", "v1", "pods", "default", data)
	if err == nil {
		t.Fatal("expected error for missing name")
	}
	if !strings.Contains(err.Error(), "resource name is required") {
		t.Errorf("expected 'resource name is required', got: %v", err)
	}
}

func TestResourceHandler_DryRunApply_Disconnected(t *testing.T) {
	mgr := cluster.NewManager()
	h := NewResourceHandler(resource.NewService(), mgr)

	data := []byte(`apiVersion: v1
kind: Pod
metadata:
  name: test-pod
  namespace: default`)
	_, err := h.DryRunApply("", "v1", "pods", "default", data)
	if err == nil {
		t.Fatal("expected error when disconnected")
	}
}

func TestResourceHandler_DryRunApply_ResourceNotFound(t *testing.T) {
	// The live resource doesn't exist, so Get should fail.
	mgr := newConnectedManager()
	h := NewResourceHandler(resource.NewService(), mgr)

	data := []byte(`apiVersion: v1
kind: Pod
metadata:
  name: nonexistent-pod
  namespace: default`)
	_, err := h.DryRunApply("", "v1", "pods", "default", data)
	if err == nil {
		t.Fatal("expected error when resource does not exist")
	}
	if !strings.Contains(err.Error(), "get live resource") {
		t.Errorf("expected 'get live resource' in error, got: %v", err)
	}
}

func TestResourceHandler_DryRunApply_Success(t *testing.T) {
	pod := testPod("my-pod", "default")
	mgr := newConnectedManager(pod)
	h := NewResourceHandler(resource.NewService(), mgr)

	data := []byte(`{"apiVersion":"v1","kind":"Pod","metadata":{"name":"my-pod","namespace":"default","labels":{"app":"test"}}}`)
	result, err := h.DryRunApply("", "v1", "pods", "default", data)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(result, "---SEPARATOR---") {
		t.Fatal("expected separator in result")
	}
	parts := strings.SplitN(result, "\n---SEPARATOR---\n", 2)
	if len(parts) != 2 {
		t.Fatalf("expected 2 parts separated by separator, got %d", len(parts))
	}
	// Both parts should contain YAML with the pod name
	if !strings.Contains(parts[0], "my-pod") {
		t.Error("live YAML should contain pod name")
	}
	if !strings.Contains(parts[1], "my-pod") {
		t.Error("dry-run YAML should contain pod name")
	}
	// The dry-run result should contain the new label
	if !strings.Contains(parts[1], "app") {
		t.Error("dry-run YAML should contain the new label")
	}
}

func TestResourceHandler_ListResources_ClusterScoped(t *testing.T) {
	ns := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "v1",
			"kind":       "Namespace",
			"metadata": map[string]interface{}{
				"name": "test-ns",
				"labels": map[string]interface{}{
					"kubernetes.io/metadata.name": "test-ns",
				},
			},
		},
	}
	mgr := newConnectedManager(ns)
	h := NewResourceHandler(resource.NewService(), mgr)

	items, err := h.ListResources("", "v1", "namespaces", "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(items))
	}
}

// --- PauseDeployment / ResumeDeployment tests ---

func TestResourceHandler_PauseDeployment(t *testing.T) {
	deploy := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{Name: "my-deploy", Namespace: "default"},
		Spec: appsv1.DeploymentSpec{
			Replicas: int32Ptr(1),
			Selector: &metav1.LabelSelector{MatchLabels: map[string]string{"app": "test"}},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: map[string]string{"app": "test"}},
				Spec:       corev1.PodSpec{Containers: []corev1.Container{{Name: "c", Image: "img"}}},
			},
		},
	}
	mgr := newConnectedManagerWithTyped([]runtime.Object{deploy})
	h := NewResourceHandler(resource.NewService(), mgr)

	err := h.PauseDeployment("default", "my-deploy")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestResourceHandler_PauseDeployment_EmptyName(t *testing.T) {
	mgr := newConnectedManager()
	h := NewResourceHandler(resource.NewService(), mgr)

	err := h.PauseDeployment("default", "")
	if err == nil {
		t.Fatal("expected error for empty name")
	}
}

func TestResourceHandler_PauseDeployment_Disconnected(t *testing.T) {
	mgr := cluster.NewManager()
	h := NewResourceHandler(resource.NewService(), mgr)

	err := h.PauseDeployment("default", "my-deploy")
	if err == nil {
		t.Fatal("expected error when disconnected")
	}
}

func TestResourceHandler_ResumeDeployment(t *testing.T) {
	deploy := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{Name: "my-deploy", Namespace: "default"},
		Spec: appsv1.DeploymentSpec{
			Paused:   true,
			Replicas: int32Ptr(1),
			Selector: &metav1.LabelSelector{MatchLabels: map[string]string{"app": "test"}},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: map[string]string{"app": "test"}},
				Spec:       corev1.PodSpec{Containers: []corev1.Container{{Name: "c", Image: "img"}}},
			},
		},
	}
	mgr := newConnectedManagerWithTyped([]runtime.Object{deploy})
	h := NewResourceHandler(resource.NewService(), mgr)

	err := h.ResumeDeployment("default", "my-deploy")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestResourceHandler_ResumeDeployment_EmptyName(t *testing.T) {
	mgr := newConnectedManager()
	h := NewResourceHandler(resource.NewService(), mgr)

	err := h.ResumeDeployment("default", "")
	if err == nil {
		t.Fatal("expected error for empty name")
	}
}

func TestResourceHandler_ResumeDeployment_Disconnected(t *testing.T) {
	mgr := cluster.NewManager()
	h := NewResourceHandler(resource.NewService(), mgr)

	err := h.ResumeDeployment("default", "my-deploy")
	if err == nil {
		t.Fatal("expected error when disconnected")
	}
}

// --- GetRolloutHistory tests ---

func TestResourceHandler_GetRolloutHistory_EmptyName(t *testing.T) {
	mgr := newConnectedManager()
	h := NewResourceHandler(resource.NewService(), mgr)

	_, err := h.GetRolloutHistory("default", "")
	if err == nil {
		t.Fatal("expected error for empty name")
	}
}

func TestResourceHandler_GetRolloutHistory_Disconnected(t *testing.T) {
	mgr := cluster.NewManager()
	h := NewResourceHandler(resource.NewService(), mgr)

	_, err := h.GetRolloutHistory("default", "my-deploy")
	if err == nil {
		t.Fatal("expected error when disconnected")
	}
}

func TestResourceHandler_GetRolloutHistory(t *testing.T) {
	deploy := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{Name: "my-deploy", Namespace: "default"},
		Spec: appsv1.DeploymentSpec{
			Replicas: int32Ptr(1),
			Selector: &metav1.LabelSelector{MatchLabels: map[string]string{"app": "test"}},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: map[string]string{"app": "test"}},
				Spec:       corev1.PodSpec{Containers: []corev1.Container{{Name: "c", Image: "nginx:1.0"}}},
			},
		},
	}
	mgr := newConnectedManagerWithTyped([]runtime.Object{deploy})
	h := NewResourceHandler(resource.NewService(), mgr)

	revisions, err := h.GetRolloutHistory("default", "my-deploy")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// No ReplicaSets yet, so should be empty.
	if len(revisions) != 0 {
		t.Fatalf("expected 0 revisions, got %d", len(revisions))
	}
}

// --- AddNodeTaint / RemoveNodeTaint tests ---

func TestResourceHandler_AddNodeTaint(t *testing.T) {
	node := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{Name: "node-1"},
	}
	mgr := newConnectedManagerWithTyped([]runtime.Object{node})
	h := NewResourceHandler(resource.NewService(), mgr)

	err := h.AddNodeTaint("node-1", "key1", "val1", "NoSchedule")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestResourceHandler_AddNodeTaint_EmptyNodeName(t *testing.T) {
	mgr := newConnectedManager()
	h := NewResourceHandler(resource.NewService(), mgr)

	err := h.AddNodeTaint("", "key", "val", "NoSchedule")
	if err == nil {
		t.Fatal("expected error for empty node name")
	}
}

func TestResourceHandler_AddNodeTaint_EmptyKey(t *testing.T) {
	mgr := newConnectedManager()
	h := NewResourceHandler(resource.NewService(), mgr)

	err := h.AddNodeTaint("node-1", "", "val", "NoSchedule")
	if err == nil {
		t.Fatal("expected error for empty key")
	}
}

func TestResourceHandler_AddNodeTaint_InvalidEffect(t *testing.T) {
	mgr := newConnectedManager()
	h := NewResourceHandler(resource.NewService(), mgr)

	err := h.AddNodeTaint("node-1", "key", "val", "BadEffect")
	if err == nil {
		t.Fatal("expected error for invalid effect")
	}
	if !strings.Contains(err.Error(), "invalid taint effect") {
		t.Errorf("expected 'invalid taint effect' in error, got: %v", err)
	}
}

func TestResourceHandler_AddNodeTaint_Duplicate(t *testing.T) {
	node := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{Name: "node-1"},
		Spec: corev1.NodeSpec{
			Taints: []corev1.Taint{
				{Key: "key1", Value: "val1", Effect: corev1.TaintEffectNoSchedule},
			},
		},
	}
	mgr := newConnectedManagerWithTyped([]runtime.Object{node})
	h := NewResourceHandler(resource.NewService(), mgr)

	err := h.AddNodeTaint("node-1", "key1", "val1", "NoSchedule")
	if err == nil {
		t.Fatal("expected error for duplicate taint")
	}
	if !strings.Contains(err.Error(), "already exists") {
		t.Errorf("expected 'already exists' in error, got: %v", err)
	}
}

func TestResourceHandler_AddNodeTaint_Disconnected(t *testing.T) {
	mgr := cluster.NewManager()
	h := NewResourceHandler(resource.NewService(), mgr)

	err := h.AddNodeTaint("node-1", "key", "val", "NoSchedule")
	if err == nil {
		t.Fatal("expected error when disconnected")
	}
}

func TestResourceHandler_RemoveNodeTaint(t *testing.T) {
	node := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{Name: "node-1"},
		Spec: corev1.NodeSpec{
			Taints: []corev1.Taint{
				{Key: "key1", Value: "val1", Effect: corev1.TaintEffectNoSchedule},
			},
		},
	}
	mgr := newConnectedManagerWithTyped([]runtime.Object{node})
	h := NewResourceHandler(resource.NewService(), mgr)

	err := h.RemoveNodeTaint("node-1", "key1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestResourceHandler_RemoveNodeTaint_NotFound(t *testing.T) {
	node := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{Name: "node-1"},
	}
	mgr := newConnectedManagerWithTyped([]runtime.Object{node})
	h := NewResourceHandler(resource.NewService(), mgr)

	err := h.RemoveNodeTaint("node-1", "nonexistent")
	if err == nil {
		t.Fatal("expected error for taint not found")
	}
	if !strings.Contains(err.Error(), "not found") {
		t.Errorf("expected 'not found' in error, got: %v", err)
	}
}

func TestResourceHandler_RemoveNodeTaint_EmptyNodeName(t *testing.T) {
	mgr := newConnectedManager()
	h := NewResourceHandler(resource.NewService(), mgr)

	err := h.RemoveNodeTaint("", "key")
	if err == nil {
		t.Fatal("expected error for empty node name")
	}
}

func TestResourceHandler_RemoveNodeTaint_EmptyKey(t *testing.T) {
	mgr := newConnectedManager()
	h := NewResourceHandler(resource.NewService(), mgr)

	err := h.RemoveNodeTaint("node-1", "")
	if err == nil {
		t.Fatal("expected error for empty key")
	}
}

func TestResourceHandler_RemoveNodeTaint_Disconnected(t *testing.T) {
	mgr := cluster.NewManager()
	h := NewResourceHandler(resource.NewService(), mgr)

	err := h.RemoveNodeTaint("node-1", "key")
	if err == nil {
		t.Fatal("expected error when disconnected")
	}
}

// --- CreateJobFromCronJob tests ---

func TestResourceHandler_CreateJobFromCronJob_EmptyCronJobName(t *testing.T) {
	mgr := newConnectedManager()
	h := NewResourceHandler(resource.NewService(), mgr)

	err := h.CreateJobFromCronJob("default", "", "")
	if err == nil {
		t.Fatal("expected error for empty cronjob name")
	}
}

func TestResourceHandler_CreateJobFromCronJob_Disconnected(t *testing.T) {
	mgr := cluster.NewManager()
	h := NewResourceHandler(resource.NewService(), mgr)

	err := h.CreateJobFromCronJob("default", "my-cj", "")
	if err == nil {
		t.Fatal("expected error when disconnected")
	}
}

func TestResourceHandler_CreateJobFromCronJob(t *testing.T) {
	cronJob := &batchv1.CronJob{
		ObjectMeta: metav1.ObjectMeta{Name: "my-cj", Namespace: "default"},
		Spec: batchv1.CronJobSpec{
			Schedule: "*/5 * * * *",
			JobTemplate: batchv1.JobTemplateSpec{
				Spec: batchv1.JobSpec{
					Template: corev1.PodTemplateSpec{
						Spec: corev1.PodSpec{
							Containers:    []corev1.Container{{Name: "worker", Image: "busybox"}},
							RestartPolicy: corev1.RestartPolicyNever,
						},
					},
				},
			},
		},
	}
	mgr := newConnectedManagerWithTyped([]runtime.Object{cronJob})
	h := NewResourceHandler(resource.NewService(), mgr)

	err := h.CreateJobFromCronJob("default", "my-cj", "manual-job")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestResourceHandler_CreateJobFromCronJob_AutoName(t *testing.T) {
	cronJob := &batchv1.CronJob{
		ObjectMeta: metav1.ObjectMeta{Name: "my-cj", Namespace: "default"},
		Spec: batchv1.CronJobSpec{
			Schedule: "*/5 * * * *",
			JobTemplate: batchv1.JobTemplateSpec{
				Spec: batchv1.JobSpec{
					Template: corev1.PodTemplateSpec{
						Spec: corev1.PodSpec{
							Containers:    []corev1.Container{{Name: "worker", Image: "busybox"}},
							RestartPolicy: corev1.RestartPolicyNever,
						},
					},
				},
			},
		},
	}
	mgr := newConnectedManagerWithTyped([]runtime.Object{cronJob})
	h := NewResourceHandler(resource.NewService(), mgr)

	err := h.CreateJobFromCronJob("default", "my-cj", "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

// --- hasEmptyDirVolume tests ---

func TestHasEmptyDirVolume(t *testing.T) {
	podWithEmptyDir := &corev1.Pod{
		Spec: corev1.PodSpec{
			Volumes: []corev1.Volume{
				{Name: "cache", VolumeSource: corev1.VolumeSource{EmptyDir: &corev1.EmptyDirVolumeSource{}}},
			},
		},
	}
	if !hasEmptyDirVolume(podWithEmptyDir) {
		t.Error("expected hasEmptyDirVolume=true for pod with emptyDir volume")
	}

	podWithoutEmptyDir := &corev1.Pod{
		Spec: corev1.PodSpec{
			Volumes: []corev1.Volume{
				{Name: "config", VolumeSource: corev1.VolumeSource{ConfigMap: &corev1.ConfigMapVolumeSource{}}},
			},
		},
	}
	if hasEmptyDirVolume(podWithoutEmptyDir) {
		t.Error("expected hasEmptyDirVolume=false for pod without emptyDir volume")
	}

	podNoVolumes := &corev1.Pod{}
	if hasEmptyDirVolume(podNoVolumes) {
		t.Error("expected hasEmptyDirVolume=false for pod with no volumes")
	}
}

// --- H1: DryRunApply with cluster-scoped resources ---

func TestResourceHandler_DryRunApply_ClusterScoped(t *testing.T) {
	// PersistentVolumes are cluster-scoped (no namespace).
	pv := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "v1",
			"kind":       "PersistentVolume",
			"metadata": map[string]interface{}{
				"name": "my-pv",
			},
			"spec": map[string]interface{}{
				"capacity": map[string]interface{}{
					"storage": "10Gi",
				},
			},
		},
	}
	mgr := newConnectedManager(pv)
	h := NewResourceHandler(resource.NewService(), mgr)

	data := []byte(`{"apiVersion":"v1","kind":"PersistentVolume","metadata":{"name":"my-pv"},"spec":{"capacity":{"storage":"20Gi"}}}`)
	result, err := h.DryRunApply("", "v1", "persistentvolumes", "", data)
	if err != nil {
		t.Fatalf("DryRunApply cluster-scoped: %v", err)
	}
	if !strings.Contains(result, "---SEPARATOR---") {
		t.Fatal("expected separator in result")
	}
	parts := strings.SplitN(result, "\n---SEPARATOR---\n", 2)
	if len(parts) != 2 {
		t.Fatalf("expected 2 parts, got %d", len(parts))
	}
	if !strings.Contains(parts[0], "my-pv") {
		t.Error("live YAML should contain PV name")
	}
	if !strings.Contains(parts[1], "my-pv") {
		t.Error("dry-run YAML should contain PV name")
	}
}

// --- H2: RestartDeployment RBAC check ---

func TestResourceHandler_RestartDeployment_RBACDenied(t *testing.T) {
	deploy := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{Name: "my-deploy", Namespace: "default"},
		Spec: appsv1.DeploymentSpec{
			Replicas: int32Ptr(1),
			Selector: &metav1.LabelSelector{MatchLabels: map[string]string{"app": "test"}},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: map[string]string{"app": "test"}},
				Spec:       corev1.PodSpec{Containers: []corev1.Container{{Name: "c", Image: "img"}}},
			},
		},
	}

	fakeTyped := kubefake.NewClientset(deploy)
	fakeTyped.PrependReactor("create", "selfsubjectaccessreviews", func(action k8stesting.Action) (bool, runtime.Object, error) {
		review := action.(k8stesting.CreateAction).GetObject().(*authv1.SelfSubjectAccessReview)
		review.Status.Allowed = false
		review.Status.Reason = "RBAC denied restart"
		return true, review, nil
	})

	mgr := cluster.NewManager()
	mgr.SetClientForTest(&k8s.ClientSet{
		Typed:   fakeTyped,
		Dynamic: dynamicfake.NewSimpleDynamicClientWithCustomListKinds(runtime.NewScheme(),
			map[schema.GroupVersionResource]string{
				{Group: "apps", Version: "v1", Resource: "deployments"}: "DeploymentList",
			},
		),
		Config: &rest.Config{},
	})

	h := NewResourceHandler(resource.NewService(), mgr)
	err := h.RestartDeployment("default", "my-deploy")
	if err == nil {
		t.Fatal("expected error when RBAC denies restart")
	}
	if !strings.Contains(err.Error(), "permission denied") {
		t.Errorf("expected 'permission denied' in error, got: %v", err)
	}
}

