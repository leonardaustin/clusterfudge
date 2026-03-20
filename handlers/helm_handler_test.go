package handlers

import (
	"strings"
	"testing"
)

func TestNewHelmHandler(t *testing.T) {
	h := NewHelmHandler("/path/to/kubeconfig", "my-context")
	if h == nil {
		t.Fatal("expected non-nil handler")
	}
	if h.kubeconfigPath != "/path/to/kubeconfig" {
		t.Fatalf("expected kubeconfigPath %q, got %q", "/path/to/kubeconfig", h.kubeconfigPath)
	}
	if h.contextName != "my-context" {
		t.Fatalf("expected contextName %q, got %q", "my-context", h.contextName)
	}
}

func TestHelmHandler_GetRelease_EmptyName(t *testing.T) {
	h := NewHelmHandler("/tmp/kc", "ctx")
	_, err := h.GetRelease("", "default")
	if err == nil {
		t.Fatal("expected error for empty name")
	}
}

func TestHelmHandler_GetReleaseHistory_EmptyName(t *testing.T) {
	h := NewHelmHandler("/tmp/kc", "ctx")
	_, err := h.GetReleaseHistory("", "default")
	if err == nil {
		t.Fatal("expected error for empty name")
	}
}

func TestHelmHandler_InstallChart_Validation(t *testing.T) {
	h := NewHelmHandler("/tmp/kc", "ctx")

	tests := []struct {
		name      string
		relName   string
		namespace string
		chartPath string
		wantErr   string
	}{
		{"empty name", "", "ns", "/chart", "release name is required"},
		{"empty namespace", "rel", "", "/chart", "namespace is required"},
		{"empty chart", "rel", "ns", "", "chart path is required"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := h.InstallChart(tt.relName, tt.namespace, tt.chartPath, nil)
			if err == nil {
				t.Fatalf("expected error %q", tt.wantErr)
			}
			if err.Error() != tt.wantErr {
				t.Fatalf("expected error %q, got %q", tt.wantErr, err.Error())
			}
		})
	}
}

func TestHelmHandler_UpgradeChart_Validation(t *testing.T) {
	h := NewHelmHandler("/tmp/kc", "ctx")

	tests := []struct {
		name      string
		relName   string
		namespace string
		chartPath string
		wantErr   string
	}{
		{"empty name", "", "ns", "/chart", "release name is required"},
		{"empty namespace", "rel", "", "/chart", "namespace is required"},
		{"empty chart", "rel", "ns", "", "chart path is required"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := h.UpgradeChart(tt.relName, tt.namespace, tt.chartPath, nil)
			if err == nil {
				t.Fatalf("expected error %q", tt.wantErr)
			}
			if err.Error() != tt.wantErr {
				t.Fatalf("expected error %q, got %q", tt.wantErr, err.Error())
			}
		})
	}
}

func TestHelmHandler_RollbackRelease_Validation(t *testing.T) {
	h := NewHelmHandler("/tmp/kc", "ctx")

	err := h.RollbackRelease("", "ns", 1)
	if err == nil {
		t.Fatal("expected error for empty name")
	}

	err = h.RollbackRelease("rel", "", 1)
	if err == nil {
		t.Fatal("expected error for empty namespace")
	}
}

func TestHelmHandler_UninstallRelease_EmptyName(t *testing.T) {
	h := NewHelmHandler("/tmp/kc", "ctx")
	err := h.UninstallRelease("", "default")
	if err == nil {
		t.Fatal("expected error for empty name")
	}
}

func TestHelmHandler_AddChartRepo_Validation(t *testing.T) {
	h := NewHelmHandler("/tmp/kc", "ctx")

	tests := []struct {
		name    string
		repoName string
		repoURL  string
		wantErr  string
	}{
		{"empty name", "", "https://charts.example.com", "repository name is required"},
		{"empty URL", "myrepo", "", "repository URL is required"},
		{"invalid URL", "myrepo", "not-a-url", "invalid repository URL"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := h.AddChartRepo(tt.repoName, tt.repoURL)
			if err == nil {
				t.Fatalf("expected error containing %q", tt.wantErr)
			}
			if !strings.Contains(err.Error(), tt.wantErr) {
				t.Fatalf("expected error containing %q, got %q", tt.wantErr, err.Error())
			}
		})
	}
}

func TestHelmHandler_RemoveChartRepo_EmptyName(t *testing.T) {
	h := NewHelmHandler("/tmp/kc", "ctx")
	err := h.RemoveChartRepo("")
	if err == nil {
		t.Fatal("expected error for empty name")
	}
	if err.Error() != "repository name is required" {
		t.Fatalf("expected %q, got %q", "repository name is required", err.Error())
	}
}

func TestHelmHandler_SearchCharts_EmptyKeyword(t *testing.T) {
	h := NewHelmHandler("/tmp/kc", "ctx")
	results, err := h.SearchCharts("")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(results) != 0 {
		t.Fatalf("expected empty results for empty keyword, got %d", len(results))
	}
}

func TestHelmHandler_ListChartRepos_NoCluster(t *testing.T) {
	h := NewHelmHandler("", "")
	_, err := h.ListChartRepos()
	if err == nil {
		t.Fatal("expected error when no cluster configured")
	}
}
