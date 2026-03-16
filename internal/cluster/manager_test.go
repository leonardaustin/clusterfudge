package cluster

import (
	"context"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"kubeviewer/internal/events"
)

// writeTestKubeconfig writes a minimal valid kubeconfig to a temp file and returns the path.
func writeTestKubeconfig(t *testing.T) string {
	t.Helper()
	f, err := os.CreateTemp("", "kubeconfig-*.yaml")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.Remove(f.Name()) })

	data := `apiVersion: v1
kind: Config
clusters:
- name: test-cluster
  cluster:
    server: https://127.0.0.1:6443
contexts:
- name: test
  context:
    cluster: test-cluster
    user: test-user
users:
- name: test-user
  user:
    token: fake-token
current-context: test
`
	if _, err := f.WriteString(data); err != nil {
		t.Fatal(err)
	}
	f.Close()
	return f.Name()
}

func TestNewManager(t *testing.T) {
	mgr := NewManager()
	if mgr == nil {
		t.Fatal("expected non-nil Manager")
	}
	if _, err := mgr.ActiveClient(); err == nil {
		t.Error("expected error from ActiveClient on new manager")
	}
	if mgr.ActiveConnection() != nil {
		t.Error("expected nil ActiveConnection on new manager")
	}
	if mgr.ActiveContext() != "" {
		t.Error("expected empty active context on new manager")
	}
}

func TestNewManagerWithLoader(t *testing.T) {
	path := writeTestKubeconfig(t)
	loader := NewKubeconfigLoaderFromPaths([]string{path})
	mgr := NewManagerWithLoader(loader)
	if mgr == nil {
		t.Fatal("expected non-nil Manager")
	}
	if mgr.Loader() != loader {
		t.Error("expected Loader() to return the injected loader")
	}
}

func TestNewManagerWithEmitter(t *testing.T) {
	path := writeTestKubeconfig(t)
	loader := NewKubeconfigLoaderFromPaths([]string{path})
	emitter := events.NewEmitter(nil)
	mgr := NewManagerWithEmitter(loader, emitter)
	if mgr == nil {
		t.Fatal("expected non-nil Manager")
	}
	if mgr.emitter != emitter {
		t.Error("expected emitter to be set")
	}
}

func TestManager_DisconnectNoActiveContext(t *testing.T) {
	mgr := NewManager()
	mgr.Disconnect() // should not panic
	if _, err := mgr.ActiveClient(); err == nil {
		t.Error("expected error after disconnect")
	}
}

func TestManager_DisconnectContext_NotConnected(t *testing.T) {
	mgr := NewManager()
	// Disconnecting a non-existent context should not panic.
	mgr.DisconnectContext("nonexistent")
}

func TestKubeconfigLoader_NonexistentPath(t *testing.T) {
	loader := NewKubeconfigLoaderFromPaths([]string{"/nonexistent/path/kubeconfig"})
	_, err := loader.Load()
	if err == nil {
		t.Fatal("expected error for nonexistent path")
	}
}

func TestKubeconfigLoader_MalformedFile(t *testing.T) {
	f, err := os.CreateTemp("", "kubeconfig-*.yaml")
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(f.Name())
	f.WriteString("{not: valid: yaml: ::}")
	f.Close()

	loader := NewKubeconfigLoaderFromPaths([]string{f.Name()})
	_, err = loader.Load()
	if err == nil {
		t.Fatal("expected error for malformed kubeconfig")
	}
}

func TestKubeconfigLoader_ValidFile(t *testing.T) {
	path := writeTestKubeconfig(t)
	loader := NewKubeconfigLoaderFromPaths([]string{path})
	cfg, err := loader.Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.CurrentContext != "test" {
		t.Errorf("expected current-context 'test', got %q", cfg.CurrentContext)
	}
}

func TestKubeconfigLoader_NewKubeconfigLoader(t *testing.T) {
	loader := NewKubeconfigLoader()
	if loader == nil {
		t.Fatal("expected non-nil loader")
	}
	if len(loader.Paths()) == 0 {
		t.Error("expected at least one path")
	}
}

