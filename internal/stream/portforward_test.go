package stream

import (
	"testing"
	"time"
)

func TestListPortForwards_Empty(t *testing.T) {
	m := NewPortForwardManager()
	result := m.ListPortForwards()
	if len(result) != 0 {
		t.Fatalf("expected 0 forwards, got %d", len(result))
	}
}

func TestStopPortForward_NonExistent(t *testing.T) {
	m := NewPortForwardManager()
	// Should not panic for non-existent port
	m.StopPortForward(99999)
}

func TestGenerateID(t *testing.T) {
	id1, err := GenerateID()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	id2, err := GenerateID()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if id1 == "" {
		t.Fatal("expected non-empty ID")
	}
	if len(id1) != 16 {
		t.Fatalf("expected 16 char hex ID, got %d chars: %s", len(id1), id1)
	}
	if id1 == id2 {
		t.Fatal("expected unique IDs")
	}
}

func TestBackoffDuration(t *testing.T) {
	tests := []struct {
		attempt  int
		expected time.Duration
	}{
		{0, 1 * time.Second},
		{1, 2 * time.Second},
		{2, 4 * time.Second},
		{3, 8 * time.Second},
		{4, 16 * time.Second},
		{5, 30 * time.Second}, // capped at max
		{10, 30 * time.Second},
	}
	for _, tt := range tests {
		got := backoffDuration(tt.attempt)
		if got != tt.expected {
			t.Errorf("backoffDuration(%d) = %v, want %v", tt.attempt, got, tt.expected)
		}
	}
}

func TestSetForwardStatus(t *testing.T) {
	m := NewPortForwardManager()
	// Register a fake forward entry.
	m.mu.Lock()
	m.forwards[12345] = &portForwardEntry{
		cancel:    func() {},
		podName:   "test-pod",
		namespace: "default",
		podPort:   8080,
		status:    "active",
	}
	m.mu.Unlock()

	// Update status.
	m.setForwardStatus(12345, "reconnecting", 2)

	m.mu.Lock()
	entry := m.forwards[12345]
	m.mu.Unlock()

	if entry.status != "reconnecting" {
		t.Errorf("expected status 'reconnecting', got %q", entry.status)
	}
	if entry.reconnectNum != 2 {
		t.Errorf("expected reconnectNum 2, got %d", entry.reconnectNum)
	}
}

func TestSetForwardStatus_NonExistent(t *testing.T) {
	m := NewPortForwardManager()
	// Should not panic for non-existent port.
	m.setForwardStatus(99999, "reconnecting", 1)
}

func TestListPortForwards_IncludesStatus(t *testing.T) {
	m := NewPortForwardManager()
	// Register a fake forward entry with status.
	m.mu.Lock()
	m.forwards[54321] = &portForwardEntry{
		cancel:       func() {},
		podName:      "status-pod",
		namespace:    "test-ns",
		podPort:      3000,
		status:       "reconnecting",
		reconnectNum: 3,
	}
	m.mu.Unlock()

	result := m.ListPortForwards()
	found := false
	for _, info := range result {
		if info.LocalPort == 54321 {
			found = true
			if info.Status != "reconnecting" {
				t.Errorf("expected status 'reconnecting', got %q", info.Status)
			}
			if info.ReconnectNum != 3 {
				t.Errorf("expected reconnectNum 3, got %d", info.ReconnectNum)
			}
		}
	}
	if !found {
		t.Error("forward with port 54321 not found in ListPortForwards")
	}
}

func TestPortForwardEmitter_Interface(t *testing.T) {
	// Verify that a simple struct can satisfy the PortForwardEmitter interface.
	var emitter PortForwardEmitter = &mockEmitter{}
	emitter.Emit("test", nil)
}

type mockEmitter struct {
	topics []string
}

func (m *mockEmitter) Emit(topic string, _ any) {
	m.topics = append(m.topics, topic)
}
