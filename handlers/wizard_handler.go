package handlers

import (
	"clusterfudge/internal/wizards"
)

// WizardHandler exposes resource creation wizard operations to the frontend.
type WizardHandler struct{}

// NewWizardHandler creates a WizardHandler.
func NewWizardHandler() *WizardHandler {
	return &WizardHandler{}
}

// PreviewDeployment generates a Deployment YAML manifest from the given spec.
func (h *WizardHandler) PreviewDeployment(spec wizards.DeploymentSpec) (string, error) {
	return wizards.DeploymentManifest(spec)
}

// PreviewService generates a Service YAML manifest from the given spec.
func (h *WizardHandler) PreviewService(spec wizards.ServiceSpec) (string, error) {
	return wizards.ServiceManifest(spec)
}

// PreviewConfigMap generates a ConfigMap YAML manifest from the given spec.
func (h *WizardHandler) PreviewConfigMap(spec wizards.ConfigMapSpec) (string, error) {
	return wizards.ConfigMapManifest(spec)
}

// PreviewSecret generates a Secret YAML manifest from the given spec.
func (h *WizardHandler) PreviewSecret(spec wizards.SecretSpec) (string, error) {
	return wizards.SecretManifest(spec)
}
