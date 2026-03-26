//go:build e2e

package e2e

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	k8serrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/clientcmd"

	"clusterfudge/internal/cluster"
	"clusterfudge/internal/k8s"
	"clusterfudge/internal/resource"
)

// testEnv holds shared state for the e2e suite.
var testEnv struct {
	kubeconfig  string
	namespace   string
	namespaceB  string
	clientSet   *k8s.ClientSet
	typed       kubernetes.Interface
	dynamic     dynamic.Interface
	resourceSvc *resource.Service
}

// TestMain sets up the e2e environment, runs the tests, and tears down.
func TestMain(m *testing.M) {
	if err := setup(); err != nil {
		fmt.Fprintf(os.Stderr, "e2e setup failed: %v\n", err)
		os.Exit(1)
	}

	code := m.Run()

	teardown()
	os.Exit(code)
}

func setup() error {
	// Resolve kubeconfig path
	testEnv.kubeconfig = os.Getenv("E2E_KUBECONFIG")
	if testEnv.kubeconfig == "" {
		testEnv.kubeconfig = os.Getenv("KUBECONFIG")
	}
	if testEnv.kubeconfig == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return fmt.Errorf("determine home directory for default kubeconfig: %w", err)
		}
		testEnv.kubeconfig = home + "/.kube/config"
	}

	// Ensure KUBECONFIG env var is set so that cluster.Manager can find it.
	os.Setenv("KUBECONFIG", testEnv.kubeconfig)

	// Resolve namespace
	testEnv.namespace = os.Getenv("E2E_NAMESPACE")
	if testEnv.namespace == "" {
		testEnv.namespace = "clusterfudge-e2e"
	}
	testEnv.namespaceB = os.Getenv("E2E_NAMESPACE_B")
	if testEnv.namespaceB == "" {
		testEnv.namespaceB = "clusterfudge-e2e-b"
	}

	// Build rest.Config
	cfg, err := clientcmd.BuildConfigFromFlags("", testEnv.kubeconfig)
	if err != nil {
		return fmt.Errorf("build rest.Config: %w", err)
	}
	cfg.Timeout = 30 * time.Second

	// Create ClientSet
	cs, err := k8s.NewClientSet(cfg)
	if err != nil {
		return fmt.Errorf("create ClientSet: %w", err)
	}
	testEnv.clientSet = cs
	testEnv.typed = cs.Typed
	testEnv.dynamic = cs.Dynamic
	testEnv.resourceSvc = resource.NewService()

	// Ensure test namespaces exist
	for _, ns := range []string{testEnv.namespace, testEnv.namespaceB} {
		if err := ensureNamespace(ns); err != nil {
			return fmt.Errorf("ensure namespace %q: %w", ns, err)
		}
	}

	fmt.Printf("e2e setup complete: kubeconfig=%s namespace=%s\n", testEnv.kubeconfig, testEnv.namespace)
	return nil
}

func teardown() {
	for _, ns := range []string{testEnv.namespace, testEnv.namespaceB} {
		ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
		err := testEnv.typed.CoreV1().Namespaces().Delete(ctx, ns, metav1.DeleteOptions{})
		cancel()
		if err != nil && !k8serrors.IsNotFound(err) {
			fmt.Fprintf(os.Stderr, "WARNING: teardown failed to delete namespace %q: %v\n", ns, err)
		}
	}
	fmt.Println("e2e teardown complete")
}

// ensureNamespace creates the namespace if it doesn't already exist.
func ensureNamespace(name string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	_, err := testEnv.typed.CoreV1().Namespaces().Get(ctx, name, metav1.GetOptions{})
	if err == nil {
		return waitForDefaultServiceAccount(ctx, name)
	}
	if !k8serrors.IsNotFound(err) {
		return fmt.Errorf("check namespace %q existence: %w", name, err)
	}

	ns := namespaceFixture(name)
	_, err = testEnv.typed.CoreV1().Namespaces().Create(ctx, ns, metav1.CreateOptions{})
	if err != nil {
		return err
	}
	return waitForDefaultServiceAccount(ctx, name)
}

func waitForDefaultServiceAccount(ctx context.Context, namespace string) error {
	for {
		_, err := testEnv.typed.CoreV1().ServiceAccounts(namespace).Get(ctx, "default", metav1.GetOptions{})
		if err == nil {
			return nil
		}
		select {
		case <-ctx.Done():
			return fmt.Errorf("timed out waiting for default service account in %q", namespace)
		case <-time.After(500 * time.Millisecond):
		}
	}
}

// ---------------------------------------------------------------------------
// k3s container helpers (used for local development, not CI)
// ---------------------------------------------------------------------------

