package handlers

import (
	"context"
	"os"
	"runtime"
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

// InstallSource returns how the app was installed: "brew", "apt", or "" (direct download).
func (h *UpdateHandler) InstallSource() string {
	switch runtime.GOOS {
	case "darwin":
		for _, prefix := range []string{"/opt/homebrew/Caskroom/clusterfudge", "/usr/local/Caskroom/clusterfudge"} {
			if _, err := os.Stat(prefix); err == nil {
				return "brew"
			}
		}
	case "linux":
		if _, err := os.Stat("/var/lib/dpkg/info/clusterfudge.list"); err == nil {
			return "apt"
		}
	}
	return ""
}
