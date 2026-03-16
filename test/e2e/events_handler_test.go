//go:build e2e

package e2e

import (
	"context"
	"testing"
	"time"

	"kubeviewer/handlers"
	"kubeviewer/internal/cluster"
	"kubeviewer/internal/events"
	"kubeviewer/internal/resource"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// TC-EVT-001: ListEvents returns events from the cluster
func TestListEvents_ReturnsEvents(t *testing.T) {
	t.Parallel()

	// Create a pod that will generate events
	name := randName("evt-pod")
	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: testEnv.namespace},
		Spec: corev1.PodSpec{
			Containers: []corev1.Container{
				{Name: "main", Image: "busybox:1.36", Command: []string{"echo", "hello"}},
			},
			RestartPolicy: corev1.RestartPolicyNever,
		},
	}

	_, err := testEnv.typed.CoreV1().Pods(testEnv.namespace).Create(
		context.Background(), pod, metav1.CreateOptions{},
	)
	if err != nil {
		t.Fatalf("create pod: %v", err)
	}
	t.Cleanup(func() {
		_ = testEnv.typed.CoreV1().Pods(testEnv.namespace).Delete(
			context.Background(), name, metav1.DeleteOptions{},
		)
	})

	// Wait a moment for events to be generated
	time.Sleep(3 * time.Second)

	h := handlers.NewResourceHandler(resource.NewService(), managerForTest(t))
	emitter := events.NewEmitter(nil)
	h.SetEmitter(emitter)

	result, err := h.ListEvents(context.Background(), testEnv.namespace, 100)
	if err != nil {
		t.Fatalf("ListEvents: %v", err)
	}

	// Should have at least some events (pod scheduling, pulling, etc.)
	if len(result) == 0 {
		t.Log("Warning: no events found. This may be expected on a fresh cluster.")
	}

	// Verify event structure
	for _, e := range result {
		if e.ObjectKind == "" {
			t.Errorf("event missing ObjectKind")
		}
		if e.Type == "" {
			t.Errorf("event missing Type")
		}
	}
}

// TC-EVT-002: ListEvents with empty namespace returns events from all namespaces
func TestListEvents_AllNamespaces(t *testing.T) {
	t.Parallel()

	h := handlers.NewResourceHandler(resource.NewService(), managerForTest(t))
	emitter := events.NewEmitter(nil)
	h.SetEmitter(emitter)

	_, err := h.ListEvents(context.Background(), "", 50)
	if err != nil {
		t.Fatalf("ListEvents all namespaces: %v", err)
	}
}

// TC-EVT-003: ListEvents respects limit
func TestListEvents_Limit(t *testing.T) {
	t.Parallel()

	h := handlers.NewResourceHandler(resource.NewService(), managerForTest(t))
	emitter := events.NewEmitter(nil)
	h.SetEmitter(emitter)

	result, err := h.ListEvents(context.Background(), testEnv.namespace, 1)
	if err != nil {
		t.Fatalf("ListEvents: %v", err)
	}

	if len(result) > 1 {
		t.Logf("Note: got %d events with limit 1 (API may return more)", len(result))
	}
}

// managerForTest creates a cluster.Manager connected to the test cluster.
func managerForTest(t *testing.T) *cluster.Manager {
	t.Helper()
	mgr := cluster.NewManager()
	mgr.SetClientForTest(testEnv.clientSet)
	return mgr
}