// startK3sContainer starts a k3s container via podman for local e2e runs.
// Returns a cleanup function.
func startK3sContainer(t *testing.T) (kubeconfigPath string, cleanup func()) {
	t.Helper()

	containerName := "clusterfudge-e2e-k3s"

	// Check if already running
	out, err := exec.Command("podman", "inspect", containerName, "--format", "{{.State.Status}}").Output()
	_ = err // inspect fails if container doesn't exist, which is expected
	if strings.TrimSpace(string(out)) != "running" {
		cmd := exec.Command("podman", "run", "-d",
			"--name", containerName,
			"--privileged",
			"-p", "16443:6443",
			"rancher/k3s:v1.28.5-k3s1", "server",
			"--disable", "traefik",
			"--disable", "metrics-server",
		)
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("start k3s container: %v\n%s", err, out)
		}
	}

	// Wait for k3s to be ready (up to 90 seconds)
	k3sReady := false
	readyDeadline := time.Now().Add(90 * time.Second)
	for time.Now().Before(readyDeadline) {
		readyOut, _ := exec.Command(
			"podman", "exec", containerName,
			"kubectl", "get", "nodes",
		).Output()
		if strings.Contains(string(readyOut), " Ready") {
			k3sReady = true
			break
		}
		time.Sleep(2 * time.Second)
	}
	if !k3sReady {
		t.Fatalf("k3s did not become ready within 90 seconds")
	}

	// Extract kubeconfig
	kubeconfigPath = t.TempDir() + "/k3s.yaml"
	raw, err := exec.Command("podman", "exec", containerName, "cat", "/etc/rancher/k3s/k3s.yaml").Output()
	if err != nil {
		t.Fatalf("get k3s kubeconfig: %v", err)
	}

	// Replace internal address with 127.0.0.1 since we forwarded port 16443→6443
	fixed := strings.ReplaceAll(string(raw), "https://127.0.0.1:6443", "https://127.0.0.1:16443")
	if err := os.WriteFile(kubeconfigPath, []byte(fixed), 0600); err != nil {
		t.Fatalf("write kubeconfig: %v", err)
	}

	cleanup = func() {
		if err := exec.Command("podman", "stop", containerName).Run(); err != nil {
			fmt.Fprintf(os.Stderr, "WARNING: podman stop %s failed: %v\n", containerName, err)
		}
		if err := exec.Command("podman", "rm", containerName).Run(); err != nil {
			fmt.Fprintf(os.Stderr, "WARNING: podman rm %s failed: %v\n", containerName, err)
		}
	}
	return kubeconfigPath, cleanup
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

// applyFixture applies a YAML fixture file using kubectl.
func applyFixture(t *testing.T, fixturePath string) {
	t.Helper()
	cmd := exec.Command("kubectl",
		"--kubeconfig", testEnv.kubeconfig,
		"apply", "-f", fixturePath,
	)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("apply fixture %s: %v\n%s", fixturePath, err, out)
	}
}

// deleteFixture deletes resources defined in a fixture file.
func deleteFixture(t *testing.T, fixturePath string) {
	t.Helper()
	cmd := exec.Command("kubectl",
		"--kubeconfig", testEnv.kubeconfig,
		"delete", "-f", fixturePath,
		"--ignore-not-found",
	)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Logf("WARNING: cleanup of fixture %s failed: %v\n%s", fixturePath, err, out)
	}
}

// waitForPodRunning waits up to timeout for the named pod to be Running.
func waitForPodRunning(t *testing.T, namespace, name string, timeout time.Duration) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		pod, err := testEnv.typed.CoreV1().Pods(namespace).Get(ctx, name, metav1.GetOptions{})
		cancel()
		if err == nil && string(pod.Status.Phase) == "Running" {
			allReady := true
			for _, cs := range pod.Status.ContainerStatuses {
				if !cs.Ready {
					allReady = false
					break
				}
			}
			if allReady {
				return
			}
		}
		time.Sleep(2 * time.Second)
	}
	t.Fatalf("pod %s/%s did not become Running within %v", namespace, name, timeout)
}

// waitForDeploymentReady waits up to timeout for all replicas to be ready.
func waitForDeploymentReady(t *testing.T, namespace, name string, expectedReplicas int32, timeout time.Duration) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		dep, err := testEnv.typed.AppsV1().Deployments(namespace).Get(ctx, name, metav1.GetOptions{})
		cancel()
		if err == nil && dep.Status.ReadyReplicas == expectedReplicas {
			return
		}
		time.Sleep(2 * time.Second)
	}
	t.Fatalf("deployment %s/%s did not reach %d ready replicas within %v", namespace, name, expectedReplicas, timeout)
}

// waitForPodCompleted waits for a pod to reach Succeeded phase.
func waitForPodCompleted(t *testing.T, namespace, name string, timeout time.Duration) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		pod, err := testEnv.typed.CoreV1().Pods(namespace).Get(ctx, name, metav1.GetOptions{})
		cancel()
		if err == nil && string(pod.Status.Phase) == "Succeeded" {
			return
		}
		time.Sleep(2 * time.Second)
	}
	t.Fatalf("pod %s/%s did not reach Succeeded within %v", namespace, name, timeout)
}

// newContextName returns the kubeconfig context name for the test cluster.
func newContextName(t *testing.T) string {
	t.Helper()
	cfg, err := clientcmd.LoadFromFile(testEnv.kubeconfig)
	if err != nil {
		t.Fatalf("load kubeconfig %q to determine context name: %v", testEnv.kubeconfig, err)
	}
	if cfg.CurrentContext == "" {
		t.Fatalf("kubeconfig %q has no current-context set", testEnv.kubeconfig)
	}
	return cfg.CurrentContext
}

// newClusterManager creates a ClusterManager connected to the test cluster.
func newClusterManager(t *testing.T) *cluster.Manager {
	t.Helper()
	mgr := cluster.NewManager()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := mgr.Connect(ctx, newContextName(t)); err != nil {
		t.Fatalf("connect cluster manager: %v", err)
	}
	return mgr
}

// nameCounter ensures unique names even when parallel tests call randName in the same nanosecond.
var nameCounter atomic.Int64

// randName generates a unique resource name with the given prefix.
func randName(prefix string) string {
	return fmt.Sprintf("%s-%d-%d", prefix, time.Now().UnixNano(), nameCounter.Add(1))
}
