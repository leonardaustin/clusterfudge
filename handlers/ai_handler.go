package handlers

import (
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"runtime"
	"sync"

	"clusterfudge/internal/ai"
	"clusterfudge/internal/cluster"
	"clusterfudge/internal/config"
	"clusterfudge/internal/events"
	"clusterfudge/internal/resource"
	"clusterfudge/internal/stream"
)

// AIHandler exposes AI debugging session management to the frontend.
type AIHandler struct {
	manager  *cluster.Manager
	cfgStore *config.Store
	svc      *resource.Service
	emitter  *events.Emitter
	mu       sync.RWMutex
	sessions map[string]*ai.LocalSession
}

// NewAIHandler creates an AIHandler.
func NewAIHandler(svc *resource.Service, mgr *cluster.Manager, cfgStore *config.Store) *AIHandler {
	return &AIHandler{
		manager:  mgr,
		cfgStore: cfgStore,
		svc:      svc,
		sessions: make(map[string]*ai.LocalSession),
	}
}

// SetEmitter sets the event emitter for AI session event broadcasting.
func (h *AIHandler) SetEmitter(emitter *events.Emitter) {
	h.emitter = emitter
}

// StartAISession gathers K8s context for a pod, writes it to a temp file,
// and launches the AI CLI in a local PTY. Returns the session ID.
// providerID selects which AI provider to use (e.g. "claude", "gemini", "codex").
// Output streams on "ai:stdout:{sessionID}", exit on "ai:exit:{sessionID}".
func (h *AIHandler) StartAISession(namespace, name, providerID string) (string, error) {
	// Resolve provider from config
	cfg := h.cfgStore.Get()
	var provider ai.Provider
	var err error
	if providerID != "" {
		provider, err = ai.ResolveProviderByID(cfg, providerID)
	} else {
		provider, err = ai.ResolveProvider(cfg)
	}
	if err != nil {
		return "", err
	}

	// Gather pod context as a prompt
	gatherer := ai.NewContextGatherer(h.manager, h.svc)
	prompt, err := gatherer.GatherPrompt(namespace, name)
	if err != nil {
		return "", fmt.Errorf("failed to gather pod context: %w", err)
	}

	// Build command
	args := provider.BuildCommand(prompt)

	// Generate session ID
	sessionID, err := stream.GenerateID()
	if err != nil {
		return "", fmt.Errorf("generate session ID: %w", err)
	}

	// Start PTY session
	session, err := ai.StartLocalSession(args, nil, func(data []byte) {
		if h.emitter != nil {
			h.emitter.Emit("ai:stdout:"+sessionID, string(data))
		}
	}, func(exitErr error) {
		msg := ""
		if exitErr != nil {
			msg = exitErr.Error()
		}
		if h.emitter != nil {
			h.emitter.Emit("ai:exit:"+sessionID, msg)
		}
		// Clean up session from map
		h.mu.Lock()
		delete(h.sessions, sessionID)
		h.mu.Unlock()
	})
	if err != nil {
		return "", fmt.Errorf("failed to start %s: %w", provider.Name(), err)
	}

	h.mu.Lock()
	h.sessions[sessionID] = session
	h.mu.Unlock()

	slog.Info("AI session started", "provider", provider.Name(), "session", sessionID, "pod", namespace+"/"+name)
	return sessionID, nil
}

// GetAIProviderName returns the name of the currently enabled AI provider, or empty string if none.
func (h *AIHandler) GetAIProviderName() string {
	cfg := h.cfgStore.Get()
	provider, err := ai.ResolveProvider(cfg)
	if err != nil {
		return ""
	}
	return provider.Name()
}

// GetEnabledAIProviders returns info about all enabled and valid AI providers.
func (h *AIHandler) GetEnabledAIProviders() []ai.ProviderInfo {
	cfg := h.cfgStore.Get()
	return ai.ListEnabledProviders(cfg)
}

// WriteAISession sends keyboard input to an AI session's PTY.
func (h *AIHandler) WriteAISession(sessionID, data string) error {
	h.mu.RLock()
	session, ok := h.sessions[sessionID]
	h.mu.RUnlock()
	if !ok {
		return fmt.Errorf("AI session not found: %s", sessionID)
	}
	return session.Write([]byte(data))
}

// ResizeAISession resizes the PTY for an AI session.
func (h *AIHandler) ResizeAISession(sessionID string, rows, cols int) error {
	if rows <= 0 || cols <= 0 || rows > 500 || cols > 500 {
		return fmt.Errorf("invalid terminal size: %dx%d", rows, cols)
	}
	h.mu.RLock()
	session, ok := h.sessions[sessionID]
	h.mu.RUnlock()
	if !ok {
		return fmt.Errorf("AI session not found: %s", sessionID)
	}
	return session.Resize(uint16(rows), uint16(cols))
}

// CloseAISession terminates an AI session and cleans up resources.
func (h *AIHandler) CloseAISession(sessionID string) {
	h.mu.Lock()
	session, ok := h.sessions[sessionID]
	if ok {
		delete(h.sessions, sessionID)
	}
	h.mu.Unlock()
	if session != nil {
		session.Close()
		slog.Info("AI session closed", "session", sessionID)
	}
}

// ValidateAIPath checks if the given path points to a valid executable.
// Returns an empty string if valid, or an error message if not.
func (h *AIHandler) ValidateAIPath(path string) string {
	if path == "" {
		return "Path is empty"
	}
	info, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return "File not found"
		}
		return fmt.Sprintf("Cannot access: %v", err)
	}
	if info.IsDir() {
		return "Path is a directory, not an executable"
	}
	if info.Mode().Perm()&0111 == 0 {
		return "File is not executable"
	}
	return ""
}

// FindAIPath attempts to locate the executable for a given provider ID.
// Returns the found path or empty string.
func (h *AIHandler) FindAIPath(providerID string) string {
	var names []string
	switch providerID {
	case "claude":
		names = []string{"claude"}
	case "gemini":
		names = []string{"gemini"}
	case "codex":
		names = []string{"codex"}
	default:
		return ""
	}

	// Common install paths to check (in priority order)
	var searchDirs []string
	if runtime.GOOS == "darwin" {
		searchDirs = []string{
			"/opt/homebrew/bin",
			"/usr/local/bin",
			os.Getenv("HOME") + "/.local/bin",
			os.Getenv("HOME") + "/.npm-global/bin",
			"/usr/bin",
		}
	} else {
		searchDirs = []string{
			"/usr/local/bin",
			os.Getenv("HOME") + "/.local/bin",
			os.Getenv("HOME") + "/.npm-global/bin",
			"/usr/bin",
			"/snap/bin",
		}
	}

	// First try exec.LookPath which respects $PATH
	for _, name := range names {
		if p, err := exec.LookPath(name); err == nil {
			return p
		}
	}

	// Then scan common directories
	for _, dir := range searchDirs {
		for _, name := range names {
			path := dir + "/" + name
			info, err := os.Stat(path)
			if err == nil && !info.IsDir() && info.Mode().Perm()&0111 != 0 {
				return path
			}
		}
	}

	return ""
}

// CloseAll terminates all active AI sessions. Called on app shutdown.
func (h *AIHandler) CloseAll() {
	h.mu.Lock()
	sessions := make(map[string]*ai.LocalSession, len(h.sessions))
	for k, v := range h.sessions {
		sessions[k] = v
	}
	h.sessions = make(map[string]*ai.LocalSession)
	h.mu.Unlock()

	for id, s := range sessions {
		s.Close()
		slog.Info("AI session closed on shutdown", "session", id)
	}
}
