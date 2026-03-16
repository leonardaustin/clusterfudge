package ai

import (
	"fmt"
	"os"

	"kubeviewer/internal/config"
)

// Provider represents an AI CLI tool that can be launched for interactive debugging.
type Provider interface {
	Name() string
	ExecPath() string
	// BuildCommand returns the executable and args for an interactive session
	// with an initial prompt referencing the context file.
	BuildCommand(contextFilePath string) []string
}

// ClaudeCode implements Provider for the Claude Code CLI.
type ClaudeCode struct {
	path string
}

func (c *ClaudeCode) Name() string     { return "Claude Code" }
func (c *ClaudeCode) ExecPath() string { return c.path }
func (c *ClaudeCode) BuildCommand(contextFilePath string) []string {
	prompt := fmt.Sprintf("Read the file %s for Kubernetes pod debugging context, then help me diagnose and fix the issues described. Start by summarizing what you see.", contextFilePath)
	return []string{c.path, prompt}
}

// GeminiCLI implements Provider for the Gemini CLI.
type GeminiCLI struct {
	path string
}

func (g *GeminiCLI) Name() string     { return "Gemini CLI" }
func (g *GeminiCLI) ExecPath() string { return g.path }
func (g *GeminiCLI) BuildCommand(contextFilePath string) []string {
	prompt := fmt.Sprintf("Read the file %s for Kubernetes pod debugging context, then help me diagnose and fix the issues described. Start by summarizing what you see.", contextFilePath)
	return []string{g.path, prompt}
}

// ChatGPTCodex implements Provider for the ChatGPT Codex CLI.
type ChatGPTCodex struct {
	path string
}

func (c *ChatGPTCodex) Name() string     { return "ChatGPT Codex" }
func (c *ChatGPTCodex) ExecPath() string { return c.path }
func (c *ChatGPTCodex) BuildCommand(contextFilePath string) []string {
	prompt := fmt.Sprintf("Read the file %s for Kubernetes pod debugging context, then help me diagnose and fix the issues described. Start by summarizing what you see.", contextFilePath)
	return []string{c.path, prompt}
}

// ResolveProvider returns the first enabled AI provider from config.
// Priority: Claude Code > Gemini CLI > ChatGPT Codex.
func ResolveProvider(cfg config.AppConfig) (Provider, error) {
	if cfg.AIClaudeCodeEnabled {
		p := &ClaudeCode{path: cfg.AIClaudeCodePath}
		if err := validatePath(p.path, p.Name()); err != nil {
			return nil, err
		}
		return p, nil
	}
	if cfg.AIGeminiCLIEnabled {
		p := &GeminiCLI{path: cfg.AIGeminiCLIPath}
		if err := validatePath(p.path, p.Name()); err != nil {
			return nil, err
		}
		return p, nil
	}
	if cfg.AIChatGPTCodexEnabled {
		p := &ChatGPTCodex{path: cfg.AIChatGPTCodexPath}
		if err := validatePath(p.path, p.Name()); err != nil {
			return nil, err
		}
		return p, nil
	}
	return nil, fmt.Errorf("no AI provider enabled — configure one in Settings > AI")
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
