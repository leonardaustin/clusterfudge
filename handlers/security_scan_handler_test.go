package handlers

import (
	"testing"
)

func TestNewSecurityScanHandler(t *testing.T) {
	h := NewSecurityScanHandler(nil)
	if h == nil {
		t.Fatal("expected non-nil handler")
	}
}

func TestSecurityScanHandler_CheckPodSecurity_SecurePod(t *testing.T) {
	podSpec := map[string]any{
		"containers": []any{
			map[string]any{
				"name":  "app",
				"image": "nginx:1.25",
				"securityContext": map[string]any{
					"privileged":             false,
					"runAsNonRoot":           true,
					"readOnlyRootFilesystem": true,
				},
				"resources": map[string]any{
					"limits": map[string]any{
						"cpu":    "500m",
						"memory": "128Mi",
					},
				},
			},
		},
	}

	h := NewSecurityScanHandler(nil)
	result := h.CheckPodSecurity(podSpec)

	if result == nil {
		t.Fatal("expected non-nil result")
	}
	if result.Level != "restricted" {
		t.Errorf("expected level %q for secure pod, got %q", "restricted", result.Level)
	}

	// A fully secure pod should have no violations
	if len(result.Violations) != 0 {
		t.Errorf("expected 0 violations for fully secure pod, got %d: %v", len(result.Violations), result.Violations)
	}
}

func TestSecurityScanHandler_CheckPodSecurity_PrivilegedContainer(t *testing.T) {
	podSpec := map[string]any{
		"containers": []any{
			map[string]any{
				"name":  "app",
				"image": "nginx",
				"securityContext": map[string]any{
					"privileged": true,
				},
			},
		},
	}

	h := NewSecurityScanHandler(nil)
	result := h.CheckPodSecurity(podSpec)

	if result.Level != "privileged" {
		t.Errorf("expected level %q, got %q", "privileged", result.Level)
	}

	foundPrivileged := false
	for _, v := range result.Violations {
		if v.Category == "privileged" {
			foundPrivileged = true
			if v.Severity != "critical" {
				t.Errorf("expected severity %q for privileged, got %q", "critical", v.Severity)
			}
		}
	}
	if !foundPrivileged {
		t.Error("expected a privileged violation")
	}
}

func TestSecurityScanHandler_CheckPodSecurity_RunAsRoot(t *testing.T) {
	podSpec := map[string]any{
		"containers": []any{
			map[string]any{
				"name":  "app",
				"image": "nginx",
				"securityContext": map[string]any{
					"runAsNonRoot": false,
				},
			},
		},
	}

	h := NewSecurityScanHandler(nil)
	result := h.CheckPodSecurity(podSpec)

	if result.Level == "restricted" {
		t.Error("expected level to be downgraded from restricted")
	}

	foundRunAsRoot := false
	for _, v := range result.Violations {
		if v.Category == "runAsRoot" {
			foundRunAsRoot = true
			if v.Severity != "warning" {
				t.Errorf("expected severity %q for runAsRoot, got %q", "warning", v.Severity)
			}
		}
	}
	if !foundRunAsRoot {
		t.Error("expected a runAsRoot violation")
	}
}

func TestSecurityScanHandler_CheckPodSecurity_WritableRootFS(t *testing.T) {
	podSpec := map[string]any{
		"containers": []any{
			map[string]any{
				"name":  "app",
				"image": "nginx",
				"securityContext": map[string]any{
					"runAsNonRoot":           true,
					"readOnlyRootFilesystem": false,
				},
			},
		},
	}

	h := NewSecurityScanHandler(nil)
	result := h.CheckPodSecurity(podSpec)

	foundRootFS := false
	for _, v := range result.Violations {
		if v.Category == "rootFilesystem" {
			foundRootFS = true
			if v.Severity != "info" {
				t.Errorf("expected severity %q for rootFilesystem, got %q", "info", v.Severity)
			}
		}
	}
	if !foundRootFS {
		t.Error("expected a rootFilesystem violation")
	}
}

