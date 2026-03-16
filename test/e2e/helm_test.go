//go:build e2e

package e2e

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"kubeviewer/internal/helm"
)

// testChartPath returns the path to the test Helm chart.
func testChartPath(t *testing.T) string {
	t.Helper()
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller(0) failed to determine test file location")
	}
	dir := filepath.Dir(filename)
	return filepath.Join(dir, "fixtures", "test-chart")
}

// newHelmClient returns a Helm client for the test cluster.
func newHelmClient(t *testing.T) *helm.Client {
	t.Helper()
	return helm.NewClient(testEnv.kubeconfig, newContextName(t))
}

// TC-HELM-001: Install a Helm chart
func TestHelm_InstallChart(t *testing.T) {
	if os.Getenv("E2E_SKIP_HELM") == "true" {
		t.Skip("skipping Helm tests (E2E_SKIP_HELM=true)")
	}

	releaseName := randName("e2e-release")
	client := newHelmClient(t)

	t.Cleanup(func() {
		client.UninstallRelease(releaseName, testEnv.namespace)
	})

	values := map[string]interface{}{
		"replicaCount": 1,
	}

	err := client.InstallChart(releaseName, testEnv.namespace, testChartPath(t), values)
	if err != nil {
		t.Fatalf("install chart: %v", err)
	}

	// Verify release appears
	releases, err := client.ListReleases(testEnv.namespace)
	if err != nil {
		t.Fatalf("list releases: %v", err)
	}

	found := false
	for _, r := range releases {
		if r.Name == releaseName {
			found = true
			if r.Status != "deployed" {
				t.Errorf("expected status=deployed, got %q", r.Status)
			}
			break
		}
	}
	if !found {
		t.Errorf("release %q not found after install", releaseName)
	}
}

// TC-HELM-002: List releases — verify installed release appears
func TestHelm_ListReleases(t *testing.T) {
	if os.Getenv("E2E_SKIP_HELM") == "true" {
		t.Skip("skipping Helm tests")
	}

	releaseName := randName("e2e-list-release")
	client := newHelmClient(t)
	t.Cleanup(func() { client.UninstallRelease(releaseName, testEnv.namespace) })

	if err := client.InstallChart(releaseName, testEnv.namespace, testChartPath(t), nil); err != nil {
		t.Fatalf("install chart: %v", err)
	}

	releases, err := client.ListReleases(testEnv.namespace)
	if err != nil {
		t.Fatalf("list releases: %v", err)
	}

	var found *helm.ReleaseInfo
	for i := range releases {
		if releases[i].Name == releaseName {
			found = &releases[i]
			break
		}
	}
	if found == nil {
		t.Fatalf("release %q not found", releaseName)
	}
	if found.Status != "deployed" {
		t.Errorf("expected status=deployed, got %q", found.Status)
	}
	if found.Revision != 1 {
		t.Errorf("expected revision=1, got %d", found.Revision)
	}
}

// TC-HELM-003: Get release detail
func TestHelm_GetReleaseDetail(t *testing.T) {
	if os.Getenv("E2E_SKIP_HELM") == "true" {
		t.Skip("skipping Helm tests")
	}

	releaseName := randName("e2e-detail-release")
	client := newHelmClient(t)
	t.Cleanup(func() { client.UninstallRelease(releaseName, testEnv.namespace) })

	values := map[string]interface{}{"replicaCount": 1, "testKey": "testValue"}
	if err := client.InstallChart(releaseName, testEnv.namespace, testChartPath(t), values); err != nil {
		t.Fatalf("install chart: %v", err)
	}

	detail, err := client.GetRelease(releaseName, testEnv.namespace)
	if err != nil {
		t.Fatalf("get release: %v", err)
	}

	if detail.Manifest == "" {
		t.Error("expected non-empty Manifest")
	}
	if detail.Values == nil {
		t.Error("expected non-nil Values")
	}
}

// TC-HELM-004: Get release history
func TestHelm_GetReleaseHistory(t *testing.T) {
	if os.Getenv("E2E_SKIP_HELM") == "true" {
		t.Skip("skipping Helm tests")
	}

	releaseName := randName("e2e-history-release")
	client := newHelmClient(t)
	t.Cleanup(func() { client.UninstallRelease(releaseName, testEnv.namespace) })

	// Install (revision 1)
	if err := client.InstallChart(releaseName, testEnv.namespace, testChartPath(t), map[string]interface{}{"replicaCount": 1}); err != nil {
		t.Fatalf("install: %v", err)
	}

	// Upgrade (revision 2)
	if err := client.UpgradeChart(releaseName, testEnv.namespace, testChartPath(t), map[string]interface{}{"replicaCount": 2}); err != nil {
		t.Fatalf("upgrade: %v", err)
	}

	history, err := client.GetReleaseHistory(releaseName, testEnv.namespace)
	if err != nil {
		t.Fatalf("get history: %v", err)
	}

	if len(history) != 2 {
		t.Errorf("expected 2 history entries, got %d", len(history))
	}

	revisions := make(map[int]bool)
	for _, h := range history {
		revisions[h.Revision] = true
	}
	if !revisions[1] || !revisions[2] {
		t.Errorf("expected revisions 1 and 2 in history, got: %v", revisions)
	}
}

