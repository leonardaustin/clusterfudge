package handlers

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"clusterfudge/internal/config"
)

func newTestConfigHandler(t *testing.T) *ConfigHandler {
	t.Helper()
	path := filepath.Join(t.TempDir(), "config.json")
	store, err := config.NewStoreWithPath(path)
	if err != nil {
		t.Fatalf("NewStoreWithPath: %v", err)
	}
	return NewConfigHandler(store)
}

func TestNewConfigHandler(t *testing.T) {
	h := newTestConfigHandler(t)
	if h == nil {
		t.Fatal("expected non-nil handler")
	}
}

func TestConfigHandler_GetConfig(t *testing.T) {
	h := newTestConfigHandler(t)

	cfg := h.GetConfig()
	if cfg.Theme != "dark" {
		t.Errorf("expected default theme dark, got %q", cfg.Theme)
	}
	if cfg.FontSize != 16 {
		t.Errorf("expected default fontSize 16, got %d", cfg.FontSize)
	}
}

func TestConfigHandler_UpdateConfig(t *testing.T) {
	h := newTestConfigHandler(t)

	err := h.UpdateConfig(map[string]interface{}{
		"theme":    "light",
		"fontSize": 16,
	})
	if err != nil {
		t.Fatalf("UpdateConfig: %v", err)
	}

	cfg := h.GetConfig()
	if cfg.Theme != "light" {
		t.Errorf("expected theme light, got %q", cfg.Theme)
	}
	if cfg.FontSize != 16 {
		t.Errorf("expected fontSize 16, got %d", cfg.FontSize)
	}
}

func TestConfigHandler_ResetConfig(t *testing.T) {
	h := newTestConfigHandler(t)

	h.UpdateConfig(map[string]interface{}{"theme": "light", "debugMode": true})

	if err := h.ResetConfig(); err != nil {
		t.Fatalf("ResetConfig: %v", err)
	}

	cfg := h.GetConfig()
	if cfg.Theme != "dark" {
		t.Errorf("expected theme 'dark' after reset, got %q", cfg.Theme)
	}
	if cfg.DebugMode {
		t.Error("expected debugMode false after reset")
	}
}

func TestConfigHandler_ExportConfig(t *testing.T) {
	h := newTestConfigHandler(t)

	h.UpdateConfig(map[string]interface{}{"theme": "light"})

	jsonStr, err := h.ExportConfig()
	if err != nil {
		t.Fatalf("ExportConfig: %v", err)
	}

	var exported config.AppConfig
	if err := json.Unmarshal([]byte(jsonStr), &exported); err != nil {
		t.Fatalf("exported JSON is invalid: %v", err)
	}
	if exported.Theme != "light" {
		t.Errorf("expected exported theme light, got %q", exported.Theme)
	}
}

func TestConfigHandler_ImportConfig(t *testing.T) {
	h := newTestConfigHandler(t)

	imported := config.AppConfig{
		Theme:    "light",
		FontSize: 18,
	}
	data, _ := json.Marshal(imported)

	if err := h.ImportConfig(string(data)); err != nil {
		t.Fatalf("ImportConfig: %v", err)
	}

	cfg := h.GetConfig()
	if cfg.Theme != "light" {
		t.Errorf("expected imported theme light, got %q", cfg.Theme)
	}
	if cfg.FontSize != 18 {
		t.Errorf("expected imported fontSize 18, got %d", cfg.FontSize)
	}
}

func TestConfigHandler_ImportConfig_InvalidJSON(t *testing.T) {
	h := newTestConfigHandler(t)

	err := h.ImportConfig("not valid json")
	if err == nil {
		t.Fatal("expected error for invalid JSON")
	}
}

func TestConfigHandler_ExportImport_RoundTrip(t *testing.T) {
	h := newTestConfigHandler(t)

	h.UpdateConfig(map[string]interface{}{
		"theme":     "light",
		"fontSize":  16,
		"debugMode": true,
	})

	exported, err := h.ExportConfig()
	if err != nil {
		t.Fatalf("ExportConfig: %v", err)
	}

	// Reset and then import
	h.ResetConfig()
	if err := h.ImportConfig(exported); err != nil {
		t.Fatalf("ImportConfig: %v", err)
	}

	cfg := h.GetConfig()
	if cfg.Theme != "light" || cfg.FontSize != 16 || !cfg.DebugMode {
		t.Errorf("round-trip failed: %+v", cfg)
	}
}

func TestConfigHandler_GetConfigPath(t *testing.T) {
	h := newTestConfigHandler(t)
	path := h.GetConfigPath()
	if path == "" {
		t.Error("expected non-empty config path")
	}
}

// --- Tests for LoadFromFile size limit ---

func TestConfigHandler_LoadFromFile_Success(t *testing.T) {
	h := newTestConfigHandler(t)

	// Write a valid config file.
	dir := t.TempDir()
	path := filepath.Join(dir, "import.json")
	cfg := config.AppConfig{Theme: "light", FontSize: 18}
	data, _ := json.Marshal(cfg)
	if err := os.WriteFile(path, data, 0640); err != nil {
		t.Fatal(err)
	}

	if err := h.LoadFromFile(path); err != nil {
		t.Fatalf("LoadFromFile: %v", err)
	}

	got := h.GetConfig()
	if got.Theme != "light" {
		t.Errorf("expected theme light, got %q", got.Theme)
	}
	if got.FontSize != 18 {
		t.Errorf("expected fontSize 18, got %d", got.FontSize)
	}
}

