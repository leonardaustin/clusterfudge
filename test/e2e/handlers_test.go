//go:build e2e

package e2e

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"clusterfudge/handlers"
	"clusterfudge/internal/cluster"
	"clusterfudge/internal/config"
	"clusterfudge/internal/resource"
)

// ---------------------------------------------------------------------------
// ClusterHandler tests
// ---------------------------------------------------------------------------

func TestHandlerCluster_ConnectDisconnect(t *testing.T) {
	mgr := cluster.NewManager()
	h := handlers.NewClusterHandler(mgr)

	ctxName := newContextName(t)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := h.Connect(ctx, ctxName); err != nil {
		t.Fatalf("Connect: %v", err)
	}

	conn := h.ActiveConnection()
	if conn == nil {
		t.Fatal("expected non-nil ActiveConnection after Connect")
	}
	if conn.Version == "" {
		t.Error("expected non-empty version in connection info")
	}

	h.Disconnect()

	if conn := h.ActiveConnection(); conn != nil {
		t.Errorf("expected nil ActiveConnection after Disconnect, got %+v", conn)
	}
}

func TestHandlerCluster_ListContexts(t *testing.T) {
	mgr := cluster.NewManager()
	h := handlers.NewClusterHandler(mgr)

	contexts, err := h.ListContexts()
	if err != nil {
		t.Fatalf("ListContexts: %v", err)
	}
	if len(contexts) == 0 {
		t.Fatal("expected at least one context")
	}
}

// ---------------------------------------------------------------------------
// ResourceHandler tests
// ---------------------------------------------------------------------------

