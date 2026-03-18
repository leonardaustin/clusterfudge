//go:build e2e

package e2e

import (
	"context"
	"strings"
	"sync"
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	rbacv1 "k8s.io/api/rbac/v1"
	"k8s.io/client-go/tools/clientcmd"

	"clusterfudge/internal/k8s"
	"clusterfudge/internal/stream"
)

// TC-EXEC-001 & TC-EXEC-002: Open exec session and send command
func TestExec_OpenSessionAndSendCommand(t *testing.T) {
	t.Parallel()
	name := randName("e2e-exec")
	t.Cleanup(func() { deletePod(t, testEnv.namespace, name) })

	spec := corev1.PodSpec{
		Containers: []corev1.Container{
			{
				Name:    "shell",
				Image:   "busybox:latest",
				Command: []string{"sleep", "3600"},
			},
		},
	}
	createPod(t, testEnv.namespace, name, spec)
	waitForPodRunning(t, testEnv.namespace, name, 90*time.Second)

	var stdout strings.Builder
	var mu sync.Mutex
	outputReceived := make(chan struct{}, 1)

	opts := stream.ExecOptions{
		Namespace:     testEnv.namespace,
		PodName:       name,
		ContainerName: "shell",
		Command:       []string{"/bin/sh"},
		TTY:           true,
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	session, err := stream.StartExec(
		ctx,
		testEnv.typed,
		testEnv.clientSet.Config,
		opts,
		func(data []byte) {
			mu.Lock()
			stdout.Write(data)
			mu.Unlock()
			select {
			case outputReceived <- struct{}{}:
			default:
			}
		},
		func(data []byte) {}, // stderr
		func(err error) {},   // exit
	)
	if err != nil {
		t.Fatalf("StartExec: %v", err)
	}
	defer session.Close()

	// Wait for shell prompt (initial output)
	select {
	case <-outputReceived:
	case <-time.After(10 * time.Second):
		t.Fatal("timed out waiting for shell prompt")
	}

	// Send echo command
	if err := session.Write([]byte("echo hello\n")); err != nil {
		t.Fatalf("write to exec session: %v", err)
	}

	// Wait for "hello" in output
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		mu.Lock()
		output := stdout.String()
		mu.Unlock()
		if strings.Contains(output, "hello") {
			return // success
		}
		time.Sleep(200 * time.Millisecond)
	}

	mu.Lock()
	output := stdout.String()
	mu.Unlock()
	t.Errorf("expected 'hello' in exec output, got: %q", output)
}

