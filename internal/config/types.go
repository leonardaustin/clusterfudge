package config

// AppConfig is the complete user configuration.
type AppConfig struct {
	// General
	DefaultNamespace string `json:"defaultNamespace"`
	StartupBehavior  string `json:"startupBehavior"` // "last_cluster" | "welcome"
	AutoCheckUpdates bool   `json:"autoCheckUpdates"`

	// Appearance
	Theme       string `json:"theme"`       // "dark" | "light" | "system"
	AccentColor string `json:"accentColor"` // hex string, e.g. "#7C3AED"
	FontSize    int    `json:"fontSize"`    // 12-18

	// Kubeconfig
	KubeconfigPaths      []string `json:"kubeconfigPaths"`
	AutoReloadKubeconfig bool     `json:"autoReloadKubeconfig"`

	// Editor
	EditorTabSize  int  `json:"editorTabSize"`  // 2 | 4
	EditorWordWrap bool `json:"editorWordWrap"`
	EditorMinimap  bool `json:"editorMinimap"`
	EditorFontSize int  `json:"editorFontSize"`

	// Terminal
	TerminalFontSize    int    `json:"terminalFontSize"`
	TerminalCursorStyle string `json:"terminalCursorStyle"` // "block" | "bar" | "underline"
	TerminalCursorBlink bool   `json:"terminalCursorBlink"`
	TerminalShell       string `json:"terminalShell"` // empty = auto-detect
	TerminalCopyOnSelect bool   `json:"terminalCopyOnSelect"`
	TerminalTheme        string `json:"terminalTheme"` // "dark" | "light" | "monokai" | "solarized"

	// Advanced
	CacheTTLSeconds      int  `json:"cacheTtlSeconds"`
	MaxLogLines          int  `json:"maxLogLines"`
	MaxConcurrentWatches int  `json:"maxConcurrentWatches"`
	DebugMode            bool `json:"debugMode"`

	// Kubernetes client tuning
	K8sRequestTimeoutSec int     `json:"k8sRequestTimeoutSec"` // per-request timeout (default: 15)
	K8sQPS               float64 `json:"k8sQps"`               // client-go QPS (default: 50)
	K8sBurst             int     `json:"k8sBurst"`              // client-go burst (default: 100)

	// Keyboard shortcuts: action → key combo string
	KeyBindings map[string]string `json:"keyBindings"`

	// Window state
	WindowState WindowState `json:"windowState"`

	// Cluster-specific
	ClusterColors    map[string]string `json:"clusterColors"`
	ClusterFavorites []string          `json:"clusterFavorites"`

	// AI Providers
	AIClaudeCodeEnabled bool   `json:"aiClaudeCodeEnabled"`
	AIClaudeCodePath    string `json:"aiClaudeCodePath"`
	AIGeminiCLIEnabled  bool   `json:"aiGeminiCliEnabled"`
	AIGeminiCLIPath     string `json:"aiGeminiCliPath"`
	AIChatGPTCodexEnabled bool `json:"aiChatgptCodexEnabled"`
	AIChatGPTCodexPath    string `json:"aiChatgptCodexPath"`

	// Beta
	BetaFeatures bool `json:"betaFeatures"`

	// Internal
	SkipUpdateVersion string `json:"skipUpdateVersion"`
}

// WindowState holds the position, size, and layout state of the application window.
type WindowState struct {
	X                 int    `json:"x"`
	Y                 int    `json:"y"`
	Width             int    `json:"width"`
	Height            int    `json:"height"`
	Maximized         bool   `json:"maximized"`
	SidebarWidth      int    `json:"sidebarWidth"`
	BottomTrayHeight  int    `json:"bottomTrayHeight"`
	BottomTrayVisible bool   `json:"bottomTrayVisible"`
	ActiveRoute       string `json:"activeRoute"`
}
