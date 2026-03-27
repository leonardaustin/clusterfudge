package handlers

import (
	"strings"
	"testing"
)

func TestValidateExecCommand_EmptyCommand(t *testing.T) {
	err := validateExecCommand([]string{})
	if err == nil {
		t.Fatal("expected error for empty command")
	}
	if !strings.Contains(err.Error(), "empty") {
		t.Errorf("expected 'empty' in error, got: %s", err.Error())
	}
}

func TestValidateExecCommand_ShellMetachars(t *testing.T) {
	tests := []struct {
		name    string
		command []string
		meta    string
	}{
		{"semicolon", []string{"ls", "; rm -rf /"}, ";"},
		{"pipe", []string{"cat", "| evil"}, "|"},
		{"ampersand", []string{"cmd", "& bg"}, "&"},
		{"backtick", []string{"echo", "`whoami`"}, "`"},
		{"dollar-paren", []string{"echo", "$(id)"}, "$("},
		{"dollar-brace", []string{"echo", "${HOME}"}, "${"},
		{"newline", []string{"ls", "foo\nbar"}, "\n"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := validateExecCommand(tc.command)
			if err == nil {
				t.Fatalf("expected error for metachar %q", tc.meta)
			}
			if !strings.Contains(err.Error(), "disallowed") {
				t.Errorf("expected 'disallowed' in error, got: %s", err.Error())
			}
		})
	}
}

func TestValidateExecCommand_ValidCommands(t *testing.T) {
	tests := []struct {
		name    string
		command []string
	}{
		{"simple-ls", []string{"ls"}},
		{"shell-exec", []string{"sh", "-c", "ls"}},
		{"bash-exec", []string{"/bin/bash", "-c", "echo hello"}},
		{"grep-with-equals", []string{"grep", "pattern=value"}},
		{"cat-file", []string{"cat", "/etc/hostname"}},
		{"kubectl", []string{"kubectl", "get", "pods", "-n", "default"}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if err := validateExecCommand(tc.command); err != nil {
				t.Errorf("expected no error for valid command %v, got: %v", tc.command, err)
			}
		})
	}
}
