package cluster

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestKubeconfigPaths_EnvVar(t *testing.T) {
	dir := t.TempDir()
	path1 := filepath.Join(dir, "config1")
	path2 := filepath.Join(dir, "config2")
	t.Setenv("KUBECONFIG", path1+string(os.PathListSeparator)+path2)

	paths := kubeconfigPaths()
	if len(paths) != 2 {
		t.Fatalf("expected 2 paths, got %d: %v", len(paths), paths)
	}
	if paths[0] != path1 || paths[1] != path2 {
		t.Errorf("unexpected paths: %v", paths)
	}
}

func TestKubeconfigPaths_EnvVarWithWhitespace(t *testing.T) {
	dir := t.TempDir()
	path1 := filepath.Join(dir, "config1")
	t.Setenv("KUBECONFIG", "  "+path1+"  "+string(os.PathListSeparator)+"  ")

	paths := kubeconfigPaths()
	if len(paths) != 1 {
		t.Fatalf("expected 1 path after trimming whitespace, got %d: %v", len(paths), paths)
	}
	if paths[0] != path1 {
		t.Errorf("expected %q, got %q", path1, paths[0])
	}
}

func TestKubeconfigPaths_EnvVarEmpty(t *testing.T) {
	t.Setenv("KUBECONFIG", "")

	paths := kubeconfigPaths()
	// Falls back to ~/.kube/config
	if len(paths) == 0 {
		// If HOME is not set, this is acceptable
		return
	}
	home, err := os.UserHomeDir()
	if err != nil {
		// UserHomeDir() error returns empty slice
		if len(paths) != 0 {
			t.Errorf("expected 0 paths when UserHomeDir fails, got %d", len(paths))
		}
		return
	}
	expected := filepath.Join(home, ".kube", "config")
	if paths[0] != expected {
		t.Errorf("expected %q, got %q", expected, paths[0])
	}
}

func TestKubeconfigPaths_AllBlank(t *testing.T) {
	t.Setenv("KUBECONFIG", "   "+string(os.PathListSeparator)+"   ")
	paths := kubeconfigPaths()
	// All-whitespace entries should be filtered, so falls back to home dir
	if len(paths) > 1 {
		t.Errorf("expected at most 1 path (home fallback), got %d: %v", len(paths), paths)
	}
}

func TestNewKubeconfigLoader_DefaultPaths(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config")
	t.Setenv("KUBECONFIG", path)

	loader := NewKubeconfigLoader()
	if len(loader.Paths()) != 1 || loader.Paths()[0] != path {
		t.Errorf("expected [%s], got %v", path, loader.Paths())
	}
}

func TestKubeconfigLoader_AddPath_Dedup(t *testing.T) {
	loader := NewKubeconfigLoaderFromPaths([]string{"/path/a"})

	loader.AddPath("/path/b")
	if len(loader.Paths()) != 2 {
		t.Fatalf("expected 2 paths, got %d", len(loader.Paths()))
	}

	// Adding a duplicate should be a no-op.
	loader.AddPath("/path/b")
	if len(loader.Paths()) != 2 {
		t.Fatalf("expected 2 paths after duplicate add, got %d", len(loader.Paths()))
	}
}

func TestKubeconfigLoader_SetClientOptions(t *testing.T) {
	loader := NewKubeconfigLoaderFromPaths([]string{})
	loader.SetClientOptions(30*time.Second, 100, 200)

	if loader.timeout != 30*time.Second {
		t.Errorf("expected timeout 30s, got %v", loader.timeout)
	}
	if loader.qps != 100 {
		t.Errorf("expected qps 100, got %f", loader.qps)
	}
	if loader.burst != 200 {
		t.Errorf("expected burst 200, got %d", loader.burst)
	}
}

func TestKubeconfigLoader_RestConfigForContext_Defaults(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config")
	if err := os.WriteFile(path, []byte(validKubeconfig), 0600); err != nil {
		t.Fatal(err)
	}

	loader := NewKubeconfigLoaderFromPaths([]string{path})
	cfg, err := loader.RestConfigForContext("test")
	if err != nil {
		t.Fatalf("RestConfigForContext: %v", err)
	}

	// Verify defaults: 15s timeout, 50 QPS, 100 burst
	if cfg.Timeout != 15*time.Second {
		t.Errorf("expected default timeout 15s, got %v", cfg.Timeout)
	}
	if cfg.QPS != 50 {
		t.Errorf("expected default QPS 50, got %f", cfg.QPS)
	}
	if cfg.Burst != 100 {
		t.Errorf("expected default burst 100, got %d", cfg.Burst)
	}
}

