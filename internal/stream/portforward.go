package stream

import (
	"context"
	"fmt"
	"net/http"
	"sync"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/portforward"
	"k8s.io/client-go/transport/spdy"
)

// PortForwardEmitter abstracts event emission for port-forward status updates.
type PortForwardEmitter interface {
	Emit(topic string, payload any)
}

// portForwardEntry tracks an active port forward with metadata.
type portForwardEntry struct {
	cancel         func() // stops the port forward and reconnect loop
	forceReconnect chan struct{}
	podName        string
	namespace      string
	podPort        int
	status         string // "active", "reconnecting"
	reconnectNum   int    // current reconnect attempt (0 when active)
}

// Reconnection constants.
const (
	pfMaxRetries   = 5
	pfMaxBackoff   = 30 * time.Second
	pfInitialDelay = 1 * time.Second
)

// PortForwardManager manages active port-forward sessions.
type PortForwardManager struct {
	forwards map[int]*portForwardEntry
	mu       sync.Mutex
}

// NewPortForwardManager creates a new PortForwardManager.
func NewPortForwardManager() *PortForwardManager {
	return &PortForwardManager{
		forwards: make(map[int]*portForwardEntry),
	}
}

// setForwardStatus updates the status of a port forward entry under lock.
func (m *PortForwardManager) setForwardStatus(localPort int, status string, attempt int) {
	m.mu.Lock()
	if e, ok := m.forwards[localPort]; ok {
		e.status = status
		e.reconnectNum = attempt
	}
	m.mu.Unlock()
}

// startSingleForward establishes one port-forward session and returns
// the actual local port, a stopChan (close to stop), and an errChan
// that receives nil on clean shutdown or an error on disconnect.
func startSingleForward(
	ctx context.Context,
	client kubernetes.Interface,
	cfg *rest.Config,
	opts PortForwardOptions,
) (int, chan struct{}, <-chan error, error) {
	transport, upgrader, err := spdy.RoundTripperFor(cfg)
	if err != nil {
		return 0, nil, nil, fmt.Errorf("create round tripper: %w", err)
	}

	reqURL := client.CoreV1().RESTClient().Post().
		Resource("pods").
		Name(opts.PodName).
		Namespace(opts.Namespace).
		SubResource("portforward").
		URL()

	dialer := spdy.NewDialer(upgrader, &http.Client{Transport: transport}, "POST", reqURL)

	portSpec := fmt.Sprintf("%d:%d", opts.LocalPort, opts.PodPort)
	readyChan := make(chan struct{})
	stopChan := make(chan struct{})

	fw, err := portforward.New(dialer, []string{portSpec}, stopChan, readyChan, nil, nil)
	if err != nil {
		return 0, nil, nil, fmt.Errorf("create port forwarder: %w", err)
	}

	errChan := make(chan error, 1)
	go func() {
		errChan <- fw.ForwardPorts()
	}()

	// Wait for the port forward to be ready or fail.
	select {
	case <-readyChan:
	case err := <-errChan:
		return 0, nil, nil, fmt.Errorf("port forward failed: %w", err)
	case <-ctx.Done():
		close(stopChan)
		return 0, nil, nil, ctx.Err()
	}

	ports, err := fw.GetPorts()
	if err != nil {
		close(stopChan)
		return 0, nil, nil, fmt.Errorf("get forwarded ports: %w", err)
	}
	if len(ports) == 0 {
		close(stopChan)
		return 0, nil, nil, fmt.Errorf("no ports forwarded")
	}

	return int(ports[0].Local), stopChan, errChan, nil
}

// podExists checks whether the target pod still exists.
func podExists(ctx context.Context, client kubernetes.Interface, namespace, name string) bool {
	checkCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	_, err := client.CoreV1().Pods(namespace).Get(checkCtx, name, metav1.GetOptions{})
	return err == nil
}

// backoffDuration returns the exponential backoff delay for the given attempt,
// capped at pfMaxBackoff.
func backoffDuration(attempt int) time.Duration {
	d := pfInitialDelay
	for i := 0; i < attempt; i++ {
		d *= 2
		if d > pfMaxBackoff {
			return pfMaxBackoff
		}
	}
	return d
}

