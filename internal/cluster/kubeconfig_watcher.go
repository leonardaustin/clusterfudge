package cluster

import (
	"context"
	"fmt"
	"log/slog"
	"path/filepath"
	"time"

	"github.com/fsnotify/fsnotify"
	"k8s.io/client-go/tools/clientcmd/api"
)

// debounceDuration controls how long the watcher waits after the last filesystem
// event before triggering a reload. Editors and kubectl often perform multiple
// rapid write/rename operations for a single logical save.
var debounceDuration = 250 * time.Millisecond

// KubeconfigWatcher watches kubeconfig files for changes and triggers a reload.
// It debounces rapid writes (editors often do a write+rename atomically).
type KubeconfigWatcher struct {
	loader   *KubeconfigLoader
	watcher  *fsnotify.Watcher
	onChange func(*api.Config)
}

// NewKubeconfigWatcher creates a watcher that calls onChange whenever any
// kubeconfig file (or its parent directory) changes.
func NewKubeconfigWatcher(loader *KubeconfigLoader, onChange func(*api.Config)) (*KubeconfigWatcher, error) {
	if onChange == nil {
		return nil, fmt.Errorf("onChange callback must not be nil")
	}

	w, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, fmt.Errorf("create fsnotify watcher: %w", err)
	}

	added := map[string]bool{}
	for _, path := range loader.paths {
		// Watch the file itself (works when it exists).
		if err := w.Add(path); err == nil {
			added[path] = true
		}
		// Also watch the parent directory to catch atomic renames used by editors
		// and kubectl. kubectl writes to a temp file then renames it.
		dir := filepath.Dir(path)
		if !added[dir] {
			if err := w.Add(dir); err == nil {
				added[dir] = true
			}
		}
	}

	return &KubeconfigWatcher{loader: loader, watcher: w, onChange: onChange}, nil
}

// Start begins watching in a background goroutine. It stops when ctx is cancelled.
func (w *KubeconfigWatcher) Start(ctx context.Context) {
	go func() {
		defer func() { _ = w.watcher.Close() }()

		// Debounce timer — reset each time we see a relevant event.
		debounce := time.NewTimer(0)
		<-debounce.C // drain the initial zero-duration tick

		for {
			select {
			case <-ctx.Done():
				debounce.Stop()
				return

			case event, ok := <-w.watcher.Events:
				if !ok {
					return
				}
				if event.Op&(fsnotify.Write|fsnotify.Create|fsnotify.Rename|fsnotify.Remove) != 0 {
					if w.isWatchedPath(event.Name) {
						if !debounce.Stop() {
							select {
							case <-debounce.C:
							default:
							}
						}
						debounce.Reset(debounceDuration)
					}
				}

			case err, ok := <-w.watcher.Errors:
				if !ok {
					return
				}
				slog.Warn("kubeconfig watcher error", "err", err)

			case <-debounce.C:
				cfg, err := w.loader.Load()
				if err != nil {
					slog.Warn("kubeconfig reload failed", "err", err)
					continue
				}
				slog.Info("kubeconfig reloaded")
				w.onChange(cfg)
			}
		}
	}()
}

// isWatchedPath returns true if the given filesystem path corresponds to one
// of the kubeconfig files we are monitoring.
func (w *KubeconfigWatcher) isWatchedPath(name string) bool {
	for _, p := range w.loader.paths {
		if name == p || filepath.Dir(name) == filepath.Dir(p) {
			return true
		}
	}
	return false
}
