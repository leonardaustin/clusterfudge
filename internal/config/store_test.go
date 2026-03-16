package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"testing"
)

func tempConfigPath(t *testing.T) string {
	t.Helper()
	return filepath.Join(t.TempDir(), "config.json")
}

func TestNewStoreWithPath_CreatesDefaults(t *testing.T) {
	path := tempConfigPath(t)
	s, err := NewStoreWithPath(path)
	if err != nil {
		t.Fatalf("NewStoreWithPath: %v", err)
	}

	cfg := s.Get()
	if cfg.Theme != "dark" {
		t.Errorf("expected default theme dark, got %q", cfg.Theme)
	}
	if cfg.FontSize != 13 {
		t.Errorf("expected default fontSize 13, got %d", cfg.FontSize)
	}
	if cfg.DefaultNamespace != "default" {
		t.Errorf("expected default namespace 'default', got %q", cfg.DefaultNamespace)
	}
	if cfg.StartupBehavior != "welcome" {
		t.Errorf("expected startupBehavior 'welcome', got %q", cfg.StartupBehavior)
	}
	if !cfg.AutoCheckUpdates {
		t.Error("expected autoCheckUpdates true")
	}
	if cfg.AccentColor != "#7C3AED" {
		t.Errorf("expected accentColor '#7C3AED', got %q", cfg.AccentColor)
	}
	if cfg.EditorTabSize != 2 {
		t.Errorf("expected editorTabSize 2, got %d", cfg.EditorTabSize)
	}
	if cfg.TerminalCursorStyle != "block" {
		t.Errorf("expected terminalCursorStyle 'block', got %q", cfg.TerminalCursorStyle)
	}
	if cfg.CacheTTLSeconds != 300 {
		t.Errorf("expected cacheTtlSeconds 300, got %d", cfg.CacheTTLSeconds)
	}
	if cfg.MaxLogLines != 50000 {
		t.Errorf("expected maxLogLines 50000, got %d", cfg.MaxLogLines)
	}
	if cfg.WindowState.Width != 1280 || cfg.WindowState.Height != 800 {
		t.Errorf("expected default window 1280x800, got %dx%d", cfg.WindowState.Width, cfg.WindowState.Height)
	}
	if cfg.WindowState.SidebarWidth != 220 {
		t.Errorf("expected sidebarWidth 220, got %d", cfg.WindowState.SidebarWidth)
	}
	if len(cfg.KeyBindings) == 0 {
		t.Error("expected default keybindings")
	}
	if cfg.KeyBindings["search"] != "Ctrl+F" {
		t.Errorf("expected search keybinding 'Ctrl+F', got %q", cfg.KeyBindings["search"])
	}
}

func TestNewStoreWithPath_InvalidDir(t *testing.T) {
	path := "/dev/null/invalid/config.json"
	_, err := NewStoreWithPath(path)
	if err == nil {
		t.Fatal("expected error for invalid directory")
	}
}

