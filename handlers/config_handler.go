package handlers

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"clusterfudge/internal/config"
)

// ConfigHandler wraps config.Store to provide Wails-callable methods for the Settings page.
type ConfigHandler struct {
	store *config.Store
}

// NewConfigHandler creates a ConfigHandler backed by the given Store.
func NewConfigHandler(store *config.Store) *ConfigHandler {
	return &ConfigHandler{store: store}
}

// GetConfig returns the full application config.
func (h *ConfigHandler) GetConfig() config.AppConfig {
	return h.store.Get()
}

// UpdateConfig applies a partial config update.
func (h *ConfigHandler) UpdateConfig(partial map[string]interface{}) error {
	return h.store.Update(partial)
}

// ResetConfig restores all settings to defaults.
func (h *ConfigHandler) ResetConfig() error {
	return h.store.Reset()
}

// ExportConfig returns the current config as a JSON string for saving to a file.
func (h *ConfigHandler) ExportConfig() (string, error) {
	cfg := h.store.Get()
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return "", fmt.Errorf("export config: %w", err)
	}
	return string(data), nil
}

// ImportConfig replaces the current config with the given JSON string.
func (h *ConfigHandler) ImportConfig(jsonStr string) error {
	var imported config.AppConfig
	if err := json.Unmarshal([]byte(jsonStr), &imported); err != nil {
		return fmt.Errorf("import config: invalid JSON: %w", err)
	}

	// Convert to partial map for Update so defaults apply for missing fields.
	var partial map[string]interface{}
	data, err := json.Marshal(imported)
	if err != nil {
		return fmt.Errorf("import config: %w", err)
	}
	if err := json.Unmarshal(data, &partial); err != nil {
		return fmt.Errorf("import config: %w", err)
	}

	// Reset first so we start from defaults, then apply imported values.
	if err := h.store.Reset(); err != nil {
		return fmt.Errorf("import config: reset failed: %w", err)
	}
	return h.store.Update(partial)
}

// ValidateFilePath checks if the given path points to a readable file.
// Returns an empty string if valid, or an error message if not.
// Supports tilde expansion for home directory.
func (h *ConfigHandler) ValidateFilePath(path string) string {
	if path == "" {
		return "Path is empty"
	}
	expanded := path
	if strings.HasPrefix(expanded, "~/") {
		home, err := os.UserHomeDir()
		if err == nil {
			expanded = filepath.Join(home, expanded[2:])
		}
	}
	info, err := os.Stat(expanded)
	if err != nil {
		if os.IsNotExist(err) {
			return "File not found"
		}
		return fmt.Sprintf("Cannot access: %v", err)
	}
	if info.IsDir() {
		return "Path is a directory, not a file"
	}
	return ""
}

// GetConfigPath returns the path to the config file on disk.
func (h *ConfigHandler) GetConfigPath() string {
	return h.store.Path()
}

// validateConfigPath checks that the path has a .json extension and resolves
// to a regular file (not a symlink to a sensitive location).
func validateConfigPath(path string) (string, error) {
	cleaned := filepath.Clean(path)
	if !strings.HasSuffix(cleaned, ".json") {
		return "", fmt.Errorf("config files must have .json extension")
	}
	return cleaned, nil
}

// SaveToFile exports the current config to the specified file path.
func (h *ConfigHandler) SaveToFile(path string) error {
	cleaned, err := validateConfigPath(path)
	if err != nil {
		return err
	}
	cfg := h.store.Get()
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("save config: %w", err)
	}
	return os.WriteFile(cleaned, data, 0640)
}

// maxConfigFileSize limits config imports to 1 MiB to prevent resource exhaustion.
const maxConfigFileSize = 1 << 20

// LoadFromFile imports config from the specified file path.
func (h *ConfigHandler) LoadFromFile(path string) error {
	cleaned, err := validateConfigPath(path)
	if err != nil {
		return err
	}
	info, err := os.Stat(cleaned)
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}
	if info.Size() > maxConfigFileSize {
		return fmt.Errorf("config file too large: %d bytes (max %d)", info.Size(), maxConfigFileSize)
	}
	data, err := os.ReadFile(cleaned)
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}
	return h.ImportConfig(string(data))
}