// TC-HELM-005: Upgrade release
func TestHelm_UpgradeRelease(t *testing.T) {
	if os.Getenv("E2E_SKIP_HELM") == "true" {
		t.Skip("skipping Helm tests")
	}

	releaseName := randName("e2e-upgrade-release")
	client := newHelmClient(t)
	t.Cleanup(func() { client.UninstallRelease(releaseName, testEnv.namespace) })

	// Install with 1 replica
	if err := client.InstallChart(releaseName, testEnv.namespace, testChartPath(t), map[string]interface{}{"replicaCount": 1}); err != nil {
		t.Fatalf("install: %v", err)
	}

	// Upgrade to 2 replicas
	if err := client.UpgradeChart(releaseName, testEnv.namespace, testChartPath(t), map[string]interface{}{"replicaCount": 2}); err != nil {
		t.Fatalf("upgrade: %v", err)
	}

	detail, err := client.GetRelease(releaseName, testEnv.namespace)
	if err != nil {
		t.Fatalf("get release after upgrade: %v", err)
	}

	if detail.Revision != 2 {
		t.Errorf("expected revision=2 after upgrade, got %d", detail.Revision)
	}
	if detail.Status != "deployed" {
		t.Errorf("expected status=deployed after upgrade, got %q", detail.Status)
	}
}

// TC-HELM-006: Rollback release
func TestHelm_RollbackRelease(t *testing.T) {
	if os.Getenv("E2E_SKIP_HELM") == "true" {
		t.Skip("skipping Helm tests")
	}

	releaseName := randName("e2e-rollback-release")
	client := newHelmClient(t)
	t.Cleanup(func() { client.UninstallRelease(releaseName, testEnv.namespace) })

	// Install (revision 1)
	if err := client.InstallChart(releaseName, testEnv.namespace, testChartPath(t), map[string]interface{}{"replicaCount": 1}); err != nil {
		t.Fatalf("install: %v", err)
	}
	// Upgrade (revision 2)
	if err := client.UpgradeChart(releaseName, testEnv.namespace, testChartPath(t), map[string]interface{}{"replicaCount": 2}); err != nil {
		t.Fatalf("upgrade: %v", err)
	}

	// Rollback to revision 1
	if err := client.RollbackRelease(releaseName, testEnv.namespace, 1); err != nil {
		t.Fatalf("rollback: %v", err)
	}

	detail, err := client.GetRelease(releaseName, testEnv.namespace)
	if err != nil {
		t.Fatalf("get release after rollback: %v", err)
	}

	if detail.Revision != 3 {
		t.Errorf("expected revision=3 after rollback (k8s increments revision), got %d", detail.Revision)
	}
	if detail.Status != "deployed" {
		t.Errorf("expected status=deployed after rollback, got %q", detail.Status)
	}
}

// TC-HELM-007: Uninstall release
func TestHelm_UninstallRelease(t *testing.T) {
	if os.Getenv("E2E_SKIP_HELM") == "true" {
		t.Skip("skipping Helm tests")
	}

	releaseName := randName("e2e-uninstall-release")
	client := newHelmClient(t)

	if err := client.InstallChart(releaseName, testEnv.namespace, testChartPath(t), nil); err != nil {
		t.Fatalf("install: %v", err)
	}

	if err := client.UninstallRelease(releaseName, testEnv.namespace); err != nil {
		t.Fatalf("uninstall: %v", err)
	}

	// Verify release is gone
	releases, err := client.ListReleases(testEnv.namespace)
	if err != nil {
		t.Fatalf("list releases after uninstall: %v", err)
	}
	for _, r := range releases {
		if r.Name == releaseName {
			t.Errorf("release %q still exists after uninstall", releaseName)
		}
	}

	// Verify k8s resources are cleaned up
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	deadline := time.Now().Add(40 * time.Second)
	for time.Now().Before(deadline) {
		deps, err := testEnv.typed.AppsV1().Deployments(testEnv.namespace).List(ctx, metav1.ListOptions{
			LabelSelector: "app.kubernetes.io/instance=" + releaseName,
		})
		if err == nil && len(deps.Items) == 0 {
			return
		}
		// Filter for our release's deployments
		found := false
		if err == nil {
			for _, d := range deps.Items {
				if strings.Contains(d.Name, releaseName) {
					found = true
					break
				}
			}
		}
		if !found {
			return
		}
		time.Sleep(2 * time.Second)
	}
	t.Error("deployment from uninstalled release still exists after 40s")
}
