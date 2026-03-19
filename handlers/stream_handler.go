package handlers

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"time"

	"clusterfudge/internal/ai"
	"clusterfudge/internal/cluster"
	"clusterfudge/internal/events"
	"clusterfudge/internal/stream"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// StreamHandler wraps stream functions and cluster.Manager to expose
// log streaming, exec, port-forward, and local terminal operations to the frontend.
type StreamHandler struct {
	manager  *cluster.Manager
	emitter  *events.Emitter
	mu       sync.RWMutex
	logCancels     map[string]context.CancelFunc    // podName → cancel
	execSessions   map[string]*stream.ExecSession   // sessionID → session
	localTerminals map[string]*ai.LocalSession      // sessionID → local terminal session
	pfCancels      map[int]context.CancelFunc       // localPort → cancel
	pfManager      *stream.PortForwardManager
	multiStreamers map[string]*multiStreamerEntry    // "ns/pod" → entry
}

// multiStreamerEntry bundles a multi-log streamer with its context cancel func.
type multiStreamerEntry struct {
	streamer *stream.MultiLogStreamer
	cancel   context.CancelFunc
}

// NewStreamHandler creates a StreamHandler.
func NewStreamHandler(mgr *cluster.Manager) *StreamHandler {
	return &StreamHandler{
		manager:        mgr,
		logCancels:     make(map[string]context.CancelFunc),
		execSessions:   make(map[string]*stream.ExecSession),
		localTerminals: make(map[string]*ai.LocalSession),
		pfCancels:      make(map[int]context.CancelFunc),
		pfManager:      stream.NewPortForwardManager(),
		multiStreamers: make(map[string]*multiStreamerEntry),
	}
}

// SetEmitter sets the event emitter for streaming event broadcasting.
func (h *StreamHandler) SetEmitter(emitter *events.Emitter) {
	h.emitter = emitter
}

// StreamLogs starts streaming logs for a pod and emits lines as events.
// Event topic: "logs:{namespace}/{podName}"
func (h *StreamHandler) StreamLogs(opts stream.LogOptions) error {
	cs, err := h.manager.ActiveClient()
	if err != nil {
		return fmt.Errorf("stream logs: %w", err)
	}

	// Cancel any existing stream for this pod (namespace-scoped key)
	logKey := fmt.Sprintf("%s/%s", opts.Namespace, opts.PodName)
	h.cancelLogStream(logKey)

	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Hour) //nolint:gosec // G118 - cancel stored in logCancels map for later cleanup
	h.mu.Lock()
	h.logCancels[logKey] = cancel
	h.mu.Unlock()

	streamer := stream.NewLogStreamer(cs.Typed)
	eventName := fmt.Sprintf("logs:%s/%s", opts.Namespace, opts.PodName)

	go func() {
		defer cancel()
		err := streamer.Stream(ctx, opts, func(line stream.LogLine) {
			if h.emitter != nil {
				h.emitter.Emit(eventName, map[string]any{
					"content":   line.Content,
					"timestamp": line.Timestamp.Format("2006-01-02T15:04:05.000Z"),
					"container": opts.ContainerName,
				})
			}
		})
		if err != nil && h.emitter != nil {
			h.emitter.Emit(eventName+":error", err.Error())
		}
	}()

	return nil
}

// StopLogStream stops an active log stream for the given pod.
func (h *StreamHandler) StopLogStream(namespace, podName string) {
	h.cancelLogStream(fmt.Sprintf("%s/%s", namespace, podName))
}

func (h *StreamHandler) cancelLogStream(podName string) {
	h.mu.Lock()
	cancel, ok := h.logCancels[podName]
	if ok {
		delete(h.logCancels, podName)
	}
	h.mu.Unlock()
	if ok {
		cancel()
	}
}

// shellMetachars are characters that should not appear in individual exec command arguments.
var shellMetachars = []string{";", "|", "&", "`", "$(", "${", "\n"}

// validateExecCommand checks that the command array does not contain shell injection patterns.
func validateExecCommand(command []string) error {
	if len(command) == 0 {
		return fmt.Errorf("command is empty")
	}
	for i, arg := range command {
		for _, meta := range shellMetachars {
			if strings.Contains(arg, meta) {
				return fmt.Errorf("command argument %d contains disallowed character %q", i, meta)
			}
		}
	}
	return nil
}

