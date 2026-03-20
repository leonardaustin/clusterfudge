package gitops

type Provider string

const (
	ProviderArgoCD Provider = "argocd"
	ProviderFlux   Provider = "flux"
)

type DetectionResult struct {
	Providers []DetectedProvider `json:"providers"`
}

type DetectedProvider struct {
	Provider  Provider `json:"provider"`
	Version   string   `json:"version,omitempty"`
	Namespace string   `json:"namespace"`
	Resources []string `json:"resources"`
}
