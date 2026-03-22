package ai

import (
	"testing"
)

func TestSanitizeResource_Secret(t *testing.T) {
	raw := map[string]any{
		"kind": "Secret",
		"metadata": map[string]any{
			"name":          "my-secret",
			"managedFields": []any{"should be removed"},
		},
		"data": map[string]any{
			"password": "c2VjcmV0",
			"token":    "dG9rZW4=",
		},
		"stringData": map[string]any{
			"key": "plaintext",
		},
	}

	sanitizeResource(raw)

	// managedFields should be removed
	meta := raw["metadata"].(map[string]any)
	if _, ok := meta["managedFields"]; ok {
		t.Error("managedFields should be removed")
	}

	// Secret data values should be redacted
	data := raw["data"].(map[string]any)
	for k, v := range data {
		if v != "<REDACTED>" {
			t.Errorf("data[%s] should be <REDACTED>, got %v", k, v)
		}
	}

	stringData := raw["stringData"].(map[string]any)
	for k, v := range stringData {
		if v != "<REDACTED>" {
			t.Errorf("stringData[%s] should be <REDACTED>, got %v", k, v)
		}
	}
}

func TestSanitizeResource_ConfigMap(t *testing.T) {
	raw := map[string]any{
		"kind": "ConfigMap",
		"metadata": map[string]any{
			"name": "my-cm",
		},
		"data": map[string]any{
			"config.yaml": "some: data",
		},
	}

	sanitizeResource(raw)

	data := raw["data"].(map[string]any)
	if data["config.yaml"] != "<REDACTED>" {
		t.Error("ConfigMap data values should be redacted")
	}
}

func TestSanitizeResource_Pod(t *testing.T) {
	raw := map[string]any{
		"kind": "Pod",
		"metadata": map[string]any{
			"name":          "my-pod",
			"managedFields": []any{"noisy"},
		},
		"spec": map[string]any{
			"containers": []any{},
		},
	}

	sanitizeResource(raw)

	// managedFields should be removed, but pod data should be preserved
	meta := raw["metadata"].(map[string]any)
	if _, ok := meta["managedFields"]; ok {
		t.Error("managedFields should be removed from pod")
	}
	if _, ok := raw["spec"]; !ok {
		t.Error("spec should be preserved for pod")
	}
}

func TestSanitizeResource_PodEnvVars(t *testing.T) {
	raw := map[string]any{
		"kind": "Pod",
		"metadata": map[string]any{
			"name": "test-pod",
		},
		"spec": map[string]any{
			"containers": []any{
				map[string]any{
					"name": "app",
					"env": []any{
						map[string]any{"name": "DB_PASSWORD", "value": "s3cret"},
						map[string]any{"name": "API_KEY", "value": "key-123"},
						map[string]any{"name": "APP_NAME", "value": "myapp"},
						map[string]any{"name": "DB_HOST", "valueFrom": map[string]any{
							"secretKeyRef": map[string]any{"name": "db-secret", "key": "host"},
						}},
					},
				},
			},
		},
	}

	sanitizeResource(raw)

	spec := raw["spec"].(map[string]any)
	containers := spec["containers"].([]any)
	envs := containers[0].(map[string]any)["env"].([]any)

	// DB_PASSWORD should be redacted (contains PASSWORD)
	if envs[0].(map[string]any)["value"] != "<REDACTED>" {
		t.Error("DB_PASSWORD value should be redacted")
	}
	// API_KEY should be redacted (contains KEY)
	if envs[1].(map[string]any)["value"] != "<REDACTED>" {
		t.Error("API_KEY value should be redacted")
	}
	// APP_NAME should NOT be redacted (no sensitive pattern)
	if envs[2].(map[string]any)["value"] != "myapp" {
		t.Error("APP_NAME value should be preserved")
	}
	// DB_HOST with valueFrom should be redacted
	if envs[3].(map[string]any)["value"] != "<REDACTED>" {
		t.Error("DB_HOST (valueFrom) value should be redacted")
	}
}
