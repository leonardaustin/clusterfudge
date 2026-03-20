package handlers

import (
	"strings"
	"testing"
)

func TestValidateChartPath_PathTraversal(t *testing.T) {
	tests := []struct {
		name string
		path string
	}{
		{"parent-dir", "../etc/passwd"},
		{"nested-traversal", "charts/../../etc/passwd"},
		{"mid-traversal", "foo/../../../bar"},
		{"double-dot-only", ".."},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := validateChartPath(tc.path)
			if err == nil {
				t.Fatalf("expected error for path traversal %q", tc.path)
			}
			if !strings.Contains(err.Error(), "traversal") {
				t.Errorf("expected 'traversal' in error, got: %s", err.Error())
			}
		})
	}
}

func TestValidateChartPath_AbsolutePaths(t *testing.T) {
	tests := []struct {
		name string
		path string
	}{
		{"etc-passwd", "/etc/passwd"},
		{"root-chart", "/opt/charts/mychart"},
		{"usr-share", "/usr/share/helm/charts"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := validateChartPath(tc.path)
			if err == nil {
				t.Fatalf("expected error for absolute path %q", tc.path)
			}
			if !strings.Contains(err.Error(), "absolute") {
				t.Errorf("expected 'absolute' in error, got: %s", err.Error())
			}
		})
	}
}

func TestValidateChartPath_ValidPaths(t *testing.T) {
	tests := []struct {
		name string
		path string
	}{
		{"simple-name", "nginx"},
		{"repo-chart", "bitnami/nginx"},
		{"relative-path", "./charts/mychart"},
		{"nested-chart", "charts/stable/nginx"},
		{"oci-style", "oci://registry/chart"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if err := validateChartPath(tc.path); err != nil {
				t.Errorf("expected no error for valid path %q, got: %v", tc.path, err)
			}
		})
	}
}
