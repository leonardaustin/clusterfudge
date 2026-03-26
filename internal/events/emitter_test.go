package events

import (
	"sync"
	"sync/atomic"
	"testing"
)

func TestNewEmitter(t *testing.T) {
	t.Run("with emit func", func(t *testing.T) {
		em := NewEmitter(func(string, any) {})
		if em == nil {
			t.Fatal("expected non-nil emitter")
		}
	})

	t.Run("without emit func", func(t *testing.T) {
		em := NewEmitter(nil)
		if em == nil {
			t.Fatal("expected non-nil emitter")
		}
	})
}

func TestEmit_CallsEmitFunc(t *testing.T) {
	var called bool
	var gotTopic string
	var gotPayload any

	em := NewEmitter(func(topic string, payload any) {
		called = true
		gotTopic = topic
		gotPayload = payload
	})

	em.Emit("resource:cluster1:pods", "test-data")

	if !called {
		t.Fatal("expected emitFn to be called")
	}
	if gotTopic != "resource:cluster1:pods" {
		t.Fatalf("expected topic %q, got %q", "resource:cluster1:pods", gotTopic)
	}
	if gotPayload != "test-data" {
		t.Fatalf("expected payload %q, got %v", "test-data", gotPayload)
	}
}

func TestEmit_WithoutEmitFunc(t *testing.T) {
	em := NewEmitter(nil)
	// Should not panic.
	em.Emit("resource:cluster1:pods", "data")
}

func TestSubscribe_ReceivesEvents(t *testing.T) {
	em := NewEmitter(nil)

	var received any
	em.Subscribe("test-topic", func(payload any) {
		received = payload
	})

	em.Emit("test-topic", "hello")

	if received != "hello" {
		t.Fatalf("expected %q, got %v", "hello", received)
	}
}

func TestSubscribe_MultipleSubscribers(t *testing.T) {
	em := NewEmitter(nil)

	var count int
	for range 3 {
		em.Subscribe("fan-out", func(any) {
			count++
		})
	}

	em.Emit("fan-out", nil)

	if count != 3 {
		t.Fatalf("expected 3 subscribers called, got %d", count)
	}
}

func TestSubscribe_TopicIsolation(t *testing.T) {
	em := NewEmitter(nil)

	var aCalled, bCalled bool
	em.Subscribe("topic-a", func(any) { aCalled = true })
	em.Subscribe("topic-b", func(any) { bCalled = true })

	em.Emit("topic-a", nil)

	if !aCalled {
		t.Fatal("expected topic-a subscriber to be called")
	}
	if bCalled {
		t.Fatal("expected topic-b subscriber NOT to be called")
	}
}

func TestUnsubscribe(t *testing.T) {
	em := NewEmitter(nil)

	var callCount int
	unsub := em.Subscribe("topic", func(any) {
		callCount++
	})

	em.Emit("topic", nil)
	if callCount != 1 {
		t.Fatalf("expected 1 call, got %d", callCount)
	}

	unsub()
	em.Emit("topic", nil)
	if callCount != 1 {
		t.Fatalf("expected still 1 call after unsub, got %d", callCount)
	}
}

func TestUnsubscribe_Idempotent(t *testing.T) {
	em := NewEmitter(nil)

	unsub := em.Subscribe("topic", func(any) {})

	// Double unsubscribe should not panic.
	unsub()
	unsub()

	if em.SubscriptionCount("topic") != 0 {
		t.Fatalf("expected 0 subscriptions, got %d", em.SubscriptionCount("topic"))
	}
}

func TestSubscriptionCount(t *testing.T) {
	em := NewEmitter(nil)

	if em.SubscriptionCount("topic") != 0 {
		t.Fatalf("expected 0, got %d", em.SubscriptionCount("topic"))
	}

	unsub1 := em.Subscribe("topic", func(any) {})
	unsub2 := em.Subscribe("topic", func(any) {})
	em.Subscribe("other", func(any) {})

	if em.SubscriptionCount("topic") != 2 {
		t.Fatalf("expected 2, got %d", em.SubscriptionCount("topic"))
	}
	if em.SubscriptionCount("other") != 1 {
		t.Fatalf("expected 1, got %d", em.SubscriptionCount("other"))
	}

	unsub1()
	if em.SubscriptionCount("topic") != 1 {
		t.Fatalf("expected 1 after unsub, got %d", em.SubscriptionCount("topic"))
	}

	unsub2()
	if em.SubscriptionCount("topic") != 0 {
		t.Fatalf("expected 0 after both unsub, got %d", em.SubscriptionCount("topic"))
	}
}

func TestEmit_ConcurrentSafety(t *testing.T) {
	em := NewEmitter(nil)

	var total atomic.Int64
	var wg sync.WaitGroup

	// Spawn subscribers and unsubscribers concurrently with emitters.
	for range 10 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			unsub := em.Subscribe("concurrent", func(any) {
				total.Add(1)
			})
			// Unsubscribe after a few emits happen.
			for range 50 {
				em.Emit("concurrent", nil)
			}
			unsub()
		}()
	}

	wg.Wait()

	// We just verify no panics or races occurred; the exact count is non-deterministic.
	if total.Load() == 0 {
		t.Fatal("expected some events to be delivered")
	}
}
