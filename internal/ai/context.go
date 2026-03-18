package ai

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"clusterfudge/internal/cluster"
	"clusterfudge/internal/k8s"
	"clusterfudge/internal/resource"
	"clusterfudge/internal/troubleshoot"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	sigyaml "sigs.k8s.io/yaml"
)

const (
	logTailLines   int64 = 200
	contextTimeout       = 30 * time.Second
)

// ContextGatherer collects Kubernetes debugging context for a pod.
type ContextGatherer struct {
	manager  *cluster.Manager
	svc      *resource.Service
	tsEngine *troubleshoot.Engine
}

// NewContextGatherer creates a new ContextGatherer.
func NewContextGatherer(mgr *cluster.Manager, svc *resource.Service, tsEngine *troubleshoot.Engine) *ContextGatherer {
	return &ContextGatherer{
		manager:  mgr,
		svc:      svc,
		tsEngine: tsEngine,
	}
}

// GatherAndWrite collects pod debugging context and writes it to a temp file.
// Returns the path to the temp file. Caller is responsible for cleanup.
func (g *ContextGatherer) GatherAndWrite(namespace, name string) (string, error) {
	cs, err := g.manager.ActiveClient()
	if err != nil {
		return "", fmt.Errorf("no active cluster connection: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), contextTimeout)
	defer cancel()

	var buf bytes.Buffer
	buf.WriteString("# Kubernetes Pod Debugging Context\n\n")
	fmt.Fprintf(&buf, "## Pod: %s/%s\n\n", namespace, name)

	// 1. Pod YAML (stripped of sensitive data)
	podYAML, status := g.gatherPodYAML(ctx, cs, namespace, name)
	buf.WriteString("### Status YAML\n```yaml\n")
	buf.WriteString(podYAML)
	buf.WriteString("\n```\n\n")

	// 2. Recent events
	events := g.gatherEvents(ctx, cs, namespace, name)
	buf.WriteString("### Recent Events\n")
	if events == "" {
		buf.WriteString("No recent events found.\n")
	} else {
		buf.WriteString(events)
	}
	buf.WriteString("\n\n")

	// 3. Container logs
	logs := g.gatherLogs(ctx, cs, namespace, name)
	buf.WriteString("### Container Logs (last 200 lines)\n```\n")
	if logs == "" {
		buf.WriteString("No logs available.\n")
	} else {
		buf.WriteString(logs)
	}
	buf.WriteString("\n```\n\n")

	// 4. Automated pre-analysis
	if g.tsEngine != nil {
		inv := g.tsEngine.Investigate("Pod", namespace, name, status)
		buf.WriteString("### Automated Pre-Analysis\n")
		fmt.Fprintf(&buf, "**Problem:** %s\n\n", inv.Problem)
		if inv.RootCause != "" {
			fmt.Fprintf(&buf, "**Root Cause:** %s\n\n", inv.RootCause)
		}
		for _, s := range inv.Suggestions {
			fmt.Fprintf(&buf, "- **%s**: %s\n", s.Title, s.Description)
		}
		buf.WriteString("\n")
	}

	// Write to temp file
	f, err := os.CreateTemp("", "kv-ai-*.md")
	if err != nil {
		return "", fmt.Errorf("create temp file: %w", err)
	}
	defer f.Close()

	if _, err := f.Write(buf.Bytes()); err != nil {
		_ = os.Remove(f.Name())
		return "", fmt.Errorf("write temp file: %w", err)
	}

	return f.Name(), nil
}

// gatherPodYAML fetches the pod and returns sanitized YAML plus status map for troubleshooting.
func (g *ContextGatherer) gatherPodYAML(ctx context.Context, cs *k8s.ClientSet, namespace, name string) (string, map[string]any) {
	q := resource.ResourceQuery{
		Group:     "",
		Version:   "v1",
		Resource:  "pods",
		Namespace: namespace,
		Name:      name,
	}

	item, err := g.svc.Get(ctx, cs.Dynamic, q)
	if err != nil {
		return fmt.Sprintf("# Error fetching pod: %v", err), nil
	}

	raw := item.Raw
	sanitizeResource(raw)

	yamlBytes, err := sigyaml.Marshal(raw)
	if err != nil {
		return fmt.Sprintf("# Error marshalling YAML: %v", err), nil
	}

	// Extract status for troubleshoot engine
	status := extractPodStatus(raw)
	return string(yamlBytes), status
}

// gatherEvents fetches recent events for the pod.
func (g *ContextGatherer) gatherEvents(ctx context.Context, cs *k8s.ClientSet, namespace, name string) string {
	fieldSelector := fmt.Sprintf("involvedObject.name=%s,involvedObject.namespace=%s,involvedObject.kind=Pod", name, namespace)
	eventList, err := cs.Typed.CoreV1().Events(namespace).List(ctx, metav1.ListOptions{
		FieldSelector: fieldSelector,
	})
	if err != nil {
		return fmt.Sprintf("Error fetching events: %v", err)
	}

	if len(eventList.Items) == 0 {
		return ""
	}

	var buf bytes.Buffer
	buf.WriteString("| Type | Reason | Age | Message |\n")
	buf.WriteString("|------|--------|-----|--------|\n")
	for _, ev := range eventList.Items {
		age := time.Since(ev.LastTimestamp.Time).Truncate(time.Second)
		fmt.Fprintf(&buf, "| %s | %s | %s | %s |\n",
			ev.Type, ev.Reason, age, strings.ReplaceAll(ev.Message, "\n", " "))
	}
	return buf.String()
}

// gatherLogs fetches the last N lines of logs from the first container.
func (g *ContextGatherer) gatherLogs(ctx context.Context, cs *k8s.ClientSet, namespace, name string) string {
	tailLines := logTailLines
	req := cs.Typed.CoreV1().Pods(namespace).GetLogs(name, &corev1.PodLogOptions{
		TailLines: &tailLines,
	})
	rc, err := req.Stream(ctx)
	if err != nil {
		return fmt.Sprintf("Error fetching logs: %v", err)
	}
	defer rc.Close()

	const maxBytes = 512 * 1024 // 512 KiB
	data, err := io.ReadAll(io.LimitReader(rc, maxBytes))
	if err != nil {
		return fmt.Sprintf("Error reading logs: %v", err)
	}
	return string(data)
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

// extractPodStatus builds a status map for the troubleshoot engine.
func extractPodStatus(raw map[string]any) map[string]any {
	status := make(map[string]any)
	podStatus, _ := raw["status"].(map[string]any)
	if podStatus == nil {
		return status
	}

	if phase, ok := podStatus["phase"].(string); ok {
		status["phase"] = phase
	}

	// Check container statuses for crash reasons
	containerStatuses, _ := podStatus["containerStatuses"].([]any)
	for _, cs := range containerStatuses {
		csMap, ok := cs.(map[string]any)
		if !ok {
			continue
		}
		stateMap, ok := csMap["state"].(map[string]any)
		if !ok {
			continue
		}
		// Check waiting state
		if waiting, ok := stateMap["waiting"].(map[string]any); ok {
			if reason, ok := waiting["reason"].(string); ok {
				status["reason"] = reason
			}
			if message, ok := waiting["message"].(string); ok {
				status["message"] = message
			}
		}
		// Check terminated state
		if terminated, ok := stateMap["terminated"].(map[string]any); ok {
			if reason, ok := terminated["reason"].(string); ok {
				status["reason"] = reason
			}
			if exitCode, ok := terminated["exitCode"]; ok {
				status["exitCode"] = exitCode
			}
		}
	}

	return status
}
