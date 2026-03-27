//go:build e2e

package e2e

import (
	"context"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/tools/clientcmd"

	"clusterfudge/internal/cluster"
	"clusterfudge/internal/k8s"
)

// TC-CONN-001: Connect to k3s cluster via kubeconfig
func TestConnect_ValidKubeconfig(t *testing.T) {
	mgr := cluster.NewManager()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	contextName := newContextName(t)
	err := mgr.Connect(ctx, contextName)
	if err != nil {
		t.Fatalf("Connect failed: %v", err)
	}

	client, err := mgr.ActiveClient()
	if err != nil {
		t.Fatalf("ActiveClient failed after connect: %v", err)
	}
	if client == nil {
		t.Fatal("expected non-nil ClientSet")
	}

	// Verify the client is functional by making a real API call.
	ns, err := client.Typed.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
	if err != nil {
		t.Fatalf("list namespaces via connected client: %v", err)
	}
	if len(ns.Items) == 0 {
		t.Error("expected at least one namespace, got 0")
	}
}

// TC-CONN-002: Verify cluster version is returned on connect
func TestConnect_VersionReturned(t *testing.T) {
	mgr := cluster.NewManager()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	contextName := newContextName(t)
	if err := mgr.Connect(ctx, contextName); err != nil {
		t.Fatalf("Connect: %v", err)
	}

	conn := mgr.ActiveConnection()
	if conn == nil {
		t.Fatal("expected active connection")
	}
	if conn.Version == "" {
		t.Error("expected non-empty Version after connect")
	}
	if !strings.HasPrefix(conn.Version, "v") {
		t.Errorf("unexpected version format %q (expected to start with 'v')", conn.Version)
	}
}

// TC-CONN-003: Verify namespace list is populated after connect
func TestConnect_NamespacesPopulated(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	ns, err := testEnv.typed.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
	if err != nil {
		t.Fatalf("list namespaces: %v", err)
	}

	names := make(map[string]bool)
	for _, n := range ns.Items {
		names[n.Name] = true
	}

	for _, required := range []string{"default", "kube-system", testEnv.namespace} {
		if !names[required] {
			t.Errorf("namespace %q not found in cluster (found: %v)", required, names)
		}
	}
}

// TC-CONN-004: Handle invalid kubeconfig — bad file path
func TestConnect_BadKubeconfigPath(t *testing.T) {
	loader := cluster.NewKubeconfigLoaderFromPaths([]string{"/nonexistent/path/kubeconfig"})
	_, err := loader.Load()
	if err == nil {
		t.Fatal("expected error loading non-existent kubeconfig, got nil")
	}
}

// TC-CONN-005: Handle invalid kubeconfig — malformed YAML
func TestConnect_MalformedKubeconfig(t *testing.T) {
	f, err := os.CreateTemp("", "kubeconfig-*.yaml")
	if err != nil {
		t.Fatalf("create temp file: %v", err)
	}
	defer os.Remove(f.Name())

	if _, err := f.WriteString("{not: valid: yaml: ::}"); err != nil {
		t.Fatalf("write temp file: %v", err)
	}
	f.Close()

	loader := cluster.NewKubeconfigLoaderFromPaths([]string{f.Name()})
	_, err = loader.Load()
	if err == nil {
		t.Fatal("expected error loading malformed kubeconfig, got nil")
	}
}

// TC-CONN-006: Handle unreachable cluster — wrong server URL
func TestConnect_UnreachableCluster(t *testing.T) {
	// Build a kubeconfig pointing to an unreachable address
	f, err := os.CreateTemp("", "kubeconfig-unreachable-*.yaml")
	if err != nil {
		t.Fatalf("create temp file: %v", err)
	}
	defer os.Remove(f.Name())

	kubeconfigData := `
apiVersion: v1
kind: Config
clusters:
- name: unreachable
  cluster:
    server: https://192.0.2.1:6443
    insecure-skip-tls-verify: true
contexts:
- name: unreachable
  context:
    cluster: unreachable
    user: test-user
users:
- name: test-user
  user:
    token: fake-token
current-context: unreachable
`
	if _, err := f.WriteString(kubeconfigData); err != nil {
		t.Fatalf("write temp kubeconfig: %v", err)
	}
	f.Close()

	cfg, err := clientcmd.BuildConfigFromFlags("", f.Name())
	if err != nil {
		t.Fatalf("build config: %v", err)
	}
	cfg.Timeout = 5 * time.Second

	cs, err := k8s.NewClientSet(cfg)
	if err != nil {
		t.Fatalf("create client set: %v", err)
	}

	_, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()

	_, err = cs.Typed.Discovery().ServerVersion()
	if err == nil {
		t.Fatal("expected error connecting to unreachable cluster, got nil")
	}
}

