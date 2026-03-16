package handlers

import "kubeviewer/internal/audit"

// AuditHandler exposes audit log operations to the Wails frontend.
type AuditHandler struct {
	logger *audit.Logger
}

// NewAuditHandler creates an AuditHandler backed by the given logger.
func NewAuditHandler(logger *audit.Logger) *AuditHandler {
	return &AuditHandler{logger: logger}
}

// GetAuditLog returns audit entries matching the filter.
func (h *AuditHandler) GetAuditLog(filter audit.QueryFilter) []audit.Entry {
	result := h.logger.Query(filter)
	if result == nil {
		return []audit.Entry{}
	}
	return result
}

// GetAuditCount returns the total number of audit entries.
func (h *AuditHandler) GetAuditCount() int {
	return h.logger.Count()
}
