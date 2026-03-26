package stream

import (
	"context"
	"testing"
	"time"
)

func TestNewMultiLogStreamer(t *testing.T) {
	s := NewMultiLogStreamer(nil)
	if s == nil {
		t.Fatal("expected non-nil streamer")
	}
}

func TestMultiLogStreamer_StopAll_Empty(t *testing.T) {
	s := NewMultiLogStreamer(nil)
	// Should not panic
	s.StopAll()
}

func TestMultiLogStreamer_Stop_NotFound(t *testing.T) {
	s := NewMultiLogStreamer(nil)
	// Should not panic
	s.Stop("nonexistent")
}

func TestMultiLogStreamer_StopAll_CancelsContexts(t *testing.T) {
	s := NewMultiLogStreamer(nil)

	ctx1, cancel1 := context.WithCancel(context.Background())
	ctx2, cancel2 := context.WithCancel(context.Background())
	defer cancel1()
	defer cancel2()

	s.mu.Lock()
	s.streams["c1"] = &ContainerLogStream{ContainerName: "c1", Cancel: cancel1}
	s.streams["c2"] = &ContainerLogStream{ContainerName: "c2", Cancel: cancel2}
	s.mu.Unlock()

	s.StopAll()

	// Both contexts should be cancelled
	select {
	case <-ctx1.Done():
		// expected
	case <-time.After(100 * time.Millisecond):
		t.Fatal("c1 context not cancelled")
	}

	select {
	case <-ctx2.Done():
		// expected
	case <-time.After(100 * time.Millisecond):
		t.Fatal("c2 context not cancelled")
	}

	s.mu.Lock()
	if len(s.streams) != 0 {
		t.Fatalf("expected 0 streams, got %d", len(s.streams))
	}
	s.mu.Unlock()
}

func TestMultiLogStreamer_Stop_CancelsSingle(t *testing.T) {
	s := NewMultiLogStreamer(nil)

	ctx1, cancel1 := context.WithCancel(context.Background())
	ctx2, cancel2 := context.WithCancel(context.Background())
	defer cancel1()
	defer cancel2()

	s.mu.Lock()
	s.streams["c1"] = &ContainerLogStream{ContainerName: "c1", Cancel: cancel1}
	s.streams["c2"] = &ContainerLogStream{ContainerName: "c2", Cancel: cancel2}
	s.mu.Unlock()

	s.Stop("c1")

	select {
	case <-ctx1.Done():
		// expected
	case <-time.After(100 * time.Millisecond):
		t.Fatal("c1 context not cancelled")
	}

	// c2 should NOT be cancelled
	select {
	case <-ctx2.Done():
		t.Fatal("c2 should not be cancelled")
	case <-time.After(10 * time.Millisecond):
		// expected
	}

	s.mu.Lock()
	if len(s.streams) != 1 {
		t.Fatalf("expected 1 stream remaining, got %d", len(s.streams))
	}
	s.mu.Unlock()
}
