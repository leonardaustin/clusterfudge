package troubleshoot

import (
	"fmt"
	"time"
)

type Engine struct {
	timeline *Timeline
}

func NewEngine(timeline *Timeline) *Engine {
	return &Engine{timeline: timeline}
}

func (e *Engine) Investigate(kind, namespace, name string, status map[string]any) *Investigation {
	inv := &Investigation{
		ResourceKind: kind,
		ResourceName: name,
		Namespace:    namespace,
		Since:        time.Now().Add(-1 * time.Hour),
	}

	e.diagnose(inv, status)

	inv.RelatedChanges = e.timeline.Query(kind, namespace, name, inv.Since)

	if inv.RootCause == "" && len(inv.RelatedChanges) > 0 {
		inv.Problem = "Resource has recent changes"
		inv.RootCause = "Recent modifications detected — review timeline for details"
	}

	if inv.Problem == "" {
		inv.Problem = "No known issues detected"
	}

	return inv
}

func (e *Engine) diagnose(inv *Investigation, status map[string]any) {
	reason := strVal(status, "reason")
	exitCode := intVal(status, "exitCode")
	phase := strVal(status, "phase")
	message := strVal(status, "message")

	// CrashLoopBackOff
	if reason == "CrashLoopBackOff" {
		inv.Problem = "Pod is crash-looping"
		inv.RootCause = "Application error — check container logs"
		inv.Checks = append(inv.Checks, Check{Name: "CrashLoopBackOff", Status: "fail", Detail: "Container is repeatedly crashing"})
		inv.Suggestions = append(inv.Suggestions,
			Suggestion{Title: "View container logs", Description: "Check recent logs for crash details", ActionType: "view_logs", ActionRef: fmt.Sprintf("%s/%s", inv.Namespace, inv.ResourceName)},
			Suggestion{Title: "Describe pod", Description: "View pod events and status details", ActionType: "describe", ActionRef: fmt.Sprintf("%s/%s", inv.Namespace, inv.ResourceName)},
		)
	} else {
		inv.Checks = append(inv.Checks, Check{Name: "CrashLoopBackOff", Status: "pass", Detail: "No crash loop detected"})
	}

	// OOMKilled
	if reason == "OOMKilled" {
		inv.Problem = "Container was OOM killed"
		inv.RootCause = "Memory limit exceeded — increase resources.limits.memory"
		inv.Checks = append(inv.Checks, Check{Name: "OOMKilled", Status: "fail", Detail: "Container exceeded memory limits"})
		inv.Suggestions = append(inv.Suggestions,
			Suggestion{Title: "View container logs", Description: "Check logs before the OOM kill", ActionType: "view_logs", ActionRef: fmt.Sprintf("%s/%s", inv.Namespace, inv.ResourceName)},
			Suggestion{Title: "Check resource limits", Description: "Review and increase memory limits", ActionType: "describe", ActionRef: fmt.Sprintf("%s/%s", inv.Namespace, inv.ResourceName)},
		)
	} else {
		inv.Checks = append(inv.Checks, Check{Name: "OOMKilled", Status: "pass", Detail: "No OOM kills detected"})
	}

	// ImagePullBackOff
	if reason == "ImagePullBackOff" || reason == "ErrImagePull" {
		inv.Problem = "Image pull failed"
		inv.RootCause = "Image pull failed — check image name, tag, and pull secrets"
		inv.Checks = append(inv.Checks, Check{Name: "ImagePull", Status: "fail", Detail: fmt.Sprintf("Image pull error: %s", reason)})
		inv.Suggestions = append(inv.Suggestions,
			Suggestion{Title: "Describe pod", Description: "View image pull error details", ActionType: "describe", ActionRef: fmt.Sprintf("%s/%s", inv.Namespace, inv.ResourceName)},
		)
	} else {
		inv.Checks = append(inv.Checks, Check{Name: "ImagePull", Status: "pass", Detail: "Images pulled successfully"})
	}

	// Pending phase
	if phase == "Pending" {
		inv.Checks = append(inv.Checks, Check{Name: "Scheduling", Status: "fail", Detail: "Pod stuck in Pending state"})
		if inv.Problem == "" {
			inv.Problem = "Pod is stuck in Pending state"
			if message != "" {
				inv.RootCause = fmt.Sprintf("Insufficient resources — %s", message)
			} else {
				inv.RootCause = "Insufficient resources — check node capacity or resource quotas"
			}
		}
		inv.Suggestions = append(inv.Suggestions,
			Suggestion{Title: "Check node resources", Description: "View node allocatable resources and current usage", ActionType: "describe", ActionRef: "nodes"},
		)
	} else {
		detail := "Pod is scheduled"
		if phase != "" {
			detail = fmt.Sprintf("Phase: %s", phase)
		}
		inv.Checks = append(inv.Checks, Check{Name: "Scheduling", Status: "pass", Detail: detail})
	}

	// Non-zero exit code
	if exitCode != 0 {
		inv.Checks = append(inv.Checks, Check{Name: "ExitCode", Status: "fail", Detail: fmt.Sprintf("Container exited with code %d", exitCode)})
		if inv.Problem == "" {
			inv.Problem = fmt.Sprintf("Container exited with code %d", exitCode)
			inv.RootCause = fmt.Sprintf("Container exited with non-zero exit code %d", exitCode)
		}
		inv.Suggestions = append(inv.Suggestions,
			Suggestion{Title: "View container logs", Description: "Check logs for the exit cause", ActionType: "view_logs", ActionRef: fmt.Sprintf("%s/%s", inv.Namespace, inv.ResourceName)},
		)
	} else {
		inv.Checks = append(inv.Checks, Check{Name: "ExitCode", Status: "pass", Detail: "Exit code 0 (normal)"})
	}

	// Status message
	if message != "" {
		inv.Checks = append(inv.Checks, Check{Name: "StatusMessage", Status: "warn", Detail: message})
	} else {
		inv.Checks = append(inv.Checks, Check{Name: "StatusMessage", Status: "pass", Detail: "No error messages"})
	}
}

func (e *Engine) GetTimeline(kind, namespace, name string) []ChangeRecord {
	return e.timeline.Query(kind, namespace, name, time.Now().Add(-1*time.Hour))
}

func strVal(m map[string]any, key string) string {
	if v, ok := m[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func intVal(m map[string]any, key string) int {
	if v, ok := m[key]; ok {
		switch n := v.(type) {
		case int:
			return n
		case float64:
			return int(n)
		case int64:
			return int(n)
		}
	}
	return 0
}
