package ai

import (
	"fmt"
	"os"

	"clusterfudge/internal/config"
)

// Provider represents an AI CLI tool that can be launched for interactive debugging.
type Provider interface {
	Name() string
	ExecPath() string
	// BuildCommand returns the executable and args for an interactive session
	// with the given prompt as the initial message.
	BuildCommand(prompt string) []string
}

// ProviderInfo is a lightweight descriptor returned to the frontend.
type ProviderInfo struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// providerDef describes how to look up a provider from config.
type providerDef struct {
	id      string
	name    string
	enabled func(config.AppConfig) bool
	path    func(config.AppConfig) string
	make    func(path string) Provider
}

// registry lists all known providers in priority order.
var registry = []providerDef{
	{
		id: "claude", name: "Claude Code",
		enabled: func(c config.AppConfig) bool { return c.AIClaudeCodeEnabled },
		path:    func(c config.AppConfig) string { return c.AIClaudeCodePath },
		make:    func(p string) Provider { return &cliProvider{name: "Claude Code", path: p} },
	},
	{
		id: "gemini", name: "Gemini CLI",
		enabled: func(c config.AppConfig) bool { return c.AIGeminiCLIEnabled },
		path:    func(c config.AppConfig) string { return c.AIGeminiCLIPath },
		make:    func(p string) Provider { return &cliProvider{name: "Gemini CLI", path: p, promptFlag: "-i"} },
	},
	{
		id: "codex", name: "ChatGPT Codex",
		enabled: func(c config.AppConfig) bool { return c.AIChatGPTCodexEnabled },
		path:    func(c config.AppConfig) string { return c.AIChatGPTCodexPath },
		make:    func(p string) Provider { return &cliProvider{name: "ChatGPT Codex", path: p} },
	},
}

// cliProvider implements Provider for any AI CLI that accepts a prompt argument.
type cliProvider struct {
	name      string
	path      string
	promptFlag string // flag to pass before prompt for interactive mode (e.g. "-i" for Gemini), empty for positional
}

func (c *cliProvider) Name() string     { return c.name }
func (c *cliProvider) ExecPath() string { return c.path }
func (c *cliProvider) BuildCommand(prompt string) []string {
	if c.promptFlag != "" {
		return []string{c.path, c.promptFlag, prompt}
	}
	return []string{c.path, prompt}
}

// ResolveProvider returns the first enabled AI provider from config.
// Priority: Claude Code > Gemini CLI > ChatGPT Codex.
func ResolveProvider(cfg config.AppConfig) (Provider, error) {
	for _, def := range registry {
		if def.enabled(cfg) {
			return resolveFromDef(def, cfg)
		}
	}
	return nil, fmt.Errorf("no AI provider enabled — configure one in Settings > AI")
}

// ResolveProviderByID returns the provider for a specific ID.
func ResolveProviderByID(cfg config.AppConfig, providerID string) (Provider, error) {
	for _, def := range registry {
		if def.id == providerID {
			if !def.enabled(cfg) {
				return nil, fmt.Errorf("%s is not enabled — check Settings > AI", def.name)
			}
			return resolveFromDef(def, cfg)
		}
	}
	return nil, fmt.Errorf("unknown AI provider: %s", providerID)
}

// ListEnabledProviders returns info for all enabled and valid AI providers.
func ListEnabledProviders(cfg config.AppConfig) []ProviderInfo {
	var providers []ProviderInfo
	for _, def := range registry {
		if def.enabled(cfg) && validatePath(def.path(cfg), def.name) == nil {
			providers = append(providers, ProviderInfo{ID: def.id, Name: def.name})
		}
	}
	return providers
}

func resolveFromDef(def providerDef, cfg config.AppConfig) (Provider, error) {
	p := def.make(def.path(cfg))
	if err := validatePath(p.ExecPath(), p.Name()); err != nil {
		return nil, err
	}
	return p, nil
}

// validatePath checks that the executable exists at the given path.
func validatePath(path, providerName string) error {
	if path == "" {
		return fmt.Errorf("%s path is empty — check Settings > AI", providerName)
	}
	info, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return fmt.Errorf("%s not found at %s — check Settings > AI", providerName, path)
		}
		return fmt.Errorf("cannot access %s at %s: %w", providerName, path, err)
	}
	if info.IsDir() {
		return fmt.Errorf("%s path %s is a directory, not an executable", providerName, path)
	}
	if info.Mode().Perm()&0111 == 0 {
		return fmt.Errorf("%s at %s is not executable — check file permissions", providerName, path)
	}
	return nil
}
