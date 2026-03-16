package cluster

import (
	"context"
	"fmt"
	"log/slog"
	"math"
	"math/rand"
	"sync"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	metricsv "k8s.io/metrics/pkg/client/clientset/versioned"

	"kubeviewer/internal/events"
	"kubeviewer/internal/k8s"
)

// Connection holds information about the active cluster connection.
// Retained for backward compatibility with existing handlers.
type Connection struct {
	Version string
}

// healthCheckInterval is the time between health check pings. Exported for testing.
var healthCheckInterval = 10 * time.Second

// Manager tracks multiple cluster connections concurrently.
type Manager struct {
	mu          sync.RWMutex
	loader      *KubeconfigLoader
	connections map[string]*ClusterConnection // keyed by context name
	active      string
	onUpdate    func(string, ConnectionSnapshot) // (contextName, snapshot)
	emitter     *events.Emitter
}

// NewManager creates a Manager with an auto-detected kubeconfig loader.
func NewManager() *Manager {
	return &Manager{
		loader:      NewKubeconfigLoader(),
		connections: make(map[string]*ClusterConnection),
	}
}

// NewManagerWithLoader creates a Manager with a specific kubeconfig loader.
func NewManagerWithLoader(loader *KubeconfigLoader) *Manager {
	return &Manager{
		loader:      loader,
		connections: make(map[string]*ClusterConnection),
	}
}

// NewManagerWithEmitter creates a Manager with a specific loader and event emitter.
func NewManagerWithEmitter(loader *KubeconfigLoader, emitter *events.Emitter) *Manager {
	return &Manager{
		loader:      loader,
		connections: make(map[string]*ClusterConnection),
		emitter:     emitter,
	}
}

// Loader returns the underlying KubeconfigLoader.
func (m *Manager) Loader() *KubeconfigLoader {
	return m.loader
}

// SetUpdateCallback registers a callback invoked on every state change.
func (m *Manager) SetUpdateCallback(fn func(string, ConnectionSnapshot)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.onUpdate = fn
}

// SetEmitter sets the event emitter for health event broadcasting.
func (m *Manager) SetEmitter(emitter *events.Emitter) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.emitter = emitter
}

// ActiveContext returns the name of the currently active context.
func (m *Manager) ActiveContext() string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.active
}

// Connect establishes a connection to the named kubeconfig context.
// The call blocks until the initial connection attempt completes.
// A background goroutine then monitors health and reconnects on failure.
func (m *Manager) Connect(ctx context.Context, contextName string) error {
	if err := m.loader.ValidateContext(contextName); err != nil {
		return fmt.Errorf("invalid context: %w", err)
	}

	connCtx, cancel := context.WithCancel(context.Background())

	conn := &ClusterConnection{
		Info:     ClusterInfo{Name: contextName, Context: contextName},
		State:    StateConnecting,
		cancelFn: cancel,
	}

	m.mu.Lock()
	// If an existing connection exists, stop it first.
	if old, ok := m.connections[contextName]; ok {
		old.cancelFn()
	}
	m.connections[contextName] = conn
	m.active = contextName
	m.mu.Unlock()

	m.notify(contextName, conn)

	bundle, meta, err := m.buildClients(ctx, contextName)
	if err != nil {
		conn.setState(StateError, err.Error())
		m.notify(contextName, conn)
		cancel()
		return err
	}

	now := time.Now()
	conn.mu.Lock()
	conn.clients = bundle
	conn.State = StateConnected
	conn.Version = meta.version
	conn.NodeCount = meta.nodeCount
	conn.Platform = meta.platform
	conn.EnabledAPIs = meta.enabledAPIs
	conn.Info.Server = meta.server
	conn.Info.Platform = meta.platform
	conn.ConnectedAt = &now
	conn.mu.Unlock()

	m.notify(contextName, conn)

	slog.Info("cluster connected",
		"context", contextName,
		"version", meta.version,
		"platform", meta.platform,
		"nodes", meta.nodeCount,
	)

	// Start background health-check loop.
	go m.healthLoop(connCtx, contextName, conn)

	return nil
}