func TestKubeconfigLoader_AddPath(t *testing.T) {
	loader := NewKubeconfigLoaderFromPaths([]string{"/a"})
	loader.AddPath("/b")
	if len(loader.Paths()) != 2 {
		t.Errorf("expected 2 paths, got %d", len(loader.Paths()))
	}
	// Adding duplicate should be a no-op.
	loader.AddPath("/b")
	if len(loader.Paths()) != 2 {
		t.Errorf("expected 2 paths after duplicate add, got %d", len(loader.Paths()))
	}
}

func TestKubeconfigLoader_ListContexts(t *testing.T) {
	path := writeTestKubeconfig(t)
	loader := NewKubeconfigLoaderFromPaths([]string{path})
	contexts, err := loader.ListContexts()
	if err != nil {
		t.Fatalf("ListContexts: %v", err)
	}
	if len(contexts) != 1 {
		t.Fatalf("expected 1 context, got %d", len(contexts))
	}
	if contexts[0].Name != "test" {
		t.Errorf("expected context name 'test', got %q", contexts[0].Name)
	}
	if contexts[0].Server != "https://127.0.0.1:6443" {
		t.Errorf("expected server URL, got %q", contexts[0].Server)
	}
	if !contexts[0].IsCurrent {
		t.Error("expected context to be current")
	}
	if contexts[0].AuthType != "token" {
		t.Errorf("expected auth type 'token', got %q", contexts[0].AuthType)
	}
}

func TestKubeconfigLoader_ValidateContext(t *testing.T) {
	path := writeTestKubeconfig(t)
	loader := NewKubeconfigLoaderFromPaths([]string{path})

	// Valid context.
	if err := loader.ValidateContext("test"); err != nil {
		t.Errorf("expected valid context, got error: %v", err)
	}

	// Non-existent context.
	if err := loader.ValidateContext("nonexistent"); err == nil {
		t.Error("expected error for nonexistent context")
	}
}

func TestKubeconfigLoader_RestConfigForContext(t *testing.T) {
	path := writeTestKubeconfig(t)
	loader := NewKubeconfigLoaderFromPaths([]string{path})

	cfg, err := loader.RestConfigForContext("test")
	if err != nil {
		t.Fatalf("RestConfigForContext: %v", err)
	}
	if cfg.Host != "https://127.0.0.1:6443" {
		t.Errorf("expected host https://127.0.0.1:6443, got %q", cfg.Host)
	}
	if cfg.QPS != 50 {
		t.Errorf("expected QPS 50, got %f", cfg.QPS)
	}
	if cfg.Burst != 100 {
		t.Errorf("expected Burst 100, got %d", cfg.Burst)
	}
}

func TestConnectionState_Constants(t *testing.T) {
	states := []ConnectionState{
		StateDisconnected, StateConnecting, StateConnected,
		StateReconnecting, StateError,
	}
	expected := []string{
		"disconnected", "connecting", "connected",
		"reconnecting", "error",
	}
	for i, s := range states {
		if string(s) != expected[i] {
			t.Errorf("state %d: expected %q, got %q", i, expected[i], s)
		}
	}
}

func TestHealthStatus_Constants(t *testing.T) {
	if string(HealthGreen) != "green" {
		t.Errorf("expected 'green', got %q", HealthGreen)
	}
	if string(HealthYellow) != "yellow" {
		t.Errorf("expected 'yellow', got %q", HealthYellow)
	}
	if string(HealthRed) != "red" {
		t.Errorf("expected 'red', got %q", HealthRed)
	}
}

func TestClusterConnection_SetState(t *testing.T) {
	conn := &ClusterConnection{State: StateDisconnected}
	conn.setState(StateConnecting, "")
	if conn.State != StateConnecting {
		t.Errorf("expected StateConnecting, got %s", conn.State)
	}
	if conn.Error != "" {
		t.Errorf("expected empty error, got %q", conn.Error)
	}

	conn.setState(StateError, "something broke")
	if conn.State != StateError {
		t.Errorf("expected StateError, got %s", conn.State)
	}
	if conn.Error != "something broke" {
		t.Errorf("expected 'something broke', got %q", conn.Error)
	}
}