func TestStore_LoadsExistingConfig(t *testing.T) {
	path := tempConfigPath(t)

	// Write a partial JSON config (only some fields) to simulate a real saved file.
	partialJSON := `{
  "theme": "light",
  "fontSize": 16,
  "windowState": { "width": 800, "height": 600, "x": 10, "y": 20 }
}`
	os.MkdirAll(filepath.Dir(path), 0750)
	if err := os.WriteFile(path, []byte(partialJSON), 0600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	s, err := NewStoreWithPath(path)
	if err != nil {
		t.Fatalf("NewStoreWithPath: %v", err)
	}

	got := s.Get()
	if got.Theme != "light" {
		t.Errorf("expected theme light, got %q", got.Theme)
	}
	if got.FontSize != 16 {
		t.Errorf("expected fontSize 16, got %d", got.FontSize)
	}
	// Defaults should fill in missing fields
	if got.EditorTabSize != 2 {
		t.Errorf("expected default editorTabSize 2 for missing field, got %d", got.EditorTabSize)
	}
	if got.DefaultNamespace != "default" {
		t.Errorf("expected default namespace 'default' for missing field, got %q", got.DefaultNamespace)
	}
}

func TestStore_Update_Partial(t *testing.T) {
	path := tempConfigPath(t)
	s, err := NewStoreWithPath(path)
	if err != nil {
		t.Fatalf("NewStoreWithPath: %v", err)
	}

	// Update only theme and fontSize
	err = s.Update(map[string]interface{}{
		"theme":    "light",
		"fontSize": 16,
	})
	if err != nil {
		t.Fatalf("Update: %v", err)
	}

	cfg := s.Get()
	if cfg.Theme != "light" {
		t.Errorf("expected theme light, got %q", cfg.Theme)
	}
	if cfg.FontSize != 16 {
		t.Errorf("expected fontSize 16, got %d", cfg.FontSize)
	}
	// Other fields should remain at defaults
	if cfg.DefaultNamespace != "default" {
		t.Errorf("expected defaultNamespace 'default', got %q", cfg.DefaultNamespace)
	}
	if cfg.EditorTabSize != 2 {
		t.Errorf("expected editorTabSize 2 (unchanged), got %d", cfg.EditorTabSize)
	}
}

func TestStore_Update_Persistence(t *testing.T) {
	path := tempConfigPath(t)
	s1, err := NewStoreWithPath(path)
	if err != nil {
		t.Fatalf("NewStoreWithPath s1: %v", err)
	}

	s1.Update(map[string]interface{}{
		"theme":        "light",
		"accentColor":  "#FF0000",
		"debugMode":    true,
		"maxLogLines":  100000,
	})

	// Read with a new store
	s2, err := NewStoreWithPath(path)
	if err != nil {
		t.Fatalf("NewStoreWithPath s2: %v", err)
	}

	cfg := s2.Get()
	if cfg.Theme != "light" {
		t.Errorf("persistence: expected theme light, got %q", cfg.Theme)
	}
	if cfg.AccentColor != "#FF0000" {
		t.Errorf("persistence: expected accentColor '#FF0000', got %q", cfg.AccentColor)
	}
	if !cfg.DebugMode {
		t.Error("persistence: expected debugMode true")
	}
	if cfg.MaxLogLines != 100000 {
		t.Errorf("persistence: expected maxLogLines 100000, got %d", cfg.MaxLogLines)
	}
}

func TestStore_Reset(t *testing.T) {
	path := tempConfigPath(t)
	s, err := NewStoreWithPath(path)
	if err != nil {
		t.Fatalf("NewStoreWithPath: %v", err)
	}

	// Modify some settings
	s.Update(map[string]interface{}{
		"theme":     "light",
		"fontSize":  18,
		"debugMode": true,
	})

	// Reset
	if err := s.Reset(); err != nil {
		t.Fatalf("Reset: %v", err)
	}

	cfg := s.Get()
	defaults := DefaultConfig()
	if cfg.Theme != defaults.Theme {
		t.Errorf("expected theme %q after reset, got %q", defaults.Theme, cfg.Theme)
	}
	if cfg.FontSize != defaults.FontSize {
		t.Errorf("expected fontSize %d after reset, got %d", defaults.FontSize, cfg.FontSize)
	}
	if cfg.DebugMode != defaults.DebugMode {
		t.Errorf("expected debugMode %v after reset, got %v", defaults.DebugMode, cfg.DebugMode)
	}
}

func TestStore_Reset_Persistence(t *testing.T) {
	path := tempConfigPath(t)
	s1, err := NewStoreWithPath(path)
	if err != nil {
		t.Fatalf("NewStoreWithPath: %v", err)
	}

	s1.Update(map[string]interface{}{"theme": "light"})
	s1.Reset()

	s2, err := NewStoreWithPath(path)
	if err != nil {
		t.Fatalf("NewStoreWithPath s2: %v", err)
	}

	cfg := s2.Get()
	if cfg.Theme != "dark" {
		t.Errorf("expected theme 'dark' after reset+reload, got %q", cfg.Theme)
	}
}

func TestStore_ConcurrentAccess(t *testing.T) {
	path := tempConfigPath(t)
	s, err := NewStoreWithPath(path)
	if err != nil {
		t.Fatalf("NewStoreWithPath: %v", err)
	}

	var wg sync.WaitGroup
	errs := make(chan error, 100)

	// Concurrent writers
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			if err := s.Update(map[string]interface{}{
				"fontSize": n + 12,
			}); err != nil {
				errs <- err
			}
		}(i)
	}

	// Concurrent readers
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_ = s.Get()
		}()
	}

	wg.Wait()
	close(errs)

	for err := range errs {
		t.Errorf("concurrent error: %v", err)
	}
}

