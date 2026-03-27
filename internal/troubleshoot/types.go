package troubleshoot

import "time"

type ChangeRecord struct {
	Timestamp  time.Time   `json:"timestamp"`
	Kind       string      `json:"kind"`
	Namespace  string      `json:"namespace"`
	Name       string      `json:"name"`
	ChangeType string      `json:"changeType"` // "created", "updated", "deleted"
	FieldDiffs []FieldDiff `json:"fieldDiffs,omitempty"`
	OwnerChain []OwnerRef  `json:"ownerChain"`
}

type FieldDiff struct {
	Path     string `json:"path"`
	OldValue string `json:"oldValue"`
	NewValue string `json:"newValue"`
}

type OwnerRef struct {
	Kind string `json:"kind"`
	Name string `json:"name"`
}

type Investigation struct {
	ResourceKind   string         `json:"resourceKind"`
	ResourceName   string         `json:"resourceName"`
	Namespace      string         `json:"namespace"`
	Problem        string         `json:"problem"`
	Since          time.Time      `json:"since"`
	RootCause      string         `json:"rootCause,omitempty"`
	RelatedChanges []ChangeRecord `json:"relatedChanges"`
	Suggestions    []Suggestion   `json:"suggestions"`
	Checks         []Check        `json:"checks"`
	RawStatus      map[string]any `json:"rawStatus,omitempty"`
}

type Check struct {
	Name   string `json:"name"`
	Status string `json:"status"` // "pass", "fail", "warn"
	Detail string `json:"detail"`
}

type Suggestion struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	ActionType  string `json:"actionType"` // "view_logs", "restart", "scale", "describe", "link"
	ActionRef   string `json:"actionRef"`
}
