package cache

import (
	"container/list"
	"sync"
	"time"
)

type entry[V any] struct {
	key       string
	value     V
	expiresAt time.Time
	elem      *list.Element
}

// LRU is a thread-safe, TTL-aware least-recently-used cache.
type LRU[V any] struct {
	mu    sync.Mutex
	cap   int
	ttl   time.Duration
	items map[string]*entry[V]
	order *list.List // front = most recently used
}

func NewLRU[V any](capacity int, ttl time.Duration) *LRU[V] {
	return &LRU[V]{
		cap:   capacity,
		ttl:   ttl,
		items: make(map[string]*entry[V], capacity),
		order: list.New(),
	}
}

// Set stores a value. Evicts the LRU entry if at capacity.
func (c *LRU[V]) Set(key string, value V) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if e, ok := c.items[key]; ok {
		e.value = value
		e.expiresAt = time.Now().Add(c.ttl)
		c.order.MoveToFront(e.elem)
		return
	}

	if c.order.Len() >= c.cap {
		oldest := c.order.Back()
		if oldest != nil {
			e := oldest.Value.(*entry[V])
			delete(c.items, e.key)
			c.order.Remove(oldest)
		}
	}

	e := &entry[V]{key: key, value: value, expiresAt: time.Now().Add(c.ttl)}
	e.elem = c.order.PushFront(e)
	c.items[key] = e
}

// Get returns a value and its age. Returns false if missing or expired.
func (c *LRU[V]) Get(key string) (V, time.Duration, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	e, ok := c.items[key]
	if !ok {
		var zero V
		return zero, 0, false
	}
	if time.Now().After(e.expiresAt) {
		delete(c.items, e.key)
		c.order.Remove(e.elem)
		var zero V
		return zero, 0, false
	}
	c.order.MoveToFront(e.elem)
	age := time.Since(e.expiresAt.Add(-c.ttl))
	return e.value, age, true
}

// Delete removes an entry.
func (c *LRU[V]) Delete(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if e, ok := c.items[key]; ok {
		delete(c.items, key)
		c.order.Remove(e.elem)
	}
}

// Len returns the number of cached entries.
func (c *LRU[V]) Len() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.order.Len()
}