// TC-CONN-007: Handle expired/invalid credentials
func TestConnect_InvalidCredentials(t *testing.T) {
	f, err := os.CreateTemp("", "kubeconfig-badcreds-*.yaml")
	if err != nil {
		t.Fatalf("create temp file: %v", err)
	}
	defer os.Remove(f.Name())

	// Read the real cluster address from the existing kubeconfig but replace the token
	realCfg, err := clientcmd.BuildConfigFromFlags("", testEnv.kubeconfig)
	if err != nil {
		t.Fatalf("load real kubeconfig: %v", err)
	}

	kubeconfigData := fmt.Sprintf(`
apiVersion: v1
kind: Config
clusters:
- name: test
  cluster:
    server: %s
    insecure-skip-tls-verify: true
contexts:
- name: test
  context:
    cluster: test
    user: test-user
users:
- name: test-user
  user:
    token: invalid-token-abc123
current-context: test
`, realCfg.Host)

	if _, err := f.WriteString(kubeconfigData); err != nil {
		t.Fatalf("write temp kubeconfig: %v", err)
	}
	f.Close()

	cfg, err := clientcmd.BuildConfigFromFlags("", f.Name())
	if err != nil {
		t.Fatalf("build config: %v", err)
	}
	cfg.Timeout = 10 * time.Second

	cs, err := k8s.NewClientSet(cfg)
	if err != nil {
		t.Fatalf("create client set: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	_, err = cs.Typed.CoreV1().Pods("default").List(ctx, metav1.ListOptions{})
	if err == nil {
		t.Fatal("expected error with invalid token, got nil")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "unauthorized") &&
		!strings.Contains(err.Error(), "401") {
		t.Errorf("expected 401/unauthorized error, got: %v", err)
	}
}

// TC-CONN-008: Reconnection after disconnect
func TestConnect_ReconnectAfterDisconnect(t *testing.T) {
	mgr := cluster.NewManager()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	contextName := newContextName(t)

	// First connect
	if err := mgr.Connect(ctx, contextName); err != nil {
		t.Fatalf("first connect: %v", err)
	}

	// Disconnect
	mgr.Disconnect()

	if _, err := mgr.ActiveClient(); err == nil {
		t.Error("expected error from ActiveClient after disconnect")
	}

	// Reconnect
	ctx2, cancel2 := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel2()
	if err := mgr.Connect(ctx2, contextName); err != nil {
		t.Fatalf("reconnect: %v", err)
	}

	client, err := mgr.ActiveClient()
	if err != nil {
		t.Fatalf("ActiveClient after reconnect: %v", err)
	}

	// Verify client is usable
	_, err = client.Typed.CoreV1().Namespaces().List(ctx2, metav1.ListOptions{})
	if err != nil {
		t.Fatalf("list namespaces after reconnect: %v", err)
	}
}

// TC-CONN-010: Disconnect invalidates active client
func TestConnect_DisconnectInvalidatesClient(t *testing.T) {
	mgr := cluster.NewManager()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := mgr.Connect(ctx, newContextName(t)); err != nil {
		t.Fatalf("connect: %v", err)
	}

	// Start a watch to create a goroutine
	client, _ := mgr.ActiveClient()
	watchCtx, watchCancel := context.WithCancel(ctx)
	_, err := testEnv.resourceSvc.Watch(watchCtx, client.Dynamic, podsQuery(testEnv.namespace))
	if err != nil {
		t.Fatalf("start watch: %v", err)
	}

	// Cancel the watch context and disconnect
	watchCancel()
	mgr.Disconnect()

	// Verify ActiveClient returns error
	if _, err := mgr.ActiveClient(); err == nil {
		t.Error("expected error from ActiveClient after disconnect")
	}
}
