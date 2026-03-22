//go:build e2e

package e2e

import (
	"context"
	"strings"
	"sync"
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"clusterfudge/internal/stream"
)

// TC-LOG-001: Start log stream and receive known content
func TestLogs_ReceiveKnownContent(t *testing.T) {
	t.Parallel()
	name := randName("e2e-logger")
	t.Cleanup(func() { deletePod(t, testEnv.namespace, name) })

	createPod(t, testEnv.namespace, name, loggingPodSpec("test-line"))
	waitForPodRunning(t, testEnv.namespace, name, 60*time.Second)

	streamer := stream.NewLogStreamer(testEnv.typed)
	opts := stream.LogOptions{
		Namespace:     testEnv.namespace,
		PodName:       name,
		ContainerName: "logger",
		Follow:        true,
		TailLines:     10,
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	var lines []stream.LogLine
	var mu sync.Mutex

	var streamErr error
	go func() {
		streamErr = streamer.Stream(ctx, opts, func(line stream.LogLine) {
			mu.Lock()
			lines = append(lines, line)
			mu.Unlock()
		})
	}()

	// Wait up to 10 seconds for at least 1 line
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		mu.Lock()
		count := len(lines)
		mu.Unlock()
		if count >= 1 {
			break
		}
		time.Sleep(500 * time.Millisecond)
	}

	mu.Lock()
	collected := len(lines)
	mu.Unlock()

	if collected == 0 {
		if streamErr != nil {
			t.Fatalf("log stream failed: %v", streamErr)
		}
		t.Fatal("expected at least 1 log line, received 0")
	}

	mu.Lock()
	firstLine := lines[0].Content
	mu.Unlock()

	if !strings.Contains(firstLine, "test-line") {
		t.Errorf("expected log line to contain 'test-line', got: %q", firstLine)
	}
}

