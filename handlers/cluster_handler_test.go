package handlers

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"kubeviewer/internal/cluster"
	"kubeviewer/internal/k8s"

	authv1 "k8s.io/api/authorization/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes/fake"
	k8stesting "k8s.io/client-go/testing"
)

func TestNewClusterHandler(t *testing.T) {
	mgr := cluster.NewManager()
	h := NewClusterHandler(mgr)
	if h == nil {
		t.Fatal("expected non-nil handler")
	}
	if h.manager != mgr {
		t.Fatal("expected handler to reference the given manager")
	}
}

func TestClusterHandler_Connect_EmptyContext(t *testing.T) {
	mgr := cluster.NewManager()
	h := NewClusterHandler(mgr)

	err := h.Connect("")
	if err == nil {
		t.Fatal("expected error for empty context name")
	}
}

func TestClusterHandler_Disconnect_Safe(t *testing.T) {
	mgr := cluster.NewManager()
	h := NewClusterHandler(mgr)

	// Disconnect on an already-disconnected manager should not panic.
	h.Disconnect()
}

func TestClusterHandler_ActiveConnection_NilWhenDisconnected(t *testing.T) {
	mgr := cluster.NewManager()
	h := NewClusterHandler(mgr)

	conn := h.ActiveConnection()
	if conn != nil {
		t.Errorf("expected nil connection, got %+v", conn)
	}
}

func TestClusterHandler_ListContexts(t *testing.T) {
	// Create a minimal kubeconfig with two contexts.
	dir := t.TempDir()
	kubeconfigPath := filepath.Join(dir, "config")
	kubeconfig := `apiVersion: v1
kind: Config
clusters:
- cluster:
    server: https://localhost:6443
  name: cluster-a
- cluster:
    server: https://localhost:6444
  name: cluster-b
contexts:
- context:
    cluster: cluster-a
    user: user-a
  name: ctx-alpha
- context:
    cluster: cluster-b
    user: user-b
  name: ctx-beta
current-context: ctx-alpha
users:
- name: user-a
- name: user-b
`
	if err := os.WriteFile(kubeconfigPath, []byte(kubeconfig), 0600); err != nil {
		t.Fatalf("write kubeconfig: %v", err)
	}

	// Override KUBECONFIG so ListContexts picks up our test file.
	t.Setenv("KUBECONFIG", kubeconfigPath)

	mgr := cluster.NewManager()
	h := NewClusterHandler(mgr)

	contexts, err := h.ListContexts()
	if err != nil {
		t.Fatalf("ListContexts: %v", err)
	}

	if len(contexts) != 2 {
		t.Fatalf("expected 2 contexts, got %d: %v", len(contexts), contexts)
	}
	// Should be sorted alphabetically.
	if contexts[0] != "ctx-alpha" || contexts[1] != "ctx-beta" {
		t.Errorf("expected [ctx-alpha, ctx-beta], got %v", contexts)
	}
}

func TestClusterHandler_GetConnectionSnapshot_NoActiveCluster(t *testing.T) {
	mgr := cluster.NewManager()
	h := NewClusterHandler(mgr)

	snap, err := h.GetConnectionSnapshot()
	if err == nil {
		t.Fatal("expected error when no active cluster")
	}
	if snap != nil {
		t.Errorf("expected nil snapshot, got %+v", snap)
	}
}

func TestClusterHandler_ListConnections_Empty(t *testing.T) {
	mgr := cluster.NewManager()
	h := NewClusterHandler(mgr)

	conns := h.ListConnections()
	if len(conns) != 0 {
		t.Errorf("expected 0 connections, got %d", len(conns))
	}
}

func TestClusterHandler_SwitchContext_EmptyName(t *testing.T) {
	mgr := cluster.NewManager()
	h := NewClusterHandler(mgr)

	err := h.SwitchContext("")
	if err == nil {
		t.Fatal("expected error for empty context name")
	}
}

func TestClusterHandler_SwitchContext_NotConnected(t *testing.T) {
	mgr := cluster.NewManager()
	h := NewClusterHandler(mgr)

	err := h.SwitchContext("nonexistent")
	if err == nil {
		t.Fatal("expected error for nonexistent context")
	}
}

func TestClusterHandler_ListNamespaces(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "default"}},
		&corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "kube-system"}},
		&corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "test-ns"}},
	)

	mgr := cluster.NewManager()
	cs := &k8s.ClientSet{Typed: fakeClient}
	mgr.SetClientForTest(cs)

	h := NewClusterHandler(mgr)
	names, err := h.ListNamespaces()
	if err != nil {
		t.Fatalf("ListNamespaces: %v", err)
	}
	if len(names) != 3 {
		t.Fatalf("expected 3 namespaces, got %d: %v", len(names), names)
	}
	// Should be sorted
	if names[0] != "default" || names[1] != "kube-system" || names[2] != "test-ns" {
		t.Errorf("expected sorted namespaces, got %v", names)
	}
}

func TestClusterHandler_ListNamespaces_NotConnected(t *testing.T) {
	mgr := cluster.NewManager()
	h := NewClusterHandler(mgr)

	_, err := h.ListNamespaces()
	if err == nil {
		t.Fatal("expected error when not connected")
	}
}

