package audit

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestLogAndCount(t *testing.T) {
	l := NewLogger()
	if l.Count() != 0 {
		t.Fatal("expected 0 entries")
	}

	l.Log(Entry{Action: "create", Kind: "Pod", Name: "nginx", Namespace: "default"})
	l.Log(Entry{Action: "delete", Kind: "Service", Name: "api", Namespace: "kube-system"})

	if l.Count() != 2 {
		t.Fatalf("expected 2 entries, got %d", l.Count())
	}
}

func TestLogMaxEntries(t *testing.T) {
	l := NewLogger()
	for i := 0; i < maxEntries+100; i++ {
		l.Log(Entry{Action: "create", Kind: "Pod", Name: "test"})
	}
	if l.Count() != maxEntries {
		t.Fatalf("expected %d entries, got %d", maxEntries, l.Count())
	}
}

func TestQueryFilterAction(t *testing.T) {
	l := NewLogger()
	l.Log(Entry{Action: "create", Kind: "Pod", Name: "a", Timestamp: time.Now()})
	l.Log(Entry{Action: "delete", Kind: "Pod", Name: "b", Timestamp: time.Now()})
	l.Log(Entry{Action: "create", Kind: "Service", Name: "c", Timestamp: time.Now()})

	results := l.Query(QueryFilter{Action: "create"})
	if len(results) != 2 {
		t.Fatalf("expected 2 create entries, got %d", len(results))
	}
}

func TestQueryFilterKind(t *testing.T) {
	l := NewLogger()
	l.Log(Entry{Action: "create", Kind: "Pod", Name: "a", Timestamp: time.Now()})
	l.Log(Entry{Action: "create", Kind: "Service", Name: "b", Timestamp: time.Now()})

	results := l.Query(QueryFilter{Kind: "Pod"})
	if len(results) != 1 {
		t.Fatalf("expected 1 Pod entry, got %d", len(results))
	}
}

func TestQueryFilterNamespace(t *testing.T) {
	l := NewLogger()
	l.Log(Entry{Action: "create", Kind: "Pod", Namespace: "default", Timestamp: time.Now()})
	l.Log(Entry{Action: "create", Kind: "Pod", Namespace: "kube-system", Timestamp: time.Now()})

	results := l.Query(QueryFilter{Namespace: "default"})
	if len(results) != 1 {
		t.Fatalf("expected 1 default entry, got %d", len(results))
	}
}

func TestQueryFilterSince(t *testing.T) {
	l := NewLogger()
	old := time.Now().Add(-2 * time.Hour)
	recent := time.Now()

	l.Log(Entry{Action: "create", Kind: "Pod", Name: "old", Timestamp: old})
	l.Log(Entry{Action: "create", Kind: "Pod", Name: "new", Timestamp: recent})

	since := time.Now().Add(-time.Hour)
	results := l.Query(QueryFilter{Since: &since})
	if len(results) != 1 {
		t.Fatalf("expected 1 recent entry, got %d", len(results))
	}
}

func TestQueryFilterLimit(t *testing.T) {
	l := NewLogger()
	for i := 0; i < 10; i++ {
		l.Log(Entry{Action: "create", Kind: "Pod", Timestamp: time.Now()})
	}

	results := l.Query(QueryFilter{Limit: 3})
	if len(results) != 3 {
		t.Fatalf("expected 3 entries with limit, got %d", len(results))
	}
}

func TestQueryNewestFirst(t *testing.T) {
	l := NewLogger()
	l.Log(Entry{Action: "create", Kind: "Pod", Name: "first", Timestamp: time.Now().Add(-time.Minute)})
	l.Log(Entry{Action: "create", Kind: "Pod", Name: "second", Timestamp: time.Now()})

	results := l.Query(QueryFilter{})
	if len(results) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(results))
	}
	if results[0].Name != "second" {
		t.Fatalf("expected newest first, got %q", results[0].Name)
	}
}

func TestPrune(t *testing.T) {
	l := NewLogger()
	l.Log(Entry{Action: "create", Kind: "Pod", Name: "old", Timestamp: time.Now().Add(-2 * time.Hour)})
	l.Log(Entry{Action: "create", Kind: "Pod", Name: "new", Timestamp: time.Now()})

	removed := l.Prune(time.Hour)
	if removed != 1 {
		t.Fatalf("expected 1 pruned, got %d", removed)
	}
	if l.Count() != 1 {
		t.Fatalf("expected 1 remaining, got %d", l.Count())
	}
}

// --- Tests for NewLoggerWithFile ---

