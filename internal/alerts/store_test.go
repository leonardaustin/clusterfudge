package alerts

import (
	"testing"
	"time"
)

func testRule() Rule {
	return Rule{
		Name:     "test-rule",
		Resource: "Pod",
		Severity: "warning",
		Enabled:  true,
	}
}

func TestFire(t *testing.T) {
	s := NewStore()
	a := s.Fire(testRule(), "Pod/default/nginx", "pod is unhealthy")

	if a.ID == "" {
		t.Fatal("expected non-empty ID")
	}
	if a.Resource != "Pod/default/nginx" {
		t.Fatalf("got resource %q", a.Resource)
	}
	if a.ResolvedAt != nil {
		t.Fatal("new alert should not be resolved")
	}
}

func TestAcknowledge(t *testing.T) {
	s := NewStore()
	a := s.Fire(testRule(), "Pod/default/nginx", "test")

	if !s.Acknowledge(a.ID) {
		t.Fatal("acknowledge should return true")
	}
	if s.Acknowledge("nonexistent") {
		t.Fatal("acknowledge should return false for unknown ID")
	}

	alerts := s.List(AlertFilter{})
	for _, al := range alerts {
		if al.ID == a.ID && !al.Acknowledged {
			t.Fatal("alert should be acknowledged")
		}
	}
}

func TestResolve(t *testing.T) {
	s := NewStore()
	a := s.Fire(testRule(), "Pod/default/nginx", "test")

	if s.ActiveCount() != 1 {
		t.Fatalf("expected 1 active, got %d", s.ActiveCount())
	}

	if !s.Resolve(a.ID) {
		t.Fatal("resolve should return true")
	}
	if s.Resolve("nonexistent") {
		t.Fatal("resolve should return false for unknown ID")
	}

	if s.ActiveCount() != 0 {
		t.Fatalf("expected 0 active after resolve, got %d", s.ActiveCount())
	}
}

func TestListFilter(t *testing.T) {
	s := NewStore()
	critical := Rule{Name: "crit", Severity: "critical", Enabled: true}
	warning := Rule{Name: "warn", Severity: "warning", Enabled: true}

	s.Fire(critical, "Node/node1", "node down")
	s.Fire(warning, "Pod/default/nginx", "pod pending")
	s.Fire(critical, "Node/node2", "node down")

	// Filter by severity
	critAlerts := s.List(AlertFilter{Severity: "critical"})
	if len(critAlerts) != 2 {
		t.Fatalf("expected 2 critical alerts, got %d", len(critAlerts))
	}

	warnAlerts := s.List(AlertFilter{Severity: "warning"})
	if len(warnAlerts) != 1 {
		t.Fatalf("expected 1 warning alert, got %d", len(warnAlerts))
	}

	// Filter by acknowledged
	s.Acknowledge(critAlerts[0].ID)
	acked := true
	ackedAlerts := s.List(AlertFilter{Acknowledged: &acked})
	if len(ackedAlerts) != 1 {
		t.Fatalf("expected 1 acknowledged alert, got %d", len(ackedAlerts))
	}

	// Filter by since
	since := time.Now().Add(-time.Second)
	sinceAlerts := s.List(AlertFilter{Since: &since})
	if len(sinceAlerts) != 3 {
		t.Fatalf("expected 3 alerts since a second ago, got %d", len(sinceAlerts))
	}

	future := time.Now().Add(time.Hour)
	futureAlerts := s.List(AlertFilter{Since: &future})
	if len(futureAlerts) != 0 {
		t.Fatalf("expected 0 alerts from future, got %d", len(futureAlerts))
	}
}

func TestActiveCount(t *testing.T) {
	s := NewStore()
	s.Fire(testRule(), "Pod/default/a", "test")
	s.Fire(testRule(), "Pod/default/b", "test")
	a3 := s.Fire(testRule(), "Pod/default/c", "test")

	if s.ActiveCount() != 3 {
		t.Fatalf("expected 3 active, got %d", s.ActiveCount())
	}

	s.Resolve(a3.ID)
	if s.ActiveCount() != 2 {
		t.Fatalf("expected 2 active, got %d", s.ActiveCount())
	}
}
