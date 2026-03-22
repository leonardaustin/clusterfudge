package backup

import (
	"bytes"

	"sigs.k8s.io/yaml"
)

// serverFields are metadata fields added by the server that should be stripped for clean exports.
var serverFields = []string{
	"resourceVersion",
	"uid",
	"creationTimestamp",
	"managedFields",
	"generation",
}

// StripServerFields removes server-side metadata and status from a resource manifest.
func StripServerFields(manifest map[string]any) map[string]any {
	result := make(map[string]any, len(manifest))
	for k, v := range manifest {
		result[k] = v
	}

	// Remove status
	delete(result, "status")

	// Remove server-side metadata fields
	if meta, ok := result["metadata"].(map[string]any); ok {
		cleaned := make(map[string]any, len(meta))
		for k, v := range meta {
			cleaned[k] = v
		}
		for _, field := range serverFields {
			delete(cleaned, field)
		}
		result["metadata"] = cleaned
	}

	return result
}

// FormatAsYAML formats a slice of resource manifests as multi-document YAML.
func FormatAsYAML(resources []map[string]any) (string, error) {
	var buf bytes.Buffer
	for i, r := range resources {
		if i > 0 {
			buf.WriteString("---\n")
		}
		data, err := yaml.Marshal(r)
		if err != nil {
			return "", err
		}
		buf.Write(data)
	}
	return buf.String(), nil
}