// StartPortForward establishes a port-forward connection to a pod.
// If emitter is non-nil, reconnection status events are emitted.
func (m *PortForwardManager) StartPortForward(
	ctx context.Context,
	client kubernetes.Interface,
	cfg *rest.Config,
	opts PortForwardOptions,
	emitter PortForwardEmitter,
) (*PortForwardResult, error) {
	// Verify pod exists.
	_, err := client.CoreV1().Pods(opts.Namespace).Get(ctx, opts.PodName, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("get pod %s/%s: %w", opts.Namespace, opts.PodName, err)
	}

	actualLocalPort, stopChan, errChan, err := startSingleForward(ctx, client, cfg, opts)
	if err != nil {
		return nil, err
	}

	// masterStop is closed when the user calls StopPortForward.
	masterStop := make(chan struct{})
	masterOnce := sync.Once{}
	masterCancel := func() {
		masterOnce.Do(func() { close(masterStop) })
	}

	entry := &portForwardEntry{
		cancel:         masterCancel,
		forceReconnect: make(chan struct{}, 1),
		podName:        opts.PodName,
		namespace:      opts.Namespace,
		podPort:        opts.PodPort,
		status:         "active",
	}

	m.mu.Lock()
	m.forwards[actualLocalPort] = entry
	m.mu.Unlock()

	// reconnect attempts to re-establish the port forward with exponential backoff.
	// It returns the new stopChan, errChan, and true on success, or zero values and false
	// if reconnection failed (pod gone or max retries exceeded).
	reconnect := func(currentStopChan chan struct{}) (chan struct{}, <-chan error, bool) {
		// Close the current forward to free the local port.
		select {
		case <-currentStopChan:
		default:
			close(currentStopChan)
		}

		// Check if the pod still exists.
		if !podExists(ctx, client, opts.Namespace, opts.PodName) {
			m.mu.Lock()
			delete(m.forwards, actualLocalPort)
			m.mu.Unlock()
			masterCancel()
			return nil, nil, false
		}

		// Attempt reconnection with exponential backoff.
		for attempt := 0; attempt < pfMaxRetries; attempt++ {
			m.setForwardStatus(actualLocalPort, "reconnecting", attempt+1)
			if emitter != nil {
				emitter.Emit(fmt.Sprintf("portforward:reconnecting:%d", actualLocalPort), map[string]any{
					"localPort":  actualLocalPort,
					"attempt":    attempt + 1,
					"maxRetries": pfMaxRetries,
				})
			}

			delay := backoffDuration(attempt)
			select {
			case <-time.After(delay):
			case <-masterStop:
				m.mu.Lock()
				delete(m.forwards, actualLocalPort)
				m.mu.Unlock()
				return nil, nil, false
			case <-ctx.Done():
				m.mu.Lock()
				delete(m.forwards, actualLocalPort)
				m.mu.Unlock()
				masterCancel()
				return nil, nil, false
			}

			// Check pod still exists before retry.
			if !podExists(ctx, client, opts.Namespace, opts.PodName) {
				m.mu.Lock()
				delete(m.forwards, actualLocalPort)
				m.mu.Unlock()
				masterCancel()
				return nil, nil, false
			}

			// Use the known local port for reconnection.
			reconnOpts := PortForwardOptions{
				Namespace: opts.Namespace,
				PodName:   opts.PodName,
				PodPort:   opts.PodPort,
				LocalPort: actualLocalPort,
			}

			newLocalPort, newStopChan, newErrChan, reconnErr := startSingleForward(ctx, client, cfg, reconnOpts)
			if reconnErr != nil {
				continue
			}

			if newLocalPort != actualLocalPort {
				// Should not happen since we specified the port,
				// but handle gracefully.
				close(newStopChan)
				continue
			}

			// Reconnected successfully.
			m.setForwardStatus(actualLocalPort, "active", 0)

			if emitter != nil {
				emitter.Emit(fmt.Sprintf("portforward:reconnected:%d", actualLocalPort), map[string]any{
					"localPort": actualLocalPort,
				})
			}

			return newStopChan, newErrChan, true
		}

		// Max retries exceeded.
		m.mu.Lock()
		delete(m.forwards, actualLocalPort)
		m.mu.Unlock()
		masterCancel()
		return nil, nil, false
	}

	// Lifecycle goroutine: monitors for disconnects and reconnects.
	go func() {
		currentStopChan := stopChan
		currentErrChan := errChan

		for {
			select {
			case <-ctx.Done():
				m.mu.Lock()
				delete(m.forwards, actualLocalPort)
				m.mu.Unlock()
				masterCancel()
				return

			case <-masterStop:
				// User requested stop. Close current forward.
				select {
				case <-currentStopChan:
				default:
					close(currentStopChan)
				}
				m.mu.Lock()
				delete(m.forwards, actualLocalPort)
				m.mu.Unlock()
				return

			case <-entry.forceReconnect:
				// Triggered by ProbeAll after sleep/wake. Force reconnection
				// without waiting for the errChan to fire.
				newStop, newErr, ok := reconnect(currentStopChan)
				if !ok {
					return
				}
				currentStopChan = newStop
				currentErrChan = newErr

			case fwErr := <-currentErrChan:
				// The port forward disconnected. Attempt reconnection.
				_ = fwErr // logged implicitly via events

				newStop, newErr, ok := reconnect(currentStopChan)
				if !ok {
					return
				}
				currentStopChan = newStop
				currentErrChan = newErr
			}
		}
	}()

	return &PortForwardResult{
		LocalPort: actualLocalPort,
		PodPort:   opts.PodPort,
		PodName:   opts.PodName,
		Namespace: opts.Namespace,
	}, nil
}

