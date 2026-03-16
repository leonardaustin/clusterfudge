//go:build e2e

package e2e

import (
	"path/filepath"
	"strings"
	"testing"
	"time"

	"kubeviewer/internal/audit"
)

// ---------------------------------------------------------------------------
// 5. Audit file persistence (L2)
// ---------------------------------------------------------------------------

// TestAuditPersistence_RoundTrip creates a logger backed by a temp file,
// writes entries, closes it, and then creates a new logger from the same
// file. The new logger should load all previously written entries.
func TestAuditPersistence_RoundTrip(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	path := filepath.Join(dir, "audit.jsonl")

	// First logger — write entries.
	l1, err := audit.NewLoggerWithFile(path)
	if err != nil {
		t.Fatalf("NewLoggerWithFile (l1): %v", err)
	}

	entries := []audit.Entry{
		{
			Action:    "create",
			Kind:      "ConfigMap",
			Name:      "test-cm-1",
			Namespace: "default",
			Cluster:   "test-cluster",
			Status:    "success",
			Timestamp: time.Now().Add(-2 * time.Minute),
		},
		{
			Action:    "delete",
			Kind:      "Pod",
			Name:      "test-pod-1",
			Namespace: "kube-system",
			Cluster:   "test-cluster",
			Status:    "success",
			Timestamp: time.Now().Add(-1 * time.Minute),
		},
		{
			Action:    "scale",
			Kind:      "Deployment",
			Name:      "test-deploy-1",
			Namespace: "production",
			Cluster:   "prod-cluster",
			Status:    "failed",
			Error:     "timeout",
			Timestamp: time.Now(),
		},
	}

	for _, e := range entries {
		l1.Log(e)
	}

	if l1.Count() != 3 {
		t.Errorf("expected 3 entries in first logger, got %d", l1.Count())
	}

	if err := l1.Close(); err != nil {
		t.Fatalf("Close l1: %v", err)
	}

	// Second logger — read from the same file.
	l2, err := audit.NewLoggerWithFile(path)
	if err != nil {
		t.Fatalf("NewLoggerWithFile (l2): %v", err)
	}
	defer l2.Close()

	if l2.Count() != 3 {
		t.Fatalf("expected 3 entries in second logger, got %d", l2.Count())
	}

	// Verify the entries via Query.
	all := l2.Query(audit.QueryFilter{})
	if len(all) != 3 {
		t.Fatalf("expected 3 entries from query, got %d", len(all))
	}

	// Query returns newest first.
	if all[0].Action != "scale" {
		t.Errorf("expected newest entry action 'scale', got %q", all[0].Action)
	}
	if all[0].Kind != "Deployment" {
		t.Errorf("expected newest entry kind 'Deployment', got %q", all[0].Kind)
	}
	if all[0].Status != "failed" {
		t.Errorf("expected newest entry status 'failed', got %q", all[0].Status)
	}
	if all[0].Error != "timeout" {
		t.Errorf("expected newest entry error 'timeout', got %q", all[0].Error)
	}

	if all[2].Action != "create" {
		t.Errorf("expected oldest entry action 'create', got %q", all[2].Action)
	}
	if all[2].Name != "test-cm-1" {
		t.Errorf("expected oldest entry name 'test-cm-1', got %q", all[2].Name)
	}
}

// TestAuditPersistence_AppendAfterReopen verifies that a reopened logger
// appends new entries to the existing file rather than overwriting it.
func TestAuditPersistence_AppendAfterReopen(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	path := filepath.Join(dir, "audit-append.jsonl")

	// First logger — write one entry.
	l1, err := audit.NewLoggerWithFile(path)
	if err != nil {
		t.Fatalf("NewLoggerWithFile (l1): %v", err)
	}
	l1.Log(audit.Entry{Action: "create", Kind: "Pod", Name: "pod-1", Status: "success"})
	if err := l1.Close(); err != nil {
		t.Fatalf("Close l1: %v", err)
	}

	// Second logger — append another entry.
	l2, err := audit.NewLoggerWithFile(path)
	if err != nil {
		t.Fatalf("NewLoggerWithFile (l2): %v", err)
	}
	l2.Log(audit.Entry{Action: "delete", Kind: "Pod", Name: "pod-2", Status: "success"})
	if err := l2.Close(); err != nil {
		t.Fatalf("Close l2: %v", err)
	}

	// Third logger — verify both entries are present.
	l3, err := audit.NewLoggerWithFile(path)
	if err != nil {
		t.Fatalf("NewLoggerWithFile (l3): %v", err)
	}
	defer l3.Close()

	if l3.Count() != 2 {
		t.Fatalf("expected 2 entries after append, got %d", l3.Count())
	}

	all := l3.Query(audit.QueryFilter{})
	names := make([]string, len(all))
	for i, e := range all {
		names[i] = e.Name
	}

	if !containsName(names, "pod-1") || !containsName(names, "pod-2") {
		t.Errorf("expected both pod-1 and pod-2 in query results, got %v", names)
	}
}