func TestStore_AtomicWrite(t *testing.T) {
	path := tempConfigPath(t)
	s, err := NewStoreWithPath(path)
	if err != nil {
		t.Fatalf("NewStoreWithPath: %v", err)
	}

	if err := s.Update(map[string]interface{}{"theme": "light"}); err != nil {
		t.Fatalf("Update: %v", err)
	}

	// Verify no temp files remain
	dir := filepath.Dir(path)
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("ReadDir: %v", err)
	}
	for _, e := range entries {
		if filepath.Ext(e.Name()) == ".tmp" {
			t.Errorf("temp file not cleaned up: %s", e.Name())
		}
	}

	// Verify file is valid JSON
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	var cfg AppConfig
	if err := json.Unmarshal(raw, &cfg); err != nil {
		t.Fatalf("config file is not valid JSON: %v", err)
	}
	if cfg.Theme != "light" {
		t.Errorf("unexpected theme in file: %q", cfg.Theme)
	}
}

func TestStore_GetReturnsCopy(t *testing.T) {
	path := tempConfigPath(t)
	s, err := NewStoreWithPath(path)
	if err != nil {
		t.Fatalf("NewStoreWithPath: %v", err)
	}

	cfg1 := s.Get()
	cfg1.Theme = "modified"
	cfg1.KeyBindings["search"] = "modified"

	cfg2 := s.Get()
	if cfg2.Theme == "modified" {
		t.Error("Get() should return a copy, but internal state was mutated via theme")
	}
	if cfg2.KeyBindings["search"] == "modified" {
		t.Error("Get() should return a copy, but internal state was mutated via keyBindings")
	}
}

func TestStore_Update_KeyBindings(t *testing.T) {
	path := tempConfigPath(t)
	s, err := NewStoreWithPath(path)
	if err != nil {
		t.Fatalf("NewStoreWithPath: %v", err)
	}

	err = s.Update(map[string]interface{}{
		"keyBindings": map[string]string{
			"search":  "Ctrl+K",
			"refresh": "F5",
		},
	})
	if err != nil {
		t.Fatalf("Update: %v", err)
	}

	cfg := s.Get()
	if cfg.KeyBindings["search"] != "Ctrl+K" {
		t.Errorf("expected search 'Ctrl+K', got %q", cfg.KeyBindings["search"])
	}
	if cfg.KeyBindings["refresh"] != "F5" {
		t.Errorf("expected refresh 'F5', got %q", cfg.KeyBindings["refresh"])
	}
}

// --- Tests for K8s tuning fields ---

func TestDefaultConfig_K8sTuningDefaults(t *testing.T) {
	cfg := DefaultConfig()
	if cfg.K8sRequestTimeoutSec != 15 {
		t.Errorf("expected K8sRequestTimeoutSec 15, got %d", cfg.K8sRequestTimeoutSec)
	}
	if cfg.K8sQPS != 50 {
		t.Errorf("expected K8sQPS 50, got %f", cfg.K8sQPS)
	}
	if cfg.K8sBurst != 100 {
		t.Errorf("expected K8sBurst 100, got %d", cfg.K8sBurst)
	}
}

func TestStore_Update_K8sTuning(t *testing.T) {
	path := tempConfigPath(t)
	s, err := NewStoreWithPath(path)
	if err != nil {
		t.Fatalf("NewStoreWithPath: %v", err)
	}

	err = s.Update(map[string]interface{}{
		"k8sRequestTimeoutSec": 30,
		"k8sQps":               200.0,
		"k8sBurst":             500,
	})
	if err != nil {
		t.Fatalf("Update: %v", err)
	}

	cfg := s.Get()
	if cfg.K8sRequestTimeoutSec != 30 {
		t.Errorf("expected K8sRequestTimeoutSec 30, got %d", cfg.K8sRequestTimeoutSec)
	}
	if cfg.K8sQPS != 200 {
		t.Errorf("expected K8sQPS 200, got %f", cfg.K8sQPS)
	}
	if cfg.K8sBurst != 500 {
		t.Errorf("expected K8sBurst 500, got %d", cfg.K8sBurst)
	}
}