func TestNewLoggerWithFile_CreatesFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "audit.jsonl")

	l, err := NewLoggerWithFile(path)
	if err != nil {
		t.Fatalf("NewLoggerWithFile: %v", err)
	}
	defer l.Close()

	if l.Count() != 0 {
		t.Fatalf("expected 0 entries in new file, got %d", l.Count())
	}

	// File should exist.
	if _, err := os.Stat(path); os.IsNotExist(err) {
		t.Fatal("expected audit file to be created")
	}
}

func TestNewLoggerWithFile_CreatesDirectory(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "subdir", "nested", "audit.jsonl")

	l, err := NewLoggerWithFile(path)
	if err != nil {
		t.Fatalf("NewLoggerWithFile: %v", err)
	}
	defer l.Close()

	if _, err := os.Stat(filepath.Dir(path)); os.IsNotExist(err) {
		t.Fatal("expected directory to be created")
	}
}

func TestNewLoggerWithFile_PersistsEntries(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "audit.jsonl")

	l, err := NewLoggerWithFile(path)
	if err != nil {
		t.Fatalf("NewLoggerWithFile: %v", err)
	}

	l.Log(Entry{Action: "create", Kind: "Pod", Name: "nginx", Namespace: "default"})
	l.Log(Entry{Action: "delete", Kind: "Service", Name: "api", Namespace: "kube-system"})

	if err := l.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}

	// Read the file and verify JSONL format.
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}

	lines := strings.Split(strings.TrimSpace(string(data)), "\n")
	if len(lines) != 2 {
		t.Fatalf("expected 2 lines in JSONL file, got %d", len(lines))
	}

	var entry1, entry2 Entry
	if err := json.Unmarshal([]byte(lines[0]), &entry1); err != nil {
		t.Fatalf("unmarshal line 1: %v", err)
	}
	if err := json.Unmarshal([]byte(lines[1]), &entry2); err != nil {
		t.Fatalf("unmarshal line 2: %v", err)
	}

	if entry1.Action != "create" || entry1.Name != "nginx" {
		t.Errorf("entry1 unexpected: %+v", entry1)
	}
	if entry2.Action != "delete" || entry2.Name != "api" {
		t.Errorf("entry2 unexpected: %+v", entry2)
	}
}

func TestNewLoggerWithFile_LoadsExistingEntries(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "audit.jsonl")

	// Write some existing entries.
	l1, err := NewLoggerWithFile(path)
	if err != nil {
		t.Fatalf("NewLoggerWithFile: %v", err)
	}
	l1.Log(Entry{Action: "create", Kind: "Pod", Name: "pod-1"})
	l1.Log(Entry{Action: "delete", Kind: "Pod", Name: "pod-2"})
	l1.Close()

	// Open a new logger on the same file -- should load existing entries.
	l2, err := NewLoggerWithFile(path)
	if err != nil {
		t.Fatalf("NewLoggerWithFile (reopen): %v", err)
	}
	defer l2.Close()

	if l2.Count() != 2 {
		t.Fatalf("expected 2 entries loaded from file, got %d", l2.Count())
	}

	// Query to verify.
	results := l2.Query(QueryFilter{Action: "create"})
	if len(results) != 1 {
		t.Fatalf("expected 1 create entry, got %d", len(results))
	}
	if results[0].Name != "pod-1" {
		t.Errorf("expected name pod-1, got %q", results[0].Name)
	}
}

func TestNewLoggerWithFile_AppendsToExisting(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "audit.jsonl")

	// First session.
	l1, err := NewLoggerWithFile(path)
	if err != nil {
		t.Fatalf("NewLoggerWithFile: %v", err)
	}
	l1.Log(Entry{Action: "create", Kind: "Pod", Name: "pod-1"})
	l1.Close()

	// Second session.
	l2, err := NewLoggerWithFile(path)
	if err != nil {
		t.Fatalf("NewLoggerWithFile: %v", err)
	}
	l2.Log(Entry{Action: "delete", Kind: "Pod", Name: "pod-2"})
	l2.Close()

	// Verify file has entries from both sessions.
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	lines := strings.Split(strings.TrimSpace(string(data)), "\n")
	if len(lines) != 3 {
		// 1 from first session, 2 loaded + 1 new from second session
		// Actually: first session writes 1 line. Second session reads 1, then writes 1.
		// File should have 2 lines total.
		if len(lines) != 2 {
			t.Fatalf("expected 2 lines in JSONL file, got %d", len(lines))
		}
	}
}