func TestClusterConnection_Snapshot(t *testing.T) {
	now := time.Now()
	conn := &ClusterConnection{
		Info:        ClusterInfo{Name: "ctx", Context: "ctx", Server: "https://localhost:6443", Platform: "k3s"},
		State:       StateConnected,
		Version:     "v1.28.0+k3s1",
		NodeCount:   3,
		Platform:    "k3s",
		EnabledAPIs: []string{"apps", "batch"},
		ConnectedAt: &now,
		LastLatency: 42,
	}

	snap := conn.Snapshot()
	if snap.State != StateConnected {
		t.Errorf("expected StateConnected, got %s", snap.State)
	}
	if snap.Version != "v1.28.0+k3s1" {
		t.Errorf("expected version, got %q", snap.Version)
	}
	if snap.NodeCount != 3 {
		t.Errorf("expected 3 nodes, got %d", snap.NodeCount)
	}
	if snap.Platform != "k3s" {
		t.Errorf("expected k3s, got %q", snap.Platform)
	}
	if len(snap.EnabledAPIs) != 2 {
		t.Errorf("expected 2 enabled APIs, got %d", len(snap.EnabledAPIs))
	}
	if snap.ConnectedAt == nil || !snap.ConnectedAt.Equal(now) {
		t.Error("expected connectedAt to match")
	}
	if snap.Latency != 42 {
		t.Errorf("expected latency 42, got %d", snap.Latency)
	}
	if snap.Info.Name != "ctx" {
		t.Errorf("expected info name 'ctx', got %q", snap.Info.Name)
	}
}

func TestClusterConnection_GetClients_Nil(t *testing.T) {
	conn := &ClusterConnection{}
	if conn.GetClients() != nil {
		t.Error("expected nil clients")
	}
}

func TestClusterConnection_ThreadSafety(t *testing.T) {
	conn := &ClusterConnection{State: StateDisconnected}

	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(3)
		go func() {
			defer wg.Done()
			conn.setState(StateConnecting, "")
		}()
		go func() {
			defer wg.Done()
			_ = conn.Snapshot()
		}()
		go func() {
			defer wg.Done()
			_ = conn.GetClients()
		}()
	}
	wg.Wait()
}

func TestManager_SetUpdateCallback(t *testing.T) {
	mgr := NewManager()
	var called bool
	mgr.SetUpdateCallback(func(name string, snap ConnectionSnapshot) {
		called = true
	})
	// Trigger notify via an internal connection.
	conn := &ClusterConnection{State: StateConnected}
	mgr.notify("test", conn)
	if !called {
		t.Error("expected callback to be called")
	}
}

func TestManager_SetEmitter(t *testing.T) {
	mgr := NewManager()
	emitter := events.NewEmitter(nil)
	mgr.SetEmitter(emitter)
	if mgr.emitter != emitter {
		t.Error("expected emitter to be set")
	}
}

func TestManager_EmitHealthEvent(t *testing.T) {
	emitter := events.NewEmitter(nil)
	mgr := &Manager{
		loader:      NewKubeconfigLoaderFromPaths(nil),
		connections: make(map[string]*ClusterConnection),
		emitter:     emitter,
	}

	var received HealthEvent
	unsub := emitter.Subscribe("cluster:health", func(payload any) {
		received = payload.(HealthEvent)
	})
	defer unsub()

	mgr.emitHealthEvent("test-cluster", HealthGreen, 42, "")

	if received.ClusterID != "test-cluster" {
		t.Errorf("expected cluster ID 'test-cluster', got %q", received.ClusterID)
	}
	if received.Status != HealthGreen {
		t.Errorf("expected HealthGreen, got %q", received.Status)
	}
	if received.LatencyMs != 42 {
		t.Errorf("expected latency 42, got %d", received.LatencyMs)
	}
	if received.Error != "" {
		t.Errorf("expected empty error, got %q", received.Error)
	}
}

func TestManager_EmitHealthEvent_WithError(t *testing.T) {
	emitter := events.NewEmitter(nil)
	mgr := &Manager{
		loader:      NewKubeconfigLoaderFromPaths(nil),
		connections: make(map[string]*ClusterConnection),
		emitter:     emitter,
	}

	var received HealthEvent
	unsub := emitter.Subscribe("cluster:health", func(payload any) {
		received = payload.(HealthEvent)
	})
	defer unsub()

	mgr.emitHealthEvent("test-cluster", HealthRed, 5000, "connection refused")

	if received.Status != HealthRed {
		t.Errorf("expected HealthRed, got %q", received.Status)
	}
	if received.Error != "connection refused" {
		t.Errorf("expected 'connection refused', got %q", received.Error)
	}
}