func TestStore_K8sTuning_Persistence(t *testing.T) {
	path := tempConfigPath(t)
	s1, err := NewStoreWithPath(path)
	if err != nil {
		t.Fatalf("NewStoreWithPath: %v", err)
	}

	s1.Update(map[string]interface{}{
		"k8sRequestTimeoutSec": 45,
		"k8sQps":               300.0,
		"k8sBurst":             600,
	})

	s2, err := NewStoreWithPath(path)
	if err != nil {
		t.Fatalf("NewStoreWithPath s2: %v", err)
	}

	cfg := s2.Get()
	if cfg.K8sRequestTimeoutSec != 45 {
		t.Errorf("persistence: expected K8sRequestTimeoutSec 45, got %d", cfg.K8sRequestTimeoutSec)
	}
	if cfg.K8sQPS != 300 {
		t.Errorf("persistence: expected K8sQPS 300, got %f", cfg.K8sQPS)
	}
	if cfg.K8sBurst != 600 {
		t.Errorf("persistence: expected K8sBurst 600, got %d", cfg.K8sBurst)
	}
}

func TestStore_K8sTuning_DefaultsForMissingFields(t *testing.T) {
	path := tempConfigPath(t)

	// Write a config file WITHOUT the K8s tuning fields.
	partialJSON := `{"theme": "light", "fontSize": 14}`
	os.MkdirAll(filepath.Dir(path), 0750)
	if err := os.WriteFile(path, []byte(partialJSON), 0600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	s, err := NewStoreWithPath(path)
	if err != nil {
		t.Fatalf("NewStoreWithPath: %v", err)
	}

	cfg := s.Get()
	// Missing fields should get defaults.
	if cfg.K8sRequestTimeoutSec != 15 {
		t.Errorf("expected default K8sRequestTimeoutSec 15, got %d", cfg.K8sRequestTimeoutSec)
	}
	if cfg.K8sQPS != 50 {
		t.Errorf("expected default K8sQPS 50, got %f", cfg.K8sQPS)
	}
	if cfg.K8sBurst != 100 {
		t.Errorf("expected default K8sBurst 100, got %d", cfg.K8sBurst)
	}
	// Explicitly set fields should be preserved.
	if cfg.Theme != "light" {
		t.Errorf("expected theme light, got %q", cfg.Theme)
	}
	if cfg.FontSize != 14 {
		t.Errorf("expected fontSize 14, got %d", cfg.FontSize)
	}
}

func TestStore_K8sTuning_ResetRestoresDefaults(t *testing.T) {
	path := tempConfigPath(t)
	s, err := NewStoreWithPath(path)
	if err != nil {
		t.Fatalf("NewStoreWithPath: %v", err)
	}

	s.Update(map[string]interface{}{
		"k8sRequestTimeoutSec": 999,
		"k8sQps":               999.0,
		"k8sBurst":             999,
	})

	if err := s.Reset(); err != nil {
		t.Fatalf("Reset: %v", err)
	}

	cfg := s.Get()
	if cfg.K8sRequestTimeoutSec != 15 {
		t.Errorf("expected K8sRequestTimeoutSec 15 after reset, got %d", cfg.K8sRequestTimeoutSec)
	}
	if cfg.K8sQPS != 50 {
		t.Errorf("expected K8sQPS 50 after reset, got %f", cfg.K8sQPS)
	}
	if cfg.K8sBurst != 100 {
		t.Errorf("expected K8sBurst 100 after reset, got %d", cfg.K8sBurst)
	}
}

func TestStore_K8sTuning_JSONRoundTrip(t *testing.T) {
	cfg := DefaultConfig()
	cfg.K8sRequestTimeoutSec = 60
	cfg.K8sQPS = 150
	cfg.K8sBurst = 250

	data, err := json.Marshal(cfg)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}

	var decoded AppConfig
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if decoded.K8sRequestTimeoutSec != 60 {
		t.Errorf("expected K8sRequestTimeoutSec 60, got %d", decoded.K8sRequestTimeoutSec)
	}
	if decoded.K8sQPS != 150 {
		t.Errorf("expected K8sQPS 150, got %f", decoded.K8sQPS)
	}
	if decoded.K8sBurst != 250 {
		t.Errorf("expected K8sBurst 250, got %d", decoded.K8sBurst)
	}
}

