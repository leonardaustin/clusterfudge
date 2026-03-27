package security

import "testing"

func TestCheckPodSecurityPrivileged(t *testing.T) {
	podSpec := map[string]any{
		"containers": []any{
			map[string]any{
				"name": "test",
				"securityContext": map[string]any{
					"privileged": true,
				},
			},
		},
	}

	result := CheckPodSecurity(podSpec)
	if result.Level != "privileged" {
		t.Errorf("expected privileged level, got %s", result.Level)
	}
	assertHasViolation(t, result, "privileged")
}

func TestCheckPodSecurityRunAsRoot(t *testing.T) {
	podSpec := map[string]any{
		"containers": []any{
			map[string]any{
				"name":            "test",
				"securityContext": map[string]any{},
			},
		},
	}

	result := CheckPodSecurity(podSpec)
	assertHasViolation(t, result, "runAsRoot")
}

func TestCheckPodSecurityHostNetwork(t *testing.T) {
	podSpec := map[string]any{
		"hostNetwork": true,
		"containers": []any{
			map[string]any{"name": "test"},
		},
	}

	result := CheckPodSecurity(podSpec)
	if result.Level != "privileged" {
		t.Errorf("expected privileged level, got %s", result.Level)
	}
	assertHasViolation(t, result, "hostNamespace")
}

func TestCheckPodSecurityDangerousCaps(t *testing.T) {
	podSpec := map[string]any{
		"containers": []any{
			map[string]any{
				"name": "test",
				"securityContext": map[string]any{
					"capabilities": map[string]any{
						"add": []any{"SYS_ADMIN"},
					},
				},
			},
		},
	}

	result := CheckPodSecurity(podSpec)
	assertHasViolation(t, result, "capabilities")
}

func TestCheckPodSecurityNoResourceLimits(t *testing.T) {
	podSpec := map[string]any{
		"containers": []any{
			map[string]any{"name": "test"},
		},
	}

	result := CheckPodSecurity(podSpec)
	assertHasViolation(t, result, "resources")
}

func TestCheckPodSecurityRestricted(t *testing.T) {
	podSpec := map[string]any{
		"containers": []any{
			map[string]any{
				"name": "test",
				"securityContext": map[string]any{
					"runAsNonRoot":           true,
					"readOnlyRootFilesystem": true,
				},
				"resources": map[string]any{
					"limits": map[string]any{
						"cpu":    "100m",
						"memory": "128Mi",
					},
				},
			},
		},
	}

	result := CheckPodSecurity(podSpec)
	if result.Level != "restricted" {
		t.Errorf("expected restricted level, got %s", result.Level)
	}
	if len(result.Violations) != 0 {
		t.Errorf("expected 0 violations, got %d", len(result.Violations))
	}
}

func assertHasViolation(t *testing.T, check *PodSecurityCheck, category string) {
	t.Helper()
	for _, v := range check.Violations {
		if v.Category == category {
			return
		}
	}
	t.Errorf("expected violation with category %q, not found", category)
}