func TestManager_EmitHealthEvent_NilEmitter(t *testing.T) {
	mgr := NewManager()
	// Should not panic when emitter is nil.
	mgr.emitHealthEvent("test", HealthGreen, 10, "")
}

func TestManager_Notify_NilCallback(t *testing.T) {
	mgr := NewManager()
	conn := &ClusterConnection{State: StateConnected}
	// Should not panic when callback is nil.
	mgr.notify("test", conn)
}

func TestManager_ConnectInvalidContext(t *testing.T) {
	path := writeTestKubeconfig(t)
	loader := NewKubeconfigLoaderFromPaths([]string{path})
	mgr := NewManagerWithLoader(loader)

	err := mgr.Connect(context.Background(), "nonexistent")
	if err == nil {
		t.Fatal("expected error for invalid context")
	}
}

func TestManager_ConnectionStateForContext(t *testing.T) {
	mgr := NewManager()
	// Non-existent context should return Disconnected.
	state := mgr.ConnectionStateForContext("nonexistent")
	if state != StateDisconnected {
		t.Errorf("expected StateDisconnected, got %s", state)
	}
}

func TestManager_SwitchContext_NotConnected(t *testing.T) {
	mgr := NewManager()
	err := mgr.SwitchContext("nonexistent")
	if err == nil {
		t.Error("expected error switching to unconnected context")
	}
}

func TestManager_IsConnected_NotConnected(t *testing.T) {
	mgr := NewManager()
	if mgr.IsConnected("nonexistent") {
		t.Error("expected IsConnected to return false for unknown context")
	}
}

func TestManager_ListConnections_Empty(t *testing.T) {
	mgr := NewManager()
	conns := mgr.ListConnections()
	if len(conns) != 0 {
		t.Errorf("expected 0 connections, got %d", len(conns))
	}
}

func TestManager_ConnectionFor_NotConnected(t *testing.T) {
	mgr := NewManager()
	_, err := mgr.ConnectionFor("nonexistent")
	if err == nil {
		t.Error("expected error for unconnected context")
	}
}

func TestManager_ClientsFor_NotConnected(t *testing.T) {
	mgr := NewManager()
	_, err := mgr.ClientsFor("nonexistent")
	if err == nil {
		t.Error("expected error for unconnected context")
	}
}

func TestManager_ActiveClients_NoActive(t *testing.T) {
	mgr := NewManager()
	_, err := mgr.ActiveClients()
	if err == nil {
		t.Error("expected error when no active cluster")
	}
}

func TestManager_SetClientBundleForTest(t *testing.T) {
	mgr := NewManager()
	bundle := &ClientBundle{
		Config: nil,
	}
	mgr.SetClientBundleForTest("test-ctx", bundle)

	if mgr.ActiveContext() != "test-ctx" {
		t.Errorf("expected active context 'test-ctx', got %q", mgr.ActiveContext())
	}
	if !mgr.IsConnected("test-ctx") {
		t.Error("expected IsConnected to return true for test context")
	}

	snap, err := mgr.ConnectionFor("test-ctx")
	if err != nil {
		t.Fatalf("ConnectionFor: %v", err)
	}
	if snap.State != StateConnected {
		t.Errorf("expected StateConnected, got %s", snap.State)
	}
	if snap.ConnectedAt == nil {
		t.Error("expected ConnectedAt to be set")
	}
}

func TestManager_Shutdown(t *testing.T) {
	mgr := NewManager()

	// Add a couple of test connections.
	mgr.SetClientBundleForTest("ctx1", &ClientBundle{})
	mgr.SetClientBundleForTest("ctx2", &ClientBundle{})

	if len(mgr.ListConnections()) != 2 {
		t.Errorf("expected 2 connections before shutdown, got %d", len(mgr.ListConnections()))
	}

	mgr.Shutdown()

	if len(mgr.ListConnections()) != 0 {
		t.Errorf("expected 0 connections after shutdown, got %d", len(mgr.ListConnections()))
	}
}