func TestSecurityScanHandler_CheckPodSecurity_DangerousCapabilities(t *testing.T) {
	podSpec := map[string]any{
		"containers": []any{
			map[string]any{
				"name":  "app",
				"image": "nginx",
				"securityContext": map[string]any{
					"runAsNonRoot": true,
					"capabilities": map[string]any{
						"add": []any{"SYS_ADMIN", "NET_ADMIN"},
					},
				},
				"resources": map[string]any{
					"limits": map[string]any{"cpu": "100m"},
				},
			},
		},
	}

	h := NewSecurityScanHandler(nil)
	result := h.CheckPodSecurity(podSpec)

	if result.Level != "privileged" {
		t.Errorf("expected level %q with dangerous capabilities, got %q", "privileged", result.Level)
	}

	capCount := 0
	for _, v := range result.Violations {
		if v.Category == "capabilities" {
			capCount++
		}
	}
	if capCount != 2 {
		t.Errorf("expected 2 capability violations (SYS_ADMIN + NET_ADMIN), got %d", capCount)
	}
}

func TestSecurityScanHandler_CheckPodSecurity_NoResourceLimits(t *testing.T) {
	podSpec := map[string]any{
		"containers": []any{
			map[string]any{
				"name":  "app",
				"image": "nginx",
				"securityContext": map[string]any{
					"runAsNonRoot":           true,
					"readOnlyRootFilesystem": true,
				},
				// No resources specified
			},
		},
	}

	h := NewSecurityScanHandler(nil)
	result := h.CheckPodSecurity(podSpec)

	foundResources := false
	for _, v := range result.Violations {
		if v.Category == "resources" {
			foundResources = true
			if v.Severity != "warning" {
				t.Errorf("expected severity %q for resources, got %q", "warning", v.Severity)
			}
		}
	}
	if !foundResources {
		t.Error("expected a resources violation for missing limits")
	}
}

func TestSecurityScanHandler_CheckPodSecurity_HostNetwork(t *testing.T) {
	podSpec := map[string]any{
		"hostNetwork": true,
		"containers": []any{
			map[string]any{
				"name":  "app",
				"image": "nginx",
				"securityContext": map[string]any{
					"runAsNonRoot":           true,
					"readOnlyRootFilesystem": true,
				},
				"resources": map[string]any{
					"limits": map[string]any{"cpu": "100m"},
				},
			},
		},
	}

	h := NewSecurityScanHandler(nil)
	result := h.CheckPodSecurity(podSpec)

	if result.Level != "privileged" {
		t.Errorf("expected level %q with hostNetwork, got %q", "privileged", result.Level)
	}

	foundHostNS := false
	for _, v := range result.Violations {
		if v.Category == "hostNamespace" && v.Field == "spec.hostNetwork" {
			foundHostNS = true
		}
	}
	if !foundHostNS {
		t.Error("expected a hostNamespace violation for hostNetwork")
	}
}

func TestSecurityScanHandler_CheckPodSecurity_HostPID(t *testing.T) {
	podSpec := map[string]any{
		"hostPID": true,
		"containers": []any{
			map[string]any{
				"name":  "app",
				"image": "nginx",
			},
		},
	}

	h := NewSecurityScanHandler(nil)
	result := h.CheckPodSecurity(podSpec)

	if result.Level != "privileged" {
		t.Errorf("expected level %q with hostPID, got %q", "privileged", result.Level)
	}
}

func TestSecurityScanHandler_CheckPodSecurity_HostIPC(t *testing.T) {
	podSpec := map[string]any{
		"hostIPC": true,
		"containers": []any{
			map[string]any{
				"name":  "app",
				"image": "nginx",
			},
		},
	}

	h := NewSecurityScanHandler(nil)
	result := h.CheckPodSecurity(podSpec)

	if result.Level != "privileged" {
		t.Errorf("expected level %q with hostIPC, got %q", "privileged", result.Level)
	}
}

func TestSecurityScanHandler_CheckPodSecurity_EmptyPodSpec(t *testing.T) {
	podSpec := map[string]any{}

	h := NewSecurityScanHandler(nil)
	result := h.CheckPodSecurity(podSpec)

	if result == nil {
		t.Fatal("expected non-nil result for empty pod spec")
	}
	// Empty spec should still return a valid check result
	if result.Level == "" {
		t.Error("expected a non-empty level")
	}
}

