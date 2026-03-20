package cluster

import (
	"context"
	"sync"
	"time"
)

// ClusterConnection is the full runtime state for one connected cluster.
type ClusterConnection struct {
	mu          sync.RWMutex
	Info        ClusterInfo
	State       ConnectionState
	Error       string
	Version     string
	NodeCount   int
	Platform    string
	EnabledAPIs []string
	ConnectedAt *time.Time
	LastLatency int64
	clients     *ClientBundle
	cancelFn    context.CancelFunc
}

// GetClients safely returns the ClientBundle.
func (c *ClusterConnection) GetClients() *ClientBundle {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.clients
}

// setState updates the connection state and optional error message.
func (c *ClusterConnection) setState(state ConnectionState, errMsg string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.State = state
	c.Error = errMsg
}

// Snapshot returns a copy of the connection state safe for JSON serialization.
func (c *ClusterConnection) Snapshot() ConnectionSnapshot {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return ConnectionSnapshot{
		Info:        c.Info,
		State:       c.State,
		Error:       c.Error,
		Version:     c.Version,
		NodeCount:   c.NodeCount,
		Platform:    c.Platform,
		EnabledAPIs: c.EnabledAPIs,
		ConnectedAt: c.ConnectedAt,
		Latency:     c.LastLatency,
	}
}
