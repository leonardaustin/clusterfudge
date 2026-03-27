package alerts

import "time"

// Rule defines an alerting rule that matches resources.
type Rule struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Resource    string   `json:"resource"`
	Condition   string   `json:"condition"`
	Duration    string   `json:"duration"`
	Severity    string   `json:"severity"` // "info", "warning", "critical"
	Enabled     bool     `json:"enabled"`
	Channels    []string `json:"channels"`
}

// Alert represents a fired alert instance.
type Alert struct {
	ID           string     `json:"id"`
	Rule         Rule       `json:"rule"`
	Resource     string     `json:"resource"` // "kind/namespace/name"
	Message      string     `json:"message"`
	FiredAt      time.Time  `json:"firedAt"`
	ResolvedAt   *time.Time `json:"resolvedAt,omitempty"`
	Acknowledged bool       `json:"acknowledged"`
}