func TestStore_Update_WindowState(t *testing.T) {
	path := tempConfigPath(t)
	s, err := NewStoreWithPath(path)
	if err != nil {
		t.Fatalf("NewStoreWithPath: %v", err)
	}

	err = s.Update(map[string]interface{}{
		"windowState": map[string]interface{}{
			"width":     1920,
			"height":    1080,
			"x":         100,
			"y":         50,
			"maximized": true,
		},
	})
	if err != nil {
		t.Fatalf("Update: %v", err)
	}

	cfg := s.Get()
	if cfg.WindowState.Width != 1920 || cfg.WindowState.Height != 1080 {
		t.Errorf("expected window 1920x1080, got %dx%d", cfg.WindowState.Width, cfg.WindowState.Height)
	}
	if !cfg.WindowState.Maximized {
		t.Error("expected maximized true")
	}
}

func TestStore_Update_WindowState_DeepMerge(t *testing.T) {
	path := tempConfigPath(t)
	s, err := NewStoreWithPath(path)
	if err != nil {
		t.Fatalf("NewStoreWithPath: %v", err)
	}

	// First update: set window position and size
	err = s.Update(map[string]interface{}{
		"windowState": map[string]interface{}{
			"width":  1920,
			"height": 1080,
			"x":      100,
			"y":      50,
		},
	})
	if err != nil {
		t.Fatalf("Update window pos: %v", err)
	}

	// Second update: set only activeRoute — should NOT zero out width/height/x/y
	err = s.Update(map[string]interface{}{
		"windowState": map[string]interface{}{
			"activeRoute": "/workloads/pods",
		},
	})
	if err != nil {
		t.Fatalf("Update activeRoute: %v", err)
	}

	cfg := s.Get()
	if cfg.WindowState.Width != 1920 || cfg.WindowState.Height != 1080 {
		t.Errorf("deep merge: expected window 1920x1080, got %dx%d", cfg.WindowState.Width, cfg.WindowState.Height)
	}
	if cfg.WindowState.X != 100 || cfg.WindowState.Y != 50 {
		t.Errorf("deep merge: expected pos (100,50), got (%d,%d)", cfg.WindowState.X, cfg.WindowState.Y)
	}
	if cfg.WindowState.ActiveRoute != "/workloads/pods" {
		t.Errorf("deep merge: expected activeRoute '/workloads/pods', got %q", cfg.WindowState.ActiveRoute)
	}

	// Third update: set sidebarWidth — should preserve everything else
	err = s.Update(map[string]interface{}{
		"windowState": map[string]interface{}{
			"sidebarWidth":    280,
			"bottomTrayHeight": 300,
		},
	})
	if err != nil {
		t.Fatalf("Update layout: %v", err)
	}

	cfg = s.Get()
	if cfg.WindowState.SidebarWidth != 280 {
		t.Errorf("deep merge: expected sidebarWidth 280, got %d", cfg.WindowState.SidebarWidth)
	}
	if cfg.WindowState.BottomTrayHeight != 300 {
		t.Errorf("deep merge: expected bottomTrayHeight 300, got %d", cfg.WindowState.BottomTrayHeight)
	}
	if cfg.WindowState.Width != 1920 {
		t.Errorf("deep merge: expected width 1920 preserved, got %d", cfg.WindowState.Width)
	}
	if cfg.WindowState.ActiveRoute != "/workloads/pods" {
		t.Errorf("deep merge: expected activeRoute preserved, got %q", cfg.WindowState.ActiveRoute)
	}
}
