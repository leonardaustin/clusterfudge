package backup

import (
	"strings"
	"testing"
)

func TestStripServerFields(t *testing.T) {
	manifest := map[string]any{
		"apiVersion": "v1",
		"kind":       "Pod",
		"metadata": map[string]any{
			"name":              "nginx",
			"namespace":         "default",
			"resourceVersion":   "12345",
			"uid":               "abc-123",
			"creationTimestamp":  "2024-01-01T00:00:00Z",
			"managedFields":     []any{"field1"},
			"generation":        int64(3),
			"labels":            map[string]any{"app": "nginx"},
		},
		"spec": map[string]any{
			"containers": []any{},
		},
		"status": map[string]any{
			"phase": "Running",
		},
	}

	result := StripServerFields(manifest)

	// Status should be removed
	if _, ok := result["status"]; ok {
		t.Fatal("status should be stripped")
	}

	// Spec should remain
	if _, ok := result["spec"]; !ok {
		t.Fatal("spec should remain")
	}

	meta, ok := result["metadata"].(map[string]any)
	if !ok {
		t.Fatal("metadata should exist")
	}

	// Server fields should be removed
	for _, field := range serverFields {
		if _, ok := meta[field]; ok {
			t.Fatalf("%s should be stripped", field)
		}
	}

	// User fields should remain
	if meta["name"] != "nginx" {
		t.Fatal("name should remain")
	}
	if meta["namespace"] != "default" {
		t.Fatal("namespace should remain")
	}
	if _, ok := meta["labels"]; !ok {
		t.Fatal("labels should remain")
	}

	// Original should not be modified
	if _, ok := manifest["status"]; !ok {
		t.Fatal("original manifest should not be modified")
	}
}

func TestStripServerFieldsNoMetadata(t *testing.T) {
	manifest := map[string]any{
		"apiVersion": "v1",
		"kind":       "ConfigMap",
	}
	result := StripServerFields(manifest)
	if result["kind"] != "ConfigMap" {
		t.Fatal("kind should remain")
	}
}

func TestFormatAsYAML(t *testing.T) {
	resources := []map[string]any{
		{"apiVersion": "v1", "kind": "Pod", "metadata": map[string]any{"name": "a"}},
		{"apiVersion": "v1", "kind": "Service", "metadata": map[string]any{"name": "b"}},
	}

	output, err := FormatAsYAML(resources)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !strings.Contains(output, "---") {
		t.Fatal("multi-document YAML should contain separator")
	}
	if !strings.Contains(output, "kind: Pod") {
		t.Fatal("should contain Pod")
	}
	if !strings.Contains(output, "kind: Service") {
		t.Fatal("should contain Service")
	}
}

func TestFormatAsYAMLSingle(t *testing.T) {
	resources := []map[string]any{
		{"apiVersion": "v1", "kind": "Pod"},
	}

	output, err := FormatAsYAML(resources)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if strings.Contains(output, "---") {
		t.Fatal("single document should not contain separator")
	}
}
