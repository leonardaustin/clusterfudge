package handlers

import (
	"fmt"
	"net/url"
	"path/filepath"
	"strings"
	"sync"

	"kubeviewer/internal/helm"
)

// HelmHandler wraps helm.Client to expose Helm operations to the frontend.
// The kubeconfigPath and contextName can be updated when the active cluster
// changes, ensuring Helm operations target the correct cluster.
type HelmHandler struct {
	mu             sync.RWMutex
	kubeconfigPath string
	contextName    string
}

// NewHelmHandler creates a HelmHandler.
func NewHelmHandler(kubeconfigPath, contextName string) *HelmHandler {
	return &HelmHandler{
		kubeconfigPath: kubeconfigPath,
		contextName:    contextName,
	}
}

// SetCluster updates the kubeconfig path and context name for subsequent Helm operations.
func (h *HelmHandler) SetCluster(kubeconfigPath, contextName string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.kubeconfigPath = kubeconfigPath
	h.contextName = contextName
}

func (h *HelmHandler) client() (*helm.Client, error) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	if h.kubeconfigPath == "" {
		return nil, fmt.Errorf("no cluster configured for Helm operations")
	}
	return helm.NewClient(h.kubeconfigPath, h.contextName), nil
}

// ListReleases returns all releases in the given namespace.
func (h *HelmHandler) ListReleases(namespace string) ([]helm.ReleaseInfo, error) {
	c, err := h.client()
	if err != nil {
		return nil, err
	}
	return c.ListReleases(namespace)
}

// GetRelease returns detailed information about a specific release.
func (h *HelmHandler) GetRelease(name, namespace string) (*helm.ReleaseDetail, error) {
	if name == "" {
		return nil, fmt.Errorf("release name is required")
	}
	c, err := h.client()
	if err != nil {
		return nil, err
	}
	return c.GetRelease(name, namespace)
}

// GetReleaseHistory returns the revision history for a release.
func (h *HelmHandler) GetReleaseHistory(name, namespace string) ([]helm.ReleaseInfo, error) {
	if name == "" {
		return nil, fmt.Errorf("release name is required")
	}
	c, err := h.client()
	if err != nil {
		return nil, err
	}
	return c.GetReleaseHistory(name, namespace)
}

// validateChartPath rejects paths with traversal components or absolute paths.
func validateChartPath(chartPath string) error {
	if filepath.IsAbs(chartPath) {
		return fmt.Errorf("absolute chart paths are not allowed: %s", chartPath)
	}
	for _, part := range strings.Split(filepath.ToSlash(chartPath), "/") {
		if part == ".." {
			return fmt.Errorf("path traversal is not allowed in chart path: %s", chartPath)
		}
	}
	return nil
}

// InstallChart installs a Helm chart.
func (h *HelmHandler) InstallChart(name, namespace, chartPath string, values map[string]interface{}) error {
	if name == "" {
		return fmt.Errorf("release name is required")
	}
	if namespace == "" {
		return fmt.Errorf("namespace is required")
	}
	if chartPath == "" {
		return fmt.Errorf("chart path is required")
	}
	if err := validateChartPath(chartPath); err != nil {
		return err
	}
	c, err := h.client()
	if err != nil {
		return err
	}
	return c.InstallChart(name, namespace, chartPath, values)
}

// UpgradeChart upgrades an existing Helm release.
func (h *HelmHandler) UpgradeChart(name, namespace, chartPath string, values map[string]interface{}) error {
	if name == "" {
		return fmt.Errorf("release name is required")
	}
	if namespace == "" {
		return fmt.Errorf("namespace is required")
	}
	if chartPath == "" {
		return fmt.Errorf("chart path is required")
	}
	if err := validateChartPath(chartPath); err != nil {
		return err
	}
	c, err := h.client()
	if err != nil {
		return err
	}
	return c.UpgradeChart(name, namespace, chartPath, values)
}

// RollbackRelease rolls back a release to the specified revision.
func (h *HelmHandler) RollbackRelease(name, namespace string, revision int) error {
	if name == "" {
		return fmt.Errorf("release name is required")
	}
	if namespace == "" {
		return fmt.Errorf("namespace is required")
	}
	c, err := h.client()
	if err != nil {
		return err
	}
	return c.RollbackRelease(name, namespace, revision)
}

// UninstallRelease removes a Helm release.
func (h *HelmHandler) UninstallRelease(name, namespace string) error {
	if name == "" {
		return fmt.Errorf("release name is required")
	}
	c, err := h.client()
	if err != nil {
		return err
	}
	return c.UninstallRelease(name, namespace)
}

// AddChartRepo adds a Helm chart repository.
func (h *HelmHandler) AddChartRepo(name, repoURL string) error {
	if name == "" {
		return fmt.Errorf("repository name is required")
	}
	if repoURL == "" {
		return fmt.Errorf("repository URL is required")
	}
	if _, err := url.ParseRequestURI(repoURL); err != nil {
		return fmt.Errorf("invalid repository URL: %w", err)
	}
	c, err := h.client()
	if err != nil {
		return err
	}
	return c.AddRepo(name, repoURL)
}

// RemoveChartRepo removes a Helm chart repository.
func (h *HelmHandler) RemoveChartRepo(name string) error {
	if name == "" {
		return fmt.Errorf("repository name is required")
	}
	c, err := h.client()
	if err != nil {
		return err
	}
	return c.RemoveRepo(name)
}

// ListChartRepos lists all configured Helm chart repositories.
func (h *HelmHandler) ListChartRepos() ([]helm.RepoInfo, error) {
	c, err := h.client()
	if err != nil {
		return nil, err
	}
	return c.ListRepos()
}

// SearchCharts searches configured repository indexes for charts matching a keyword.
func (h *HelmHandler) SearchCharts(keyword string) ([]helm.ChartResult, error) {
	if keyword == "" {
		return []helm.ChartResult{}, nil
	}
	c, err := h.client()
	if err != nil {
		return nil, err
	}
	return c.SearchCharts(keyword)
}