func TestKubeconfigLoader_RestConfigForContext_CustomValues(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config")
	if err := os.WriteFile(path, []byte(validKubeconfig), 0600); err != nil {
		t.Fatal(err)
	}

	loader := NewKubeconfigLoaderFromPaths([]string{path})
	loader.SetClientOptions(45*time.Second, 200, 500)

	cfg, err := loader.RestConfigForContext("test")
	if err != nil {
		t.Fatalf("RestConfigForContext: %v", err)
	}

	if cfg.Timeout != 45*time.Second {
		t.Errorf("expected custom timeout 45s, got %v", cfg.Timeout)
	}
	if cfg.QPS != 200 {
		t.Errorf("expected custom QPS 200, got %f", cfg.QPS)
	}
	if cfg.Burst != 500 {
		t.Errorf("expected custom burst 500, got %d", cfg.Burst)
	}
}

func TestKubeconfigLoader_RestConfigForContext_InvalidContext(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config")
	if err := os.WriteFile(path, []byte(validKubeconfig), 0600); err != nil {
		t.Fatal(err)
	}

	loader := NewKubeconfigLoaderFromPaths([]string{path})
	_, err := loader.RestConfigForContext("nonexistent")
	if err == nil {
		t.Fatal("expected error for nonexistent context")
	}
}

func TestKubeconfigLoader_Load_MultipleFiles(t *testing.T) {
	dir := t.TempDir()

	kubeconfig1 := `apiVersion: v1
kind: Config
clusters:
- name: cluster-a
  cluster:
    server: https://a.example.com:6443
contexts:
- name: ctx-a
  context:
    cluster: cluster-a
    user: user-a
users:
- name: user-a
  user:
    token: fake-a
current-context: ctx-a
`
	kubeconfig2 := `apiVersion: v1
kind: Config
clusters:
- name: cluster-b
  cluster:
    server: https://b.example.com:6443
contexts:
- name: ctx-b
  context:
    cluster: cluster-b
    user: user-b
users:
- name: user-b
  user:
    token: fake-b
`

	path1 := filepath.Join(dir, "config1")
	path2 := filepath.Join(dir, "config2")
	if err := os.WriteFile(path1, []byte(kubeconfig1), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path2, []byte(kubeconfig2), 0600); err != nil {
		t.Fatal(err)
	}

	loader := NewKubeconfigLoaderFromPaths([]string{path1, path2})
	cfg, err := loader.Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	// Should have both contexts after merge.
	if len(cfg.Contexts) != 2 {
		t.Errorf("expected 2 contexts, got %d", len(cfg.Contexts))
	}
	if _, ok := cfg.Contexts["ctx-a"]; !ok {
		t.Error("missing ctx-a")
	}
	if _, ok := cfg.Contexts["ctx-b"]; !ok {
		t.Error("missing ctx-b")
	}
}

func TestKubeconfigLoader_Load_NonexistentPath(t *testing.T) {
	loader := NewKubeconfigLoaderFromPaths([]string{"/no/such/path"})
	_, err := loader.Load()
	if err == nil {
		t.Fatal("expected error for nonexistent path")
	}
}

func TestKubeconfigLoader_ValidateContext_MissingContext(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config")
	if err := os.WriteFile(path, []byte(validKubeconfig), 0600); err != nil {
		t.Fatal(err)
	}

	loader := NewKubeconfigLoaderFromPaths([]string{path})
	err := loader.ValidateContext("nonexistent")
	if err == nil {
		t.Fatal("expected error for missing context")
	}
}

func TestKubeconfigLoader_ValidateContext_ValidContext(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config")
	if err := os.WriteFile(path, []byte(validKubeconfig), 0600); err != nil {
		t.Fatal(err)
	}

	loader := NewKubeconfigLoaderFromPaths([]string{path})
	err := loader.ValidateContext("test")
	if err != nil {
		t.Fatalf("ValidateContext should succeed for valid context: %v", err)
	}
}

func TestKubeconfigLoader_ListContexts_Detailed(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config")
	if err := os.WriteFile(path, []byte(validKubeconfig), 0600); err != nil {
		t.Fatal(err)
	}

	loader := NewKubeconfigLoaderFromPaths([]string{path})
	contexts, err := loader.ListContexts()
	if err != nil {
		t.Fatalf("ListContexts: %v", err)
	}
	if len(contexts) != 1 {
		t.Fatalf("expected 1 context, got %d", len(contexts))
	}
	if contexts[0].Name != "test" {
		t.Errorf("expected context name 'test', got %q", contexts[0].Name)
	}
	if contexts[0].Server != "https://127.0.0.1:6443" {
		t.Errorf("expected server 'https://127.0.0.1:6443', got %q", contexts[0].Server)
	}
	if !contexts[0].IsCurrent {
		t.Error("expected context to be current")
	}
	if contexts[0].AuthType != "token" {
		t.Errorf("expected authType 'token', got %q", contexts[0].AuthType)
	}
}
