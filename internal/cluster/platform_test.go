package cluster

import "testing"

func TestDetectPlatformExtended(t *testing.T) {
	tests := []struct {
		name      string
		version   string
		apiGroups []string
		expect    string
	}{
		{
			name:    "EKS version string",
			version: "v1.28.3-eks-4f4795d",
			expect:  PlatformEKS,
		},
		{
			name:    "GKE version string",
			version: "v1.27.4-gke.900",
			expect:  PlatformGKE,
		},
		{
			name:    "AKS version string",
			version: "v1.27.1-aks-1",
			expect:  PlatformAKS,
		},
		{
			name:    "k3s version string",
			version: "v1.28.2+k3s1",
			expect:  PlatformK3s,
		},
		{
			name:    "RKE version string",
			version: "v1.27.5+rke2r1",
			expect:  PlatformRKE,
		},
		{
			name:    "OpenShift version string",
			version: "v1.26.0+openshift.1",
			expect:  PlatformOpenShift,
		},
		{
			name:      "OpenShift via API group",
			version:   "v1.26.0",
			apiGroups: []string{"apps", "route.openshift.io", "batch"},
			expect:    PlatformOpenShift,
		},
		{
			name:      "OpenShift version takes priority over API group",
			version:   "v1.26.0+openshift.1",
			apiGroups: []string{"route.openshift.io"},
			expect:    PlatformOpenShift,
		},
		{
			name:    "vanilla Kubernetes",
			version: "v1.28.2",
			expect:  PlatformVanilla,
		},
		{
			name:      "vanilla with unrelated API groups",
			version:   "v1.28.2",
			apiGroups: []string{"apps", "batch", "networking.k8s.io"},
			expect:    PlatformVanilla,
		},
		{
			name:    "empty version string",
			version: "",
			expect:  PlatformVanilla,
		},
		{
			name:    "case insensitive EKS",
			version: "v1.28.3-EKS-4f4795d",
			expect:  PlatformEKS,
		},
		{
			name:    "case insensitive GKE",
			version: "v1.27.4-GKE.900",
			expect:  PlatformGKE,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := DetectPlatform(tt.version, tt.apiGroups)
			if got != tt.expect {
				t.Errorf("DetectPlatform(%q, %v) = %q, want %q",
					tt.version, tt.apiGroups, got, tt.expect)
			}
		})
	}
}

func TestDetectPlatform_Constants(t *testing.T) {
	// Verify constants are non-empty and distinct.
	platforms := []string{
		PlatformEKS, PlatformGKE, PlatformAKS,
		PlatformOpenShift, PlatformK3s, PlatformRKE, PlatformVanilla,
	}
	seen := map[string]bool{}
	for _, p := range platforms {
		if p == "" {
			t.Error("platform constant is empty")
		}
		if seen[p] {
			t.Errorf("duplicate platform constant: %q", p)
		}
		seen[p] = true
	}
}
