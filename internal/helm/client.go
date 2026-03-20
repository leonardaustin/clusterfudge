package helm

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"helm.sh/helm/v3/pkg/action"
	"helm.sh/helm/v3/pkg/chart/loader"
	"helm.sh/helm/v3/pkg/cli"
	"helm.sh/helm/v3/pkg/getter"
	"helm.sh/helm/v3/pkg/registry"
	"helm.sh/helm/v3/pkg/release"
	"helm.sh/helm/v3/pkg/repo"
)

// Client wraps the Helm v3 action SDK.
type Client struct {
	kubeconfigPath string
	contextName    string
}

// NewClient creates a Helm client configured for the given kubeconfig and context.
func NewClient(kubeconfigPath, contextName string) *Client {
	return &Client{
		kubeconfigPath: kubeconfigPath,
		contextName:    contextName,
	}
}

func (c *Client) actionConfig(namespace string) (*action.Configuration, error) {
	settings := cli.New()
	settings.KubeConfig = c.kubeconfigPath
	settings.KubeContext = c.contextName

	cfg := new(action.Configuration)
	if err := cfg.Init(settings.RESTClientGetter(), namespace, "secret", log.Printf); err != nil {
		return nil, fmt.Errorf("init helm action config: %w", err)
	}
	return cfg, nil
}

// InstallChart installs a Helm chart. Supports OCI references (oci://...).
func (c *Client) InstallChart(name, namespace, chartPath string, values map[string]interface{}) error {
	cfg, err := c.actionConfig(namespace)
	if err != nil {
		return err
	}

	// Resolve chart path, handling OCI references
	resolvedPath := chartPath
	if strings.HasPrefix(chartPath, "oci://") {
		resolvedPath, err = c.loadChartWithOCI(cfg, chartPath)
		if err != nil {
			return err
		}
	}

	chart, err := loader.Load(resolvedPath)
	if err != nil {
		return fmt.Errorf("load chart %q: %w", chartPath, err)
	}

	install := action.NewInstall(cfg)
	install.ReleaseName = name
	install.Namespace = namespace
	install.CreateNamespace = false

	if strings.HasPrefix(chartPath, "oci://") {
		install.ChartPathOptions.RepoURL = chartPath
	}

	if _, err := install.Run(chart, values); err != nil {
		return fmt.Errorf("install release %q: %w", name, err)
	}
	return nil
}

// UpgradeChart upgrades an existing Helm release. Supports OCI references (oci://...).
func (c *Client) UpgradeChart(name, namespace, chartPath string, values map[string]interface{}) error {
	cfg, err := c.actionConfig(namespace)
	if err != nil {
		return err
	}

	// Resolve chart path, handling OCI references
	resolvedPath := chartPath
	if strings.HasPrefix(chartPath, "oci://") {
		resolvedPath, err = c.loadChartWithOCI(cfg, chartPath)
		if err != nil {
			return err
		}
	}

	chart, err := loader.Load(resolvedPath)
	if err != nil {
		return fmt.Errorf("load chart %q: %w", chartPath, err)
	}

	upgrade := action.NewUpgrade(cfg)
	upgrade.Namespace = namespace

	if strings.HasPrefix(chartPath, "oci://") {
		upgrade.ChartPathOptions.RepoURL = chartPath
	}

	if _, err := upgrade.Run(name, chart, values); err != nil {
		return fmt.Errorf("upgrade release %q: %w", name, err)
	}
	return nil
}

// UninstallRelease removes a Helm release.
func (c *Client) UninstallRelease(name, namespace string) error {
	cfg, err := c.actionConfig(namespace)
	if err != nil {
		return err
	}

	uninstall := action.NewUninstall(cfg)
	if _, err := uninstall.Run(name); err != nil {
		return fmt.Errorf("uninstall release %q: %w", name, err)
	}
	return nil
}