// clusterMeta holds discovered metadata fetched during connect.
type clusterMeta struct {
	version     string
	server      string
	nodeCount   int
	platform    string
	enabledAPIs []string
}

// buildClients creates all client types for the given context.
func (m *Manager) buildClients(ctx context.Context, contextName string) (*ClientBundle, clusterMeta, error) {
	cfg, err := m.loader.RestConfigForContext(contextName)
	if err != nil {
		return nil, clusterMeta{}, fmt.Errorf("rest.Config: %w", err)
	}

	typed, err := kubernetes.NewForConfig(cfg)
	if err != nil {
		return nil, clusterMeta{}, fmt.Errorf("typed client: %w", err)
	}

	dyn, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return nil, clusterMeta{}, fmt.Errorf("dynamic client: %w", err)
	}

	// Probe server version -- this is the connectivity check.
	sv, err := typed.Discovery().ServerVersion()
	if err != nil {
		return nil, clusterMeta{}, fmt.Errorf("server version check: %w", err)
	}

	probeCtx, probeCancel := context.WithTimeout(ctx, 15*time.Second)
	defer probeCancel()

	meta := clusterMeta{
		version: sv.GitVersion,
		server:  cfg.Host,
	}

	// Count nodes.
	nodeList, err := typed.CoreV1().Nodes().List(probeCtx, metav1.ListOptions{Limit: 1000})
	if err == nil {
		meta.nodeCount = len(nodeList.Items)
	}

	// Discover enabled API groups.
	groups, _, _ := typed.Discovery().ServerGroupsAndResources()
	for _, g := range groups {
		meta.enabledAPIs = append(meta.enabledAPIs, g.Name)
	}

	// Detect platform using version string and discovered API groups.
	meta.platform = DetectPlatform(sv.GitVersion, meta.enabledAPIs)

	// Try to build a metrics client (optional -- metrics-server may not be installed).
	metricsClient, _ := metricsv.NewForConfig(cfg)

	bundle := &ClientBundle{
		Typed:     typed,
		Dynamic:   dyn,
		Discovery: typed.Discovery(),
		Metrics:   metricsClient,
		Config:    cfg,
	}

	return bundle, meta, nil
}

// healthLoop runs a periodic API server ping and triggers reconnection on failure.
func (m *Manager) healthLoop(connCtx context.Context, contextName string, conn *ClusterConnection) {
	ticker := time.NewTicker(healthCheckInterval)
	defer ticker.Stop()

	for {
		select {
		case <-connCtx.Done():
			return
		case <-ticker.C:
			clients := conn.GetClients()
			if clients == nil {
				continue
			}
			start := time.Now()
			_, err := clients.Typed.Discovery().ServerVersion()
			latency := time.Since(start).Milliseconds()

			if err != nil {
				slog.Warn("cluster health check failed",
					"context", contextName, "err", err, "latencyMs", latency)
				conn.setState(StateReconnecting, err.Error())
				m.notify(contextName, conn)
				m.emitHealthEvent(contextName, HealthRed, latency, err.Error())
				m.reconnectWithBackoff(connCtx, contextName, conn)
				return // reconnectWithBackoff starts a new healthLoop on success
			}

			// Update latency on the connection.
			conn.mu.Lock()
			conn.LastLatency = latency
			conn.mu.Unlock()

			// Emit health event.
			status := HealthGreen
			if latency > 1000 {
				status = HealthYellow
			}
			m.emitHealthEvent(contextName, status, latency, "")
		}
	}
}