func TestHandlerResource_ListResources(t *testing.T) {
	mgr := newClusterManager(t)
	h := handlers.NewResourceHandler(resource.NewService(), mgr)

	podName := randName("handler-list")
	createPod(t, testEnv.namespace, podName, nginxPodSpec())
	t.Cleanup(func() { deletePod(t, testEnv.namespace, podName) })

	items, err := h.ListResources(context.Background(), "", "v1", "pods", testEnv.namespace)
	if err != nil {
		t.Fatalf("ListResources: %v", err)
	}

	found := false
	for _, item := range items {
		if item.Name == podName {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected to find pod %q in list of %d items", podName, len(items))
	}
}

func TestHandlerResource_GetResource(t *testing.T) {
	mgr := newClusterManager(t)
	h := handlers.NewResourceHandler(resource.NewService(), mgr)

	cmName := randName("handler-get")
	createConfigMap(t, testEnv.namespace, cmName, map[string]string{"key": "value"})
	t.Cleanup(func() { deleteConfigMap(t, testEnv.namespace, cmName) })

	item, err := h.GetResource(context.Background(), "", "v1", "configmaps", testEnv.namespace, cmName)
	if err != nil {
		t.Fatalf("GetResource: %v", err)
	}
	if item.Name != cmName {
		t.Errorf("expected name %q, got %q", cmName, item.Name)
	}
}

func TestHandlerResource_ApplyAndDelete(t *testing.T) {
	mgr := newClusterManager(t)
	h := handlers.NewResourceHandler(resource.NewService(), mgr)

	cmName := randName("handler-apply")
	data := []byte(fmt.Sprintf(`{
		"apiVersion": "v1",
		"kind": "ConfigMap",
		"metadata": {
			"name": %q,
			"namespace": %q
		},
		"data": {"applied": "true"}
	}`, cmName, testEnv.namespace))

	if err := h.ApplyResource(context.Background(), "", "v1", "configmaps", testEnv.namespace, data); err != nil {
		t.Fatalf("ApplyResource: %v", err)
	}
	t.Cleanup(func() { deleteConfigMap(t, testEnv.namespace, cmName) })

	// Verify it exists.
	item, err := h.GetResource(context.Background(), "", "v1", "configmaps", testEnv.namespace, cmName)
	if err != nil {
		t.Fatalf("GetResource after apply: %v", err)
	}
	if item.Name != cmName {
		t.Errorf("expected name %q, got %q", cmName, item.Name)
	}

	// Delete.
	if err := h.DeleteResource(context.Background(), "", "v1", "configmaps", testEnv.namespace, cmName); err != nil {
		t.Fatalf("DeleteResource: %v", err)
	}

	// Verify gone.
	_, err = h.GetResource(context.Background(), "", "v1", "configmaps", testEnv.namespace, cmName)
	if err == nil {
		t.Fatal("expected error getting deleted resource")
	}
}

func TestHandlerResource_DisconnectedError(t *testing.T) {
	mgr := cluster.NewManager() // not connected
	h := handlers.NewResourceHandler(resource.NewService(), mgr)

	_, err := h.ListResources(context.Background(), "", "v1", "pods", "default")
	if err == nil {
		t.Fatal("expected error when disconnected")
	}
	errMsg := err.Error()
	if !strings.Contains(errMsg, "not connected") && !strings.Contains(errMsg, "no active cluster") {
		t.Errorf("expected error about disconnected state, got %q", errMsg)
	}
}

// ---------------------------------------------------------------------------
// ConfigHandler tests
// ---------------------------------------------------------------------------

func TestHandlerConfig_GetUpdateConfig(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	store, err := config.NewStoreWithPath(path)
	if err != nil {
		t.Fatalf("NewStoreWithPath: %v", err)
	}
	h := handlers.NewConfigHandler(store)

	// Defaults.
	cfg := h.GetConfig()
	if cfg.Theme != "dark" {
		t.Errorf("expected default theme dark, got %q", cfg.Theme)
	}

	// Update.
	if err := h.UpdateConfig(map[string]interface{}{
		"theme":            "light",
		"fontSize":         16,
		"defaultNamespace": "kube-system",
	}); err != nil {
		t.Fatalf("UpdateConfig: %v", err)
	}

	cfg = h.GetConfig()
	if cfg.Theme != "light" || cfg.FontSize != 16 || cfg.DefaultNamespace != "kube-system" {
		t.Errorf("unexpected config after update: theme=%q fontSize=%d ns=%q", cfg.Theme, cfg.FontSize, cfg.DefaultNamespace)
	}
}

func TestHandlerConfig_ResetConfig(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	store, err := config.NewStoreWithPath(path)
	if err != nil {
		t.Fatalf("NewStoreWithPath: %v", err)
	}
	h := handlers.NewConfigHandler(store)

	h.UpdateConfig(map[string]interface{}{"theme": "light", "debugMode": true})

	if err := h.ResetConfig(); err != nil {
		t.Fatalf("ResetConfig: %v", err)
	}

	cfg := h.GetConfig()
	if cfg.Theme != "dark" || cfg.DebugMode {
		t.Errorf("expected defaults after reset, got theme=%q debugMode=%v", cfg.Theme, cfg.DebugMode)
	}
}

func TestHandlerConfig_ExportImport(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	store, err := config.NewStoreWithPath(path)
	if err != nil {
		t.Fatalf("NewStoreWithPath: %v", err)
	}
	h := handlers.NewConfigHandler(store)

	h.UpdateConfig(map[string]interface{}{"theme": "light", "fontSize": 18})

	exported, err := h.ExportConfig()
	if err != nil {
		t.Fatalf("ExportConfig: %v", err)
	}

	h.ResetConfig()

	if err := h.ImportConfig(exported); err != nil {
		t.Fatalf("ImportConfig: %v", err)
	}

	cfg := h.GetConfig()
	if cfg.Theme != "light" || cfg.FontSize != 18 {
		t.Errorf("round-trip failed: theme=%q fontSize=%d", cfg.Theme, cfg.FontSize)
	}
}

// ---------------------------------------------------------------------------
// HelmHandler tests
// ---------------------------------------------------------------------------

func TestHandlerHelm_ListReleases(t *testing.T) {
	ctxName := newContextName(t)
	h := handlers.NewHelmHandler(testEnv.kubeconfig, ctxName)

	releases, err := h.ListReleases(testEnv.namespace)
	if err != nil {
		t.Fatalf("ListReleases: %v", err)
	}
	// Empty list is expected in a fresh namespace.
	_ = releases
}