// TC-EXEC-004: Close exec session — verify cleanup
func TestExec_CloseSession(t *testing.T) {
	t.Parallel()
	name := randName("e2e-exec-close")
	t.Cleanup(func() { deletePod(t, testEnv.namespace, name) })

	spec := corev1.PodSpec{
		Containers: []corev1.Container{
			{Name: "shell", Image: "busybox:latest", Command: []string{"sleep", "3600"}},
		},
	}
	createPod(t, testEnv.namespace, name, spec)
	waitForPodRunning(t, testEnv.namespace, name, 90*time.Second)

	exitCalled := make(chan struct{})
	var exitOnce sync.Once

	opts := stream.ExecOptions{
		Namespace:     testEnv.namespace,
		PodName:       name,
		ContainerName: "shell",
		Command:       []string{"/bin/sh"},
		TTY:           false,
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	session, err := stream.StartExec(
		ctx, testEnv.typed, testEnv.clientSet.Config, opts,
		func(data []byte) {},
		func(data []byte) {},
		func(err error) { exitOnce.Do(func() { close(exitCalled) }) },
	)
	if err != nil {
		t.Fatalf("StartExec: %v", err)
	}

	// Close the session
	session.Close()

	// Verify exit callback is called
	select {
	case <-exitCalled:
	case <-time.After(5 * time.Second):
		t.Error("exit callback was not called within 5s after Close()")
	}

	// Verify write returns error after close
	err = session.Write([]byte("echo after close\n"))
	if err == nil {
		t.Error("expected error writing to closed session, got nil")
	}
}

// TC-EXEC-005: Exec into non-existent pod — verify error
func TestExec_NonExistentPod(t *testing.T) {
	opts := stream.ExecOptions{
		Namespace:     testEnv.namespace,
		PodName:       "does-not-exist-xyz",
		ContainerName: "container",
		Command:       []string{"/bin/sh"},
		TTY:           false,
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := stream.StartExec(
		ctx, testEnv.typed, testEnv.clientSet.Config, opts,
		func(data []byte) { t.Error("unexpected stdout from non-existent pod") },
		func(data []byte) {},
		func(err error) {},
	)
	if err == nil {
		t.Error("expected error exec-ing into non-existent pod, got nil")
	}
}

// TC-EXEC-006: RBAC denied exec — verify 403 error
func TestExec_RBACDenied(t *testing.T) {
	saName := randName("e2e-no-exec-sa")
	createServiceAccount(t, testEnv.namespace, saName)

	// Create a role that only allows getting pods, NOT exec
	roleName := randName("e2e-no-exec-role")
	role := &rbacv1.Role{
		ObjectMeta: metav1.ObjectMeta{Name: roleName, Namespace: testEnv.namespace},
		Rules: []rbacv1.PolicyRule{
			{APIGroups: []string{""}, Resources: []string{"pods"}, Verbs: []string{"get", "list"}},
			// Note: pods/exec is NOT in this role
		},
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	_, err := testEnv.typed.RbacV1().Roles(testEnv.namespace).Create(ctx, role, metav1.CreateOptions{})
	if err != nil {
		t.Fatalf("create role: %v", err)
	}
	t.Cleanup(func() {
		testEnv.typed.RbacV1().Roles(testEnv.namespace).Delete(context.Background(), roleName, metav1.DeleteOptions{})
	})

	rb := &rbacv1.RoleBinding{
		ObjectMeta: metav1.ObjectMeta{Name: roleName + "-rb", Namespace: testEnv.namespace},
		RoleRef:    rbacv1.RoleRef{APIGroup: "rbac.authorization.k8s.io", Kind: "Role", Name: roleName},
		Subjects:   []rbacv1.Subject{{Kind: "ServiceAccount", Name: saName, Namespace: testEnv.namespace}},
	}
	_, err = testEnv.typed.RbacV1().RoleBindings(testEnv.namespace).Create(ctx, rb, metav1.CreateOptions{})
	if err != nil {
		t.Fatalf("create rolebinding: %v", err)
	}
	t.Cleanup(func() {
		testEnv.typed.RbacV1().RoleBindings(testEnv.namespace).Delete(context.Background(), roleName+"-rb", metav1.DeleteOptions{})
		testEnv.typed.CoreV1().ServiceAccounts(testEnv.namespace).Delete(context.Background(), saName, metav1.DeleteOptions{})
	})

	// Get the SA token (k3s auto-creates a token secret)
	deadline := time.Now().Add(15 * time.Second)
	var saToken string
	for time.Now().Before(deadline) {
		secrets, err := testEnv.typed.CoreV1().Secrets(testEnv.namespace).List(ctx, metav1.ListOptions{})
		if err == nil {
			for _, s := range secrets.Items {
				if strings.HasPrefix(s.Name, saName) && s.Type == "kubernetes.io/service-account-token" {
					saToken = string(s.Data["token"])
					break
				}
			}
		}
		if saToken != "" {
			break
		}
		time.Sleep(2 * time.Second)
	}

	if saToken == "" {
		t.Skip("could not get SA token; skipping RBAC exec test")
	}

	// Build a restricted config
	realCfg, err := clientcmd.BuildConfigFromFlags("", testEnv.kubeconfig)
	if err != nil {
		t.Fatalf("load real kubeconfig: %v", err)
	}
	restrictedCfg := *realCfg
	restrictedCfg.BearerToken = saToken
	restrictedCfg.BearerTokenFile = ""
	restrictedCfg.CertFile = ""
	restrictedCfg.KeyFile = ""

	restrictedCS, err := k8s.NewClientSet(&restrictedCfg)
	if err != nil {
		t.Fatalf("create restricted client: %v", err)
	}

	// Create a target pod to exec into
	podName := randName("e2e-exec-rbac-target")
	createPod(t, testEnv.namespace, podName, corev1.PodSpec{
		Containers: []corev1.Container{
			{Name: "shell", Image: "busybox:latest", Command: []string{"sleep", "3600"}},
		},
	})
	waitForPodRunning(t, testEnv.namespace, podName, 90*time.Second)
	t.Cleanup(func() { deletePod(t, testEnv.namespace, podName) })

	execOpts := stream.ExecOptions{
		Namespace:     testEnv.namespace,
		PodName:       podName,
		ContainerName: "shell",
		Command:       []string{"/bin/sh"},
		TTY:           false,
	}

	ctx2, cancel2 := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel2()

	_, err = stream.StartExec(
		ctx2, restrictedCS.Typed, restrictedCS.Config, execOpts,
		func(data []byte) {},
		func(data []byte) {},
		func(err error) {},
	)
	if err == nil {
		t.Error("expected RBAC error exec-ing with restricted SA, got nil")
	}
	errStr := strings.ToLower(err.Error())
	if !strings.Contains(errStr, "forbidden") && !strings.Contains(errStr, "403") {
		t.Errorf("expected forbidden/403 error, got: %v", err)
	}
}
