package updater

import (
	"context"
	"log/slog"
	"sync"
	"time"
)

// Scheduler periodically checks for updates.
type Scheduler struct {
	updater      *Updater
	interval     time.Duration
	initialDelay time.Duration
	onAvailable  func(UpdateInfo)

	mu       sync.Mutex
	cancel   context.CancelFunc
	skipped  map[string]bool
}

// NewScheduler creates a scheduler that checks for updates at the given interval.
func NewScheduler(u *Updater, interval, initialDelay time.Duration, onAvailable func(UpdateInfo)) *Scheduler {
	return &Scheduler{
		updater:      u,
		interval:     interval,
		initialDelay: initialDelay,
		onAvailable:  onAvailable,
		skipped:      make(map[string]bool),
	}
}

// Start begins periodic update checks.
func (s *Scheduler) Start() {
	ctx, cancel := context.WithCancel(context.Background())
	s.mu.Lock()
	s.cancel = cancel
	s.mu.Unlock()

	go func() {
		select {
		case <-time.After(s.initialDelay):
		case <-ctx.Done():
			return
		}
		s.check(ctx)

		ticker := time.NewTicker(s.interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				s.check(ctx)
			}
		}
	}()
}

// Stop halts periodic checks.
func (s *Scheduler) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cancel != nil {
		s.cancel()
		s.cancel = nil
	}
}

// CheckNow triggers an immediate update check.
func (s *Scheduler) CheckNow(ctx context.Context) (*UpdateInfo, error) {
	info, err := s.updater.CheckForUpdate(ctx)
	if err != nil {
		return nil, err
	}
	if info != nil {
		s.mu.Lock()
		skipped := s.skipped[info.Version]
		s.mu.Unlock()
		if !skipped && s.onAvailable != nil {
			s.onAvailable(*info)
		}
	}
	return info, nil
}

// SkipVersion marks a version to be ignored.
func (s *Scheduler) SkipVersion(version string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.skipped[version] = true
}

func (s *Scheduler) check(ctx context.Context) {
	info, err := s.updater.CheckForUpdate(ctx)
	if err != nil {
		slog.Warn("update check failed", "error", err)
		return
	}
	if info == nil {
		return
	}

	s.mu.Lock()
	skipped := s.skipped[info.Version]
	s.mu.Unlock()

	if !skipped && s.onAvailable != nil {
		s.onAvailable(*info)
	}
}
