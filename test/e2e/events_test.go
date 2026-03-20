//go:build e2e

package e2e

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"clusterfudge/internal/events"
)

func TestEvents_EmitAndSubscribe(t *testing.T) {
	em := events.NewEmitter(nil)

	var received atomic.Value
	unsub := em.Subscribe("test:topic", func(payload any) {
		received.Store(payload)
	})
	defer unsub()

	em.Emit("test:topic", "hello")

	got, ok := received.Load().(string)
	if !ok || got != "hello" {
		t.Errorf("expected payload %q, got %v", "hello", received.Load())
	}
}

func TestEvents_FanOut(t *testing.T) {
	em := events.NewEmitter(nil)

	var count atomic.Int32
	for range 3 {
		unsub := em.Subscribe("fan-out", func(payload any) {
			count.Add(1)
		})
		defer unsub()
	}

	em.Emit("fan-out", "ping")

	if got := count.Load(); got != 3 {
		t.Errorf("expected 3 subscribers to receive event, got %d", got)
	}
}

func TestEvents_TopicIsolation(t *testing.T) {
	em := events.NewEmitter(nil)

	var gotA, gotB atomic.Bool
	unsubA := em.Subscribe("topic-a", func(payload any) {
		gotA.Store(true)
	})
	defer unsubA()

	unsubB := em.Subscribe("topic-b", func(payload any) {
		gotB.Store(true)
	})
	defer unsubB()

	em.Emit("topic-a", "data")

	if !gotA.Load() {
		t.Error("topic-a subscriber should have received event")
	}
	if gotB.Load() {
		t.Error("topic-b subscriber should NOT have received event")
	}
}

func TestEvents_Unsubscribe(t *testing.T) {
	em := events.NewEmitter(nil)

	var count atomic.Int32
	unsub := em.Subscribe("unsub-test", func(payload any) {
		count.Add(1)
	})

	em.Emit("unsub-test", "first")
	if got := count.Load(); got != 1 {
		t.Fatalf("expected count 1 after first emit, got %d", got)
	}

	unsub()

	em.Emit("unsub-test", "second")
	if got := count.Load(); got != 1 {
		t.Errorf("expected count still 1 after unsubscribe, got %d", got)
	}
}

func TestEvents_ConcurrentEmitSubscribe(t *testing.T) {
	em := events.NewEmitter(nil)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	var wg sync.WaitGroup

	// 10 goroutines emitting
	for range 10 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				select {
				case <-ctx.Done():
					return
				default:
					em.Emit("concurrent", j)
				}
			}
		}()
	}

	// 10 goroutines subscribing and unsubscribing
	for range 10 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				select {
				case <-ctx.Done():
					return
				default:
					unsub := em.Subscribe("concurrent", func(payload any) {})
					unsub()
				}
			}
		}()
	}

	wg.Wait()
	// Test passes if no panics or races occurred.
}
