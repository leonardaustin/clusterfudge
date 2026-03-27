package ai

import (
	"bytes"
	"context"
	"fmt"
	"strings"
	"time"

	"clusterfudge/internal/cluster"
	"clusterfudge/internal/k8s"
	"clusterfudge/internal/resource"

	sigyaml "sigs.k8s.io/yaml"
)

const contextTimeout = 30 * time.Second

// ContextGatherer collects Kubernetes debugging context for a pod.
type ContextGatherer struct {
	manager *cluster.Manager
	svc     *resource.Service
}

// NewContextGatherer creates a new ContextGatherer.
func NewContextGatherer(mgr *cluster.Manager, svc *resource.Service) *ContextGatherer {
	return &ContextGatherer{
		manager: mgr,
		svc:     svc,
	}
}

// GatherPrompt collects pod details and returns a prompt string for the AI.
// It includes the sanitized pod YAML and kubectl instructions so the AI
// can fetch logs and events itself.
func (g *ContextGatherer) GatherPrompt(namespace, name string) (string, error) {
	cs, err := g.manager.ActiveClient()
	if err != nil {
		return "", fmt.Errorf("no active cluster connection: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), contextTimeout)
	defer cancel()

	podYAML := g.gatherPodYAML(ctx, cs, namespace, name)

	kubeconfigPath := g.manager.Loader().ResolvedPath()
	contextName := g.manager.ActiveContext()

	var buf bytes.Buffer
	buf.WriteString("Here are the details of the K8s pod I want to look into:\n\n")
	buf.WriteString("```yaml\n")
	buf.WriteString(podYAML)
	buf.WriteString("\n```\n\n")
	fmt.Fprintf(&buf, "You can use kubectl to investigate further (get logs, describe, events, etc.). Use:\n")
	fmt.Fprintf(&buf, "```\nkubectl --kubeconfig=%s --context=%s -n %s ...\n```\n\n",
		kubeconfigPath, contextName, namespace)
	buf.WriteString("Please wait for future instructions.")

	return buf.String(), nil
}

// gatherPodYAML fetches the pod and returns sanitized YAML.
func (g *ContextGatherer) gatherPodYAML(ctx context.Context, cs *k8s.ClientSet, namespace, name string) string {
	q := resource.ResourceQuery{
		Group:     "",
		Version:   "v1",
		Resource:  "pods",
		Namespace: namespace,
		Name:      name,
	}

	item, err := g.svc.Get(ctx, cs.Dynamic, q)
	if err != nil {
		return fmt.Sprintf("# Error fetching pod: %v", err)
	}

	raw := item.Raw
	sanitizeResource(raw)

	yamlBytes, err := sigyaml.Marshal(raw)
	if err != nil {
		return fmt.Sprintf("# Error marshalling YAML: %v", err)
	}

	return string(yamlBytes)
}

// sanitizeResource strips sensitive data fields from a resource map.
func sanitizeResource(raw map[string]any) {
	// Remove managedFields (noisy, not useful for debugging)
	if metadata, ok := raw["metadata"].(map[string]any); ok {
		delete(metadata, "managedFields")
	}

	// Strip secret data values (keep keys only)
	if kind, _ := raw["kind"].(string); kind == "Secret" {
		if data, ok := raw["data"].(map[string]any); ok {
			for k := range data {
				data[k] = "<REDACTED>"
			}
		}
		if stringData, ok := raw["stringData"].(map[string]any); ok {
			for k := range stringData {
				stringData[k] = "<REDACTED>"
			}
		}
	}

	// Redact sensitive env vars in pod specs (PASSWORD, SECRET, TOKEN, KEY, CREDENTIAL patterns)
	if kind, _ := raw["kind"].(string); kind == "Pod" {
		if spec, ok := raw["spec"].(map[string]any); ok {
			redactContainerEnvVars(spec)
		}
	}

	// Strip ConfigMap values (keep keys only) — avoids leaking secrets stored in CMs
	if kind, _ := raw["kind"].(string); kind == "ConfigMap" {
		if data, ok := raw["data"].(map[string]any); ok {
			for k := range data {
				data[k] = "<REDACTED>"
			}
		}
	}
}

// sensitiveEnvPatterns are substrings that indicate a sensitive env var name.
var sensitiveEnvPatterns = []string{"SECRET", "PASSWORD", "TOKEN", "KEY", "CREDENTIAL", "API_KEY", "APIKEY"}

// redactContainerEnvVars redacts env var values whose names match sensitive patterns.
func redactContainerEnvVars(spec map[string]any) {
	for _, containerKey := range []string{"containers", "initContainers"} {
		containers, _ := spec[containerKey].([]any)
		for _, c := range containers {
			cMap, ok := c.(map[string]any)
			if !ok {
				continue
			}
			envs, _ := cMap["env"].([]any)
			for _, e := range envs {
				eMap, ok := e.(map[string]any)
				if !ok {
					continue
				}
				envName, _ := eMap["name"].(string)
				upper := strings.ToUpper(envName)
				for _, pattern := range sensitiveEnvPatterns {
					if strings.Contains(upper, pattern) {
						eMap["value"] = "<REDACTED>"
						break
					}
				}
				// Always redact env vars from valueFrom (secretKeyRef, etc.)
				if _, hasValueFrom := eMap["valueFrom"]; hasValueFrom {
					eMap["value"] = "<REDACTED>"
				}
			}
		}
	}
}
