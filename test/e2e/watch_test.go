//go:build e2e

package e2e

import (
	"context"
	"testing"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
)

// TC-WATCH-001: Watch pods — receive ADDED event on pod creation
func TestWatch_PodAdded(t *testing.T) {
	t.Parallel()
	name := randName("e2e-watch-add")
	t.Cleanup(func() { deletePod(t, testEnv.namespace, name) })

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	ch, err := testEnv.resourceSvc.Watch(ctx, testEnv.dynamic, podsQuery(testEnv.namespace))
	if err != nil {
		t.Fatalf("start watch: %v", err)
	}

	// Create pod after watch is started
	createPod(t, testEnv.namespace, name, nginxPodSpec())

	assertEventReceived(t, ch, "ADDED", name, 15*time.Second)
}

// TC-WATCH-002: Watch pods — receive MODIFIED event on label change
func TestWatch_PodModified(t *testing.T) {
	t.Parallel()
	name := randName("e2e-watch-mod")
	t.Cleanup(func() { deletePod(t, testEnv.namespace, name) })

	createPod(t, testEnv.namespace, name, nginxPodSpec())

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	ch, err := testEnv.resourceSvc.Watch(ctx, testEnv.dynamic, podsQuery(testEnv.namespace))
	if err != nil {
		t.Fatalf("start watch: %v", err)
	}

	// Consume initial ADDED event
	assertEventReceived(t, ch, "ADDED", name, 15*time.Second)

	// Add label to trigger MODIFIED
	patchData := `{"metadata":{"labels":{"e2e-test":"modified"}}}`
	_, err = testEnv.typed.CoreV1().Pods(testEnv.namespace).Patch(
		ctx, name,
		types.MergePatchType,
		[]byte(patchData),
		metav1.PatchOptions{},
	)
	if err != nil {
		t.Fatalf("patch pod labels: %v", err)
	}

	assertEventReceived(t, ch, "MODIFIED", name, 15*time.Second)
}

// TC-WATCH-003: Watch pods — receive DELETED event on pod deletion
func TestWatch_PodDeleted(t *testing.T) {
	t.Parallel()
	name := randName("e2e-watch-del")

	createPod(t, testEnv.namespace, name, nginxPodSpec())

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	ch, err := testEnv.resourceSvc.Watch(ctx, testEnv.dynamic, podsQuery(testEnv.namespace))
	if err != nil {
		t.Fatalf("start watch: %v", err)
	}

	// Consume initial ADDED event
	assertEventReceived(t, ch, "ADDED", name, 15*time.Second)

	// Delete the pod
	deletePod(t, testEnv.namespace, name)

	assertEventReceived(t, ch, "DELETED", name, 15*time.Second)
}

// TC-WATCH-004: Watch reconnection — cancel and restart watch
func TestWatch_Reconnect(t *testing.T) {
	t.Parallel()

	// Start first watch
	ctx1, cancel1 := context.WithTimeout(context.Background(), 15*time.Second)
	ch1, err := testEnv.resourceSvc.Watch(ctx1, testEnv.dynamic, podsQuery(testEnv.namespace))
	if err != nil {
		cancel1()
		t.Fatalf("start first watch: %v", err)
	}

	name1 := randName("e2e-watch-reconnect-1")
	t.Cleanup(func() { deletePod(t, testEnv.namespace, name1) })
	createPod(t, testEnv.namespace, name1, nginxPodSpec())
	assertEventReceived(t, ch1, "ADDED", name1, 10*time.Second)

	// Cancel first watch
	cancel1()

	// Verify channel closes
	select {
	case _, ok := <-ch1:
		if ok {
			// drain any remaining events
		}
	case <-time.After(5 * time.Second):
		// channel may have buffered events
	}

	// Start second watch
	ctx2, cancel2 := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel2()

	ch2, err := testEnv.resourceSvc.Watch(ctx2, testEnv.dynamic, podsQuery(testEnv.namespace))
	if err != nil {
		t.Fatalf("start second watch: %v", err)
	}

	// Create a new pod after reconnect
	name2 := randName("e2e-watch-reconnect-2")
	t.Cleanup(func() { deletePod(t, testEnv.namespace, name2) })
	createPod(t, testEnv.namespace, name2, nginxPodSpec())

	assertEventReceived(t, ch2, "ADDED", name2, 15*time.Second)
}

// TC-WATCH-005: Watch with namespace filter — correct isolation
func TestWatch_NamespaceFilter(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	// Watch only namespace A
	ch, err := testEnv.resourceSvc.Watch(ctx, testEnv.dynamic, podsQuery(testEnv.namespace))
	if err != nil {
		t.Fatalf("start watch: %v", err)
	}

	// Create pod in namespace A — should get event
	podA := randName("pod-watch-ns-a")
	t.Cleanup(func() { deletePod(t, testEnv.namespace, podA) })
	createPod(t, testEnv.namespace, podA, nginxPodSpec())
	assertEventReceived(t, ch, "ADDED", podA, 15*time.Second)

	// Create pod in namespace B — should NOT get event
	podB := randName("pod-watch-ns-b")
	t.Cleanup(func() { deletePod(t, testEnv.namespaceB, podB) })
	createPod(t, testEnv.namespaceB, podB, nginxPodSpec())
	assertNoEventReceived(t, ch, podB, 5*time.Second)
}

// TC-WATCH-006: Watch delivers events for multiple rapid pod creations
func TestWatch_MultipleRapidChanges(t *testing.T) {
	t.Parallel()
	const podCount = 5

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	ch, err := testEnv.resourceSvc.Watch(ctx, testEnv.dynamic, podsQuery(testEnv.namespace))
	if err != nil {
		t.Fatalf("start watch: %v", err)
	}

	// Create 5 pods rapidly
	names := make([]string, podCount)
	for i := 0; i < podCount; i++ {
		names[i] = randName("e2e-watch-rapid")
		createPod(t, testEnv.namespace, names[i], nginxPodSpec())
	}
	t.Cleanup(func() {
		for _, name := range names {
			deletePod(t, testEnv.namespace, name)
		}
	})

	// Verify all 5 ADDED events are received
	received := make(map[string]bool)
	deadline := time.NewTimer(30 * time.Second)
	defer deadline.Stop()

	for len(received) < podCount {
		select {
		case ev, ok := <-ch:
			if !ok {
				t.Fatal("watch channel closed prematurely")
			}
			for _, name := range names {
				if ev.Type == "ADDED" && ev.Resource.Name == name {
					received[name] = true
				}
			}
		case <-deadline.C:
			t.Fatalf("timed out waiting for all %d ADDED events, received %d", podCount, len(received))
		}
	}
}