// StartExec creates a new exec session and returns the session ID.
// Emits events on "exec:stdout:{sessionID}", "exec:stderr:{sessionID}", "exec:exit:{sessionID}".
func (h *StreamHandler) StartExec(opts stream.ExecOptions) (string, error) {
	cs, err := h.manager.ActiveClient()
	if err != nil {
		return "", fmt.Errorf("start exec: %w", err)
	}

	if len(opts.Command) == 0 {
		opts.Command = []string{"/bin/sh", "-c", "bash || sh"}
	} else if err := validateExecCommand(opts.Command); err != nil {
		return "", fmt.Errorf("exec command validation failed: %w", err)
	}

	opts.TTY = true

	sessionID, err := stream.GenerateID()
	if err != nil {
		return "", fmt.Errorf("generate session ID: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 24*time.Hour)

	session, err := stream.StartExec(
		ctx,
		cs.Typed,
		cs.Config,
		opts,
		func(data []byte) {
			if h.emitter != nil {
				h.emitter.Emit("exec:stdout:"+sessionID, string(data))
			}
		},
		func(data []byte) {
			if h.emitter != nil {
				h.emitter.Emit("exec:stderr:"+sessionID, string(data))
			}
		},
		func(exitErr error) {
			msg := ""
			if exitErr != nil {
				msg = exitErr.Error()
			}
			if h.emitter != nil {
				h.emitter.Emit("exec:exit:"+sessionID, msg)
			}
			cancel()
			// Clean up session
			h.mu.Lock()
			delete(h.execSessions, sessionID)
			h.mu.Unlock()
		},
	)
	if err != nil {
		cancel()
		return "", err
	}

	h.mu.Lock()
	h.execSessions[sessionID] = session
	h.mu.Unlock()

	return sessionID, nil
}

// WriteExec sends input to an exec session.
func (h *StreamHandler) WriteExec(sessionID string, data string) error {
	h.mu.RLock()
	session, ok := h.execSessions[sessionID]
	h.mu.RUnlock()
	if !ok {
		return fmt.Errorf("exec session not found: %s", sessionID)
	}
	return session.Write([]byte(data))
}

// ResizeExec sends a terminal size update to an exec session.
func (h *StreamHandler) ResizeExec(sessionID string, cols, rows int) error {
	h.mu.RLock()
	session, ok := h.execSessions[sessionID]
	h.mu.RUnlock()
	if !ok {
		return fmt.Errorf("exec session not found: %s", sessionID)
	}
	session.Resize(uint16(cols), uint16(rows)) //nolint:gosec // G115 - cols/rows are terminal dimensions, always small positive ints
	return nil
}

// CloseExec terminates an exec session.
func (h *StreamHandler) CloseExec(sessionID string) {
	h.mu.Lock()
	session, ok := h.execSessions[sessionID]
	if ok {
		delete(h.execSessions, sessionID)
	}
	h.mu.Unlock()
	if session != nil {
		session.Close()
	}
}

// StartPortForward starts port forwarding to a pod.
func (h *StreamHandler) StartPortForward(opts stream.PortForwardOptions) (*stream.PortForwardResult, error) {
	cs, err := h.manager.ActiveClient()
	if err != nil {
		return nil, fmt.Errorf("start port forward: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 24*time.Hour)
	result, err := h.pfManager.StartPortForward(ctx, cs.Typed, cs.Config, opts, h.emitter)
	if err != nil {
		cancel()
		return nil, err
	}

	h.mu.Lock()
	h.pfCancels[result.LocalPort] = cancel
	h.mu.Unlock()

	return result, nil
}

// StartServicePortForward resolves a service to its backing pod(s) and starts
// a port forward to the first Ready pod.
func (h *StreamHandler) StartServicePortForward(namespace, serviceName string, servicePort, localPort int) (*stream.PortForwardResult, error) {
	cs, err := h.manager.ActiveClient()
	if err != nil {
		return nil, fmt.Errorf("start service port forward: %w", err)
	}

	ctx := context.Background()

	// Get the service.
	svc, err := cs.Typed.CoreV1().Services(namespace).Get(ctx, serviceName, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("get service %s/%s: %w", namespace, serviceName, err)
	}

	selector := svc.Spec.Selector
	if len(selector) == 0 {
		return nil, fmt.Errorf("service %s/%s has no selector", namespace, serviceName)
	}

	// Build label selector string from the map.
	var selectorParts []string
	for k, v := range selector {
		selectorParts = append(selectorParts, fmt.Sprintf("%s=%s", k, v))
	}
	labelSelector := strings.Join(selectorParts, ",")

	// List pods matching the selector.
	pods, err := cs.Typed.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: labelSelector,
	})
	if err != nil {
		return nil, fmt.Errorf("list pods for service %s/%s: %w", namespace, serviceName, err)
	}
	if len(pods.Items) == 0 {
		return nil, fmt.Errorf("no pods found for service %s/%s", namespace, serviceName)
	}

	// Find the first Ready pod.
	var readyPodName string
	for _, pod := range pods.Items {
		for _, cond := range pod.Status.Conditions {
			if cond.Type == corev1.PodReady && cond.Status == corev1.ConditionTrue {
				readyPodName = pod.Name
				break
			}
		}
		if readyPodName != "" {
			break
		}
	}
	if readyPodName == "" {
		return nil, fmt.Errorf("no Ready pods found for service %s/%s", namespace, serviceName)
	}

	// Resolve the target port: find which container port the service port maps to.
	targetPort := servicePort
	for _, sp := range svc.Spec.Ports {
		if int(sp.Port) == servicePort {
			if sp.TargetPort.IntValue() != 0 {
				targetPort = sp.TargetPort.IntValue()
			}
			break
		}
	}

	return h.StartPortForward(stream.PortForwardOptions{
		Namespace: namespace,
		PodName:   readyPodName,
		PodPort:   targetPort,
		LocalPort: localPort,
	})
}

// StopPortForward stops a port forward by local port number.
func (h *StreamHandler) StopPortForward(localPort int) {
	h.pfManager.StopPortForward(localPort)

	h.mu.Lock()
	cancel, ok := h.pfCancels[localPort]
	if ok {
		delete(h.pfCancels, localPort)
	}
	h.mu.Unlock()
	if ok {
		cancel()
	}
}

// ListPortForwards returns all active port forwards.
func (h *StreamHandler) ListPortForwards() []stream.PortForwardInfo {
	return h.pfManager.ListPortForwards()
}

// StreamAllContainerLogs starts parallel log streams for every container in a pod.
// Lines are emitted on "logs:all:{namespace}/{podName}".
func (h *StreamHandler) StreamAllContainerLogs(namespace, podName string, containers []string, tailLines int64) error {
	key := fmt.Sprintf("%s/%s", namespace, podName)

	// Stop any existing multi-streamer for this pod
	h.mu.Lock()
	if existing, ok := h.multiStreamers[key]; ok {
		existing.streamer.StopAll()
		existing.cancel()
		delete(h.multiStreamers, key)
	}
	h.mu.Unlock()

	cs, err := h.manager.ActiveClient()
	if err != nil {
		return fmt.Errorf("stream all container logs: %w", err)
	}

	s := stream.NewMultiLogStreamer(stream.NewLogStreamer(cs.Typed))
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Hour) //nolint:gosec // G118 - cancel stored in multiStreamers map for later cleanup

	h.mu.Lock()
	h.multiStreamers[key] = &multiStreamerEntry{streamer: s, cancel: cancel}
	h.mu.Unlock()

	eventName := fmt.Sprintf("logs:all:%s", key)
	s.StartAll(ctx, namespace, podName, containers, tailLines, func(line stream.LogLine) {
		if h.emitter != nil {
			h.emitter.Emit(eventName, map[string]any{
				"content":   line.Content,
				"timestamp": line.Timestamp.Format("2006-01-02T15:04:05.000Z"),
				"container": line.Container,
			})
		}
	}, func(containerName string, err error) {
		if h.emitter != nil {
			h.emitter.Emit(eventName+":error", fmt.Sprintf("container %s: %v", containerName, err))
		}
	})
	return nil
}

// StopAllContainerLogs stops all container streams for a pod.
func (h *StreamHandler) StopAllContainerLogs(namespace, podName string) {
	key := fmt.Sprintf("%s/%s", namespace, podName)
	h.mu.Lock()
	if existing, ok := h.multiStreamers[key]; ok {
		existing.streamer.StopAll()
		existing.cancel()
		delete(h.multiStreamers, key)
	}
	h.mu.Unlock()
}

// StartLocalTerminal spawns a local shell in a PTY.
// Output streams on "localterm:stdout:{sessionID}", exit on "localterm:exit:{sessionID}".
func (h *StreamHandler) StartLocalTerminal() (string, error) {
	shell := defaultShell()

	sessionID, err := stream.GenerateID()
	if err != nil {
		return "", fmt.Errorf("generate session ID: %w", err)
	}

	session, err := ai.StartLocalSession([]string{shell}, nil, func(data []byte) {
		if h.emitter != nil {
			h.emitter.Emit("localterm:stdout:"+sessionID, string(data))
		}
	}, func(exitErr error) {
		msg := ""
		if exitErr != nil {
			msg = exitErr.Error()
		}
		if h.emitter != nil {
			h.emitter.Emit("localterm:exit:"+sessionID, msg)
		}
		h.mu.Lock()
		delete(h.localTerminals, sessionID)
		h.mu.Unlock()
	})
	if err != nil {
		return "", fmt.Errorf("failed to start local terminal: %w", err)
	}

	h.mu.Lock()
	h.localTerminals[sessionID] = session
	h.mu.Unlock()

	slog.Info("Local terminal started", "session", sessionID, "shell", shell)
	return sessionID, nil
}

// WriteLocalTerminal sends keyboard input to a local terminal session's PTY.
func (h *StreamHandler) WriteLocalTerminal(sessionID, data string) error {
	h.mu.RLock()
	session, ok := h.localTerminals[sessionID]
	h.mu.RUnlock()
	if !ok {
		return fmt.Errorf("local terminal session not found: %s", sessionID)
	}
	return session.Write([]byte(data))
}

// ResizeLocalTerminal resizes the PTY for a local terminal session.
func (h *StreamHandler) ResizeLocalTerminal(sessionID string, rows, cols int) error {
	if rows <= 0 || cols <= 0 || rows > 500 || cols > 500 {
		return fmt.Errorf("invalid terminal size: %dx%d", rows, cols)
	}
	h.mu.RLock()
	session, ok := h.localTerminals[sessionID]
	h.mu.RUnlock()
	if !ok {
		return fmt.Errorf("local terminal session not found: %s", sessionID)
	}
	return session.Resize(uint16(rows), uint16(cols))
}

// CloseLocalTerminal terminates a local terminal session.
func (h *StreamHandler) CloseLocalTerminal(sessionID string) {
	h.mu.Lock()
	session, ok := h.localTerminals[sessionID]
	if ok {
		delete(h.localTerminals, sessionID)
	}
	h.mu.Unlock()
	if session != nil {
		session.Close()
		slog.Info("Local terminal closed", "session", sessionID)
	}
}

// defaultShell returns the user's preferred shell.
func defaultShell() string {
	if s := os.Getenv("SHELL"); s != "" {
		return s
	}
	if runtime.GOOS == "windows" {
		if ps, err := exec.LookPath("powershell.exe"); err == nil {
			return ps
		}
		return "cmd.exe"
	}
	return "/bin/sh"
}

// DownloadLogs fetches the full (non-streaming) log for a container and returns it as a string.
func (h *StreamHandler) DownloadLogs(opts stream.LogOptions) (string, error) {
	cs, err := h.manager.ActiveClient()
	if err != nil {
		return "", fmt.Errorf("download logs: %w", err)
	}

	tailLines := opts.TailLines
	if tailLines == 0 {
		tailLines = 100_000
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	req := cs.Typed.CoreV1().Pods(opts.Namespace).GetLogs(opts.PodName, &corev1.PodLogOptions{
		Container:  opts.ContainerName,
		TailLines:  &tailLines,
		Timestamps: opts.Timestamps,
	})
	rc, err := req.Stream(ctx)
	if err != nil {
		return "", fmt.Errorf("open log stream: %w", err)
	}
	defer rc.Close()

	const maxDownloadBytes = 50 * 1024 * 1024 // 50 MiB
	data, err := io.ReadAll(io.LimitReader(rc, maxDownloadBytes))
	if err != nil {
		return "", fmt.Errorf("read log data: %w", err)
	}
	return string(data), nil
}