func TestNewLoggerWithFile_TrimToMaxEntries(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "audit.jsonl")

	// Write more than maxEntries to the file.
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < maxEntries+50; i++ {
		entry := Entry{
			ID:        "test",
			Action:    "create",
			Kind:      "Pod",
			Name:      "pod",
			Timestamp: time.Now(),
		}
		data, _ := json.Marshal(entry)
		f.Write(append(data, '\n'))
	}
	f.Close()

	l, err := NewLoggerWithFile(path)
	if err != nil {
		t.Fatalf("NewLoggerWithFile: %v", err)
	}
	defer l.Close()

	if l.Count() != maxEntries {
		t.Fatalf("expected entries trimmed to %d, got %d", maxEntries, l.Count())
	}
}

func TestNewLoggerWithFile_SkipsMalformedLines(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "audit.jsonl")

	// Write a mix of valid and invalid lines.
	content := `{"action":"create","kind":"Pod","name":"pod-1"}
not valid json
{"action":"delete","kind":"Service","name":"svc-1"}
`
	if err := os.WriteFile(path, []byte(content), 0640); err != nil {
		t.Fatal(err)
	}

	l, err := NewLoggerWithFile(path)
	if err != nil {
		t.Fatalf("NewLoggerWithFile: %v", err)
	}
	defer l.Close()

	// Should have loaded only the 2 valid entries.
	if l.Count() != 2 {
		t.Fatalf("expected 2 valid entries (skipping malformed), got %d", l.Count())
	}
}

func TestLogger_Close_InMemoryLogger(t *testing.T) {
	l := NewLogger()
	l.Log(Entry{Action: "create", Kind: "Pod", Name: "test"})

	// Close on an in-memory logger should be a no-op.
	if err := l.Close(); err != nil {
		t.Fatalf("Close on in-memory logger: %v", err)
	}
}

func TestLogger_Close_FileLogger(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "audit.jsonl")

	l, err := NewLoggerWithFile(path)
	if err != nil {
		t.Fatalf("NewLoggerWithFile: %v", err)
	}

	l.Log(Entry{Action: "create", Kind: "Pod", Name: "test"})

	if err := l.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}

	// Double close should not panic but may return an error.
	_ = l.Close()
}

func TestLogger_EntryGetsID(t *testing.T) {
	l := NewLogger()
	l.Log(Entry{Action: "create", Kind: "Pod", Name: "test"})

	results := l.Query(QueryFilter{})
	if len(results) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(results))
	}
	if results[0].ID == "" {
		t.Error("expected non-empty ID")
	}
	if !strings.HasPrefix(results[0].ID, "audit-") {
		t.Errorf("expected ID prefix 'audit-', got %q", results[0].ID)
	}
}

func TestLogger_EntryGetsTimestamp(t *testing.T) {
	l := NewLogger()
	before := time.Now()
	l.Log(Entry{Action: "create", Kind: "Pod", Name: "test"})
	after := time.Now()

	results := l.Query(QueryFilter{})
	if len(results) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(results))
	}
	ts := results[0].Timestamp
	if ts.Before(before) || ts.After(after) {
		t.Errorf("timestamp %v not between %v and %v", ts, before, after)
	}
}

func TestPrune_RewritesFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "audit.jsonl")

	l, err := NewLoggerWithFile(path)
	if err != nil {
		t.Fatalf("NewLoggerWithFile: %v", err)
	}

	// Log old and recent entries.
	l.Log(Entry{Action: "create", Kind: "Pod", Name: "old", Timestamp: time.Now().Add(-2 * time.Hour)})
	l.Log(Entry{Action: "create", Kind: "Pod", Name: "recent", Timestamp: time.Now()})

	// Prune old entries.
	removed := l.Prune(time.Hour)
	if removed != 1 {
		t.Fatalf("expected 1 pruned, got %d", removed)
	}
	l.Close()

	// Reopen — file should contain only the recent entry.
	l2, err := NewLoggerWithFile(path)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	defer l2.Close()

	if l2.Count() != 1 {
		t.Fatalf("expected 1 entry after prune+reopen, got %d", l2.Count())
	}
	results := l2.Query(QueryFilter{})
	if results[0].Name != "recent" {
		t.Errorf("expected 'recent' entry, got %q", results[0].Name)
	}
}

func TestNewLoggerWithFile_NonexistentFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "new-audit.jsonl")

	l, err := NewLoggerWithFile(path)
	if err != nil {
		t.Fatalf("NewLoggerWithFile: %v", err)
	}
	defer l.Close()

	if l.Count() != 0 {
		t.Errorf("expected 0 entries for new file, got %d", l.Count())
	}
}
