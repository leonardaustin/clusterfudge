package troubleshoot

import (
	"testing"
	"time"
)

func TestTimelineRecordAndQuery(t *testing.T) {
	tl := NewTimeline(100)

	now := time.Now()
	tl.Record(ChangeRecord{
		Timestamp:  now,
		Kind:       "Pod",
		Namespace:  "default",
		Name:       "web-1",
		ChangeType: "created",
	})
	tl.Record(ChangeRecord{
		Timestamp:  now.Add(time.Second),
		Kind:       "Pod",
		Namespace:  "default",
		Name:       "web-2",
		ChangeType: "updated",
	})
	tl.Record(ChangeRecord{
		Timestamp:  now.Add(2 * time.Second),
		Kind:       "Service",
		Namespace:  "default",
		Name:       "web-svc",
		ChangeType: "created",
	})

	if tl.Len() != 3 {
		t.Fatalf("expected 3 entries, got %d", tl.Len())
	}

	results := tl.Query("Pod", "default", "", now)
	if len(results) != 2 {
		t.Fatalf("expected 2 Pod results, got %d", len(results))
	}

	results = tl.Query("Pod", "default", "web-1", now)
	if len(results) != 1 {
		t.Fatalf("expected 1 result for web-1, got %d", len(results))
	}

	all := tl.QueryAll(now)
	if len(all) != 3 {
		t.Fatalf("expected 3 total results, got %d", len(all))
	}
}

func TestTimelineRingBuffer(t *testing.T) {
	tl := NewTimeline(3)

	now := time.Now()
	for i := range 5 {
		tl.Record(ChangeRecord{
			Timestamp:  now.Add(time.Duration(i) * time.Second),
			Kind:       "Pod",
			Namespace:  "default",
			Name:       "pod",
			ChangeType: "updated",
		})
	}

	if tl.Len() != 3 {
		t.Fatalf("expected 3 (capped), got %d", tl.Len())
	}

	all := tl.QueryAll(now)
	if len(all) != 3 {
		t.Fatalf("expected 3 results, got %d", len(all))
	}
	// Oldest should be index 2 (entries 0 and 1 were evicted)
	if !all[0].Timestamp.Equal(now.Add(2 * time.Second)) {
		t.Fatalf("oldest entry should be at t+2s, got %v", all[0].Timestamp)
	}
}

func TestTimelineQuerySinceFilter(t *testing.T) {
	tl := NewTimeline(100)
	now := time.Now()

	tl.Record(ChangeRecord{Timestamp: now.Add(-2 * time.Hour), Kind: "Pod", Namespace: "default", Name: "old"})
	tl.Record(ChangeRecord{Timestamp: now, Kind: "Pod", Namespace: "default", Name: "new"})

	results := tl.QueryAll(now.Add(-1 * time.Hour))
	if len(results) != 1 {
		t.Fatalf("expected 1 result after since filter, got %d", len(results))
	}
	if results[0].Name != "new" {
		t.Fatalf("expected 'new', got %q", results[0].Name)
	}
}

func TestInvestigateCrashLoopBackOff(t *testing.T) {
	tl := NewTimeline(100)
	engine := NewEngine(tl)

	inv := engine.Investigate("Pod", "default", "crash-pod", map[string]any{
		"reason": "CrashLoopBackOff",
	})

	if inv.Problem != "Pod is crash-looping" {
		t.Fatalf("unexpected problem: %s", inv.Problem)
	}
	if inv.RootCause != "Application error — check container logs" {
		t.Fatalf("unexpected root cause: %s", inv.RootCause)
	}
	if len(inv.Suggestions) < 1 {
		t.Fatal("expected suggestions")
	}
	if inv.Suggestions[0].ActionType != "view_logs" {
		t.Fatalf("expected view_logs suggestion, got %s", inv.Suggestions[0].ActionType)
	}
}

func TestInvestigateOOMKilled(t *testing.T) {
	tl := NewTimeline(100)
	engine := NewEngine(tl)

	inv := engine.Investigate("Pod", "default", "oom-pod", map[string]any{
		"reason": "OOMKilled",
	})

	if inv.Problem != "Container was OOM killed" {
		t.Fatalf("unexpected problem: %s", inv.Problem)
	}
	if inv.RootCause != "Memory limit exceeded — increase resources.limits.memory" {
		t.Fatalf("unexpected root cause: %s", inv.RootCause)
	}
}

func TestInvestigateImagePullBackOff(t *testing.T) {
	tl := NewTimeline(100)
	engine := NewEngine(tl)

	inv := engine.Investigate("Pod", "default", "bad-image", map[string]any{
		"reason": "ImagePullBackOff",
	})

	if inv.Problem != "Image pull failed" {
		t.Fatalf("unexpected problem: %s", inv.Problem)
	}
	if inv.RootCause != "Image pull failed — check image name, tag, and pull secrets" {
		t.Fatalf("unexpected root cause: %s", inv.RootCause)
	}
}

func TestInvestigatePending(t *testing.T) {
	tl := NewTimeline(100)
	engine := NewEngine(tl)

	inv := engine.Investigate("Pod", "default", "pending-pod", map[string]any{
		"phase":   "Pending",
		"message": "0/3 nodes available: insufficient cpu",
	})

	if inv.Problem != "Pod is stuck in Pending state" {
		t.Fatalf("unexpected problem: %s", inv.Problem)
	}
	if inv.RootCause != "Insufficient resources — 0/3 nodes available: insufficient cpu" {
		t.Fatalf("unexpected root cause: %s", inv.RootCause)
	}
}

func TestInvestigateExitCode(t *testing.T) {
	tl := NewTimeline(100)
	engine := NewEngine(tl)

	inv := engine.Investigate("Pod", "default", "exit-pod", map[string]any{
		"exitCode": 137,
	})

	if inv.Problem != "Container exited with code 137" {
		t.Fatalf("unexpected problem: %s", inv.Problem)
	}
}

func TestInvestigateNoIssues(t *testing.T) {
	tl := NewTimeline(100)
	engine := NewEngine(tl)

	inv := engine.Investigate("Pod", "default", "healthy-pod", map[string]any{})

	if inv.Problem != "No known issues detected" {
		t.Fatalf("unexpected problem: %s", inv.Problem)
	}
}

func TestInvestigateWithRelatedChanges(t *testing.T) {
	tl := NewTimeline(100)
	tl.Record(ChangeRecord{
		Timestamp:  time.Now(),
		Kind:       "Pod",
		Namespace:  "default",
		Name:       "web-1",
		ChangeType: "updated",
		FieldDiffs: []FieldDiff{{Path: ".spec.containers[0].image", OldValue: "v1", NewValue: "v2"}},
	})

	engine := NewEngine(tl)
	inv := engine.Investigate("Pod", "default", "web-1", map[string]any{
		"reason": "CrashLoopBackOff",
	})

	if len(inv.RelatedChanges) != 1 {
		t.Fatalf("expected 1 related change, got %d", len(inv.RelatedChanges))
	}
}

func TestInvestigateErrImagePull(t *testing.T) {
	tl := NewTimeline(100)
	engine := NewEngine(tl)

	inv := engine.Investigate("Pod", "default", "bad-img", map[string]any{
		"reason": "ErrImagePull",
	})

	if inv.Problem != "Image pull failed" {
		t.Fatalf("unexpected problem: %s", inv.Problem)
	}
}
