//go:build e2e

package e2e

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"testing"

	"clusterfudge/internal/config"
)

func TestConfig_PersistenceRoundTrip(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")

	// Write with first store.
	s1, err := config.NewStoreWithPath(path)
	if err != nil {
		t.Fatalf("NewStoreWithPath s1: %v", err)
	}

	if err := s1.Update(map[string]interface{}{
		"theme":            "light",
		"fontSize":         16,
		"defaultNamespace": "kube-system",
		"clusterColors": map[string]string{
			"prod":    "#00ff00",
			"staging": "#ffff00",
		},
	}); err != nil {
		t.Fatalf("Update: %v", err)
	}

	// Read with second store at same path.
	s2, err := config.NewStoreWithPath(path)
	if err != nil {
		t.Fatalf("NewStoreWithPath s2: %v", err)
	}

	cfg := s2.Get()
	if cfg.Theme != "light" {
		t.Errorf("expected theme light, got %q", cfg.Theme)
	}
	if cfg.FontSize != 16 {
		t.Errorf("expected fontSize 16, got %d", cfg.FontSize)
	}
	if cfg.DefaultNamespace != "kube-system" {
		t.Errorf("expected defaultNamespace kube-system, got %q", cfg.DefaultNamespace)
	}
	if cfg.ClusterColors["prod"] != "#00ff00" {
		t.Errorf("expected clusterColors[prod] '#00ff00', got %q", cfg.ClusterColors["prod"])
	}
}

func TestConfig_DefaultsOnFirstUse(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")

	s, err := config.NewStoreWithPath(path)
	if err != nil {
		t.Fatalf("NewStoreWithPath: %v", err)
	}

	cfg := s.Get()
	defaults := config.DefaultConfig()

	if cfg.Theme != defaults.Theme {
		t.Errorf("expected default theme %q, got %q", defaults.Theme, cfg.Theme)
	}
	if cfg.WindowState.Width != defaults.WindowState.Width || cfg.WindowState.Height != defaults.WindowState.Height {
		t.Errorf("expected default window %dx%d, got %dx%d",
			defaults.WindowState.Width, defaults.WindowState.Height,
			cfg.WindowState.Width, cfg.WindowState.Height)
	}
	if cfg.EditorTabSize != defaults.EditorTabSize {
		t.Errorf("expected default editorTabSize %d, got %d", defaults.EditorTabSize, cfg.EditorTabSize)
	}
}

func TestConfig_ConcurrentWriters(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")

	s, err := config.NewStoreWithPath(path)
	if err != nil {
		t.Fatalf("NewStoreWithPath: %v", err)
	}

	var wg sync.WaitGroup
	errs := make(chan error, 10)

	for i := range 10 {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			if err := s.Update(map[string]interface{}{
				"fontSize": 12 + n,
			}); err != nil {
				errs <- err
			}
		}(i)
	}

	wg.Wait()
	close(errs)

	for err := range errs {
		t.Errorf("concurrent update error: %v", err)
	}

	// Verify no corruption by re-reading from disk.
	s2, err := config.NewStoreWithPath(path)
	if err != nil {
		t.Fatalf("re-open store: %v", err)
	}
	cfg := s2.Get()
	if cfg.FontSize < 12 || cfg.FontSize > 21 {
		t.Errorf("unexpected fontSize after concurrent writes: %d", cfg.FontSize)
	}
}

func TestConfig_AtomicWriteRecovery(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")

	s, err := config.NewStoreWithPath(path)
	if err != nil {
		t.Fatalf("NewStoreWithPath: %v", err)
	}

	// Seed with initial data.
	if err := s.Update(map[string]interface{}{"theme": "light"}); err != nil {
		t.Fatalf("seed Update: %v", err)
	}

	var wg sync.WaitGroup
	readErrs := make(chan error, 200)

	// Writer: continuously mutate preferences.
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := range 100 {
			_ = s.Update(map[string]interface{}{
				"fontSize": 12 + (i % 7),
			})
		}
	}()

	// Reader: continuously read the file and parse JSON.
	wg.Add(1)
	go func() {
		defer wg.Done()
		for range 100 {
			raw, err := os.ReadFile(path)
			if err != nil {
				continue
			}
			var data map[string]any
			if err := json.Unmarshal(raw, &data); err != nil {
				readErrs <- fmt.Errorf("invalid JSON: %w (content: %s)", err, string(raw))
			}
		}
	}()

	wg.Wait()
	close(readErrs)

	for err := range readErrs {
		t.Errorf("atomic write violation: %v", err)
	}
}
