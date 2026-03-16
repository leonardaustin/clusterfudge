package handlers

import (
	"testing"
	"time"

	"kubeviewer/internal/audit"
)

func TestNewAuditHandler(t *testing.T) {
	logger := audit.NewLogger()
	h := NewAuditHandler(logger)
	if h == nil {
		t.Fatal("expected non-nil handler")
	}
}

func TestAuditHandler_GetAuditLog_Empty(t *testing.T) {
	logger := audit.NewLogger()
	h := NewAuditHandler(logger)

	result := h.GetAuditLog(audit.QueryFilter{})
	if result == nil {
		t.Fatal("expected non-nil result")
	}
	if len(result) != 0 {
		t.Errorf("expected 0 entries, got %d", len(result))
	}
}

func TestAuditHandler_GetAuditLog_WithEntries(t *testing.T) {
	logger := audit.NewLogger()
	logger.Log(audit.Entry{
		Action:    "create",
		Kind:      "Deployment",
		Name:      "my-deploy",
		Namespace: "default",
		Status:    "success",
	})
	logger.Log(audit.Entry{
		Action:    "delete",
		Kind:      "Pod",
		Name:      "my-pod",
		Namespace: "default",
		Status:    "success",
	})

	h := NewAuditHandler(logger)
	result := h.GetAuditLog(audit.QueryFilter{})
	if len(result) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(result))
	}

	// Query returns newest first
	if result[0].Action != "delete" {
		t.Errorf("expected newest entry first with action %q, got %q", "delete", result[0].Action)
	}
	if result[1].Action != "create" {
		t.Errorf("expected oldest entry last with action %q, got %q", "create", result[1].Action)
	}
}

func TestAuditHandler_GetAuditLog_FilterByAction(t *testing.T) {
	logger := audit.NewLogger()
	logger.Log(audit.Entry{Action: "create", Kind: "Deployment", Name: "d1", Namespace: "default"})
	logger.Log(audit.Entry{Action: "delete", Kind: "Pod", Name: "p1", Namespace: "default"})
	logger.Log(audit.Entry{Action: "create", Kind: "Service", Name: "s1", Namespace: "default"})

	h := NewAuditHandler(logger)
	result := h.GetAuditLog(audit.QueryFilter{Action: "create"})
	if len(result) != 2 {
		t.Fatalf("expected 2 create entries, got %d", len(result))
	}
	for _, e := range result {
		if e.Action != "create" {
			t.Errorf("expected action %q, got %q", "create", e.Action)
		}
	}
}

func TestAuditHandler_GetAuditLog_FilterByKind(t *testing.T) {
	logger := audit.NewLogger()
	logger.Log(audit.Entry{Action: "create", Kind: "Deployment", Name: "d1", Namespace: "default"})
	logger.Log(audit.Entry{Action: "delete", Kind: "Pod", Name: "p1", Namespace: "default"})

	h := NewAuditHandler(logger)
	result := h.GetAuditLog(audit.QueryFilter{Kind: "Pod"})
	if len(result) != 1 {
		t.Fatalf("expected 1 Pod entry, got %d", len(result))
	}
	if result[0].Kind != "Pod" {
		t.Errorf("expected kind %q, got %q", "Pod", result[0].Kind)
	}
}

func TestAuditHandler_GetAuditLog_FilterByNamespace(t *testing.T) {
	logger := audit.NewLogger()
	logger.Log(audit.Entry{Action: "create", Kind: "Pod", Name: "p1", Namespace: "default"})
	logger.Log(audit.Entry{Action: "create", Kind: "Pod", Name: "p2", Namespace: "kube-system"})

	h := NewAuditHandler(logger)
	result := h.GetAuditLog(audit.QueryFilter{Namespace: "kube-system"})
	if len(result) != 1 {
		t.Fatalf("expected 1 entry in kube-system, got %d", len(result))
	}
	if result[0].Name != "p2" {
		t.Errorf("expected name %q, got %q", "p2", result[0].Name)
	}
}

func TestAuditHandler_GetAuditLog_FilterByLimit(t *testing.T) {
	logger := audit.NewLogger()
	for range 10 {
		logger.Log(audit.Entry{Action: "create", Kind: "Pod", Name: "p", Namespace: "default"})
	}

	h := NewAuditHandler(logger)
	result := h.GetAuditLog(audit.QueryFilter{Limit: 3})
	if len(result) != 3 {
		t.Fatalf("expected 3 entries, got %d", len(result))
	}
}

func TestAuditHandler_GetAuditLog_FilterBySince(t *testing.T) {
	logger := audit.NewLogger()
	oldTime := time.Now().Add(-2 * time.Hour)
	logger.Log(audit.Entry{
		Action:    "create",
		Kind:      "Pod",
		Name:      "old-pod",
		Namespace: "default",
		Timestamp: oldTime,
	})
	logger.Log(audit.Entry{
		Action:    "delete",
		Kind:      "Pod",
		Name:      "new-pod",
		Namespace: "default",
	})

	h := NewAuditHandler(logger)
	since := time.Now().Add(-1 * time.Hour)
	result := h.GetAuditLog(audit.QueryFilter{Since: &since})
	if len(result) != 1 {
		t.Fatalf("expected 1 entry since 1 hour ago, got %d", len(result))
	}
	if result[0].Name != "new-pod" {
		t.Errorf("expected name %q, got %q", "new-pod", result[0].Name)
	}
}

func TestAuditHandler_GetAuditLog_ReturnsEmptySliceNotNil(t *testing.T) {
	logger := audit.NewLogger()
	h := NewAuditHandler(logger)

	// With no entries and a filter that matches nothing
	result := h.GetAuditLog(audit.QueryFilter{Action: "nonexistent"})
	if result == nil {
		t.Fatal("expected non-nil empty slice, got nil")
	}
	if len(result) != 0 {
		t.Errorf("expected 0 entries, got %d", len(result))
	}
}

func TestAuditHandler_GetAuditCount_Empty(t *testing.T) {
	logger := audit.NewLogger()
	h := NewAuditHandler(logger)

	count := h.GetAuditCount()
	if count != 0 {
		t.Errorf("expected count 0, got %d", count)
	}
}

func TestAuditHandler_GetAuditCount_WithEntries(t *testing.T) {
	logger := audit.NewLogger()
	logger.Log(audit.Entry{Action: "create", Kind: "Pod", Name: "p1"})
	logger.Log(audit.Entry{Action: "delete", Kind: "Pod", Name: "p2"})
	logger.Log(audit.Entry{Action: "scale", Kind: "Deployment", Name: "d1"})

	h := NewAuditHandler(logger)
	count := h.GetAuditCount()
	if count != 3 {
		t.Errorf("expected count 3, got %d", count)
	}
}

func TestAuditHandler_GetAuditCount_AfterMultipleLogs(t *testing.T) {
	logger := audit.NewLogger()
	h := NewAuditHandler(logger)

	if h.GetAuditCount() != 0 {
		t.Error("expected count 0 initially")
	}

	logger.Log(audit.Entry{Action: "create", Kind: "Pod", Name: "p1"})
	if h.GetAuditCount() != 1 {
		t.Error("expected count 1 after one log")
	}

	logger.Log(audit.Entry{Action: "delete", Kind: "Pod", Name: "p2"})
	if h.GetAuditCount() != 2 {
		t.Error("expected count 2 after two logs")
	}
}