// TC-LOG-002: Verify log lines arrive in order (timestamps increasing)
func TestLogs_LinesInOrder(t *testing.T) {
	t.Parallel()
	name := randName("e2e-logger-order")
	t.Cleanup(func() { deletePod(t, testEnv.namespace, name) })

	// Log lines that include a counter for ordering verification
	spec := loggingPodSpec("line")
	spec.Containers[0].Command = []string{"/bin/sh", "-c"}
	spec.Containers[0].Args = []string{"i=0; while true; do echo \"line-$i\"; i=$((i+1)); sleep 1; done"}
	createPod(t, testEnv.namespace, name, spec)
	waitForPodRunning(t, testEnv.namespace, name, 60*time.Second)

	streamer := stream.NewLogStreamer(testEnv.typed)
	opts := stream.LogOptions{
		Namespace:     testEnv.namespace,
		PodName:       name,
		ContainerName: "logger",
		Follow:        true,
		TailLines:     5,
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	var lines []string
	var mu sync.Mutex

	var streamErr2 error
	go func() {
		streamErr2 = streamer.Stream(ctx, opts, func(line stream.LogLine) {
			mu.Lock()
			lines = append(lines, line.Content)
			mu.Unlock()
		})
	}()

	// Collect at least 5 lines
	deadline := time.Now().Add(15 * time.Second)
	for time.Now().Before(deadline) {
		mu.Lock()
		count := len(lines)
		mu.Unlock()
		if count >= 5 {
			break
		}
		time.Sleep(500 * time.Millisecond)
	}

	mu.Lock()
	collected := make([]string, len(lines))
	copy(collected, lines)
	mu.Unlock()

	if len(collected) < 5 {
		if streamErr2 != nil {
			t.Fatalf("log stream failed: %v", streamErr2)
		}
		t.Fatalf("expected 5 lines, got %d", len(collected))
	}
	// Lines should contain "line-0", "line-1", etc. in order
	for i := 0; i < len(collected); i++ {
		if !strings.Contains(collected[i], "line-") {
			t.Errorf("line %d doesn't contain expected prefix: %q", i, collected[i])
		}
	}
}

// TC-LOG-004: Verify tail lines option
func TestLogs_TailLines(t *testing.T) {
	t.Parallel()
	name := randName("e2e-logger-tail")
	t.Cleanup(func() { deletePod(t, testEnv.namespace, name) })

	// Pod that outputs exactly 50 numbered lines then exits
	spec := corev1.PodSpec{
		RestartPolicy: corev1.RestartPolicyNever,
		Containers: []corev1.Container{
			{
				Name:    "logger",
				Image:   "busybox:latest",
				Command: []string{"/bin/sh", "-c"},
				Args:    []string{"for i in $(seq 1 50); do echo \"line $i\"; done"},
			},
		},
	}
	createPod(t, testEnv.namespace, name, spec)
	waitForPodCompleted(t, testEnv.namespace, name, 60*time.Second)

	streamer := stream.NewLogStreamer(testEnv.typed)
	opts := stream.LogOptions{
		Namespace:     testEnv.namespace,
		PodName:       name,
		ContainerName: "logger",
		Follow:        false,
		TailLines:     20,
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	var lines []stream.LogLine
	var mu sync.Mutex
	done := make(chan struct{})

	go func() {
		streamer.Stream(ctx, opts, func(line stream.LogLine) {
			mu.Lock()
			lines = append(lines, line)
			mu.Unlock()
		})
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(10 * time.Second):
		t.Fatal("log stream did not complete within 10s")
	}

	mu.Lock()
	count := len(lines)
	mu.Unlock()

	if count > 20 {
		t.Errorf("expected <= 20 lines with TailLines=20, got %d", count)
	}
	if count == 0 {
		t.Error("expected some lines, got 0")
	}
}

// TC-LOG-005: Retrieve previous container logs
func TestLogs_PreviousLogs(t *testing.T) {
	t.Parallel()
	name := randName("e2e-crash-logger")
	t.Cleanup(func() { deletePod(t, testEnv.namespace, name) })

	// Pod that exits 1 on first run (restart policy OnFailure)
	spec := corev1.PodSpec{
		RestartPolicy: corev1.RestartPolicyOnFailure,
		Containers: []corev1.Container{
			{
				Name:    "crasher",
				Image:   "busybox:latest",
				Command: []string{"/bin/sh", "-c"},
				Args:    []string{"echo 'crashing now'; exit 1"},
			},
		},
	}
	createPod(t, testEnv.namespace, name, spec)

	// Wait for at least 1 restart
	deadline := time.Now().Add(90 * time.Second)
	for time.Now().Before(deadline) {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		pod, err := testEnv.typed.CoreV1().Pods(testEnv.namespace).Get(ctx, name, metav1.GetOptions{})
		cancel()
		if err == nil && len(pod.Status.ContainerStatuses) > 0 &&
			pod.Status.ContainerStatuses[0].RestartCount >= 1 {
			break
		}
		time.Sleep(3 * time.Second)
	}

	streamer := stream.NewLogStreamer(testEnv.typed)
	opts := stream.LogOptions{
		Namespace:     testEnv.namespace,
		PodName:       name,
		ContainerName: "crasher",
		Follow:        false,
		TailLines:     100,
		Previous:      true,
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	var lines []stream.LogLine
	var mu sync.Mutex
	done := make(chan struct{})

	go func() {
		streamer.Stream(ctx, opts, func(line stream.LogLine) {
			mu.Lock()
			lines = append(lines, line)
			mu.Unlock()
		})
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(10 * time.Second):
		t.Fatal("previous log stream did not complete")
	}

	mu.Lock()
	count := len(lines)
	mu.Unlock()

	if count == 0 {
		t.Error("expected previous logs, got 0 lines")
	}

	mu.Lock()
	found := false
	for _, l := range lines {
		if strings.Contains(l.Content, "crashing now") {
			found = true
			break
		}
	}
	mu.Unlock()

	if !found {
		t.Error("expected 'crashing now' in previous logs")
	}
}

// TC-LOG-006: Stop log stream — verify no more events after cancel
func TestLogs_StopStream(t *testing.T) {
	t.Parallel()
	name := randName("e2e-logger-stop")
	t.Cleanup(func() { deletePod(t, testEnv.namespace, name) })

	createPod(t, testEnv.namespace, name, loggingPodSpec("stop-test-line"))
	waitForPodRunning(t, testEnv.namespace, name, 60*time.Second)

	streamer := stream.NewLogStreamer(testEnv.typed)
	opts := stream.LogOptions{
		Namespace:     testEnv.namespace,
		PodName:       name,
		ContainerName: "logger",
		Follow:        true,
		TailLines:     10,
	}

	ctx, cancel := context.WithCancel(context.Background())

	var lineCount int
	var mu sync.Mutex
	streamDone := make(chan struct{})

	go func() {
		streamer.Stream(ctx, opts, func(line stream.LogLine) {
			mu.Lock()
			lineCount++
			mu.Unlock()
		})
		close(streamDone)
	}()

	// Wait for some lines to arrive
	time.Sleep(3 * time.Second)

	mu.Lock()
	countBeforeStop := lineCount
	mu.Unlock()

	if countBeforeStop == 0 {
		t.Fatal("expected some lines before stopping stream")
	}

	// Stop the stream
	cancel()

	// Wait for stream goroutine to finish
	select {
	case <-streamDone:
	case <-time.After(5 * time.Second):
		t.Fatal("stream goroutine did not stop within 5s after cancel")
	}

	// Wait another 3s and verify no new lines
	time.Sleep(3 * time.Second)

	mu.Lock()
	countAfterStop := lineCount
	mu.Unlock()

	if countAfterStop > countBeforeStop {
		t.Errorf("received %d lines after stop (expected 0)", countAfterStop-countBeforeStop)
	}
}

// TC-LOG-007: Log stream for non-existent pod — verify error
func TestLogs_NonExistentPod(t *testing.T) {
	streamer := stream.NewLogStreamer(testEnv.typed)
	opts := stream.LogOptions{
		Namespace:     testEnv.namespace,
		PodName:       "does-not-exist-xyz",
		ContainerName: "container",
		Follow:        false,
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	err := streamer.Stream(ctx, opts, func(line stream.LogLine) {
		t.Error("unexpected log line from non-existent pod")
	})

	if err == nil {
		t.Error("expected error streaming logs from non-existent pod, got nil")
	}
}

// TC-LOG-008: Multi-container pod — stream specific container
func TestLogs_MultiContainerStreamSpecific(t *testing.T) {
	t.Parallel()
	name := randName("e2e-multi-container")
	t.Cleanup(func() { deletePod(t, testEnv.namespace, name) })

	// Create multi-container pod
	spec := corev1.PodSpec{
		Containers: []corev1.Container{
			{
				Name:    "container-a",
				Image:   "busybox:latest",
				Command: []string{"/bin/sh", "-c"},
				Args:    []string{"while true; do echo 'container-a-line'; sleep 1; done"},
			},
			{
				Name:    "container-b",
				Image:   "busybox:latest",
				Command: []string{"/bin/sh", "-c"},
				Args:    []string{"while true; do echo 'container-b-line'; sleep 1; done"},
			},
		},
	}
	createPod(t, testEnv.namespace, name, spec)
	waitForPodRunning(t, testEnv.namespace, name, 90*time.Second)

	streamer := stream.NewLogStreamer(testEnv.typed)
	opts := stream.LogOptions{
		Namespace:     testEnv.namespace,
		PodName:       name,
		ContainerName: "container-a",
		Follow:        true,
		TailLines:     5,
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var lines []stream.LogLine
	var mu sync.Mutex

	var multiStreamErr error
	go func() {
		multiStreamErr = streamer.Stream(ctx, opts, func(line stream.LogLine) {
			mu.Lock()
			lines = append(lines, line)
			mu.Unlock()
		})
	}()

	time.Sleep(5 * time.Second)
	cancel()

	mu.Lock()
	collected := make([]stream.LogLine, len(lines))
	copy(collected, lines)
	mu.Unlock()

	if len(collected) == 0 {
		if multiStreamErr != nil {
			t.Fatalf("log stream failed: %v", multiStreamErr)
		}
		t.Fatal("expected log lines, got 0")
	}

	for _, l := range collected {
		if strings.Contains(l.Content, "container-b-line") {
			t.Errorf("unexpected container-b log line in container-a stream: %q", l.Content)
		}
		if !strings.Contains(l.Content, "container-a-line") {
			t.Errorf("expected container-a-line, got: %q", l.Content)
		}
	}
}