// TestAuditPersistence_QueryFilters verifies that QueryFilter works
// correctly with persisted entries.
func TestAuditPersistence_QueryFilters(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	path := filepath.Join(dir, "audit-filter.jsonl")

	l, err := audit.NewLoggerWithFile(path)
	if err != nil {
		t.Fatalf("NewLoggerWithFile: %v", err)
	}
	defer l.Close()

	now := time.Now()
	l.Log(audit.Entry{Action: "create", Kind: "ConfigMap", Namespace: "ns-a", Name: "cm-1", Status: "success", Timestamp: now.Add(-3 * time.Hour)})
	l.Log(audit.Entry{Action: "delete", Kind: "Pod", Namespace: "ns-a", Name: "pod-1", Status: "success", Timestamp: now.Add(-2 * time.Hour)})
	l.Log(audit.Entry{Action: "create", Kind: "Pod", Namespace: "ns-b", Name: "pod-2", Status: "failed", Timestamp: now.Add(-1 * time.Hour)})
	l.Log(audit.Entry{Action: "scale", Kind: "Deployment", Namespace: "ns-a", Name: "dep-1", Status: "success", Timestamp: now})

	// Filter by action.
	creates := l.Query(audit.QueryFilter{Action: "create"})
	if len(creates) != 2 {
		t.Errorf("expected 2 'create' entries, got %d", len(creates))
	}

	// Filter by kind.
	pods := l.Query(audit.QueryFilter{Kind: "Pod"})
	if len(pods) != 2 {
		t.Errorf("expected 2 Pod entries, got %d", len(pods))
	}

	// Filter by namespace.
	nsA := l.Query(audit.QueryFilter{Namespace: "ns-a"})
	if len(nsA) != 3 {
		t.Errorf("expected 3 entries in ns-a, got %d", len(nsA))
	}

	// Filter with limit.
	limited := l.Query(audit.QueryFilter{Limit: 2})
	if len(limited) != 2 {
		t.Errorf("expected 2 entries with limit, got %d", len(limited))
	}

	// Filter by time range.
	since := now.Add(-2*time.Hour - 30*time.Minute)
	until := now.Add(-30 * time.Minute)
	ranged := l.Query(audit.QueryFilter{Since: &since, Until: &until})
	if len(ranged) != 2 {
		t.Errorf("expected 2 entries in time range, got %d", len(ranged))
	}
}

// TestAuditPersistence_Prune verifies that Prune removes old entries and
// keeps recent ones.
func TestAuditPersistence_Prune(t *testing.T) {
	t.Parallel()

	l := audit.NewLogger()

	now := time.Now()
	l.Log(audit.Entry{Action: "create", Name: "old-1", Timestamp: now.Add(-48 * time.Hour)})
	l.Log(audit.Entry{Action: "create", Name: "old-2", Timestamp: now.Add(-25 * time.Hour)})
	l.Log(audit.Entry{Action: "create", Name: "recent-1", Timestamp: now.Add(-1 * time.Hour)})
	l.Log(audit.Entry{Action: "create", Name: "recent-2", Timestamp: now})

	removed := l.Prune(24 * time.Hour)
	if removed != 2 {
		t.Errorf("expected 2 entries pruned, got %d", removed)
	}
	if l.Count() != 2 {
		t.Errorf("expected 2 entries remaining, got %d", l.Count())
	}

	all := l.Query(audit.QueryFilter{})
	for _, e := range all {
		if strings.HasPrefix(e.Name, "old-") {
			t.Errorf("old entry %q should have been pruned", e.Name)
		}
	}
}

// TestAuditPersistence_IDsAssigned verifies that logged entries receive
// unique IDs in the "audit-N" format.
func TestAuditPersistence_IDsAssigned(t *testing.T) {
	t.Parallel()

	l := audit.NewLogger()
	l.Log(audit.Entry{Action: "create", Name: "a"})
	l.Log(audit.Entry{Action: "delete", Name: "b"})

	all := l.Query(audit.QueryFilter{})
	if len(all) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(all))
	}

	for _, e := range all {
		if e.ID == "" {
			t.Errorf("entry %q has empty ID", e.Name)
		}
		if !strings.HasPrefix(e.ID, "audit-") {
			t.Errorf("entry %q has unexpected ID format: %q", e.Name, e.ID)
		}
	}

	// IDs should be different.
	if all[0].ID == all[1].ID {
		t.Errorf("expected different IDs, both are %q", all[0].ID)
	}
}

// containsName checks if a name is present in the slice.
func containsName(names []string, target string) bool {
	for _, n := range names {
		if n == target {
			return true
		}
	}
	return false
}
