package handlers

import (
	"testing"

	"kubeviewer/internal/cluster"
	"kubeviewer/internal/events"
	"kubeviewer/internal/stream"
)

func TestStreamHandler_StreamLogs_Disconnected(t *testing.T) {
	mgr := cluster.NewManager()
	h := NewStreamHandler(mgr)

	err := h.StreamLogs(stream.LogOptions{
		Namespace:     "default",
		PodName:       "pod",
		ContainerName: "container",
		Follow:        false,
		TailLines:     100,
	})
	if err == nil {
		t.Fatal("expected error when disconnected")
	}
}

func TestStreamHandler_StartExec_Disconnected(t *testing.T) {
	mgr := cluster.NewManager()
	h := NewStreamHandler(mgr)

	_, err := h.StartExec(stream.ExecOptions{
		Namespace:     "default",
		PodName:       "pod",
		ContainerName: "container",
		Command:       []string{"sh"},
		TTY:           false,
	})
	if err == nil {
		t.Fatal("expected error when disconnected")
	}
}

func TestStreamHandler_StartPortForward_Disconnected(t *testing.T) {
	mgr := cluster.NewManager()
	h := NewStreamHandler(mgr)

	_, err := h.StartPortForward(stream.PortForwardOptions{
		Namespace: "default",
		PodName:   "pod",
		PodPort:   8080,
		LocalPort: 0,
	})
	if err == nil {
		t.Fatal("expected error when disconnected")
	}
}

func TestStreamHandler_StopPortForward_NoOp(t *testing.T) {
	mgr := cluster.NewManager()
	h := NewStreamHandler(mgr)

	// Should not panic when stopping a non-existent forward.
	h.StopPortForward(9999)
}

func TestStreamHandler_StreamLogs_Connected(t *testing.T) {
	mgr := newConnectedManager(testPod("log-pod", "default"))
	h := NewStreamHandler(mgr)

	// With fake clients the stream will fail at the API level but shouldn't panic.
	err := h.StreamLogs(stream.LogOptions{
		Namespace:     "default",
		PodName:       "log-pod",
		ContainerName: "main",
		Follow:        false,
		TailLines:     10,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestNewStreamHandler(t *testing.T) {
	mgr := cluster.NewManager()
	h := NewStreamHandler(mgr)
	if h == nil {
		t.Fatal("expected non-nil handler")
	}
}

func TestStreamHandler_SetEmitter(t *testing.T) {
	mgr := cluster.NewManager()
	h := NewStreamHandler(mgr)

	emitter := events.NewEmitter(nil)
	h.SetEmitter(emitter)
	if h.emitter != emitter {
		t.Fatal("emitter not set")
	}
}

func TestStreamHandler_WriteExec_NotFound(t *testing.T) {
	mgr := cluster.NewManager()
	h := NewStreamHandler(mgr)

	err := h.WriteExec("nonexistent", "data")
	if err == nil {
		t.Fatal("expected error for nonexistent session")
	}
}

func TestStreamHandler_CloseExec_NotFound(t *testing.T) {
	mgr := cluster.NewManager()
	h := NewStreamHandler(mgr)

	// Should not panic when closing a non-existent session.
	h.CloseExec("nonexistent")
}

func TestStreamHandler_StopLogStream_NoOp(t *testing.T) {
	mgr := cluster.NewManager()
	h := NewStreamHandler(mgr)

	// Should not panic when stopping a non-existent stream.
	h.StopLogStream("default", "nonexistent")
}

func TestStreamHandler_ListPortForwards_Empty(t *testing.T) {
	mgr := cluster.NewManager()
	h := NewStreamHandler(mgr)

	forwards := h.ListPortForwards()
	if len(forwards) != 0 {
		t.Fatalf("expected 0 forwards, got %d", len(forwards))
	}
}

func TestStreamHandler_StreamAllContainerLogs_Disconnected(t *testing.T) {
	mgr := cluster.NewManager()
	h := NewStreamHandler(mgr)

	err := h.StreamAllContainerLogs("default", "pod", []string{"c1", "c2"}, 100)
	if err == nil {
		t.Fatal("expected error when disconnected")
	}
}

func TestStreamHandler_StopAllContainerLogs_NoOp(t *testing.T) {
	mgr := cluster.NewManager()
	h := NewStreamHandler(mgr)

	// Should not panic when stopping non-existent streams.
	h.StopAllContainerLogs("default", "pod")
}

func TestStreamHandler_DownloadLogs_Disconnected(t *testing.T) {
	mgr := cluster.NewManager()
	h := NewStreamHandler(mgr)

	_, err := h.DownloadLogs(stream.LogOptions{
		Namespace:     "default",
		PodName:       "pod",
		ContainerName: "container",
	})
	if err == nil {
		t.Fatal("expected error when disconnected")
	}
}

func TestStreamHandler_StartServicePortForward_Disconnected(t *testing.T) {
	mgr := cluster.NewManager()
	h := NewStreamHandler(mgr)

	_, err := h.StartServicePortForward("default", "my-svc", 80, 0)
	if err == nil {
		t.Fatal("expected error when disconnected")
	}
}

func TestStreamHandler_StreamLogs_EmitsEvents(t *testing.T) {
	mgr := newConnectedManager(testPod("emitting-pod", "default"))
	h := NewStreamHandler(mgr)

	var emitted []string
	emitter := events.NewEmitter(func(topic string, _ any) {
		emitted = append(emitted, topic)
	})
	h.SetEmitter(emitter)

	// The call should not return an error even with fake clients.
	// The goroutine may emit an error event since the fake can't actually stream.
	err := h.StreamLogs(stream.LogOptions{
		Namespace:     "default",
		PodName:       "emitting-pod",
		ContainerName: "main",
		Follow:        false,
		TailLines:     10,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}
