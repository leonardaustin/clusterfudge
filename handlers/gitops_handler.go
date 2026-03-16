package handlers

import (
	"fmt"

	"kubeviewer/internal/cluster"
	"kubeviewer/internal/gitops"
)

// GitOpsHandler exposes GitOps detection to the frontend.
type GitOpsHandler struct {
	detector *gitops.Detector
	manager  *cluster.Manager
}

// NewGitOpsHandler creates a GitOpsHandler.
func NewGitOpsHandler(mgr *cluster.Manager) *GitOpsHandler {
	return &GitOpsHandler{detector: gitops.NewDetector(), manager: mgr}
}

// DetectProviders detects GitOps providers from available API groups.
func (h *GitOpsHandler) DetectProviders(apiGroups []string) *gitops.DetectionResult {
	return h.detector.Detect(apiGroups)
}

// DetectClusterProviders discovers API groups from the cluster and detects
// which GitOps providers are installed.
func (h *GitOpsHandler) DetectClusterProviders() (*gitops.DetectionResult, error) {
	bundle, err := h.manager.ActiveClients()
	if err != nil {
		return nil, fmt.Errorf("active clients: %w", err)
	}

	serverGroups, err := bundle.Discovery.ServerGroups()
	if err != nil {
		return nil, fmt.Errorf("server groups: %w", err)
	}

	groups := make([]string, 0, len(serverGroups.Groups))
	for _, g := range serverGroups.Groups {
		groups = append(groups, g.Name)
	}

	return h.detector.Detect(groups), nil
}
