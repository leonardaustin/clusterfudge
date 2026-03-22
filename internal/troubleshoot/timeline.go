package troubleshoot

import (
	"sync"
	"time"
)

// Timeline is a thread-safe ring buffer of change records.
type Timeline struct {
	mu      sync.RWMutex
	entries []ChangeRecord
	head    int
	count   int
	maxSize int
}

func NewTimeline(maxEntries int) *Timeline {
	if maxEntries <= 0 {
		maxEntries = 1000
	}
	return &Timeline{
		entries: make([]ChangeRecord, maxEntries),
		maxSize: maxEntries,
	}
}

func (t *Timeline) Record(record ChangeRecord) {
	t.mu.Lock()
	defer t.mu.Unlock()

	t.entries[t.head] = record
	t.head = (t.head + 1) % t.maxSize
	if t.count < t.maxSize {
		t.count++
	}
}

func (t *Timeline) Query(kind, namespace, name string, since time.Time) []ChangeRecord {
	t.mu.RLock()
	defer t.mu.RUnlock()

	var results []ChangeRecord
	t.iterate(func(r ChangeRecord) {
		if !r.Timestamp.Before(since) &&
			(kind == "" || r.Kind == kind) &&
			(namespace == "" || r.Namespace == namespace) &&
			(name == "" || r.Name == name) {
			results = append(results, r)
		}
	})
	return results
}

func (t *Timeline) QueryAll(since time.Time) []ChangeRecord {
	return t.Query("", "", "", since)
}

func (t *Timeline) Len() int {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return t.count
}

// iterate walks entries from oldest to newest.
func (t *Timeline) iterate(fn func(ChangeRecord)) {
	start := 0
	if t.count == t.maxSize {
		start = t.head // oldest entry when buffer is full
	}
	for i := range t.count {
		idx := (start + i) % t.maxSize
		fn(t.entries[idx])
	}
}
