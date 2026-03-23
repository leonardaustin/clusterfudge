package cluster

import "strings"

// Platform constants for detected cluster types.
const (
	PlatformEKS       = "eks"
	PlatformGKE       = "gke"
	PlatformAKS       = "aks"
	PlatformOpenShift = "openshift"
	PlatformK3s       = "k3s"
	PlatformRKE       = "rke"
	PlatformVanilla   = "vanilla"
)

// DetectPlatform identifies the cluster platform from the server version string
// and the list of API groups. Version-based checks are tried first; if none match,
// API groups are inspected (e.g., OpenShift exposes route.openshift.io).
func DetectPlatform(version string, apiGroups []string) string {
	v := strings.ToLower(version)

	switch {
	case strings.Contains(v, "-eks-"):
		return PlatformEKS
	case strings.Contains(v, "-gke."):
		return PlatformGKE
	case strings.Contains(v, "aks"):
		return PlatformAKS
	case strings.Contains(v, "+k3s"):
		return PlatformK3s
	case strings.Contains(v, "+rke"):
		return PlatformRKE
	case strings.Contains(v, "+openshift"):
		return PlatformOpenShift
	}

	// Fall back to API group inspection for platforms that don't always
	// advertise themselves in the version string.
	for _, group := range apiGroups {
		if group == "route.openshift.io" {
			return PlatformOpenShift
		}
	}

	return PlatformVanilla
}
