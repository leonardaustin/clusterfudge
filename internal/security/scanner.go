package security

import "fmt"

type VulnerabilitySummary struct {
	Workload    string `json:"workload"`
	Namespace   string `json:"namespace"`
	Image       string `json:"image"`
	Critical    int    `json:"critical"`
	High        int    `json:"high"`
	Medium      int    `json:"medium"`
	Low         int    `json:"low"`
	LastScanned string `json:"lastScanned"`
}

type PodSecurityCheck struct {
	PodName    string          `json:"podName"`
	Namespace  string          `json:"namespace"`
	Level      string          `json:"level"` // "privileged", "baseline", "restricted"
	Violations []SecurityIssue `json:"violations"`
}

type SecurityIssue struct {
	Severity    string `json:"severity"` // "critical", "warning", "info"
	Category    string `json:"category"`
	Message     string `json:"message"`
	Field       string `json:"field"`
	Remediation string `json:"remediation"`
}

// CheckPodSecurity evaluates a pod spec for security issues.
func CheckPodSecurity(podSpec map[string]any) *PodSecurityCheck {
	check := &PodSecurityCheck{Level: "restricted"}

	containers, _ := getSlice(podSpec, "containers")
	for i, c := range containers {
		cm, ok := c.(map[string]any)
		if !ok {
			continue
		}
		prefix := fmt.Sprintf("containers[%d]", i)
		checkContainerSecurity(cm, prefix, check)
	}

	initContainers, _ := getSlice(podSpec, "initContainers")
	for i, c := range initContainers {
		cm, ok := c.(map[string]any)
		if !ok {
			continue
		}
		prefix := fmt.Sprintf("initContainers[%d]", i)
		checkContainerSecurity(cm, prefix, check)
	}

	checkHostNamespace(podSpec, check)

	return check
}

func checkContainerSecurity(container map[string]any, prefix string, check *PodSecurityCheck) {
	sc, _ := container["securityContext"].(map[string]any)

	// Privileged container
	if getBool(sc, "privileged") {
		check.Violations = append(check.Violations, SecurityIssue{
			Severity:    "critical",
			Category:    "privileged",
			Message:     "Container runs in privileged mode",
			Field:       prefix + ".securityContext.privileged",
			Remediation: "Set securityContext.privileged to false",
		})
		check.Level = "privileged"
	}

	// Running as root
	if !getBool(sc, "runAsNonRoot") {
		check.Violations = append(check.Violations, SecurityIssue{
			Severity:    "warning",
			Category:    "runAsRoot",
			Message:     "Container may run as root",
			Field:       prefix + ".securityContext.runAsNonRoot",
			Remediation: "Set securityContext.runAsNonRoot to true",
		})
		if check.Level == "restricted" {
			check.Level = "baseline"
		}
	}

	// Writable root filesystem
	if !getBool(sc, "readOnlyRootFilesystem") {
		check.Violations = append(check.Violations, SecurityIssue{
			Severity:    "info",
			Category:    "rootFilesystem",
			Message:     "Container has writable root filesystem",
			Field:       prefix + ".securityContext.readOnlyRootFilesystem",
			Remediation: "Set securityContext.readOnlyRootFilesystem to true",
		})
	}

	// Dangerous capabilities
	if caps, ok := sc["capabilities"].(map[string]any); ok {
		if add, ok := getSlice(caps, "add"); ok {
			dangerous := map[string]bool{"SYS_ADMIN": true, "NET_ADMIN": true}
			for _, cap := range add {
				if s, ok := cap.(string); ok && dangerous[s] {
					check.Violations = append(check.Violations, SecurityIssue{
						Severity:    "critical",
						Category:    "capabilities",
						Message:     fmt.Sprintf("Container has dangerous capability: %s", s),
						Field:       prefix + ".securityContext.capabilities.add",
						Remediation: fmt.Sprintf("Remove %s from capabilities.add", s),
					})
					check.Level = "privileged"
				}
			}
		}
	}

	// No resource limits
	resources, _ := container["resources"].(map[string]any)
	if resources == nil || resources["limits"] == nil {
		check.Violations = append(check.Violations, SecurityIssue{
			Severity:    "warning",
			Category:    "resources",
			Message:     "Container has no resource limits",
			Field:       prefix + ".resources.limits",
			Remediation: "Set resource limits for CPU and memory",
		})
	}
}

func checkHostNamespace(podSpec map[string]any, check *PodSecurityCheck) {
	hostChecks := []struct {
		field   string
		message string
	}{
		{"hostNetwork", "Pod uses host network"},
		{"hostPID", "Pod uses host PID namespace"},
		{"hostIPC", "Pod uses host IPC namespace"},
	}

	for _, hc := range hostChecks {
		if getBool(podSpec, hc.field) {
			check.Violations = append(check.Violations, SecurityIssue{
				Severity:    "critical",
				Category:    "hostNamespace",
				Message:     hc.message,
				Field:       "spec." + hc.field,
				Remediation: fmt.Sprintf("Set %s to false", hc.field),
			})
			check.Level = "privileged"
		}
	}
}

func getBool(m map[string]any, key string) bool {
	if m == nil {
		return false
	}
	v, ok := m[key].(bool)
	return ok && v
}

func getSlice(m map[string]any, key string) ([]any, bool) {
	if m == nil {
		return nil, false
	}
	v, ok := m[key].([]any)
	return v, ok
}
