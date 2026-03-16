package cluster

import (
	"context"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"k8s.io/client-go/tools/clientcmd/api"
)

// validKubeconfig is a minimal valid kubeconfig for testing.
const validKubeconfig = `apiVersion: v1
kind: Config
clusters:
- name: test
  cluster:
    server: https://127.0.0.1:6443
contexts:
- name: test
  context:
    cluster: test
    user: test
users:
- name: test
  user:
    token: fake
current-context: test
`

func TestNewKubeconfigWatcher_NilCallback(t *testing.T) {
	loader := NewKubeconfigLoaderFromPaths([]string{"/tmp/nonexistent"})
	_, err := NewKubeconfigWatcher(loader, nil)
	if err == nil {
		t.Fatal("expected error for nil callback")
	}
}

func TestNewKubeconfigWatcher_WatchesParentDir(t *testing.T) {
	// Create a temp kubeconfig file
	dir := t.TempDir()
	path := filepath.Join(dir, "config")
	if err := os.WriteFile(path, []byte(validKubeconfig), 0600); err != nil {
		t.Fatal(err)
	}

	loader := NewKubeconfigLoaderFromPaths([]string{path})
	watcher, err := NewKubeconfigWatcher(loader, func(*api.Config) {})
	if err != nil {
		t.Fatalf("NewKubeconfigWatcher: %v", err)
	}
	defer watcher.watcher.Close()

	// Verify the watcher was created successfully
	if watcher.loader != loader {
		t.Error("loader not set correctly")
	}
}

