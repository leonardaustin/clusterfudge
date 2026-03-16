package config

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"sync"
)

// DefaultConfig returns the default AppConfig with sensible defaults for all fields.
func DefaultConfig() AppConfig {
	return AppConfig{
		DefaultNamespace:     "default",
		StartupBehavior:      "welcome",
		AutoCheckUpdates:     true,
		Theme:                "dark",
		AccentColor:          "#7C3AED",
		FontSize:             13,
		KubeconfigPaths:      defaultKubeconfigPaths(),
		AutoReloadKubeconfig: true,
		EditorTabSize:        2,
		EditorWordWrap:       false,
		EditorMinimap:        true,
		EditorFontSize:       13,
		TerminalFontSize:     13,
		TerminalCursorStyle:  "block",
		TerminalCursorBlink:  true,
		TerminalShell:        "",
		TerminalCopyOnSelect: true,
		CacheTTLSeconds:      300,
		MaxLogLines:          50000,
		MaxConcurrentWatches: 10,
		DebugMode:            false,
		K8sRequestTimeoutSec: 15,
		K8sQPS:               50,
		K8sBurst:             100,
		KeyBindings:          defaultKeyBindings(),
		WindowState: WindowState{
			X: -1, Y: -1, Width: 1280, Height: 800,
			SidebarWidth: 220, BottomTrayHeight: 250,
			ActiveRoute: "/overview",
		},
		ClusterColors:    make(map[string]string),
		ClusterFavorites: []string{},

		AIClaudeCodeEnabled:   false,
		AIClaudeCodePath:      defaultAIPath("claude"),
		AIGeminiCLIEnabled:    false,
		AIGeminiCLIPath:       defaultAIPath("gemini"),
		AIChatGPTCodexEnabled: false,
		AIChatGPTCodexPath:    defaultAIPath("codex"),
	}
}

func defaultKubeconfigPaths() []string {
	home, _ := os.UserHomeDir()
	if home == "" {
		return []string{}
	}
	return []string{filepath.Join(home, ".kube", "config")}
}

func defaultKeyBindings() map[string]string {
	return map[string]string{
		"commandPalette": "Ctrl+Shift+P",
		"search":         "Ctrl+F",
		"refresh":        "Ctrl+R",
		"toggleSidebar":  "Ctrl+B",
		"closePanel":     "Escape",
		"nextTab":        "Ctrl+Tab",
		"prevTab":        "Ctrl+Shift+Tab",
		"deleteResource": "Ctrl+Backspace",
		"editYAML":       "Ctrl+E",
		"scaleTo0":       "",
		"openTerminal":   "Ctrl+`",
	}
}

func defaultAIPath(tool string) string {
	switch runtime.GOOS {
	case "windows":
		switch tool {
		case "claude":
			return `%USERPROFILE%\.claude\local\claude.exe`
		case "gemini":
			return `%APPDATA%\npm\gemini.cmd`
		case "codex":
			return `%APPDATA%\npm\codex.cmd`
		}
	default:
		switch tool {
		case "claude":
			return "/usr/local/bin/claude"
		case "gemini":
			return "/usr/local/bin/gemini"
		case "codex":
			return "/usr/local/bin/codex"
		}
	}
	return ""
}

// Store manages config persistence with thread-safe access and atomic file writes.
type Store struct {
	mu   sync.RWMutex
	cfg  AppConfig
	path string
}

// NewStore loads or creates the config file using the platform-appropriate path.
func NewStore() (*Store, error) {
	path, err := configFilePath()
	if err != nil {
		return nil, fmt.Errorf("config: %w", err)
	}
	return NewStoreWithPath(path)
}

// NewStoreWithPath creates a Store that reads/writes the given file path.
func NewStoreWithPath(path string) (*Store, error) {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0750); err != nil {
		return nil, fmt.Errorf("config: unable to create directory %s: %w", dir, err)
	}

	s := &Store{path: path, cfg: DefaultConfig()}

	data, err := os.ReadFile(path)
	if err == nil {
		// Merge saved config over defaults so new fields get their defaults.
		var saved map[string]json.RawMessage
		if jsonErr := json.Unmarshal(data, &saved); jsonErr == nil {
			defaults, _ := json.Marshal(s.cfg)
			var merged map[string]json.RawMessage
			if err := json.Unmarshal(defaults, &merged); err != nil {
				log.Printf("warning: config: failed to unmarshal defaults, using saved config as-is: %v", err)
			} else {
				for k, v := range saved {
					merged[k] = v
				}
				if merged2, err := json.Marshal(merged); err != nil {
					log.Printf("warning: config: failed to marshal merged config: %v", err)
				} else if err := json.Unmarshal(merged2, &s.cfg); err != nil {
					log.Printf("warning: config: failed to unmarshal merged config: %v", err)
				}
			}
		}
	} else if !os.IsNotExist(err) {
		return nil, fmt.Errorf("config: unable to read %s: %w", path, err)
	}

	return s, nil
}

