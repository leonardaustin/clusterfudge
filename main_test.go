package main

import "testing"

func TestShellPathCmd(t *testing.T) {
	tests := []struct {
		shell string
		want  string
	}{
		{"/bin/bash", "echo __PATH__=$PATH"},
		{"/bin/zsh", "echo __PATH__=$PATH"},
		{"/usr/bin/fish", "echo __PATH__=(string join : $PATH)"},
		{"/opt/homebrew/bin/fish", "echo __PATH__=(string join : $PATH)"},
		{"/usr/local/bin/fish", "echo __PATH__=(string join : $PATH)"},
		{"fish", "echo __PATH__=(string join : $PATH)"},
		{"/bin/sh", "echo __PATH__=$PATH"},
		{"", "echo __PATH__=$PATH"},
	}
	for _, tt := range tests {
		t.Run(tt.shell, func(t *testing.T) {
			if got := shellPathCmd(tt.shell); got != tt.want {
				t.Errorf("shellPathCmd(%q) = %q, want %q", tt.shell, got, tt.want)
			}
		})
	}
}