func TestSecurityScanHandler_CheckPodSecurity_NilPodSpec(t *testing.T) {
	h := NewSecurityScanHandler(nil)
	result := h.CheckPodSecurity(nil)

	if result == nil {
		t.Fatal("expected non-nil result for nil pod spec")
	}
}

func TestSecurityScanHandler_CheckPodSecurity_MultipleContainers(t *testing.T) {
	podSpec := map[string]any{
		"containers": []any{
			map[string]any{
				"name":  "secure",
				"image": "nginx",
				"securityContext": map[string]any{
					"runAsNonRoot":           true,
					"readOnlyRootFilesystem": true,
				},
				"resources": map[string]any{
					"limits": map[string]any{"cpu": "100m"},
				},
			},
			map[string]any{
				"name":  "insecure",
				"image": "nginx",
				"securityContext": map[string]any{
					"privileged": true,
				},
			},
		},
	}

	h := NewSecurityScanHandler(nil)
	result := h.CheckPodSecurity(podSpec)

	if result.Level != "privileged" {
		t.Errorf("expected level %q when any container is privileged, got %q", "privileged", result.Level)
	}

	// Should have violations from the insecure container
	if len(result.Violations) == 0 {
		t.Error("expected violations for insecure container")
	}
}

func TestSecurityScanHandler_CheckPodSecurity_InitContainers(t *testing.T) {
	podSpec := map[string]any{
		"containers": []any{
			map[string]any{
				"name":  "app",
				"image": "nginx",
				"securityContext": map[string]any{
					"runAsNonRoot":           true,
					"readOnlyRootFilesystem": true,
				},
				"resources": map[string]any{
					"limits": map[string]any{"cpu": "100m"},
				},
			},
		},
		"initContainers": []any{
			map[string]any{
				"name":  "init",
				"image": "busybox",
				"securityContext": map[string]any{
					"privileged": true,
				},
			},
		},
	}

	h := NewSecurityScanHandler(nil)
	result := h.CheckPodSecurity(podSpec)

	if result.Level != "privileged" {
		t.Errorf("expected level %q when init container is privileged, got %q", "privileged", result.Level)
	}

	foundInitViolation := false
	for _, v := range result.Violations {
		if v.Category == "privileged" && v.Field == "initContainers[0].securityContext.privileged" {
			foundInitViolation = true
		}
	}
	if !foundInitViolation {
		t.Error("expected a privileged violation for initContainers[0]")
	}
}

func TestSecurityScanHandler_CheckPodSecurity_NoSecurityContext(t *testing.T) {
	podSpec := map[string]any{
		"containers": []any{
			map[string]any{
				"name":  "app",
				"image": "nginx",
				// No securityContext at all
			},
		},
	}

	h := NewSecurityScanHandler(nil)
	result := h.CheckPodSecurity(podSpec)

	// Should have violations for missing security settings
	if len(result.Violations) == 0 {
		t.Error("expected violations when no securityContext is set")
	}

	// Should have at least runAsRoot and rootFilesystem and resources violations
	categories := make(map[string]bool)
	for _, v := range result.Violations {
		categories[v.Category] = true
	}
	if !categories["runAsRoot"] {
		t.Error("expected runAsRoot violation when no securityContext")
	}
	if !categories["rootFilesystem"] {
		t.Error("expected rootFilesystem violation when no securityContext")
	}
	if !categories["resources"] {
		t.Error("expected resources violation when no resources")
	}
}

func TestSecurityScanHandler_CheckPodSecurity_AllHostNamespaces(t *testing.T) {
	podSpec := map[string]any{
		"hostNetwork": true,
		"hostPID":     true,
		"hostIPC":     true,
		"containers": []any{
			map[string]any{
				"name":  "app",
				"image": "nginx",
			},
		},
	}

	h := NewSecurityScanHandler(nil)
	result := h.CheckPodSecurity(podSpec)

	if result.Level != "privileged" {
		t.Errorf("expected level %q, got %q", "privileged", result.Level)
	}

	hostNSCount := 0
	for _, v := range result.Violations {
		if v.Category == "hostNamespace" {
			hostNSCount++
		}
	}
	if hostNSCount != 3 {
		t.Errorf("expected 3 hostNamespace violations (network + PID + IPC), got %d", hostNSCount)
	}
}