func TestManager_DisconnectContext(t *testing.T) {
	mgr := NewManager()
	mgr.SetClientBundleForTest("ctx1", &ClientBundle{})

	if !mgr.IsConnected("ctx1") {
		t.Fatal("expected ctx1 to be connected")
	}

	mgr.DisconnectContext("ctx1")

	if mgr.IsConnected("ctx1") {
		t.Error("expected ctx1 to be disconnected after DisconnectContext")
	}
	if mgr.ActiveContext() != "" {
		t.Errorf("expected empty active context, got %q", mgr.ActiveContext())
	}
}

func TestManager_Disconnect_DisconnectsActive(t *testing.T) {
	mgr := NewManager()
	mgr.SetClientBundleForTest("active-ctx", &ClientBundle{})

	if mgr.ActiveContext() != "active-ctx" {
		t.Fatal("expected active-ctx to be active")
	}

	mgr.Disconnect()

	if mgr.ActiveContext() != "" {
		t.Errorf("expected empty active context after Disconnect, got %q", mgr.ActiveContext())
	}
}

func TestManager_SwitchContext(t *testing.T) {
	mgr := NewManager()
	mgr.SetClientBundleForTest("ctx1", &ClientBundle{})
	mgr.SetClientBundleForTest("ctx2", &ClientBundle{})

	// The last SetClientBundleForTest call sets ctx2 as active.
	if mgr.ActiveContext() != "ctx2" {
		t.Errorf("expected ctx2 active, got %q", mgr.ActiveContext())
	}

	err := mgr.SwitchContext("ctx1")
	if err != nil {
		t.Fatalf("SwitchContext: %v", err)
	}
	if mgr.ActiveContext() != "ctx1" {
		t.Errorf("expected ctx1 active after switch, got %q", mgr.ActiveContext())
	}
}

func TestManager_ActiveConnection_ReturnsNilWhenDisconnected(t *testing.T) {
	mgr := NewManager()
	if mgr.ActiveConnection() != nil {
		t.Error("expected nil ActiveConnection when no active context")
	}
}

func TestManager_ActiveConnection_ReturnsConnection(t *testing.T) {
	mgr := NewManager()
	// Inject a test connection directly.
	mgr.mu.Lock()
	now := time.Now()
	mgr.connections["ctx"] = &ClusterConnection{
		State:   StateConnected,
		Version: "v1.28.0",
		ConnectedAt: &now,
		cancelFn: func() {},
	}
	mgr.active = "ctx"
	mgr.mu.Unlock()

	conn := mgr.ActiveConnection()
	if conn == nil {
		t.Fatal("expected non-nil ActiveConnection")
	}
	if conn.Version != "v1.28.0" {
		t.Errorf("expected version v1.28.0, got %q", conn.Version)
	}
}

func TestManager_ActiveConnection_ReturnsNilWhenNotConnected(t *testing.T) {
	mgr := NewManager()
	mgr.mu.Lock()
	mgr.connections["ctx"] = &ClusterConnection{
		State:    StateConnecting,
		cancelFn: func() {},
	}
	mgr.active = "ctx"
	mgr.mu.Unlock()

	if mgr.ActiveConnection() != nil {
		t.Error("expected nil ActiveConnection when state is not connected")
	}
}

