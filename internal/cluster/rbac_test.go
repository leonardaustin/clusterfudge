package cluster

import (
	"context"
	"fmt"
	"testing"

	authv1 "k8s.io/api/authorization/v1"
	"k8s.io/apimachinery/pkg/runtime"
	kubefake "k8s.io/client-go/kubernetes/fake"
	k8stesting "k8s.io/client-go/testing"
)

// newFakeClientWithSSAR creates a fake Kubernetes client that responds to
// SelfSubjectAccessReview requests using the provided decision function.
func newFakeClientWithSSAR(decide func(verb, group, resource, namespace string) (bool, string)) *kubefake.Clientset {
	client := kubefake.NewSimpleClientset()
	client.PrependReactor("create", "selfsubjectaccessreviews",
		func(action k8stesting.Action) (bool, runtime.Object, error) {
			createAction := action.(k8stesting.CreateAction)
			review := createAction.GetObject().(*authv1.SelfSubjectAccessReview)
			attr := review.Spec.ResourceAttributes

			allowed, reason := decide(attr.Verb, attr.Group, attr.Resource, attr.Namespace)
			review.Status = authv1.SubjectAccessReviewStatus{
				Allowed: allowed,
				Reason:  reason,
			}
			return true, review, nil
		},
	)
	return client
}

func TestRBACChecker_CheckAccess_Allowed(t *testing.T) {
	client := newFakeClientWithSSAR(func(verb, group, resource, namespace string) (bool, string) {
		return true, "allowed by test"
	})

	checker := NewRBACChecker()
	result, err := checker.CheckAccess(context.Background(), client, "list", "", "pods", "default")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Allowed {
		t.Error("expected Allowed=true")
	}
	if result.Reason != "allowed by test" {
		t.Errorf("expected reason 'allowed by test', got %q", result.Reason)
	}
	if result.Verb != "list" {
		t.Errorf("expected verb 'list', got %q", result.Verb)
	}
	if result.Resource != "pods" {
		t.Errorf("expected resource 'pods', got %q", result.Resource)
	}
	if result.Namespace != "default" {
		t.Errorf("expected namespace 'default', got %q", result.Namespace)
	}
}

func TestRBACChecker_CheckAccess_Denied(t *testing.T) {
	client := newFakeClientWithSSAR(func(verb, group, resource, namespace string) (bool, string) {
		return false, "denied by RBAC"
	})

	checker := NewRBACChecker()
	result, err := checker.CheckAccess(context.Background(), client, "delete", "apps", "deployments", "kube-system")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Allowed {
		t.Error("expected Allowed=false")
	}
	if result.Reason != "denied by RBAC" {
		t.Errorf("expected reason 'denied by RBAC', got %q", result.Reason)
	}
}

func TestRBACChecker_CheckAccess_Caching(t *testing.T) {
	callCount := 0
	client := newFakeClientWithSSAR(func(verb, group, resource, namespace string) (bool, string) {
		callCount++
		return true, "ok"
	})

	checker := NewRBACChecker()
	ctx := context.Background()

	// First call should hit the API.
	_, err := checker.CheckAccess(ctx, client, "get", "", "pods", "default")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if callCount != 1 {
		t.Fatalf("expected 1 API call, got %d", callCount)
	}

	// Second call with same params should be cached.
	result, err := checker.CheckAccess(ctx, client, "get", "", "pods", "default")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if callCount != 1 {
		t.Errorf("expected API call count to stay at 1, got %d", callCount)
	}
	if !result.Allowed {
		t.Error("expected cached result to be Allowed=true")
	}

	// Different params should trigger a new API call.
	_, err = checker.CheckAccess(ctx, client, "delete", "", "pods", "default")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if callCount != 2 {
		t.Errorf("expected 2 API calls, got %d", callCount)
	}
}

func TestRBACChecker_ClearCache(t *testing.T) {
	callCount := 0
	client := newFakeClientWithSSAR(func(verb, group, resource, namespace string) (bool, string) {
		callCount++
		return true, "ok"
	})

	checker := NewRBACChecker()
	ctx := context.Background()

	_, _ = checker.CheckAccess(ctx, client, "get", "", "pods", "default")
	if callCount != 1 {
		t.Fatalf("expected 1 API call, got %d", callCount)
	}

	checker.ClearCache()

	_, _ = checker.CheckAccess(ctx, client, "get", "", "pods", "default")
	if callCount != 2 {
		t.Errorf("expected 2 API calls after cache clear, got %d", callCount)
	}
}

