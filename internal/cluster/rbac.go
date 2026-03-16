package cluster

import (
	"context"
	"fmt"
	"sync"

	authv1 "k8s.io/api/authorization/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// CommonVerbs are the standard verbs checked for RBAC permissions.
var CommonVerbs = []string{"list", "get", "create", "delete", "watch"}

// RBACChecker checks whether the current user has permission to perform
// specific actions on Kubernetes resources using the SelfSubjectAccessReview API.
type RBACChecker struct {
	mu sync.RWMutex
	// cache stores results keyed by "verb:group:resource:namespace".
	cache map[string]RBACCheckResult
}

// NewRBACChecker creates a new RBAC permission checker.
func NewRBACChecker() *RBACChecker {
	return &RBACChecker{
		cache: make(map[string]RBACCheckResult),
	}
}

// CheckAccess checks whether the current user is allowed to perform the given
// verb on the specified resource. It uses the SelfSubjectAccessReview API.
func (r *RBACChecker) CheckAccess(
	ctx context.Context,
	client kubernetes.Interface,
	verb, group, resource, namespace string,
) (RBACCheckResult, error) {
	cacheKey := fmt.Sprintf("%s:%s:%s:%s", verb, group, resource, namespace)

	r.mu.RLock()
	if cached, ok := r.cache[cacheKey]; ok {
		r.mu.RUnlock()
		return cached, nil
	}
	r.mu.RUnlock()

	review := &authv1.SelfSubjectAccessReview{
		Spec: authv1.SelfSubjectAccessReviewSpec{
			ResourceAttributes: &authv1.ResourceAttributes{
				Verb:      verb,
				Group:     group,
				Resource:  resource,
				Namespace: namespace,
			},
		},
	}

	resp, err := client.AuthorizationV1().SelfSubjectAccessReviews().Create(
		ctx, review, metav1.CreateOptions{},
	)
	if err != nil {
		return RBACCheckResult{}, fmt.Errorf("RBAC check for %s %s/%s in %q: %w",
			verb, group, resource, namespace, err)
	}

	result := RBACCheckResult{
		Allowed:   resp.Status.Allowed,
		Reason:    resp.Status.Reason,
		Verb:      verb,
		Resource:  resource,
		Namespace: namespace,
	}

	r.mu.Lock()
	r.cache[cacheKey] = result
	r.mu.Unlock()

	return result, nil
}

// BulkCheck checks multiple verbs for the same resource and namespace.
// Returns a result for each verb, stopping early only on API errors.
func (r *RBACChecker) BulkCheck(
	ctx context.Context,
	client kubernetes.Interface,
	verbs []string,
	group, resource, namespace string,
) ([]RBACCheckResult, error) {
	results := make([]RBACCheckResult, 0, len(verbs))
	for _, verb := range verbs {
		result, err := r.CheckAccess(ctx, client, verb, group, resource, namespace)
		if err != nil {
			return results, err
		}
		results = append(results, result)
	}
	return results, nil
}

// BulkCheckCommon checks all CommonVerbs for the given resource and namespace.
func (r *RBACChecker) BulkCheckCommon(
	ctx context.Context,
	client kubernetes.Interface,
	group, resource, namespace string,
) ([]RBACCheckResult, error) {
	return r.BulkCheck(ctx, client, CommonVerbs, group, resource, namespace)
}

// ClearCache removes all cached RBAC results. Call this when
// the user switches contexts or after a reconnection.
func (r *RBACChecker) ClearCache() {
	r.mu.Lock()
	r.cache = make(map[string]RBACCheckResult)
	r.mu.Unlock()
}