func TestManager_HealthEventEmissionOnUpdate(t *testing.T) {
	emitter := events.NewEmitter(nil)

	var healthEvents []HealthEvent
	var mu sync.Mutex
	unsub := emitter.Subscribe("cluster:health", func(payload any) {
		mu.Lock()
		healthEvents = append(healthEvents, payload.(HealthEvent))
		mu.Unlock()
	})
	defer unsub()

	mgr := &Manager{
		loader:      NewKubeconfigLoaderFromPaths(nil),
		connections: make(map[string]*ClusterConnection),
		emitter:     emitter,
	}

	// Emit a series of health events.
	mgr.emitHealthEvent("cluster-1", HealthGreen, 15, "")
	mgr.emitHealthEvent("cluster-1", HealthYellow, 1200, "")
	mgr.emitHealthEvent("cluster-1", HealthRed, 0, "connection refused")

	mu.Lock()
	defer mu.Unlock()
	if len(healthEvents) != 3 {
		t.Fatalf("expected 3 health events, got %d", len(healthEvents))
	}
	if healthEvents[0].Status != HealthGreen {
		t.Errorf("event 0: expected green, got %s", healthEvents[0].Status)
	}
	if healthEvents[1].Status != HealthYellow {
		t.Errorf("event 1: expected yellow, got %s", healthEvents[1].Status)
	}
	if healthEvents[2].Status != HealthRed {
		t.Errorf("event 2: expected red, got %s", healthEvents[2].Status)
	}
}

func TestManager_NotifyCallback_TracksStateTransitions(t *testing.T) {
	mgr := NewManager()

	var transitions []ConnectionState
	var mu sync.Mutex
	mgr.SetUpdateCallback(func(name string, snap ConnectionSnapshot) {
		mu.Lock()
		transitions = append(transitions, snap.State)
		mu.Unlock()
	})

	conn := &ClusterConnection{}

	// Simulate a state transition sequence.
	conn.setState(StateConnecting, "")
	mgr.notify("test", conn)

	conn.setState(StateConnected, "")
	mgr.notify("test", conn)

	conn.setState(StateReconnecting, "timeout")
	mgr.notify("test", conn)

	conn.setState(StateConnected, "")
	mgr.notify("test", conn)

	conn.setState(StateDisconnected, "")
	mgr.notify("test", conn)

	mu.Lock()
	defer mu.Unlock()
	expected := []ConnectionState{
		StateConnecting, StateConnected, StateReconnecting,
		StateConnected, StateDisconnected,
	}
	if len(transitions) != len(expected) {
		t.Fatalf("expected %d transitions, got %d", len(expected), len(transitions))
	}
	for i, e := range expected {
		if transitions[i] != e {
			t.Errorf("transition %d: expected %s, got %s", i, e, transitions[i])
		}
	}
}

func TestClientBundle_HasMetrics(t *testing.T) {
	b := &ClientBundle{}
	if b.HasMetrics() {
		t.Error("expected HasMetrics false for nil Metrics")
	}
}

func TestManager_ConcurrentAccess(t *testing.T) {
	mgr := NewManager()
	mgr.SetClientBundleForTest("ctx1", &ClientBundle{})

	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(5)
		go func() {
			defer wg.Done()
			_ = mgr.ActiveContext()
		}()
		go func() {
			defer wg.Done()
			_ = mgr.ActiveConnection()
		}()
		go func() {
			defer wg.Done()
			_, _ = mgr.ActiveClient()
		}()
		go func() {
			defer wg.Done()
			_ = mgr.ListConnections()
		}()
		go func() {
			defer wg.Done()
			_ = mgr.IsConnected("ctx1")
		}()
	}
	wg.Wait()
}

func TestManager_HealthCheckIntervalUsed(t *testing.T) {
	// Override the health check interval for testing.
	old := healthCheckInterval
	healthCheckInterval = 50 * time.Millisecond
	t.Cleanup(func() { healthCheckInterval = old })

	if healthCheckInterval != 50*time.Millisecond {
		t.Errorf("expected healthCheckInterval to be 50ms, got %v", healthCheckInterval)
	}
}

func TestManager_EmitHealthEvent_YellowLatency(t *testing.T) {
	emitter := events.NewEmitter(nil)
	mgr := &Manager{
		loader:      NewKubeconfigLoaderFromPaths(nil),
		connections: make(map[string]*ClusterConnection),
		emitter:     emitter,
	}

	var count atomic.Int32
	unsub := emitter.Subscribe("cluster:health", func(payload any) {
		count.Add(1)
	})
	defer unsub()

	// Emit events with different statuses.
	mgr.emitHealthEvent("c1", HealthYellow, 1500, "")
	if count.Load() != 1 {
		t.Errorf("expected 1 event emitted, got %d", count.Load())
	}
}

