package handlers

import (
	"context"
	"time"

	"clusterfudge/internal/updater"
)

// UpdateHandler exposes update operations to the frontend.
type UpdateHandler struct {
	updater   *updater.Updater
	scheduler *updater.Scheduler
}

// NewUpdateHandler creates an UpdateHandler.
func NewUpdateHandler(u *updater.Updater, s *updater.Scheduler) *UpdateHandler {
	return &UpdateHandler{
		updater:   u,
		scheduler: s,
	}
}

// CheckForUpdate checks for available updates.
func (h *UpdateHandler) CheckForUpdate() (*updater.UpdateInfo, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	return h.scheduler.CheckNow(ctx)
}

// SkipVersion marks a version to be skipped.
func (h *UpdateHandler) SkipVersion(version string) {
	h.scheduler.SkipVersion(version)
}
