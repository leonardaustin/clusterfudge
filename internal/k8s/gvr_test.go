package k8s

import (
	"testing"

	"k8s.io/apimachinery/pkg/runtime/schema"
)

func TestAllCoreGVRs(t *testing.T) {
	gvrs := AllCoreGVRs()
	if len(gvrs) == 0 {
		t.Fatal("AllCoreGVRs returned empty slice")
	}
	// Verify a known GVR is present.
	found := false
	for _, gvr := range gvrs {
		if gvr == GVRPods {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected GVRPods in AllCoreGVRs")
	}
}

func TestGVRDisplayName(t *testing.T) {
	tests := []struct {
		gvr      schema.GroupVersionResource
		expected string
	}{
		{GVRPods, "Pods"},
		{GVRDeployments, "Deployments"},
		{GVRStorageClasses, "Storage Classes"},
		{GVRHPAs, "Horizontal Pod Autoscalers"},
		{
			schema.GroupVersionResource{Group: "custom.io", Version: "v1", Resource: "widgets"},
			"widgets",
		},
	}
	for _, tt := range tests {
		got := GVRDisplayName(tt.gvr)
		if got != tt.expected {
			t.Errorf("GVRDisplayName(%s): expected %q, got %q", tt.gvr, tt.expected, got)
		}
	}
}

func TestIsNamespaced(t *testing.T) {
	tests := []struct {
		gvr        schema.GroupVersionResource
		namespaced bool
	}{
		{GVRPods, true},
		{GVRDeployments, true},
		{GVRNamespaces, false},
		{GVRNodes, false},
		{GVRClusterRoles, false},
		{GVRStorageClasses, false},
		{GVRPersistentVolumes, false},
	}
	for _, tt := range tests {
		got := IsNamespaced(tt.gvr)
		if got != tt.namespaced {
			t.Errorf("IsNamespaced(%s): expected %v, got %v", tt.gvr, tt.namespaced, got)
		}
	}
}

func TestLookupGVR(t *testing.T) {
	tests := []struct {
		name     string
		expected schema.GroupVersionResource
		wantErr  bool
	}{
		{"pods", GVRPods, false},
		{"deployments", GVRDeployments, false},
		{"storageclasses", GVRStorageClasses, false},
		{"horizontalpodautoscalers", GVRHPAs, false},
		{"nonexistent", schema.GroupVersionResource{}, true},
	}
	for _, tt := range tests {
		gvr, err := LookupGVR(tt.name)
		if tt.wantErr {
			if err == nil {
				t.Errorf("LookupGVR(%q): expected error, got nil", tt.name)
			}
			continue
		}
		if err != nil {
			t.Errorf("LookupGVR(%q): unexpected error: %v", tt.name, err)
			continue
		}
		if gvr != tt.expected {
			t.Errorf("LookupGVR(%q): expected %v, got %v", tt.name, tt.expected, gvr)
		}
	}
}

func TestLookupGVRByKind(t *testing.T) {
	tests := []struct {
		kind     string
		expected schema.GroupVersionResource
		wantErr  bool
	}{
		// Regular plurals (lowercase + "s")
		{"Pod", GVRPods, false},
		{"Deployment", GVRDeployments, false},
		{"Service", GVRServices, false},
		// Irregular plurals via kindToResource map
		{"Ingress", GVRIngresses, false},
		{"NetworkPolicy", GVRNetworkPolicies, false},
		{"Endpoints", GVREndpoints, false},
		{"StorageClass", GVRStorageClasses, false},
		{"IngressClass", GVRIngressClasses, false},
		{"ResourceQuota", GVRResourceQuotas, false},
		{"LimitRange", GVRLimitRanges, false},
		// Unknown kind
		{"NonExistentKind", schema.GroupVersionResource{}, true},
	}
	for _, tt := range tests {
		gvr, err := LookupGVRByKind(tt.kind)
		if tt.wantErr {
			if err == nil {
				t.Errorf("LookupGVRByKind(%q): expected error, got nil", tt.kind)
			}
			continue
		}
		if err != nil {
			t.Errorf("LookupGVRByKind(%q): unexpected error: %v", tt.kind, err)
			continue
		}
		if gvr != tt.expected {
			t.Errorf("LookupGVRByKind(%q): expected %v, got %v", tt.kind, tt.expected, gvr)
		}
	}
}

func TestParseGVR(t *testing.T) {
	tests := []struct {
		input    string
		expected schema.GroupVersionResource
		wantErr  bool
	}{
		{
			input:    "v1/pods",
			expected: schema.GroupVersionResource{Group: "", Version: "v1", Resource: "pods"},
		},
		{
			input:    "apps/v1/deployments",
			expected: schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "deployments"},
		},
		{
			input:    "networking.k8s.io/v1/ingresses",
			expected: schema.GroupVersionResource{Group: "networking.k8s.io", Version: "v1", Resource: "ingresses"},
		},
		{
			input:   "invalid",
			wantErr: true,
		},
		{
			input:   "a/b/c/d",
			wantErr: true,
		},
		{
			input:   "",
			wantErr: true,
		},
	}
	for _, tt := range tests {
		gvr, err := ParseGVR(tt.input)
		if tt.wantErr {
			if err == nil {
				t.Errorf("ParseGVR(%q): expected error, got nil", tt.input)
			}
			continue
		}
		if err != nil {
			t.Errorf("ParseGVR(%q): unexpected error: %v", tt.input, err)
			continue
		}
		if gvr != tt.expected {
			t.Errorf("ParseGVR(%q): expected %v, got %v", tt.input, tt.expected, gvr)
		}
	}
}