// reconnectWithBackoff attempts to reconnect using exponential backoff.
// Backoff: 2s, 4s, 8s, ... up to 5 minutes.
func (m *Manager) reconnectWithBackoff(connCtx context.Context, contextName string, conn *ClusterConnection) {
	const maxBackoff = 5 * time.Minute

	for attempt := 0; ; attempt++ {
		backoff := float64(2*time.Second) * math.Pow(2, float64(attempt))
		if backoff > float64(maxBackoff) {
			backoff = float64(maxBackoff)
		}
		// Add jitter (+/- 20%) to prevent thundering herd on mass reconnect.
		jitter := backoff * 0.4 * (rand.Float64() - 0.5)
		delay := time.Duration(backoff + jitter)

		slog.Info("reconnect attempt",
			"context", contextName, "attempt", attempt+1, "delay", delay)

		select {
		case <-connCtx.Done():
			conn.setState(StateDisconnected, "")
			m.notify(contextName, conn)
			return
		case <-time.After(delay):
		}

		bundle, meta, err := m.buildClients(connCtx, contextName)
		if err != nil {
			slog.Warn("reconnect failed",
				"context", contextName, "attempt", attempt+1, "err", err)
			conn.setState(StateReconnecting, err.Error())
			m.notify(contextName, conn)
			continue
		}

		now := time.Now()
		conn.mu.Lock()
		conn.clients = bundle
		conn.State = StateConnected
		conn.Version = meta.version
		conn.NodeCount = meta.nodeCount
		conn.Platform = meta.platform
		conn.Error = ""
		conn.ConnectedAt = &now
		conn.mu.Unlock()

		m.notify(contextName, conn)
		slog.Info("cluster reconnected", "context", contextName)

		// Start a fresh health-check loop.
		go m.healthLoop(connCtx, contextName, conn)
		return
	}
}

// Disconnect closes the connection to a specific cluster context and cancels all watchers.
func (m *Manager) DisconnectContext(contextName string) {
	m.mu.Lock()
	conn, ok := m.connections[contextName]
	if ok {
		delete(m.connections, contextName)
		if m.active == contextName {
			m.active = ""
		}
	}
	m.mu.Unlock()

	if ok && conn.cancelFn != nil {
		conn.cancelFn()
		conn.setState(StateDisconnected, "")
		m.notify(contextName, conn)
		slog.Info("cluster disconnected", "context", contextName)
	}
}

// Disconnect tears down the active connection. Retained for backward compatibility.
func (m *Manager) Disconnect() {
	m.mu.RLock()
	active := m.active
	m.mu.RUnlock()
	if active != "" {
		m.DisconnectContext(active)
	}
}

// SwitchContext changes the active context without disconnecting others.
func (m *Manager) SwitchContext(contextName string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.connections[contextName]; !ok {
		return fmt.Errorf("context %q is not connected", contextName)
	}
	m.active = contextName
	return nil
}

// ActiveClients returns the ClientBundle for the currently active cluster.
func (m *Manager) ActiveClients() (*ClientBundle, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.active == "" {
		return nil, fmt.Errorf("no active cluster")
	}
	conn, ok := m.connections[m.active]
	if !ok {
		return nil, fmt.Errorf("active cluster %q not found", m.active)
	}
	conn.mu.RLock()
	state := conn.State
	clients := conn.clients
	conn.mu.RUnlock()
	if state != StateConnected || clients == nil {
		return nil, fmt.Errorf("cluster %q is not connected (state: %s)", m.active, state)
	}
	return clients, nil
}

// ActiveClient returns the internal k8s.ClientSet for backward compatibility.
// Prefer ActiveClients() for new code.
func (m *Manager) ActiveClient() (*k8s.ClientSet, error) {
	bundle, err := m.ActiveClients()
	if err != nil {
		return nil, err
	}
	return &k8s.ClientSet{
		Typed:   bundle.Typed,
		Dynamic: bundle.Dynamic,
		Config:  bundle.Config,
	}, nil
}

// ActiveConnection returns the Connection info for backward compatibility.
func (m *Manager) ActiveConnection() *Connection {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.active == "" {
		return nil
	}
	conn, ok := m.connections[m.active]
	if !ok {
		return nil
	}
	conn.mu.RLock()
	defer conn.mu.RUnlock()
	if conn.State != StateConnected {
		return nil
	}
	return &Connection{Version: conn.Version}
}

// ClientsFor returns the ClientBundle for a specific cluster (may not be active).
func (m *Manager) ClientsFor(contextName string) (*ClientBundle, error) {
	m.mu.RLock()
	conn, ok := m.connections[contextName]
	m.mu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("context %q is not connected", contextName)
	}
	conn.mu.RLock()
	state := conn.State
	clients := conn.clients
	conn.mu.RUnlock()
	if state != StateConnected || clients == nil {
		return nil, fmt.Errorf("cluster %q is not connected (state: %s)", contextName, state)
	}
	return clients, nil
}

