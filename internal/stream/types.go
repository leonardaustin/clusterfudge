package stream

import "time"

// LogLine represents a single line of container log output.
type LogLine struct {
	Content   string    `json:"content"`
	Timestamp time.Time `json:"timestamp,omitempty"`
	Container string    `json:"container,omitempty"`
}

// LogOptions configures a log stream.
type LogOptions struct {
	Namespace     string `json:"namespace"`
	PodName       string `json:"podName"`
	ContainerName string `json:"containerName"`
	Follow        bool   `json:"follow"`
	TailLines     int64  `json:"tailLines"`
	Previous      bool   `json:"previous"`
	Timestamps    bool   `json:"timestamps"`
}

// ExecOptions configures an exec session.
type ExecOptions struct {
	Namespace     string   `json:"namespace"`
	PodName       string   `json:"podName"`
	ContainerName string   `json:"containerName"`
	Command       []string `json:"command"`
	TTY           bool     `json:"tty"`
}

// PortForwardOptions configures a port-forward session.
type PortForwardOptions struct {
	Namespace string `json:"namespace"`
	PodName   string `json:"podName"`
	PodPort   int    `json:"podPort"`
	LocalPort int    `json:"localPort"` // 0 for auto-assign
}

// PortForwardResult holds port-forward session info.
type PortForwardResult struct {
	LocalPort int    `json:"localPort"`
	PodPort   int    `json:"podPort"`
	PodName   string `json:"podName"`
	Namespace string `json:"namespace"`
}

// PortForwardInfo represents an active port forward for listing.
type PortForwardInfo struct {
	LocalPort    int    `json:"localPort"`
	PodName      string `json:"podName"`
	Namespace    string `json:"namespace"`
	PodPort      int    `json:"podPort"`
	Status       string `json:"status"`       // "active" or "reconnecting"
	ReconnectNum int    `json:"reconnectNum"` // current reconnect attempt (0 when active)
}
