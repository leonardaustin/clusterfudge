//go:build e2e

package e2e

import (
	"context"
	"strings"
	"testing"
	"time"

	"k8s.io/apimachinery/pkg/runtime/schema"

	"clusterfudge/internal/k8s"
)

// TestSearch_FindPodByPartialName verifies that Search finds a pod by
// a substring of its name.
func TestSearch_FindPodByPartialName(t *testing.T) {
	t.Parallel()

	podName := randName("e2e-search-pod")
	t.Cleanup(func() { deletePod(t, testEnv.namespace, podName) })
	createPod(t, testEnv.namespace, podName, nginxPodSpec())

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Use the unique suffix as the search term.
	parts := strings.SplitN(podName, "-", 4)
	searchTerm := parts[len(parts)-1]

	results := testEnv.resourceSvc.Search(ctx, testEnv.dynamic, k8s.AllCoreGVRs(), searchTerm, 50)

	found := false
	for _, r := range results {
		if r.Name == podName && r.Namespace == testEnv.namespace {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("pod %q not found in search results (got %d results)", podName, len(results))
	}
}

// TestSearch_MultipleResourceTypes verifies that Search returns results
// from different resource types.
func TestSearch_MultipleResourceTypes(t *testing.T) {
	t.Parallel()

	// Use a shared unique token in all resource names.
	token := randName("srch")
	podName := token + "-pod"
	cmName := token + "-cm"

	t.Cleanup(func() {
		deletePod(t, testEnv.namespace, podName)
		deleteConfigMap(t, testEnv.namespace, cmName)
	})

	createPod(t, testEnv.namespace, podName, nginxPodSpec())
	createConfigMap(t, testEnv.namespace, cmName, map[string]string{"key": "value"})

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	results := testEnv.resourceSvc.Search(ctx, testEnv.dynamic, k8s.AllCoreGVRs(), token, 50)

	foundPod := false
	foundCM := false
	for _, r := range results {
		if r.Name == podName {
			foundPod = true
		}
		if r.Name == cmName {
			foundCM = true
		}
	}

	if !foundPod {
		t.Errorf("pod %q not found in search results", podName)
	}
	if !foundCM {
		t.Errorf("configmap %q not found in search results", cmName)
	}
}

// TestSearch_CaseInsensitive verifies case-insensitive matching.
func TestSearch_CaseInsensitive(t *testing.T) {
	t.Parallel()

	podName := randName("e2e-search-case")
	t.Cleanup(func() { deletePod(t, testEnv.namespace, podName) })
	createPod(t, testEnv.namespace, podName, nginxPodSpec())

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Search with upper case.
	parts := strings.SplitN(podName, "-", 4)
	searchTerm := strings.ToUpper(parts[len(parts)-1])

	results := testEnv.resourceSvc.Search(ctx, testEnv.dynamic, k8s.AllCoreGVRs(), searchTerm, 50)

	found := false
	for _, r := range results {
		if r.Name == podName {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("case-insensitive search for %q failed: pod %q not found", searchTerm, podName)
	}
}

// TestSearch_QueryTooShort verifies that queries shorter than 2 chars
// return nil.
func TestSearch_QueryTooShort(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	results := testEnv.resourceSvc.Search(ctx, testEnv.dynamic, k8s.AllCoreGVRs(), "a", 50)
	if results != nil {
		t.Errorf("expected nil results for single-char query, got %d", len(results))
	}
}

// TestSearch_MaxResults verifies that results are capped.
func TestSearch_MaxResults(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Search for "default" which should match the default service account
	// and other system resources. Limit to 3 results.
	results := testEnv.resourceSvc.Search(ctx, testEnv.dynamic, k8s.AllCoreGVRs(), "default", 3)

	if len(results) > 3 {
		t.Errorf("expected at most 3 results, got %d", len(results))
	}
}

// TestSearch_LimitedGVRs verifies that Search only searches the provided GVRs.
func TestSearch_LimitedGVRs(t *testing.T) {
	t.Parallel()

	podName := randName("e2e-search-limited")
	cmName := podName // same name for both
	t.Cleanup(func() {
		deletePod(t, testEnv.namespace, podName)
		deleteConfigMap(t, testEnv.namespace, cmName)
	})

	createPod(t, testEnv.namespace, podName, nginxPodSpec())
	createConfigMap(t, testEnv.namespace, cmName, map[string]string{"k": "v"})

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Only search pods, not configmaps.
	podsOnly := []schema.GroupVersionResource{k8s.GVRPods}
	results := testEnv.resourceSvc.Search(ctx, testEnv.dynamic, podsOnly, podName, 50)

	foundPod := false
	for _, r := range results {
		if r.Kind == "configmaps" && r.Name == cmName {
			t.Errorf("configmap %q should not appear when searching pods only", cmName)
		}
		if r.Name == podName && r.Kind == "pods" {
			foundPod = true
		}
	}
	if !foundPod {
		t.Errorf("pod %q should appear in pods-only search results (got %d results)", podName, len(results))
	}
}