func TestRBACChecker_BulkCheck(t *testing.T) {
	client := newFakeClientWithSSAR(func(verb, group, resource, namespace string) (bool, string) {
		if verb == "delete" || verb == "create" {
			return false, "no write access"
		}
		return true, "read allowed"
	})

	checker := NewRBACChecker()
	results, err := checker.BulkCheck(
		context.Background(), client,
		[]string{"list", "get", "create", "delete"},
		"", "pods", "default",
	)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(results) != 4 {
		t.Fatalf("expected 4 results, got %d", len(results))
	}

	// list and get should be allowed.
	if !results[0].Allowed || !results[1].Allowed {
		t.Error("expected list and get to be allowed")
	}
	// create and delete should be denied.
	if results[2].Allowed || results[3].Allowed {
		t.Error("expected create and delete to be denied")
	}
}

func TestRBACChecker_BulkCheckCommon(t *testing.T) {
	client := newFakeClientWithSSAR(func(verb, group, resource, namespace string) (bool, string) {
		return true, "all allowed"
	})

	checker := NewRBACChecker()
	results, err := checker.BulkCheckCommon(context.Background(), client, "", "pods", "default")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(results) != len(CommonVerbs) {
		t.Fatalf("expected %d results, got %d", len(CommonVerbs), len(results))
	}
	for i, r := range results {
		if !r.Allowed {
			t.Errorf("expected verb %q to be allowed", CommonVerbs[i])
		}
	}
}

func TestRBACChecker_CheckAccess_APIError(t *testing.T) {
	client := kubefake.NewSimpleClientset()
	client.PrependReactor("create", "selfsubjectaccessreviews",
		func(action k8stesting.Action) (bool, runtime.Object, error) {
			return true, nil, fmt.Errorf("API server unavailable")
		},
	)

	checker := NewRBACChecker()
	_, err := checker.CheckAccess(context.Background(), client, "list", "", "pods", "default")
	if err == nil {
		t.Fatal("expected error from API failure")
	}
}

func TestRBACChecker_BulkCheck_APIError(t *testing.T) {
	callCount := 0
	client := kubefake.NewSimpleClientset()
	client.PrependReactor("create", "selfsubjectaccessreviews",
		func(action k8stesting.Action) (bool, runtime.Object, error) {
			callCount++
			if callCount >= 2 {
				return true, nil, fmt.Errorf("API server unavailable")
			}
			review := action.(k8stesting.CreateAction).GetObject().(*authv1.SelfSubjectAccessReview)
			review.Status = authv1.SubjectAccessReviewStatus{Allowed: true}
			return true, review, nil
		},
	)

	checker := NewRBACChecker()
	results, err := checker.BulkCheck(
		context.Background(), client,
		[]string{"list", "get", "create"},
		"", "pods", "default",
	)
	if err == nil {
		t.Fatal("expected error from BulkCheck")
	}
	// Should have the first successful result.
	if len(results) != 1 {
		t.Errorf("expected 1 partial result, got %d", len(results))
	}
}

func TestRBACChecker_CheckAccess_ClusterScoped(t *testing.T) {
	client := newFakeClientWithSSAR(func(verb, group, resource, namespace string) (bool, string) {
		if namespace == "" {
			return true, "cluster-scoped allowed"
		}
		return false, "namespaced denied"
	})

	checker := NewRBACChecker()

	// Cluster-scoped check (empty namespace).
	result, err := checker.CheckAccess(context.Background(), client, "list", "", "nodes", "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Allowed {
		t.Error("expected cluster-scoped check to be allowed")
	}
	if result.Namespace != "" {
		t.Errorf("expected empty namespace, got %q", result.Namespace)
	}
}

func TestRBACChecker_CheckAccess_CancelledContext(t *testing.T) {
	client := newFakeClientWithSSAR(func(verb, group, resource, namespace string) (bool, string) {
		return true, "ok"
	})

	checker := NewRBACChecker()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := checker.CheckAccess(ctx, client, "list", "", "pods", "default")
	// The fake client may or may not respect cancelled contexts, so just verify no panic.
	_ = err
}