func TestConfigHandler_LoadFromFile_TooLarge(t *testing.T) {
	h := newTestConfigHandler(t)

	// Create a file larger than maxConfigFileSize (1 MiB).
	dir := t.TempDir()
	path := filepath.Join(dir, "big.json")
	data := make([]byte, 1<<20+1) // 1 MiB + 1 byte
	for i := range data {
		data[i] = ' '
	}
	if err := os.WriteFile(path, data, 0640); err != nil {
		t.Fatal(err)
	}

	err := h.LoadFromFile(path)
	if err == nil {
		t.Fatal("expected error for file larger than 1 MiB")
	}
	if !strings.Contains(err.Error(), "too large") {
		t.Errorf("expected 'too large' in error, got: %v", err)
	}
}

func TestConfigHandler_LoadFromFile_ExactLimit(t *testing.T) {
	h := newTestConfigHandler(t)

	// Create a file exactly at maxConfigFileSize -- should succeed.
	dir := t.TempDir()
	path := filepath.Join(dir, "exact.json")
	// Create valid JSON that is large but within limits.
	cfg := config.AppConfig{Theme: "dark"}
	data, _ := json.Marshal(cfg)
	// Pad with whitespace to fill up to 1 MiB.
	padding := make([]byte, (1<<20)-len(data))
	for i := range padding {
		padding[i] = ' '
	}
	padded := append(data[:len(data)-1], padding...) // before the closing }
	padded = append(padded, '}')
	if err := os.WriteFile(path, padded, 0640); err != nil {
		t.Fatal(err)
	}

	// File is within limit (may fail on JSON parse but not on size check).
	err := h.LoadFromFile(path)
	if err != nil && strings.Contains(err.Error(), "too large") {
		t.Fatalf("file should not be too large at exactly 1 MiB")
	}
}

func TestConfigHandler_LoadFromFile_NonExistent(t *testing.T) {
	h := newTestConfigHandler(t)

	err := h.LoadFromFile("/nonexistent/path/config.json")
	if err == nil {
		t.Fatal("expected error for non-existent file")
	}
}

func TestConfigHandler_LoadFromFile_NonJSON(t *testing.T) {
	h := newTestConfigHandler(t)

	dir := t.TempDir()
	path := filepath.Join(dir, "config.txt") // wrong extension
	os.WriteFile(path, []byte(`{"theme":"light"}`), 0640)

	err := h.LoadFromFile(path)
	if err == nil {
		t.Fatal("expected error for non-.json extension")
	}
	if !strings.Contains(err.Error(), ".json") {
		t.Errorf("expected error about .json extension, got: %v", err)
	}
}

func TestConfigHandler_LoadFromFile_InvalidJSON(t *testing.T) {
	h := newTestConfigHandler(t)

	dir := t.TempDir()
	path := filepath.Join(dir, "bad.json")
	os.WriteFile(path, []byte("not json"), 0640)

	err := h.LoadFromFile(path)
	if err == nil {
		t.Fatal("expected error for invalid JSON")
	}
}

// --- Tests for SaveToFile ---

func TestConfigHandler_SaveToFile_Success(t *testing.T) {
	h := newTestConfigHandler(t)
	h.UpdateConfig(map[string]interface{}{"theme": "light"})

	dir := t.TempDir()
	path := filepath.Join(dir, "export.json")

	if err := h.SaveToFile(path); err != nil {
		t.Fatalf("SaveToFile: %v", err)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}

	var loaded config.AppConfig
	if err := json.Unmarshal(data, &loaded); err != nil {
		t.Fatalf("invalid JSON in saved file: %v", err)
	}
	if loaded.Theme != "light" {
		t.Errorf("expected theme light in saved file, got %q", loaded.Theme)
	}
}

func TestConfigHandler_SaveToFile_NonJSON(t *testing.T) {
	h := newTestConfigHandler(t)

	err := h.SaveToFile("/tmp/export.txt")
	if err == nil {
		t.Fatal("expected error for non-.json extension")
	}
}

// --- Tests for validateConfigPath ---

func TestValidateConfigPath(t *testing.T) {
	tests := []struct {
		path    string
		wantErr bool
	}{
		{"/tmp/config.json", false},
		{"/tmp/config.txt", true},
		{"/tmp/config", true},
		{"/tmp/my.config.json", false},
		{"./relative/config.json", false},
	}
	for _, tt := range tests {
		_, err := validateConfigPath(tt.path)
		if (err != nil) != tt.wantErr {
			t.Errorf("validateConfigPath(%q): err=%v, wantErr=%v", tt.path, err, tt.wantErr)
		}
	}
}

// --- Test maxConfigFileSize constant ---

func TestMaxConfigFileSize(t *testing.T) {
	if maxConfigFileSize != 1<<20 {
		t.Errorf("expected maxConfigFileSize 1MiB (1048576), got %d", maxConfigFileSize)
	}
}

// --- SaveToFile + LoadFromFile round trip ---

func TestConfigHandler_SaveLoadRoundTrip(t *testing.T) {
	h := newTestConfigHandler(t)
	h.UpdateConfig(map[string]interface{}{
		"theme":    "light",
		"fontSize": 16,
	})

	dir := t.TempDir()
	path := filepath.Join(dir, "roundtrip.json")

	if err := h.SaveToFile(path); err != nil {
		t.Fatalf("SaveToFile: %v", err)
	}

	// Reset and reload from file.
	h.ResetConfig()
	if err := h.LoadFromFile(path); err != nil {
		t.Fatalf("LoadFromFile: %v", err)
	}

	cfg := h.GetConfig()
	if cfg.Theme != "light" {
		t.Errorf("expected theme light after round-trip, got %q", cfg.Theme)
	}
	if cfg.FontSize != 16 {
		t.Errorf("expected fontSize 16 after round-trip, got %d", cfg.FontSize)
	}
}
