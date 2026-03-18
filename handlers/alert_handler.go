package handlers

import "clusterfudge/internal/alerts"

// AlertHandler exposes alert operations to the Wails frontend.
type AlertHandler struct {
	store *alerts.Store
}

// NewAlertHandler creates an AlertHandler backed by the given store.
func NewAlertHandler(store *alerts.Store) *AlertHandler {
	return &AlertHandler{store: store}
}

// ListAlerts returns all alerts (no filter).
func (h *AlertHandler) ListAlerts() []alerts.Alert {
	result := h.store.List(alerts.AlertFilter{})
	if result == nil {
		return []alerts.Alert{}
	}
	return result
}

// AcknowledgeAlert marks the alert with the given ID as acknowledged.
func (h *AlertHandler) AcknowledgeAlert(id string) bool {
	return h.store.Acknowledge(id)
}

// GetRules returns the default alert rules.
func (h *AlertHandler) GetRules() []alerts.Rule {
	return alerts.DefaultRules()
}

// ActiveAlertCount returns the number of unresolved alerts.
func (h *AlertHandler) ActiveAlertCount() int {
	return h.store.ActiveCount()
}