func TestClusterHandler_CheckRBACPermission_NotConnected(t *testing.T) {
	mgr := cluster.NewManager()
	h := NewClusterHandler(mgr)

	_, err := h.CheckRBACPermission("list", "", "pods", "default")
	if err == nil {
		t.Fatal("expected error when not connected")
	}
}

func TestClusterHandler_CheckRBACPermissions(t *testing.T) {
	fakeClient := fake.NewSimpleClientset()
	// The fake client returns an "already exists" error on the second
	// SelfSubjectAccessReview because it interprets Create as a named resource.
	// Add a reactor that always succeeds for access reviews.
	fakeClient.PrependReactor("create", "selfsubjectaccessreviews", func(action k8stesting.Action) (bool, runtime.Object, error) {
		review := action.(k8stesting.CreateAction).GetObject().(*authv1.SelfSubjectAccessReview)
		review.Status.Allowed = true
		review.Status.Reason = "fake"
		return true, review, nil
	})

	mgr := cluster.NewManager()
	cs := &k8s.ClientSet{Typed: fakeClient}
	mgr.SetClientForTest(cs)

	h := NewClusterHandler(mgr)
	results, err := h.CheckRBACPermissions(
		[]string{"list", "get"}, "", "pods", "default")
	if err != nil {
		t.Fatalf("CheckRBACPermissions: %v", err)
	}
	if len(results) != 2 {
		t.Fatalf("expected 2 results, got %d", len(results))
	}
	for _, r := range results {
		if !r.Allowed {
			t.Errorf("expected allowed=true for verb %s", r.Verb)
		}
	}
}

func TestClusterHandler_GetMetrics_NotConnected(t *testing.T) {
	mgr := cluster.NewManager()
	h := NewClusterHandler(mgr)

	_, err := h.GetMetrics()
	if err == nil {
		t.Fatal("expected error when not connected")
	}
}

// --- Tests for pagination in ListNamespaces ---

func TestClusterHandler_ListNamespaces_Pagination(t *testing.T) {
	// Create many namespaces to verify pagination works.
	var nsList []runtime.Object
	for i := 0; i < 10; i++ {
		nsList = append(nsList, &corev1.Namespace{
			ObjectMeta: metav1.ObjectMeta{Name: fmt.Sprintf("ns-%02d", i)},
		})
	}

	fakeClient := fake.NewSimpleClientset(nsList...)
	mgr := cluster.NewManager()
	cs := &k8s.ClientSet{Typed: fakeClient}
	mgr.SetClientForTest(cs)

	h := NewClusterHandler(mgr)
	names, err := h.ListNamespaces()
	if err != nil {
		t.Fatalf("ListNamespaces: %v", err)
	}
	if len(names) != 10 {
		t.Fatalf("expected 10 namespaces, got %d: %v", len(names), names)
	}
	// Should be sorted.
	for i := 1; i < len(names); i++ {
		if names[i] < names[i-1] {
			t.Errorf("namespaces not sorted: %v", names)
			break
		}
	}
}

func TestClusterHandler_ListNamespaces_Empty(t *testing.T) {
	fakeClient := fake.NewSimpleClientset()
	mgr := cluster.NewManager()
	cs := &k8s.ClientSet{Typed: fakeClient}
	mgr.SetClientForTest(cs)

	h := NewClusterHandler(mgr)
	names, err := h.ListNamespaces()
	if err != nil {
		t.Fatalf("ListNamespaces: %v", err)
	}
	if len(names) != 0 {
		t.Fatalf("expected 0 namespaces, got %d", len(names))
	}
}

// --- Tests for GetClusterSummary ---

func TestClusterHandler_GetClusterSummary_NotConnected(t *testing.T) {
	mgr := cluster.NewManager()
	h := NewClusterHandler(mgr)

	_, err := h.GetClusterSummary()
	if err == nil {
		t.Fatal("expected error when not connected")
	}
}

func TestClusterHandler_GetClusterSummary_EmptyCluster(t *testing.T) {
	fakeClient := fake.NewSimpleClientset()
	mgr := cluster.NewManager()
	cs := &k8s.ClientSet{Typed: fakeClient}
	mgr.SetClientForTest(cs)

	h := NewClusterHandler(mgr)
	summary, err := h.GetClusterSummary()
	if err != nil {
		t.Fatalf("GetClusterSummary: %v", err)
	}
	if summary.NodeCount != 0 {
		t.Errorf("expected 0 nodes, got %d", summary.NodeCount)
	}
	if summary.PodCount != 0 {
		t.Errorf("expected 0 pods, got %d", summary.PodCount)
	}
	if summary.DeploymentCount != 0 {
		t.Errorf("expected 0 deployments, got %d", summary.DeploymentCount)
	}
	if summary.ServiceCount != 0 {
		t.Errorf("expected 0 services, got %d", summary.ServiceCount)
	}
}

