package helm

// ReleaseInfo contains summary information about a Helm release.
type ReleaseInfo struct {
	Name       string `json:"name"`
	Status     string `json:"status"`
	Namespace  string `json:"namespace"`
	Revision   int    `json:"revision"`
	Chart      string `json:"chart"`
	ChartVer   string `json:"chartVersion"`
	AppVersion string `json:"appVersion"`
	Updated    string `json:"updated"`
	Notes      string `json:"notes,omitempty"`
}

// ReleaseDetail extends ReleaseInfo with the full manifest and values.
type ReleaseDetail struct {
	ReleaseInfo
	Manifest string
	Values   map[string]interface{}
}

// RepoInfo contains summary information about a Helm chart repository.
type RepoInfo struct {
	Name string `json:"name"`
	URL  string `json:"url"`
}

// ChartResult represents a chart found during a search.
type ChartResult struct {
	Name        string `json:"name"`
	Version     string `json:"version"`
	AppVersion  string `json:"appVersion"`
	Description string `json:"description"`
	Repo        string `json:"repo"`
}