func TestClusterConnection_ConcurrentSetStateAndSnapshot(t *testing.T) {
	conn := &ClusterConnection{State: StateDisconnected}

	var wg sync.WaitGroup
	for i := 0; i < 200; i++ {
		wg.Add(2)
		go func() {
			defer wg.Done()
			conn.setState(StateConnected, "")
		}()
		go func() {
			defer wg.Done()
			snap := conn.Snapshot()
			// Snapshot should always have a valid state.
			switch snap.State {
			case StateDisconnected, StateConnecting, StateConnected, StateReconnecting, StateError:
				// valid
			default:
				t.Errorf("unexpected state: %s", snap.State)
			}
		}()
	}
	wg.Wait()
}

func TestManager_ListConnections_MultipleContexts(t *testing.T) {
	mgr := NewManager()
	mgr.SetClientBundleForTest("ctx1", &ClientBundle{})
	mgr.SetClientBundleForTest("ctx2", &ClientBundle{})
	mgr.SetClientBundleForTest("ctx3", &ClientBundle{})

	conns := mgr.ListConnections()
	if len(conns) != 3 {
		t.Errorf("expected 3 connections, got %d", len(conns))
	}
	// All should be connected.
	for _, c := range conns {
		if c.State != StateConnected {
			t.Errorf("expected StateConnected, got %s", c.State)
		}
	}
}

func TestManager_ConnectionFor_Connected(t *testing.T) {
	mgr := NewManager()
	mgr.SetClientBundleForTest("ctx1", &ClientBundle{})

	snap, err := mgr.ConnectionFor("ctx1")
	if err != nil {
		t.Fatalf("ConnectionFor: %v", err)
	}
	if snap.State != StateConnected {
		t.Errorf("expected StateConnected, got %s", snap.State)
	}
}

func TestManager_ClientsFor_Connected(t *testing.T) {
	mgr := NewManager()
	bundle := &ClientBundle{}
	mgr.SetClientBundleForTest("ctx1", bundle)

	got, err := mgr.ClientsFor("ctx1")
	if err != nil {
		t.Fatalf("ClientsFor: %v", err)
	}
	if got != bundle {
		t.Error("expected same bundle back")
	}
}

func TestManager_ActiveClients_Connected(t *testing.T) {
	mgr := NewManager()
	bundle := &ClientBundle{}
	mgr.SetClientBundleForTest("ctx1", bundle)

	got, err := mgr.ActiveClients()
	if err != nil {
		t.Fatalf("ActiveClients: %v", err)
	}
	if got != bundle {
		t.Error("expected same bundle back from ActiveClients")
	}
}

func TestAuthTypeFor(t *testing.T) {
	tests := []struct {
		name     string
		yaml     string
		expected string
	}{
		{"token", `apiVersion: v1
kind: Config
clusters:
- name: c
  cluster:
    server: https://localhost
contexts:
- name: ctx
  context:
    cluster: c
    user: u
users:
- name: u
  user:
    token: foo
current-context: ctx
`, "token"},
		{"certificate", `apiVersion: v1
kind: Config
clusters:
- name: c
  cluster:
    server: https://localhost
contexts:
- name: ctx
  context:
    cluster: c
    user: u
users:
- name: u
  user:
    client-certificate: /tmp/cert.pem
current-context: ctx
`, "certificate"},
		{"basic", `apiVersion: v1
kind: Config
clusters:
- name: c
  cluster:
    server: https://localhost
contexts:
- name: ctx
  context:
    cluster: c
    user: u
users:
- name: u
  user:
    username: admin
    password: secret
current-context: ctx
`, "basic"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f, err := os.CreateTemp("", "kubeconfig-*.yaml")
			if err != nil {
				t.Fatal(err)
			}
			defer os.Remove(f.Name())
			f.WriteString(tt.yaml)
			f.Close()

			loader := NewKubeconfigLoaderFromPaths([]string{f.Name()})
			contexts, err := loader.ListContexts()
			if err != nil {
				t.Fatalf("ListContexts: %v", err)
			}
			if len(contexts) == 0 {
				t.Fatal("expected at least 1 context")
			}
			if contexts[0].AuthType != tt.expected {
				t.Errorf("expected auth type %q, got %q", tt.expected, contexts[0].AuthType)
			}
		})
	}
}
