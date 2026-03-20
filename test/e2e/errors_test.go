//go:build e2e

package e2e

import (
	"context"
	"strings"
	"testing"
	"time"

	authenticationv1 "k8s.io/api/authentication/v1"
	k8serrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/tools/clientcmd"

	"clusterfudge/internal/k8s"
	"clusterfudge/internal/resource"
)

// TC-ERR-002: Resource not found — 404 error
func TestErrors_ResourceNotFound(t *testing.T) {
	q := resource.ResourceQuery{
		Version: "v1", Resource: "pods",
		Namespace: testEnv.namespace, Name: "does-not-exist-pod-xyz",
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := testEnv.resourceSvc.Get(ctx, testEnv.dynamic, q)
	if err == nil {
		t.Fatal("expected error for non-existent pod, got nil")
	}
	if !k8serrors.IsNotFound(err) {
		t.Errorf("expected NotFound error, got: %v (type: %T)", err, err)
	}
}

// TC-ERR-004: Invalid YAML — parse error
func TestErrors_InvalidYAML(t *testing.T) {
	q := resource.ResourceQuery{
		Group: "apps", Version: "v1", Resource: "deployments",
		Namespace: testEnv.namespace, Name: "invalid",
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Not valid JSON
	err := testEnv.resourceSvc.Apply(ctx, testEnv.dynamic, q, []byte(`{this is not: valid json}`))
	if err == nil {
		t.Fatal("expected error for invalid JSON, got nil")
	}
}

// TC-ERR-006: Apply to unknown API group — API error
func TestErrors_UnknownAPIGroup(t *testing.T) {
	q := resource.ResourceQuery{
		Group:     "nonexistent.example.com",
		Version:   "v1",
		Resource:  "fakethings",
		Namespace: testEnv.namespace,
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	fakeObj := map[string]interface{}{
		"apiVersion": "nonexistent.example.com/v1",
		"kind":       "FakeThing",
		"metadata":   map[string]interface{}{"name": "fake", "namespace": testEnv.namespace},
	}
	err := testEnv.resourceSvc.Apply(ctx, testEnv.dynamic, q, marshalJSON(t, fakeObj))
	if err == nil {
		t.Fatal("expected error for unknown API group, got nil")
	}
}

// TC-ERR-RBAC: List with restricted service account
func TestErrors_RBACForbidden(t *testing.T) {
	// Create a service account with NO permissions
	saName := randName("e2e-no-perms-sa")
	createServiceAccount(t, testEnv.namespace, saName)
	t.Cleanup(func() {
		testEnv.typed.CoreV1().ServiceAccounts(testEnv.namespace).Delete(
			context.Background(), saName, metav1.DeleteOptions{},
		)
	})

	// Get the auto-created SA token (may take a moment in k3s)
	var saToken string
	deadline := time.Now().Add(20 * time.Second)
	for time.Now().Before(deadline) {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		secrets, err := testEnv.typed.CoreV1().Secrets(testEnv.namespace).List(ctx, metav1.ListOptions{})
		cancel()
		if err == nil {
			for _, s := range secrets.Items {
				if strings.HasPrefix(s.Name, saName) &&
					s.Type == "kubernetes.io/service-account-token" {
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
		// Try creating a token manually via TokenRequest
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		tokenReq, err := testEnv.typed.CoreV1().ServiceAccounts(testEnv.namespace).CreateToken(
			ctx, saName,
			&authenticationv1.TokenRequest{
				Spec: authenticationv1.TokenRequestSpec{ExpirationSeconds: func() *int64 { i := int64(3600); return &i }()},
			},
			metav1.CreateOptions{},
		)
		if err != nil {
			t.Skipf("could not obtain SA token: %v", err)
		}
		saToken = tokenReq.Status.Token
	}

	// Build restricted config
	realCfg, err := clientcmd.BuildConfigFromFlags("", testEnv.kubeconfig)
	if err != nil {
		t.Fatalf("load kubeconfig: %v", err)
	}
	restrictedCfg := *realCfg
	restrictedCfg.BearerToken = saToken
	restrictedCfg.BearerTokenFile = ""
	restrictedCfg.CertFile = ""
	restrictedCfg.KeyFile = ""
	restrictedCfg.Timeout = 10 * time.Second

	restrictedCS, err := k8s.NewClientSet(&restrictedCfg)
	if err != nil {
		t.Fatalf("create restricted client: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Try to list secrets in kube-system (restricted SA has no permissions for secrets)
	_, err = restrictedCS.Typed.CoreV1().Secrets("kube-system").List(ctx, metav1.ListOptions{})
	if err == nil {
		// Some k8s distributions (e.g. k3s) may have permissive defaults for some resources.
		// Try deleting a pod as a fallback check for RBAC enforcement.
		err = restrictedCS.Typed.CoreV1().Pods("kube-system").Delete(ctx, "nonexistent", metav1.DeleteOptions{})
		if err == nil || (!k8serrors.IsForbidden(err) && !k8serrors.IsNotFound(err)) {
			t.Skipf("RBAC not strictly enforced in this cluster (got: %v)", err)
		}
		if k8serrors.IsNotFound(err) {
			t.Skipf("RBAC not strictly enforced: delete returned NotFound instead of Forbidden")
		}
	}
	if err != nil && !k8serrors.IsForbidden(err) {
		t.Errorf("expected Forbidden error, got: %v", err)
	}
}

// TC-ERR-CONN: Server unreachable — connection error
func TestErrors_ServerUnreachable(t *testing.T) {
	cfg, err := clientcmd.BuildConfigFromFlags("", testEnv.kubeconfig)
	if err != nil {
		t.Fatalf("load kubeconfig: %v", err)
	}

	// Point to an unreachable address
	cfg.Host = "https://192.0.2.1:6443"
	cfg.Timeout = 3 * time.Second

	cs, err := k8s.NewClientSet(cfg)
	if err != nil {
		t.Fatalf("create client set: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()

	start := time.Now()
	_, err = cs.Typed.CoreV1().Pods("default").List(ctx, metav1.ListOptions{})
	elapsed := time.Since(start)

	if err == nil {
		t.Fatal("expected connection error, got nil")
	}
	// Should fail within reasonable time (not hang indefinitely)
	if elapsed > 10*time.Second {
		t.Errorf("expected failure within 10s, took %v", elapsed)
	}
}