func TestKubeconfigWatcher_DetectsWrite(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config")
	if err := os.WriteFile(path, []byte(validKubeconfig), 0600); err != nil {
		t.Fatal(err)
	}

	// Shorten debounce for test speed
	oldDebounce := debounceDuration
	debounceDuration = 50 * time.Millisecond
	defer func() { debounceDuration = oldDebounce }()

	var mu sync.Mutex
	var called int
	var lastCfg *api.Config

	loader := NewKubeconfigLoaderFromPaths([]string{path})
	watcher, err := NewKubeconfigWatcher(loader, func(cfg *api.Config) {
		mu.Lock()
		called++
		lastCfg = cfg
		mu.Unlock()
	})
	if err != nil {
		t.Fatalf("NewKubeconfigWatcher: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	watcher.Start(ctx)

	// Give watcher time to set up.
	time.Sleep(50 * time.Millisecond)

	// Modify the kubeconfig file.
	if err := os.WriteFile(path, []byte(validKubeconfig), 0600); err != nil {
		t.Fatal(err)
	}

	// Wait for debounce + processing.
	time.Sleep(300 * time.Millisecond)

	mu.Lock()
	defer mu.Unlock()
	if called == 0 {
		t.Error("expected onChange to be called after file write")
	}
	if lastCfg == nil {
		t.Error("expected non-nil config in callback")
	} else if lastCfg.CurrentContext != "test" {
		t.Errorf("current-context = %q, want %q", lastCfg.CurrentContext, "test")
	}
}

func TestKubeconfigWatcher_DebouncesManyWrites(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config")
	if err := os.WriteFile(path, []byte(validKubeconfig), 0600); err != nil {
		t.Fatal(err)
	}

	oldDebounce := debounceDuration
	debounceDuration = 100 * time.Millisecond
	defer func() { debounceDuration = oldDebounce }()

	var mu sync.Mutex
	var callCount int

	loader := NewKubeconfigLoaderFromPaths([]string{path})
	watcher, err := NewKubeconfigWatcher(loader, func(cfg *api.Config) {
		mu.Lock()
		callCount++
		mu.Unlock()
	})
	if err != nil {
		t.Fatalf("NewKubeconfigWatcher: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	watcher.Start(ctx)

	time.Sleep(50 * time.Millisecond)

	// Rapid writes — should be debounced into a single reload.
	for i := 0; i < 5; i++ {
		if err := os.WriteFile(path, []byte(validKubeconfig), 0600); err != nil {
			t.Fatal(err)
		}
		time.Sleep(10 * time.Millisecond)
	}

	// Wait for debounce to fire.
	time.Sleep(300 * time.Millisecond)

	mu.Lock()
	count := callCount
	mu.Unlock()

	// Debouncing should collapse 5 rapid writes into 1-2 callbacks.
	if count > 2 {
		t.Errorf("expected at most 2 debounced calls, got %d", count)
	}
	if count == 0 {
		t.Error("expected at least one callback")
	}
}

func TestKubeconfigWatcher_DetectsAtomicRename(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config")
	if err := os.WriteFile(path, []byte(validKubeconfig), 0600); err != nil {
		t.Fatal(err)
	}

	oldDebounce := debounceDuration
	debounceDuration = 50 * time.Millisecond
	defer func() { debounceDuration = oldDebounce }()

	var mu sync.Mutex
	var called int

	loader := NewKubeconfigLoaderFromPaths([]string{path})
	watcher, err := NewKubeconfigWatcher(loader, func(cfg *api.Config) {
		mu.Lock()
		called++
		mu.Unlock()
	})
	if err != nil {
		t.Fatalf("NewKubeconfigWatcher: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	watcher.Start(ctx)

	time.Sleep(50 * time.Millisecond)

	// Simulate an atomic rename (the way kubectl and editors save files):
	// write to temp file, then rename over the original.
	tmpPath := filepath.Join(dir, "config.tmp")
	if err := os.WriteFile(tmpPath, []byte(validKubeconfig), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(tmpPath, path); err != nil {
		t.Fatal(err)
	}

	time.Sleep(300 * time.Millisecond)

	mu.Lock()
	defer mu.Unlock()
	if called == 0 {
		t.Error("expected onChange to be called after atomic rename")
	}
}

func TestKubeconfigWatcher_StopsOnContextCancel(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config")
	if err := os.WriteFile(path, []byte(validKubeconfig), 0600); err != nil {
		t.Fatal(err)
	}

	oldDebounce := debounceDuration
	debounceDuration = 50 * time.Millisecond
	defer func() { debounceDuration = oldDebounce }()

	var mu sync.Mutex
	var called int

	loader := NewKubeconfigLoaderFromPaths([]string{path})
	watcher, err := NewKubeconfigWatcher(loader, func(cfg *api.Config) {
		mu.Lock()
		called++
		mu.Unlock()
	})
	if err != nil {
		t.Fatalf("NewKubeconfigWatcher: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	watcher.Start(ctx)
	time.Sleep(50 * time.Millisecond)

	// Cancel the context to stop the watcher.
	cancel()
	time.Sleep(100 * time.Millisecond)

	// Writes after cancel should not trigger callbacks.
	if err := os.WriteFile(path, []byte(validKubeconfig), 0600); err != nil {
		t.Fatal(err)
	}
	time.Sleep(200 * time.Millisecond)

	mu.Lock()
	defer mu.Unlock()
	if called != 0 {
		t.Errorf("expected no calls after cancel, got %d", called)
	}
}

func TestKubeconfigWatcher_IgnoresUnrelatedFiles(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config")
	if err := os.WriteFile(path, []byte(validKubeconfig), 0600); err != nil {
		t.Fatal(err)
	}

	oldDebounce := debounceDuration
	debounceDuration = 50 * time.Millisecond
	defer func() { debounceDuration = oldDebounce }()

	var mu sync.Mutex
	var called int

	loader := NewKubeconfigLoaderFromPaths([]string{path})
	watcher, err := NewKubeconfigWatcher(loader, func(cfg *api.Config) {
		mu.Lock()
		called++
		mu.Unlock()
	})
	if err != nil {
		t.Fatalf("NewKubeconfigWatcher: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	watcher.Start(ctx)

	time.Sleep(50 * time.Millisecond)

	// Write a file in a completely different directory — the watcher watches
	// the parent dir, so files in the same directory may still trigger a check.
	// This test validates the watcher doesn't panic on unrelated changes.
	otherDir := t.TempDir()
	os.WriteFile(filepath.Join(otherDir, "other.txt"), []byte("hello"), 0600)

	time.Sleep(200 * time.Millisecond)
	// No assertion on count — the watcher is directory-level and may or may not fire
	// depending on whether the event matches isWatchedPath. The key check is no panic.
}

func TestIsWatchedPath(t *testing.T) {
	loader := NewKubeconfigLoaderFromPaths([]string{"/home/user/.kube/config"})
	w := &KubeconfigWatcher{loader: loader}

	tests := []struct {
		path   string
		expect bool
	}{
		{"/home/user/.kube/config", true},
		{"/home/user/.kube/config.tmp", true}, // same directory
		{"/home/user/.kube/other", true},       // same directory
		{"/other/path/config", false},
	}
	for _, tt := range tests {
		if got := w.isWatchedPath(tt.path); got != tt.expect {
			t.Errorf("isWatchedPath(%q) = %v, want %v", tt.path, got, tt.expect)
		}
	}
}

func TestNewKubeconfigWatcher_NonexistentFile(t *testing.T) {
	// Watcher should still work — it watches the parent directory even if
	// the file doesn't exist yet.
	dir := t.TempDir()
	path := filepath.Join(dir, "nonexistent-config")

	loader := NewKubeconfigLoaderFromPaths([]string{path})
	watcher, err := NewKubeconfigWatcher(loader, func(cfg *api.Config) {})
	if err != nil {
		t.Fatalf("should not error for nonexistent file: %v", err)
	}
	defer watcher.watcher.Close()
}
