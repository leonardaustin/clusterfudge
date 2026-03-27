package events

import (
	"sync"
)

// EmitFunc is a callback that sends an event to the frontend (e.g., Wails runtime).
// When nil, events are only delivered to internal subscribers.
type EmitFunc func(topic string, payload any)

// Emitter is a fan-out event emitter. It distributes events to registered
// subscribers and optionally to an external sink (e.g., the Wails event bus).
type Emitter struct {
	emitFn      EmitFunc
	mu          sync.RWMutex
	subscribers map[string][]subscription
	nextID      uint64
}

type subscription struct {
	id uint64
	fn func(payload any)
}

// NewEmitter creates a new Emitter. The emitFn callback, if non-nil, is called
// for every Emit in addition to internal subscribers. Pass nil for testing.
func NewEmitter(emitFn EmitFunc) *Emitter {
	return &Emitter{
		emitFn:      emitFn,
		subscribers: make(map[string][]subscription),
	}
}

// Emit sends an event on the given topic. It calls the external emitFn (if set)
// and delivers to all registered subscribers for the topic.
func (e *Emitter) Emit(topic string, payload any) {
	if e.emitFn != nil {
		e.emitFn(topic, payload)
	}

	e.mu.RLock()
	subs := e.subscribers[topic]
	// Copy slice under read lock so we can release before calling handlers.
	copied := make([]subscription, len(subs))
	copy(copied, subs)
	e.mu.RUnlock()

	for _, s := range copied {
		s.fn(payload)
	}
}

// Subscribe registers a handler for the given topic. Returns an unsubscribe function.
func (e *Emitter) Subscribe(topic string, handler func(payload any)) (unsubscribe func()) {
	e.mu.Lock()
	id := e.nextID
	e.nextID++
	e.subscribers[topic] = append(e.subscribers[topic], subscription{id: id, fn: handler})
	e.mu.Unlock()

	var once sync.Once
	return func() {
		once.Do(func() {
			e.mu.Lock()
			defer e.mu.Unlock()
			subs := e.subscribers[topic]
			for i, s := range subs {
				if s.id == id {
					e.subscribers[topic] = append(subs[:i], subs[i+1:]...)
					return
				}
			}
		})
	}
}

// SubscriptionCount returns the number of active subscriptions for a topic.
func (e *Emitter) SubscriptionCount(topic string) int {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return len(e.subscribers[topic])
}