// RollbackRelease rolls back a release to the specified revision.
func (c *Client) RollbackRelease(name, namespace string, revision int) error {
	cfg, err := c.actionConfig(namespace)
	if err != nil {
		return err
	}

	rollback := action.NewRollback(cfg)
	rollback.Version = revision

	if err := rollback.Run(name); err != nil {
		return fmt.Errorf("rollback release %q to revision %d: %w", name, revision, err)
	}
	return nil
}

// releaseToInfo converts a Helm SDK release to our ReleaseInfo.
func releaseToInfo(r *release.Release) ReleaseInfo {
	info := ReleaseInfo{
		Name:      r.Name,
		Status:    r.Info.Status.String(),
		Namespace: r.Namespace,
		Revision:  r.Version,
	}
	if r.Chart != nil && r.Chart.Metadata != nil {
		info.Chart = r.Chart.Metadata.Name
		info.ChartVer = r.Chart.Metadata.Version
		info.AppVersion = r.Chart.Metadata.AppVersion
	}
	if r.Info != nil {
		if !r.Info.LastDeployed.IsZero() {
			info.Updated = r.Info.LastDeployed.Format(time.RFC3339)
		}
		info.Notes = r.Info.Notes
	}
	return info
}

// ListReleases returns all releases in the given namespace.
func (c *Client) ListReleases(namespace string) ([]ReleaseInfo, error) {
	cfg, err := c.actionConfig(namespace)
	if err != nil {
		return nil, err
	}

	list := action.NewList(cfg)
	list.Deployed = true
	list.Failed = true
	list.Pending = true
	list.Superseded = true
	list.Uninstalled = false
	list.Uninstalling = true
	list.SetStateMask()

	releases, err := list.Run()
	if err != nil {
		return nil, fmt.Errorf("list releases: %w", err)
	}

	result := make([]ReleaseInfo, 0, len(releases))
	for _, r := range releases {
		result = append(result, releaseToInfo(r))
	}
	return result, nil
}

// GetRelease returns detailed information about a specific release.
func (c *Client) GetRelease(name, namespace string) (*ReleaseDetail, error) {
	cfg, err := c.actionConfig(namespace)
	if err != nil {
		return nil, err
	}

	get := action.NewGet(cfg)
	rel, err := get.Run(name)
	if err != nil {
		return nil, fmt.Errorf("get release %q: %w", name, err)
	}

	return &ReleaseDetail{
		ReleaseInfo: releaseToInfo(rel),
		Manifest:    rel.Manifest,
		Values:      rel.Config,
	}, nil
}

// GetReleaseHistory returns the revision history for a release.
func (c *Client) GetReleaseHistory(name, namespace string) ([]ReleaseInfo, error) {
	cfg, err := c.actionConfig(namespace)
	if err != nil {
		return nil, err
	}

	history := action.NewHistory(cfg)
	releases, err := history.Run(name)
	if err != nil {
		return nil, fmt.Errorf("get release history %q: %w", name, err)
	}

	result := make([]ReleaseInfo, 0, len(releases))
	for _, r := range releases {
		result = append(result, releaseToInfo(r))
	}
	return result, nil
}

// repoFilePath returns the path to the Helm repositories.yaml file.
func repoFilePath() string {
	settings := cli.New()
	return settings.RepositoryConfig
}

// AddRepo adds a Helm chart repository.
func (c *Client) AddRepo(name, url string) error {
	repoFile := repoFilePath()

	// Ensure the directory exists
	if err := os.MkdirAll(filepath.Dir(repoFile), 0755); err != nil {
		return fmt.Errorf("create repo config directory: %w", err)
	}

	// Load or create the repo file
	var f *repo.File
	if _, err := os.Stat(repoFile); os.IsNotExist(err) {
		f = repo.NewFile()
	} else {
		f, err = repo.LoadFile(repoFile)
		if err != nil {
			return fmt.Errorf("load repo file: %w", err)
		}
	}

	// Check if already exists
	if f.Has(name) {
		return fmt.Errorf("repository %q already exists", name)
	}

	entry := &repo.Entry{
		Name: name,
		URL:  url,
	}

	settings := cli.New()
	chartRepo, err := repo.NewChartRepository(entry, getter.All(settings))
	if err != nil {
		return fmt.Errorf("create chart repository: %w", err)
	}

	// Download the index to validate the repo
	if _, err := chartRepo.DownloadIndexFile(); err != nil {
		return fmt.Errorf("download index for %q: %w", name, err)
	}

	f.Update(entry)
	if err := f.WriteFile(repoFile, 0644); err != nil {
		return fmt.Errorf("write repo file: %w", err)
	}
	return nil
}

