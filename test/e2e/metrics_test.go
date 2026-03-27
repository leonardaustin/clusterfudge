//go:build e2e

package e2e

import (
	"context"
	"testing"
	"time"

	"clusterfudge/internal/k8s"
)

// TC-METRICS-001: GetPodMetrics returns nil gracefully when metrics-server is absent
func TestMetrics_GracefulDegradation_NilClient(t *testing.T) {
	// Pass nil metrics client to simulate missing metrics-server
	mc := k8s.NewMetricsClient(nil)

	if mc.Available() {
		t.Fatal("expected Available()=false for nil client")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pods, err := mc.ListPodMetrics(ctx, testEnv.namespace)
	if err != nil {
		t.Fatalf("expected nil error for missing metrics-server, got: %v", err)
	}
	if pods != nil {
		t.Errorf("expected nil pod metrics, got %d items", len(pods))
	}

	nodes, err := mc.ListNodeMetrics(ctx)
	if err != nil {
		t.Fatalf("expected nil error for missing metrics-server node metrics, got: %v", err)
	}
	if nodes != nil {
		t.Errorf("expected nil node metrics, got %d items", len(nodes))
	}
}

// TC-METRICS-002: GetPodMetrics via handler returns nil when metrics unavailable
func TestMetrics_HandlerGracefulDegradation(t *testing.T) {
	mgr := newClusterManager(t)

	bundle, err := mgr.ActiveClients()
	if err != nil {
		t.Fatalf("ActiveClients: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// K3s in our e2e cluster typically does not have metrics-server.
	// Either way, verify the metrics client returns sensible results.
	mc := bundle.Metrics
	if !bundle.HasMetrics() {
		pods, podErr := mc.ListPodMetrics(ctx, testEnv.namespace)
		if podErr != nil {
			t.Fatalf("expected nil error when metrics unavailable, got: %v", podErr)
		}
		if pods != nil {
			t.Errorf("expected nil pod metrics when metrics-server absent, got %d items", len(pods))
		}
	} else {
		pods, podErr := mc.ListPodMetrics(ctx, testEnv.namespace)
		if podErr != nil {
			t.Fatalf("ListPodMetrics: %v", podErr)
		}
		// With metrics-server available, result should be non-nil (may be empty slice).
		if pods == nil {
			t.Error("expected non-nil pod metrics slice when metrics-server is available")
		}
	}
}
