package system

import (
	"context"
	"time"
)

// Sleep/wake detection constants.
const (
	tickInterval   = 5 * time.Second
	sleepThreshold = 15 * time.Second // 3x tick interval
)

// SleepWakeDetector detects OS sleep/wake cycles by monitoring for
// unexpected gaps in the monotonic clock. When the wall clock advances
// by significantly more than the tick interval (> 15s for a 5s tick),
// the machine almost certainly slept.
type SleepWakeDetector struct {
	onWake func()
}

// NewSleepWakeDetector creates a detector that calls onWake when
// a sleep/wake cycle is detected.
func NewSleepWakeDetector(onWake func()) *SleepWakeDetector {
	return &SleepWakeDetector{onWake: onWake}
}

// Start begins monitoring for sleep/wake events in a background goroutine.
// It returns immediately. The goroutine exits when ctx is cancelled.
func (d *SleepWakeDetector) Start(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(tickInterval)
		defer ticker.Stop()
		lastTick := time.Now()
		for {
			select {
			case <-ctx.Done():
				return
			case now := <-ticker.C:
				if now.Sub(lastTick) > sleepThreshold {
					d.onWake()
				}
				lastTick = now
			}
		}
	}()
}
