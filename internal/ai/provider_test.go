package ai

import (
	"os"
	"path/filepath"
	"testing"

	"clusterfudge/internal/config"
)

func TestResolveProvider_NoProviderEnabled(t *testing.T) {
	cfg := config.AppConfig{}
	_, err := ResolveProvider(cfg)
	if err == nil {
		t.Fatal("expected error when no provider enabled")
	}
	if got := err.Error(); got != "no AI provider enabled — configure one in Settings > AI" {
		t.Errorf("unexpected error: %s", got)
	}
}

func TestResolveProvider_ClaudeCodePriority(t *testing.T) {
	// Create a temp file to act as the CLI executable
	tmp := filepath.Join(t.TempDir(), "claude")
	if err := os.WriteFile(tmp, []byte("#!/bin/sh"), 0755); err != nil {
		t.Fatal(err)
	}

	cfg := config.AppConfig{
		AIClaudeCodeEnabled:   true,
		AIClaudeCodePath:      tmp,
		AIGeminiCLIEnabled:    true,
		AIGeminiCLIPath:       tmp,
		AIChatGPTCodexEnabled: true,
		AIChatGPTCodexPath:    tmp,
	}

	p, err := ResolveProvider(cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if p.Name() != "Claude Code" {
		t.Errorf("expected Claude Code, got %s", p.Name())
	}
}

func TestResolveProvider_GeminiFallback(t *testing.T) {
	tmp := filepath.Join(t.TempDir(), "gemini")
	if err := os.WriteFile(tmp, []byte("#!/bin/sh"), 0755); err != nil {
		t.Fatal(err)
	}

	cfg := config.AppConfig{
		AIGeminiCLIEnabled: true,
		AIGeminiCLIPath:    tmp,
	}

	p, err := ResolveProvider(cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if p.Name() != "Gemini CLI" {
		t.Errorf("expected Gemini CLI, got %s", p.Name())
	}
}

func TestResolveProvider_CodexFallback(t *testing.T) {
	tmp := filepath.Join(t.TempDir(), "codex")
	if err := os.WriteFile(tmp, []byte("#!/bin/sh"), 0755); err != nil {
		t.Fatal(err)
	}

	cfg := config.AppConfig{
		AIChatGPTCodexEnabled: true,
		AIChatGPTCodexPath:    tmp,
	}

	p, err := ResolveProvider(cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if p.Name() != "ChatGPT Codex" {
		t.Errorf("expected ChatGPT Codex, got %s", p.Name())
	}
}

func TestResolveProvider_PathNotFound(t *testing.T) {
	cfg := config.AppConfig{
		AIClaudeCodeEnabled: true,
		AIClaudeCodePath:    "/nonexistent/path/claude",
	}

	_, err := ResolveProvider(cfg)
	if err == nil {
		t.Fatal("expected error for nonexistent path")
	}
}

func TestResolveProvider_EmptyPath(t *testing.T) {
	cfg := config.AppConfig{
		AIClaudeCodeEnabled: true,
		AIClaudeCodePath:    "",
	}

	_, err := ResolveProvider(cfg)
	if err == nil {
		t.Fatal("expected error for empty path")
	}
}

func TestResolveProvider_NotExecutable(t *testing.T) {
	tmp := filepath.Join(t.TempDir(), "claude")
	if err := os.WriteFile(tmp, []byte("not executable"), 0644); err != nil {
		t.Fatal(err)
	}

	cfg := config.AppConfig{
		AIClaudeCodeEnabled: true,
		AIClaudeCodePath:    tmp,
	}

	_, err := ResolveProvider(cfg)
	if err == nil {
		t.Fatal("expected error for non-executable file")
	}
}

func TestBuildCommand_Positional(t *testing.T) {
	// Claude Code and Codex pass the prompt as a positional argument.
	for _, p := range []Provider{
		&cliProvider{name: "Claude Code", path: "/usr/local/bin/claude"},
		&cliProvider{name: "ChatGPT Codex", path: "/usr/local/bin/codex"},
	} {
		cmd := p.BuildCommand("test prompt")
		if len(cmd) != 2 {
			t.Errorf("%s: expected 2 args, got %d", p.Name(), len(cmd))
			continue
		}
		if cmd[0] != p.ExecPath() {
			t.Errorf("%s: expected exec path %s, got %s", p.Name(), p.ExecPath(), cmd[0])
		}
		if cmd[1] != "test prompt" {
			t.Errorf("%s: expected prompt 'test prompt', got %s", p.Name(), cmd[1])
		}
	}
}

func TestBuildCommand_GeminiFlag(t *testing.T) {
	// Gemini CLI needs -i for interactive mode with an initial prompt.
	p := &cliProvider{name: "Gemini CLI", path: "/usr/local/bin/gemini", promptFlag: "-i"}
	cmd := p.BuildCommand("test prompt")
	if len(cmd) != 3 {
		t.Fatalf("Gemini: expected 3 args, got %d", len(cmd))
	}
	if cmd[0] != "/usr/local/bin/gemini" {
		t.Errorf("expected exec path, got %s", cmd[0])
	}
	if cmd[1] != "-i" {
		t.Errorf("expected -i flag, got %s", cmd[1])
	}
	if cmd[2] != "test prompt" {
		t.Errorf("expected prompt, got %s", cmd[2])
	}
}