func TestClusterHandler_GetClusterSummary_WithResources(t *testing.T) {
	node := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{Name: "node-1"},
		Status: corev1.NodeStatus{
			Conditions: []corev1.NodeCondition{
				{Type: "Ready", Status: "True"},
			},
		},
	}
	nodeNotReady := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{Name: "node-2"},
		Status: corev1.NodeStatus{
			Conditions: []corev1.NodeCondition{
				{Type: "Ready", Status: "False"},
			},
		},
	}
	runningPod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{Name: "pod-1", Namespace: "default"},
		Status:     corev1.PodStatus{Phase: corev1.PodRunning},
	}
	pendingPod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{Name: "pod-2", Namespace: "default"},
		Status:     corev1.PodStatus{Phase: corev1.PodPending},
	}
	svc := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{Name: "svc-1", Namespace: "default"},
		Spec:       corev1.ServiceSpec{Type: corev1.ServiceTypeClusterIP},
	}
	lbSvc := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{Name: "svc-lb", Namespace: "default"},
		Spec:       corev1.ServiceSpec{Type: corev1.ServiceTypeLoadBalancer},
	}
	ns := &corev1.Namespace{
		ObjectMeta: metav1.ObjectMeta{Name: "default"},
	}

	fakeClient := fake.NewSimpleClientset(node, nodeNotReady, runningPod, pendingPod, svc, lbSvc, ns)
	mgr := cluster.NewManager()
	cs := &k8s.ClientSet{Typed: fakeClient}
	mgr.SetClientForTest(cs)

	h := NewClusterHandler(mgr)
	summary, err := h.GetClusterSummary()
	if err != nil {
		t.Fatalf("GetClusterSummary: %v", err)
	}

	if summary.NodeCount != 2 {
		t.Errorf("expected 2 nodes, got %d", summary.NodeCount)
	}
	if summary.NodeReady != 1 {
		t.Errorf("expected 1 ready node, got %d", summary.NodeReady)
	}
	if summary.PodCount != 2 {
		t.Errorf("expected 2 pods, got %d", summary.PodCount)
	}
	if summary.PodRunning != 1 {
		t.Errorf("expected 1 running pod, got %d", summary.PodRunning)
	}
	if summary.ServiceCount != 2 {
		t.Errorf("expected 2 services, got %d", summary.ServiceCount)
	}
	if summary.ServiceLB != 1 {
		t.Errorf("expected 1 LB service, got %d", summary.ServiceLB)
	}
	if len(summary.NamespaceSummary) != 1 {
		t.Errorf("expected 1 namespace summary, got %d", len(summary.NamespaceSummary))
	}
	if summary.NamespaceSummary[0].PodCount != 2 {
		t.Errorf("expected 2 pods in default namespace, got %d", summary.NamespaceSummary[0].PodCount)
	}
}

func TestClusterHandler_GetClusterSummary_NoCluster(t *testing.T) {
	// GetClusterSummary should return an error when no cluster is connected.
	mgr := cluster.NewManager()
	h := NewClusterHandler(mgr)

	_, err := h.GetClusterSummary()
	if err == nil {
		t.Fatal("expected error when no cluster is connected")
	}
}

// --- Verify constants ---

func TestClusterHandler_Constants(t *testing.T) {
	if opTimeout != 30*time.Second {
		t.Errorf("expected opTimeout 30s, got %v", opTimeout)
	}
	if listPageSize != 500 {
		t.Errorf("expected listPageSize 500, got %d", listPageSize)
	}
}

// TestClusterHandler_ListContexts_UsesManagerLoader verifies that ListContexts
// uses the Manager's KubeconfigLoader (which respects custom paths) rather than
// the default loading rules.
func TestClusterHandler_ListContexts_UsesManagerLoader(t *testing.T) {
	// Create two separate kubeconfig files with different contexts.
	dir := t.TempDir()
	customPath := filepath.Join(dir, "custom.yaml")
	customKubeconfig := `apiVersion: v1
kind: Config
clusters:
- cluster:
    server: https://custom:6443
  name: custom-cluster
contexts:
- context:
    cluster: custom-cluster
    user: custom-user
  name: custom-ctx
current-context: custom-ctx
users:
- name: custom-user
`
	if err := os.WriteFile(customPath, []byte(customKubeconfig), 0600); err != nil {
		t.Fatalf("write kubeconfig: %v", err)
	}

	// Set KUBECONFIG to a nonexistent file so the default loader would fail.
	t.Setenv("KUBECONFIG", filepath.Join(dir, "nonexistent.yaml"))

	// Create a Manager with a loader using our custom path.
	loader := cluster.NewKubeconfigLoaderFromPaths([]string{customPath})
	mgr := cluster.NewManagerWithLoader(loader)
	h := NewClusterHandler(mgr)

	contexts, err := h.ListContexts()
	if err != nil {
		t.Fatalf("ListContexts: %v", err)
	}

	if len(contexts) != 1 {
		t.Fatalf("expected 1 context, got %d: %v", len(contexts), contexts)
	}
	if contexts[0] != "custom-ctx" {
		t.Errorf("expected 'custom-ctx', got %q", contexts[0])
	}
}