// StopPortForward stops a port-forward by local port number.
func (m *PortForwardManager) StopPortForward(localPort int) {
	m.mu.Lock()
	entry, ok := m.forwards[localPort]
	if ok {
		delete(m.forwards, localPort)
	}
	m.mu.Unlock()
	if ok {
		entry.cancel()
	}
}

// StopAllPortForwards stops all active port forwards.
func (m *PortForwardManager) StopAllPortForwards() {
	m.mu.Lock()
	entries := make([]*portForwardEntry, 0, len(m.forwards))
	for port, entry := range m.forwards {
		entries = append(entries, entry)
		delete(m.forwards, port)
	}
	m.mu.Unlock()

	for _, e := range entries {
		e.cancel()
	}
}

// ProbeAll checks all active port forwards by verifying the underlying
// connection is still alive. Dead forwards (pod gone) are cleaned up
// immediately. Live forwards are force-reconnected so stale connections
// (e.g. after OS sleep/wake) are replaced promptly.
func (m *PortForwardManager) ProbeAll(ctx context.Context, client kubernetes.Interface) {
	m.mu.Lock()
	// Snapshot current entries to avoid holding the lock during network calls.
	type snapshot struct {
		port  int
		entry *portForwardEntry
	}
	entries := make([]snapshot, 0, len(m.forwards))
	for port, entry := range m.forwards {
		entries = append(entries, snapshot{port: port, entry: entry})
	}
	m.mu.Unlock()

	for _, s := range entries {
		if !podExists(ctx, client, s.entry.namespace, s.entry.podName) {
			// Pod is gone. Cancel the forward so the lifecycle goroutine cleans up.
			s.entry.cancel()
			continue
		}

		// Pod exists but the connection is likely stale after sleep/wake.
		// Signal the lifecycle goroutine to force a reconnect.
		select {
		case s.entry.forceReconnect <- struct{}{}:
		default:
			// Already has a pending reconnect signal; skip.
		}
	}
}

// ListPortForwards returns all active port forwards.
func (m *PortForwardManager) ListPortForwards() []PortForwardInfo {
	m.mu.Lock()
	defer m.mu.Unlock()

	result := make([]PortForwardInfo, 0, len(m.forwards))
	for localPort, entry := range m.forwards {
		result = append(result, PortForwardInfo{
			LocalPort:    localPort,
			PodName:      entry.podName,
			Namespace:    entry.namespace,
			PodPort:      entry.podPort,
			Status:       entry.status,
			ReconnectNum: entry.reconnectNum,
		})
	}
	return result
}
