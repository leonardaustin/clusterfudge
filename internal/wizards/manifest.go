package wizards

import (
	"encoding/json"
	"fmt"
	"sort"

	sigYAML "sigs.k8s.io/yaml"
)

// DeploymentManifest generates a Kubernetes Deployment YAML from the given spec.
func DeploymentManifest(spec DeploymentSpec) (string, error) {
	if spec.Name == "" {
		return "", fmt.Errorf("deployment name is required")
	}
	if spec.Image == "" {
		return "", fmt.Errorf("deployment image is required")
	}
	if spec.Namespace == "" {
		spec.Namespace = "default"
	}
	if spec.Replicas <= 0 {
		spec.Replicas = 1
	}

	labels := map[string]string{"app": spec.Name}
	for k, v := range spec.Labels {
		labels[k] = v
	}

	container := map[string]any{
		"name":  spec.Name,
		"image": spec.Image,
	}

	if spec.ContainerPort > 0 {
		protocol := spec.Protocol
		if protocol == "" {
			protocol = "TCP"
		}
		container["ports"] = []map[string]any{{
			"containerPort": spec.ContainerPort,
			"protocol":      protocol,
		}}
	}

	resources := map[string]map[string]string{}
	if spec.CPURequest != "" || spec.MemoryRequest != "" {
		requests := map[string]string{}
		if spec.CPURequest != "" {
			requests["cpu"] = spec.CPURequest
		}
		if spec.MemoryRequest != "" {
			requests["memory"] = spec.MemoryRequest
		}
		resources["requests"] = requests
	}
	if spec.CPULimit != "" || spec.MemoryLimit != "" {
		limits := map[string]string{}
		if spec.CPULimit != "" {
			limits["cpu"] = spec.CPULimit
		}
		if spec.MemoryLimit != "" {
			limits["memory"] = spec.MemoryLimit
		}
		resources["limits"] = limits
	}
	if len(resources) > 0 {
		container["resources"] = resources
	}

	if len(spec.EnvVars) > 0 {
		keys := make([]string, 0, len(spec.EnvVars))
		for k := range spec.EnvVars {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		envList := make([]map[string]string, 0, len(spec.EnvVars))
		for _, k := range keys {
			envList = append(envList, map[string]string{
				"name":  k,
				"value": spec.EnvVars[k],
			})
		}
		container["env"] = envList
	}

	manifest := map[string]any{
		"apiVersion": "apps/v1",
		"kind":       "Deployment",
		"metadata": map[string]any{
			"name":      spec.Name,
			"namespace": spec.Namespace,
			"labels":    labels,
		},
		"spec": map[string]any{
			"replicas": spec.Replicas,
			"selector": map[string]any{
				"matchLabels": map[string]string{"app": spec.Name},
			},
			"template": map[string]any{
				"metadata": map[string]any{
					"labels": labels,
				},
				"spec": map[string]any{
					"containers": []any{container},
				},
			},
		},
	}

	return marshalYAML(manifest)
}

// ServiceManifest generates a Kubernetes Service YAML from the given spec.
func ServiceManifest(spec ServiceSpec) (string, error) {
	if spec.Name == "" {
		return "", fmt.Errorf("service name is required")
	}
	if len(spec.Ports) == 0 {
		return "", fmt.Errorf("at least one port is required")
	}
	if spec.Namespace == "" {
		spec.Namespace = "default"
	}
	if spec.Type == "" {
		spec.Type = "ClusterIP"
	}

	ports := make([]map[string]any, len(spec.Ports))
	for i, p := range spec.Ports {
		port := map[string]any{
			"port":       p.Port,
			"targetPort": p.TargetPort,
		}
		if p.Name != "" {
			port["name"] = p.Name
		}
		protocol := p.Protocol
		if protocol == "" {
			protocol = "TCP"
		}
		port["protocol"] = protocol
		ports[i] = port
	}

	manifest := map[string]any{
		"apiVersion": "v1",
		"kind":       "Service",
		"metadata": map[string]any{
			"name":      spec.Name,
			"namespace": spec.Namespace,
		},
		"spec": map[string]any{
			"type":     spec.Type,
			"selector": spec.Selector,
			"ports":    ports,
		},
	}

	return marshalYAML(manifest)
}

// ConfigMapManifest generates a Kubernetes ConfigMap YAML from the given spec.
func ConfigMapManifest(spec ConfigMapSpec) (string, error) {
	if spec.Name == "" {
		return "", fmt.Errorf("configmap name is required")
	}
	if spec.Namespace == "" {
		spec.Namespace = "default"
	}

	metadata := map[string]any{
		"name":      spec.Name,
		"namespace": spec.Namespace,
	}
	if len(spec.Labels) > 0 {
		metadata["labels"] = spec.Labels
	}

	manifest := map[string]any{
		"apiVersion": "v1",
		"kind":       "ConfigMap",
		"metadata":   metadata,
		"data":       spec.Data,
	}

	return marshalYAML(manifest)
}

// SecretManifest generates a Kubernetes Secret YAML from the given spec.
// Values in Data are stored as stringData (plain text) in the manifest.
func SecretManifest(spec SecretSpec) (string, error) {
	if spec.Name == "" {
		return "", fmt.Errorf("secret name is required")
	}
	if spec.Namespace == "" {
		spec.Namespace = "default"
	}
	secretType := spec.Type
	if secretType == "" {
		secretType = "Opaque"
	}

	metadata := map[string]any{
		"name":      spec.Name,
		"namespace": spec.Namespace,
	}
	if len(spec.Labels) > 0 {
		metadata["labels"] = spec.Labels
	}

	manifest := map[string]any{
		"apiVersion": "v1",
		"kind":       "Secret",
		"metadata":   metadata,
		"type":       secretType,
		"stringData": spec.Data,
	}

	return marshalYAML(manifest)
}

func marshalYAML(v any) (string, error) {
	jsonBytes, err := json.Marshal(v)
	if err != nil {
		return "", fmt.Errorf("marshal to JSON: %w", err)
	}
	yamlBytes, err := sigYAML.JSONToYAML(jsonBytes)
	if err != nil {
		return "", fmt.Errorf("convert to YAML: %w", err)
	}
	return string(yamlBytes), nil
}