// ConnectionFor returns the connection snapshot for a specific context.
func (m *Manager) ConnectionFor(contextName string) (ConnectionSnapshot, error) {
	m.mu.RLock()
	conn, ok := m.connections[contextName]
	m.mu.RUnlock()
	if !ok {
		return ConnectionSnapshot{}, fmt.Errorf("context %q is not connected", contextName)
	}
	return conn.Snapshot(), nil
}

// ListConnections returns a snapshot of all tracked connections.
func (m *Manager) ListConnections() []ConnectionSnapshot {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]ConnectionSnapshot, 0, len(m.connections))
	for _, conn := range m.connections {
		out = append(out, conn.Snapshot())
	}
	return out
}

// IsConnected returns true if the named context is connected.
func (m *Manager) IsConnected(contextName string) bool {
	m.mu.RLock()
	conn, ok := m.connections[contextName]
	m.mu.RUnlock()
	if !ok {
		return false
	}
	conn.mu.RLock()
	defer conn.mu.RUnlock()
	return conn.State == StateConnected
}

// Shutdown gracefully disconnects all clusters.
func (m *Manager) Shutdown() {
	m.mu.Lock()
	names := make([]string, 0, len(m.connections))
	for name := range m.connections {
		names = append(names, name)
	}
	m.mu.Unlock()
	for _, name := range names {
		m.DisconnectContext(name)
	}
	slog.Info("cluster manager shut down", "disconnected", len(names))
}

// SetClientForTest injects a ClientSet for testing purposes (backward compat).
func (m *Manager) SetClientForTest(cs *k8s.ClientSet) {
	m.mu.Lock()
	defer m.mu.Unlock()

	conn := &ClusterConnection{
		Info:    ClusterInfo{Name: "test", Context: "test"},
		State:   StateConnected,
		Version: "test",
		clients: &ClientBundle{
			Typed:   cs.Typed,
			Dynamic: cs.Dynamic,
			Config:  cs.Config,
		},
		cancelFn: func() {},
	}
	if cs.Typed != nil {
		conn.clients.Discovery = cs.Typed.Discovery()
	}
	m.connections["test"] = conn
	m.active = "test"
}

// SetClientBundleForTest injects a ClientBundle directly for testing.
func (m *Manager) SetClientBundleForTest(contextName string, bundle *ClientBundle) {
	m.mu.Lock()
	defer m.mu.Unlock()

	now := time.Now()
	conn := &ClusterConnection{
		Info:        ClusterInfo{Name: contextName, Context: contextName},
		State:       StateConnected,
		Version:     "test",
		ConnectedAt: &now,
		clients:     bundle,
		cancelFn:    func() {},
	}
	m.connections[contextName] = conn
	m.active = contextName
}

// notify sends a snapshot of the connection state to the registered callback.
func (m *Manager) notify(contextName string, conn *ClusterConnection) {
	m.mu.RLock()
	fn := m.onUpdate
	m.mu.RUnlock()
	if fn == nil {
		return
	}
	fn(contextName, conn.Snapshot())
}

// emitHealthEvent sends a HealthEvent through the event emitter.
func (m *Manager) emitHealthEvent(clusterID string, status HealthStatus, latencyMs int64, errMsg string) {
	m.mu.RLock()
	e := m.emitter
	m.mu.RUnlock()
	if e == nil {
		return
	}
	e.Emit("cluster:health", HealthEvent{
		ClusterID: clusterID,
		Status:    status,
		LatencyMs: latencyMs,
		Error:     errMsg,
	})
}

// ConnectionState returns the current state of the active connection.
func (m *Manager) ConnectionStateForContext(contextName string) ConnectionState {
	m.mu.RLock()
	conn, ok := m.connections[contextName]
	m.mu.RUnlock()
	if !ok {
		return StateDisconnected
	}
	conn.mu.RLock()
	defer conn.mu.RUnlock()
	return conn.State
}
