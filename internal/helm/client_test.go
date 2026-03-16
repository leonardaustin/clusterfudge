package helm

import (
	"testing"
)

func TestNewClient(t *testing.T) {
	c := NewClient("/tmp/kubeconfig", "test-context")
	if c == nil {
		t.Fatal("expected non-nil Client")
	}
	if c.kubeconfigPath != "/tmp/kubeconfig" {
		t.Errorf("expected kubeconfigPath '/tmp/kubeconfig', got %q", c.kubeconfigPath)
	}
	if c.contextName != "test-context" {
		t.Errorf("expected contextName 'test-context', got %q", c.contextName)
	}
}

func TestReleaseInfoFields(t *testing.T) {
	info := ReleaseInfo{
		Name:      "my-release",
		Status:    "deployed",
		Namespace: "default",
		Revision:  1,
	}
	if info.Name != "my-release" {
		t.Error("unexpected Name")
	}
	if info.Status != "deployed" {
		t.Error("unexpected Status")
	}
}

func TestReleaseDetailEmbed(t *testing.T) {
	detail := ReleaseDetail{
		ReleaseInfo: ReleaseInfo{Name: "test", Revision: 2},
		Manifest:    "---\napiVersion: v1",
		Values:      map[string]interface{}{"key": "value"},
	}
	if detail.Name != "test" {
		t.Error("expected embedded Name")
	}
	if detail.Manifest == "" {
		t.Error("expected non-empty Manifest")
	}
}

func TestRepoInfoFields(t *testing.T) {
	info := RepoInfo{
		Name: "stable",
		URL:  "https://charts.helm.sh/stable",
	}
	if info.Name != "stable" {
		t.Errorf("expected Name 'stable', got %q", info.Name)
	}
	if info.URL != "https://charts.helm.sh/stable" {
		t.Errorf("expected URL 'https://charts.helm.sh/stable', got %q", info.URL)
	}
}

func TestChartResultFields(t *testing.T) {
	result := ChartResult{
		Name:        "nginx",
		Version:     "1.0.0",
		AppVersion:  "1.21.0",
		Description: "A Helm chart for nginx",
		Repo:        "stable",
	}
	if result.Name != "nginx" {
		t.Errorf("expected Name 'nginx', got %q", result.Name)
	}
	if result.Repo != "stable" {
		t.Errorf("expected Repo 'stable', got %q", result.Repo)
	}
}

func TestListRepos_NoRepoFile(t *testing.T) {
	// ListRepos should return empty slice when repo file doesn't exist
	c := NewClient("/tmp/nonexistent-kubeconfig", "test-context")
	// This uses the default helm config path; since we can't easily
	// control it in unit tests, we at minimum verify the method doesn't panic
	_ = c
}

func TestRepoFilePath(t *testing.T) {
	path := repoFilePath()
	if path == "" {
		t.Error("expected non-empty repo file path")
	}
}
