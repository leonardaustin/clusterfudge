package alerts

// DefaultRules returns the built-in alert rules.
func DefaultRules() []Rule {
	return []Rule{
		{
			Name:        "pod-crashloop",
			Description: "Pod in CrashLoopBackOff for more than 5 minutes",
			Resource:    "Pod",
			Condition:   "CrashLoopBackOff",
			Duration:    "5m",
			Severity:    "critical",
			Enabled:     true,
			Channels:    []string{"ui"},
		},
		{
			Name:        "pod-pending",
			Description: "Pod stuck in Pending state for more than 10 minutes",
			Resource:    "Pod",
			Condition:   "Pending",
			Duration:    "10m",
			Severity:    "warning",
			Enabled:     true,
			Channels:    []string{"ui"},
		},
		{
			Name:        "node-not-ready",
			Description: "Node in NotReady state for more than 2 minutes",
			Resource:    "Node",
			Condition:   "NotReady",
			Duration:    "2m",
			Severity:    "critical",
			Enabled:     true,
			Channels:    []string{"ui"},
		},
		{
			Name:        "deployment-unavailable",
			Description: "Deployment with zero available replicas",
			Resource:    "Deployment",
			Condition:   "Unavailable",
			Duration:    "0s",
			Severity:    "critical",
			Enabled:     true,
			Channels:    []string{"ui"},
		},
		{
			Name:        "container-restarts",
			Description: "Container restart count exceeds 10",
			Resource:    "Pod",
			Condition:   "RestartCount>10",
			Duration:    "0s",
			Severity:    "warning",
			Enabled:     true,
			Channels:    []string{"ui"},
		},
	}
}
