package audit

import "time"

// Entry represents a single audit log entry.
type Entry struct {
	ID        string    `json:"id"`
	Timestamp time.Time `json:"timestamp"`
	Cluster   string    `json:"cluster"`
	Namespace string    `json:"namespace"`
	Action    string    `json:"action"` // "create", "update", "delete", "scale", "restart"
	Kind      string    `json:"kind"`
	Name      string    `json:"name"`
	User      string    `json:"user"`
	Details   string    `json:"details"`
	Status    string    `json:"status"` // "success", "failed"
	Error     string    `json:"error,omitempty"`
}

// QueryFilter controls which audit entries are returned.
type QueryFilter struct {
	Since     *time.Time `json:"since,omitempty"`
	Until     *time.Time `json:"until,omitempty"`
	Action    string     `json:"action,omitempty"`
	Kind      string     `json:"kind,omitempty"`
	Namespace string     `json:"namespace,omitempty"`
	Limit     int        `json:"limit,omitempty"`
}
