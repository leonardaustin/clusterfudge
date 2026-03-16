package alerts

import (
	"fmt"
	"sync"
	"time"
)

// AlertFilter controls which alerts are returned by List.
type AlertFilter struct {
	Severity     string `json:"severity,omitempty"`
	Acknowledged *bool  `json:"acknowledged,omitempty"`
	Since        *time.Time `json:"since,omitempty"`
}

// Store is an in-memory alert store.
type Store struct {
	mu     sync.RWMutex
	alerts []Alert
	nextID int
}

// NewStore creates a new alert store.
func NewStore() *Store {
	return &Store{}
}

// Fire creates and stores a new alert from the given rule.
func (s *Store) Fire(rule Rule, resource, message string) *Alert {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.nextID++
	a := Alert{
		ID:       fmt.Sprintf("alert-%d", s.nextID),
		Rule:     rule,
		Resource: resource,
		Message:  message,
		FiredAt:  time.Now(),
	}
	s.alerts = append(s.alerts, a)
	return &a
}

// Acknowledge marks an alert as acknowledged. Returns false if not found.
func (s *Store) Acknowledge(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	for i := range s.alerts {
		if s.alerts[i].ID == id {
			s.alerts[i].Acknowledged = true
			return true
		}
	}
	return false
}

// Resolve marks an alert as resolved. Returns false if not found.
func (s *Store) Resolve(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now()
	for i := range s.alerts {
		if s.alerts[i].ID == id {
			s.alerts[i].ResolvedAt = &now
			return true
		}
	}
	return false
}

// List returns alerts matching the given filter.
func (s *Store) List(filter AlertFilter) []Alert {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]Alert, 0)
	for _, a := range s.alerts {
		if filter.Severity != "" && a.Rule.Severity != filter.Severity {
			continue
		}
		if filter.Acknowledged != nil && a.Acknowledged != *filter.Acknowledged {
			continue
		}
		if filter.Since != nil && a.FiredAt.Before(*filter.Since) {
			continue
		}
		result = append(result, a)
	}
	return result
}

// ActiveCount returns the number of unresolved alerts.
func (s *Store) ActiveCount() int {
	s.mu.RLock()
	defer s.mu.RUnlock()

	count := 0
	for _, a := range s.alerts {
		if a.ResolvedAt == nil {
			count++
		}
	}
	return count
}
