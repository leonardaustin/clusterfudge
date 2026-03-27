package system

import (
	"context"
	"testing"
	"time"
)

func TestNewSleepWakeDetector(t *testing.T) {
	d := NewSleepWakeDetector(func() {})
	if d == nil {
		t.Fatal("expected non-nil detector")
	}
}

func TestSleepWakeDetector_StartStops(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	d := NewSleepWakeDetector(func() {})
	d.Start(ctx)
	cancel()
	// Give the goroutine time to exit.
	time.Sleep(10 * time.Millisecond)
}
