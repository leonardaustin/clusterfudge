package handlers

import (
	"testing"
)

func TestNewBackupHandler(t *testing.T) {
	h := NewBackupHandler(nil, nil)
	if h == nil {
		t.Fatal("expected non-nil handler")
	}
}

func TestBackupHandler_StripManifest_RemovesStatus(t *testing.T) {
	manifest := map[string]any{
		"apiVersion": "v1",
		"kind":       "Service",
		"metadata": map[string]any{
			"name":      "my-svc",
			"namespace": "default",
		},
		"spec": map[string]any{
			"type": "ClusterIP",
		},
		"status": map[string]any{
			"loadBalancer": map[string]any{},
		},
	}

	h := NewBackupHandler(nil, nil)
	result := h.StripManifest(manifest)

	if _, ok := result["status"]; ok {
		t.Error("expected status to be removed")
	}
	if result["apiVersion"] != "v1" {
		t.Errorf("expected apiVersion %q, got %v", "v1", result["apiVersion"])
	}
	if result["kind"] != "Service" {
		t.Errorf("expected kind %q, got %v", "Service", result["kind"])
	}
}

func TestBackupHandler_StripManifest_RemovesServerFields(t *testing.T) {
	manifest := map[string]any{
		"apiVersion": "apps/v1",
		"kind":       "Deployment",
		"metadata": map[string]any{
			"name":              "my-deploy",
			"namespace":         "default",
			"resourceVersion":   "12345",
			"uid":               "abc-123",
			"creationTimestamp":  "2024-01-01T00:00:00Z",
			"managedFields":     []any{},
			"generation":        int64(3),
			"labels":            map[string]any{"app": "test"},
		},
	}

	h := NewBackupHandler(nil, nil)
	result := h.StripManifest(manifest)

	meta, ok := result["metadata"].(map[string]any)
	if !ok {
		t.Fatal("expected metadata to be a map")
	}

	serverFields := []string{"resourceVersion", "uid", "creationTimestamp", "managedFields", "generation"}
	for _, field := range serverFields {
		if _, ok := meta[field]; ok {
			t.Errorf("expected server field %q to be removed", field)
		}
	}

	// Preserved fields should still exist
	if meta["name"] != "my-deploy" {
		t.Errorf("expected name to be preserved, got %v", meta["name"])
	}
	if meta["namespace"] != "default" {
		t.Errorf("expected namespace to be preserved, got %v", meta["namespace"])
	}
	labels, ok := meta["labels"].(map[string]any)
	if !ok {
		t.Fatal("expected labels to be preserved")
	}
	if labels["app"] != "test" {
		t.Errorf("expected label app=test, got %v", labels["app"])
	}
}

func TestBackupHandler_StripManifest_NoMetadata(t *testing.T) {
	manifest := map[string]any{
		"apiVersion": "v1",
		"kind":       "ConfigMap",
	}

	h := NewBackupHandler(nil, nil)
	result := h.StripManifest(manifest)

	if result["apiVersion"] != "v1" {
		t.Errorf("expected apiVersion %q, got %v", "v1", result["apiVersion"])
	}
	if result["kind"] != "ConfigMap" {
		t.Errorf("expected kind %q, got %v", "ConfigMap", result["kind"])
	}
}

func TestBackupHandler_StripManifest_EmptyManifest(t *testing.T) {
	manifest := map[string]any{}

	h := NewBackupHandler(nil, nil)
	result := h.StripManifest(manifest)

	if len(result) != 0 {
		t.Errorf("expected empty result, got %v", result)
	}
}

func TestBackupHandler_StripManifest_DoesNotMutateOriginal(t *testing.T) {
	manifest := map[string]any{
		"apiVersion": "v1",
		"kind":       "Pod",
		"metadata": map[string]any{
			"name":            "my-pod",
			"resourceVersion": "999",
		},
		"status": map[string]any{
			"phase": "Running",
		},
	}

	h := NewBackupHandler(nil, nil)
	_ = h.StripManifest(manifest)

	// The original should still have status and resourceVersion
	if _, ok := manifest["status"]; !ok {
		t.Error("original manifest should still have status")
	}
	meta, ok := manifest["metadata"].(map[string]any)
	if !ok {
		t.Fatal("original metadata should still be a map")
	}
	if _, ok := meta["resourceVersion"]; !ok {
		t.Error("original metadata should still have resourceVersion")
	}
}

func TestBackupHandler_StripManifest_PreservesSpec(t *testing.T) {
	manifest := map[string]any{
		"apiVersion": "apps/v1",
		"kind":       "Deployment",
		"metadata": map[string]any{
			"name": "my-deploy",
		},
		"spec": map[string]any{
			"replicas": int64(3),
			"selector": map[string]any{
				"matchLabels": map[string]any{"app": "test"},
			},
		},
		"status": map[string]any{
			"replicas": int64(3),
		},
	}

	h := NewBackupHandler(nil, nil)
	result := h.StripManifest(manifest)

	spec, ok := result["spec"].(map[string]any)
	if !ok {
		t.Fatal("expected spec to be preserved")
	}
	if spec["replicas"] != int64(3) {
		t.Errorf("expected replicas 3, got %v", spec["replicas"])
	}
	if _, ok := result["status"]; ok {
		t.Error("expected status to be removed")
	}
}

func TestBackupHandler_StripManifest_MetadataOnlyServerFields(t *testing.T) {
	manifest := map[string]any{
		"apiVersion": "v1",
		"kind":       "ConfigMap",
		"metadata": map[string]any{
			"resourceVersion":  "12345",
			"uid":              "abc-123",
			"creationTimestamp": "2024-01-01T00:00:00Z",
		},
	}

	h := NewBackupHandler(nil, nil)
	result := h.StripManifest(manifest)

	meta, ok := result["metadata"].(map[string]any)
	if !ok {
		t.Fatal("expected metadata to be a map")
	}
	if len(meta) != 0 {
		t.Errorf("expected empty metadata after stripping, got %v", meta)
	}
}

func TestSplitYAMLDocuments(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  int
	}{
		{"single doc", "apiVersion: v1\nkind: Pod", 1},
		{"two docs", "apiVersion: v1\nkind: Pod\n---\napiVersion: v1\nkind: Service", 2},
		{"empty", "", 0},
		{"only separator", "---", 0},
		{"trailing separator", "apiVersion: v1\nkind: Pod\n---\n", 1},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			docs := splitYAMLDocuments(tt.input)
			if len(docs) != tt.want {
				t.Errorf("splitYAMLDocuments(%q) = %d docs, want %d", tt.input, len(docs), tt.want)
			}
		})
	}
}
