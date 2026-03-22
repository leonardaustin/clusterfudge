package gitops

import "strings"

// Detector detects GitOps providers from available API groups.
type Detector struct{}

// NewDetector creates a new GitOps provider detector.
func NewDetector() *Detector {
	return &Detector{}
}

// Detect checks the given API groups for known GitOps providers.
func (d *Detector) Detect(apiGroups []string) *DetectionResult {
	result := &DetectionResult{}

	hasArgo := false
	hasFluxSource := false
	hasFluxKustomize := false

	for _, g := range apiGroups {
		g = strings.TrimSpace(g)
		switch {
		case g == "argoproj.io":
			hasArgo = true
		case g == "source.toolkit.fluxcd.io":
			hasFluxSource = true
		case g == "kustomize.toolkit.fluxcd.io":
			hasFluxKustomize = true
		}
	}

	if hasArgo {
		result.Providers = append(result.Providers, DetectedProvider{
			Provider:  ProviderArgoCD,
			Resources: []string{"applications.argoproj.io", "appprojects.argoproj.io"},
		})
	}

	if hasFluxSource || hasFluxKustomize {
		var resources []string
		if hasFluxSource {
			resources = append(resources, "gitrepositories.source.toolkit.fluxcd.io")
		}
		if hasFluxKustomize {
			resources = append(resources, "kustomizations.kustomize.toolkit.fluxcd.io")
		}
		result.Providers = append(result.Providers, DetectedProvider{
			Provider:  ProviderFlux,
			Resources: resources,
		})
	}

	return result
}