// Path returns the file path used by this store.
func (s *Store) Path() string {
	return s.path
}

// Get returns a copy of the current config.
func (s *Store) Get() AppConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.copyCfg()
}

// Update applies a partial config update and atomically writes to disk.
// Nested maps (e.g. windowState) are deep-merged so callers can send partial
// sub-objects without overwriting sibling fields.
func (s *Store) Update(partial map[string]interface{}) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	current, err := json.Marshal(s.cfg)
	if err != nil {
		return fmt.Errorf("config: marshal current: %w", err)
	}
	var merged map[string]interface{}
	if err := json.Unmarshal(current, &merged); err != nil {
		return fmt.Errorf("config: unmarshal current: %w", err)
	}
	deepMerge(merged, partial)
	data, err := json.MarshalIndent(merged, "", "  ")
	if err != nil {
		return fmt.Errorf("config: marshal merged: %w", err)
	}
	if err := json.Unmarshal(data, &s.cfg); err != nil {
		return fmt.Errorf("config: unmarshal merged: %w", err)
	}

	return atomicWrite(s.path, data)
}

// deepMerge recursively merges src into dst. When both dst[k] and src[k] are
// maps, the values are merged recursively instead of replaced.
func deepMerge(dst, src map[string]interface{}) {
	for k, srcVal := range src {
		if dstVal, ok := dst[k]; ok {
			srcMap, srcOk := srcVal.(map[string]interface{})
			dstMap, dstOk := dstVal.(map[string]interface{})
			if srcOk && dstOk {
				deepMerge(dstMap, srcMap)
				continue
			}
		}
		dst[k] = srcVal
	}
}

// Reset restores all settings to defaults and writes to disk.
func (s *Store) Reset() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.cfg = DefaultConfig()
	data, err := json.MarshalIndent(s.cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("config: marshal defaults: %w", err)
	}
	return atomicWrite(s.path, data)
}

// copyCfg returns a deep copy of the config to prevent mutation of internal state.
func (s *Store) copyCfg() AppConfig {
	c := s.cfg

	if s.cfg.KubeconfigPaths != nil {
		c.KubeconfigPaths = make([]string, len(s.cfg.KubeconfigPaths))
		copy(c.KubeconfigPaths, s.cfg.KubeconfigPaths)
	}
	if s.cfg.KeyBindings != nil {
		c.KeyBindings = make(map[string]string, len(s.cfg.KeyBindings))
		for k, v := range s.cfg.KeyBindings {
			c.KeyBindings[k] = v
		}
	}
	if s.cfg.ClusterColors != nil {
		c.ClusterColors = make(map[string]string, len(s.cfg.ClusterColors))
		for k, v := range s.cfg.ClusterColors {
			c.ClusterColors[k] = v
		}
	}
	if s.cfg.ClusterFavorites != nil {
		c.ClusterFavorites = make([]string, len(s.cfg.ClusterFavorites))
		copy(c.ClusterFavorites, s.cfg.ClusterFavorites)
	}

	return c
}

func atomicWrite(path string, data []byte) error {
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, "config-*.json.tmp")
	if err != nil {
		return fmt.Errorf("config: create temp file: %w", err)
	}
	tmpPath := tmp.Name()

	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		_ = os.Remove(tmpPath)
		return fmt.Errorf("config: write temp file: %w", err)
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		_ = os.Remove(tmpPath)
		return fmt.Errorf("config: sync temp file: %w", err)
	}
	if err := tmp.Close(); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("config: close temp file: %w", err)
	}

	if err := os.Rename(tmpPath, path); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("config: rename temp file: %w", err)
	}
	return nil
}

func configFilePath() (string, error) {
	if runtime.GOOS == "windows" {
		appdata := os.Getenv("APPDATA")
		if appdata == "" {
			return "", fmt.Errorf("APPDATA not set")
		}
		return filepath.Join(appdata, "kubeviewer", "config.json"), nil
	}
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "kubeviewer", "config.json"), nil
}