// RemoveRepo removes a Helm chart repository by name.
func (c *Client) RemoveRepo(name string) error {
	repoFile := repoFilePath()

	f, err := repo.LoadFile(repoFile)
	if err != nil {
		return fmt.Errorf("load repo file: %w", err)
	}

	if !f.Remove(name) {
		return fmt.Errorf("repository %q not found", name)
	}

	if err := f.WriteFile(repoFile, 0644); err != nil {
		return fmt.Errorf("write repo file: %w", err)
	}

	// Clean up the cached index file
	settings := cli.New()
	indexPath := filepath.Join(settings.RepositoryCache, name+"-index.yaml")
	_ = os.Remove(indexPath)

	return nil
}

// ListRepos lists all configured Helm chart repositories.
func (c *Client) ListRepos() ([]RepoInfo, error) {
	repoFile := repoFilePath()

	if _, err := os.Stat(repoFile); os.IsNotExist(err) {
		return []RepoInfo{}, nil
	}

	f, err := repo.LoadFile(repoFile)
	if err != nil {
		return nil, fmt.Errorf("load repo file: %w", err)
	}

	result := make([]RepoInfo, 0, len(f.Repositories))
	for _, r := range f.Repositories {
		result = append(result, RepoInfo{
			Name: r.Name,
			URL:  r.URL,
		})
	}
	return result, nil
}

// SearchCharts searches configured repository indexes for charts matching a keyword.
func (c *Client) SearchCharts(keyword string) ([]ChartResult, error) {
	repoFile := repoFilePath()

	if _, err := os.Stat(repoFile); os.IsNotExist(err) {
		return []ChartResult{}, nil
	}

	f, err := repo.LoadFile(repoFile)
	if err != nil {
		return nil, fmt.Errorf("load repo file: %w", err)
	}

	settings := cli.New()
	var results []ChartResult
	lowerKeyword := strings.ToLower(keyword)

	for _, r := range f.Repositories {
		indexPath := filepath.Join(settings.RepositoryCache, r.Name+"-index.yaml")
		indexFile, err := repo.LoadIndexFile(indexPath)
		if err != nil {
			continue // skip repos with missing or unreadable index files
		}

		for chartName, versions := range indexFile.Entries {
			if len(versions) == 0 {
				continue
			}
			latest := versions[0]
			if strings.Contains(strings.ToLower(chartName), lowerKeyword) ||
				strings.Contains(strings.ToLower(latest.Description), lowerKeyword) {
				results = append(results, ChartResult{
					Name:        chartName,
					Version:     latest.Version,
					AppVersion:  latest.AppVersion,
					Description: latest.Description,
					Repo:        r.Name,
				})
			}
		}
	}

	if results == nil {
		results = []ChartResult{}
	}
	return results, nil
}

// loadChartWithOCI loads a chart, handling OCI references transparently.
func (c *Client) loadChartWithOCI(cfg *action.Configuration, chartPath string) (string, error) {
	if strings.HasPrefix(chartPath, "oci://") {
		regClient, err := registry.NewClient()
		if err != nil {
			return "", fmt.Errorf("create OCI registry client: %w", err)
		}
		cfg.RegistryClient = regClient
	}

	settings := cli.New()
	pathOpts := action.ChartPathOptions{}
	resolved, err := pathOpts.LocateChart(chartPath, settings)
	if err != nil {
		return "", fmt.Errorf("locate chart %q: %w", chartPath, err)
	}
	return resolved, nil
}

