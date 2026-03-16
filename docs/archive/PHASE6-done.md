# Phase 6 — Real-Time Features: Logs, Events, Shell

## Goal

Live log streaming, real-time event feeds, and interactive pod exec (shell) — the three features that make a K8s desktop app indispensable over `kubectl`. All rendered in the bottom tray and the detail panel.

---

## 6.1 — Pod Log Streaming

### Backend: `internal/stream/logs.go`

```go
package stream

import (
    "bufio"
    "context"
    "fmt"
    "io"

    corev1 "k8s.io/api/core/v1"
    "k8s.io/client-go/kubernetes"
)

// LogOptions configures a log stream.
type LogOptions struct {
    Namespace     string `json:"namespace"`
    PodName       string `json:"podName"`
    ContainerName string `json:"containerName"`
    Follow        bool   `json:"follow"`       // tail -f behaviour
    TailLines     int64  `json:"tailLines"`     // last N lines on initial load
    Previous      bool   `json:"previous"`      // logs from previous container instance
    Timestamps    bool   `json:"timestamps"`    // prepend RFC3339 timestamps
}

// LogLine represents a single log line sent to the frontend.
type LogLine struct {
    Timestamp string `json:"timestamp,omitempty"`
    Content   string `json:"content"`
    Container string `json:"container"`
}

// LogStreamer manages pod log streams.
type LogStreamer struct {
    client kubernetes.Interface
}

func NewLogStreamer(client kubernetes.Interface) *LogStreamer {
    return &LogStreamer{client: client}
}

// Stream opens a log stream and sends lines to the provided callback.
// The callback is typically a Wails event emitter.
func (l *LogStreamer) Stream(ctx context.Context, opts LogOptions, onLine func(LogLine)) error {
    tailLines := opts.TailLines
    if tailLines == 0 {
        tailLines = 500 // default: last 500 lines
    }

    podLogOpts := &corev1.PodLogOptions{
        Container:  opts.ContainerName,
        Follow:     opts.Follow,
        TailLines:  &tailLines,
        Previous:   opts.Previous,
        Timestamps: opts.Timestamps,
    }

    req := l.client.CoreV1().Pods(opts.Namespace).GetLogs(opts.PodName, podLogOpts)
    stream, err := req.Stream(ctx)
    if err != nil {
        return fmt.Errorf("failed to open log stream: %w", err)
    }
    defer stream.Close()

    scanner := bufio.NewScanner(stream)
    // Increase buffer for long log lines
    scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

    for scanner.Scan() {
        select {
        case <-ctx.Done():
            return nil
        default:
            line := scanner.Text()
            logLine := LogLine{
                Content:   line,
                Container: opts.ContainerName,
            }
            if opts.Timestamps && len(line) > 30 {
                // Parse timestamp prefix: "2024-01-15T10:30:00.123456789Z actual log content"
                logLine.Timestamp = line[:30]
                logLine.Content = line[31:]
            }
            onLine(logLine)
        }
    }

    return scanner.Err()
}
```

### Handler: `handlers/stream_handler.go`

```go
// StreamLogs starts streaming logs for a pod and emits lines as Wails events.
func (h *StreamHandler) StreamLogs(opts stream.LogOptions) error {
    client, err := h.clusterMgr.ActiveClient()
    if err != nil {
        return err
    }

    // Cancel any existing stream for this pod
    h.cancelLogStream(opts.PodName)

    ctx, cancel := context.WithCancel(h.ctx)
    h.mu.Lock()
    h.logCancels[opts.PodName] = cancel
    h.mu.Unlock()

    streamer := stream.NewLogStreamer(client.Typed)

    go func() {
        defer cancel()
        eventName := fmt.Sprintf("logs:%s/%s", opts.Namespace, opts.PodName)
        err := streamer.Stream(ctx, opts, func(line stream.LogLine) {
            wailsRuntime.EventsEmit(h.ctx, eventName, line)
        })
        if err != nil {
            wailsRuntime.EventsEmit(h.ctx, eventName+":error", err.Error())
        }
    }()

    return nil
}

// StopLogStream stops an active log stream.
func (h *StreamHandler) StopLogStream(podName string) {
    h.cancelLogStream(podName)
}
```

### Frontend: Log Viewer Component

```tsx
// components/logs/LogViewer.tsx

interface LogViewerProps {
  namespace: string;
  podName: string;
  containers: string[];
}

export function LogViewer({ namespace, podName, containers }: LogViewerProps) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [selectedContainer, setSelectedContainer] = useState(containers[0]);
  const [isFollowing, setIsFollowing] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Start streaming when container changes
  useEffect(() => {
    setLines([]);
    StreamLogs({
      namespace,
      podName,
      containerName: selectedContainer,
      follow: true,
      tailLines: 500,
      timestamps: true,
    });

    const eventName = `logs:${namespace}/${podName}`;
    const cleanup = EventsOn(eventName, (line: LogLine) => {
      setLines((prev) => {
        const updated = [...prev, line];
        // Cap at 10,000 lines to prevent memory issues
        if (updated.length > 10000) {
          return updated.slice(-10000);
        }
        return updated;
      });
    });

    return () => {
      cleanup();
      StopLogStream(podName);
    };
  }, [namespace, podName, selectedContainer]);

  // Auto-scroll when following
  useEffect(() => {
    if (isFollowing && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, isFollowing]);

  // Filter lines by search
  const filteredLines = searchTerm
    ? lines.filter((l) => l.content.toLowerCase().includes(searchTerm.toLowerCase()))
    : lines;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        {/* Container selector */}
        {containers.length > 1 && (
          <select
            value={selectedContainer}
            onChange={(e) => setSelectedContainer(e.target.value)}
            className="text-xs bg-bg-tertiary border border-border rounded px-2 py-1 text-text-primary"
          >
            {containers.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}

        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Search logs..."
          className="flex-1"
        />

        {/* Follow toggle */}
        <button
          onClick={() => setIsFollowing(!isFollowing)}
          className={cn(
            "text-xs px-2 py-1 rounded",
            isFollowing
              ? "bg-accent text-white"
              : "bg-bg-tertiary text-text-secondary hover:text-text-primary"
          )}
        >
          {isFollowing ? "Following" : "Follow"}
        </button>

        {/* Clear */}
        <button
          onClick={() => setLines([])}
          className="text-xs text-text-tertiary hover:text-text-secondary"
        >
          Clear
        </button>
      </div>

      {/* Log output */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto font-mono text-xs p-3 leading-5"
        onScroll={(e) => {
          const el = e.currentTarget;
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
          if (!atBottom && isFollowing) setIsFollowing(false);
          if (atBottom && !isFollowing) setIsFollowing(true);
        }}
      >
        {filteredLines.map((line, i) => (
          <div key={i} className="flex hover:bg-bg-hover">
            {line.timestamp && (
              <span className="text-text-tertiary mr-3 select-none shrink-0">
                {formatTimestamp(line.timestamp)}
              </span>
            )}
            <span className="text-text-primary whitespace-pre-wrap break-all">
              {highlightSearch(line.content, searchTerm)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Log viewer features

| Feature | Detail |
|---------|--------|
| **Container selector** | Dropdown when pod has multiple containers |
| **Follow mode** | Auto-scroll to bottom on new lines. Disengages when user scrolls up. |
| **Search** | Highlights matching text in log output |
| **Timestamps** | Toggle timestamp display |
| **Clear** | Clears the buffer without stopping the stream |
| **Previous logs** | Toggle to view logs from the previous container instance (post-crash) |
| **Line limit** | Cap at 10,000 lines in the buffer. Older lines are discarded. |
| **Copy** | Click a line to copy it. Select multiple lines to copy a range. |
| **Wrap** | Toggle line wrapping on/off |

---

## 6.2 — Pod Exec (Interactive Shell)

### Backend: `internal/stream/exec.go`

Pod exec requires a SPDY or WebSocket connection to the API server. We use `client-go`'s `remotecommand` package to set up the stream, then bridge it to the frontend via Wails events.

```go
package stream

import (
    "context"
    "io"
    "sync"

    corev1 "k8s.io/api/core/v1"
    "k8s.io/client-go/kubernetes"
    "k8s.io/client-go/kubernetes/scheme"
    "k8s.io/client-go/rest"
    "k8s.io/client-go/tools/remotecommand"
)

// ExecOptions configures a pod exec session.
type ExecOptions struct {
    Namespace     string   `json:"namespace"`
    PodName       string   `json:"podName"`
    ContainerName string   `json:"containerName"`
    Command       []string `json:"command"` // e.g. ["/bin/sh", "-c", "bash || sh"]
    TTY           bool     `json:"tty"`
}

// ExecSession represents an active exec connection.
type ExecSession struct {
    ID     string
    stdin  io.WriteCloser
    cancel context.CancelFunc
    mu     sync.Mutex
}

// Write sends input to the exec session (keystrokes from the frontend terminal).
func (s *ExecSession) Write(data []byte) error {
    s.mu.Lock()
    defer s.mu.Unlock()
    _, err := s.stdin.Write(data)
    return err
}

// Resize sends a terminal resize event.
func (s *ExecSession) Resize(width, height uint16) {
    // Handled via remotecommand.TerminalSizeQueue
}

// Close terminates the exec session.
func (s *ExecSession) Close() {
    s.cancel()
    s.stdin.Close()
}

// StartExec creates a new exec session.
func StartExec(
    ctx context.Context,
    client kubernetes.Interface,
    config *rest.Config,
    opts ExecOptions,
    onStdout func(data []byte),
    onStderr func(data []byte),
    onExit func(err error),
) (*ExecSession, error) {
    execCtx, cancel := context.WithCancel(ctx)

    req := client.CoreV1().RESTClient().Post().
        Resource("pods").
        Name(opts.PodName).
        Namespace(opts.Namespace).
        SubResource("exec").
        VersionedParams(&corev1.PodExecOptions{
            Container: opts.ContainerName,
            Command:   opts.Command,
            Stdin:     true,
            Stdout:    true,
            Stderr:    true,
            TTY:       opts.TTY,
        }, scheme.ParameterCodec)

    exec, err := remotecommand.NewSPDYExecutor(config, "POST", req.URL())
    if err != nil {
        cancel()
        return nil, err
    }

    stdinR, stdinW := io.Pipe()
    stdoutW := &callbackWriter{fn: onStdout}
    stderrW := &callbackWriter{fn: onStderr}

    session := &ExecSession{
        ID:     generateID(),
        stdin:  stdinW,
        cancel: cancel,
    }

    go func() {
        err := exec.StreamWithContext(execCtx, remotecommand.StreamOptions{
            Stdin:  stdinR,
            Stdout: stdoutW,
            Stderr: stderrW,
            Tty:    opts.TTY,
        })
        onExit(err)
    }()

    return session, nil
}

// callbackWriter implements io.Writer, forwarding data to a callback.
type callbackWriter struct {
    fn func([]byte)
}

func (w *callbackWriter) Write(p []byte) (int, error) {
    w.fn(p)
    return len(p), nil
}
```

### Handler: Exec session management

```go
// StartExec creates a new exec session and returns the session ID.
func (h *StreamHandler) StartExec(opts stream.ExecOptions) (string, error) {
    client, err := h.clusterMgr.ActiveClient()
    if err != nil {
        return "", err
    }

    if len(opts.Command) == 0 {
        opts.Command = []string{"/bin/sh", "-c", "bash || sh"}
    }
    opts.TTY = true

    sessionID := ""
    session, err := stream.StartExec(
        h.ctx,
        client.Typed,
        client.Config,
        opts,
        func(data []byte) {
            // stdout → frontend
            wailsRuntime.EventsEmit(h.ctx, "exec:stdout:"+sessionID, string(data))
        },
        func(data []byte) {
            // stderr → frontend
            wailsRuntime.EventsEmit(h.ctx, "exec:stderr:"+sessionID, string(data))
        },
        func(err error) {
            // session ended
            msg := ""
            if err != nil {
                msg = err.Error()
            }
            wailsRuntime.EventsEmit(h.ctx, "exec:exit:"+sessionID, msg)
        },
    )
    if err != nil {
        return "", err
    }

    sessionID = session.ID
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
```

### Frontend: Terminal Component

Uses xterm.js for terminal emulation.

```tsx
// components/terminal/Terminal.tsx
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

interface TerminalProps {
  namespace: string;
  podName: string;
  containerName: string;
}

export function Terminal({ namespace, podName, containerName }: TerminalProps) {
  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const sessionIdRef = useRef<string>("");

  useEffect(() => {
    if (!termRef.current) return;

    // Create xterm instance
    const term = new XTerm({
      theme: {
        background: "#0A0A0B",
        foreground: "#EDEDEF",
        cursor: "#7C5CFC",
        selectionBackground: "#7C5CFC33",
        black: "#1A1A1E",
        red: "#F87171",
        green: "#4ADE80",
        yellow: "#FBBF24",
        blue: "#60A5FA",
        magenta: "#C084FC",
        cyan: "#22D3EE",
        white: "#EDEDEF",
      },
      fontFamily: "JetBrains Mono, Menlo, Monaco, monospace",
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: "bar",
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(termRef.current);
    fitAddon.fit();

    xtermRef.current = term;

    // Start exec session
    StartExec({
      namespace,
      podName,
      containerName,
      command: ["/bin/sh", "-c", "bash || sh"],
      tty: true,
    }).then((sessionId) => {
      sessionIdRef.current = sessionId;

      // Forward keystrokes to Go backend
      term.onData((data) => {
        WriteExec(sessionId, data);
      });

      // Receive stdout from Go backend
      EventsOn(`exec:stdout:${sessionId}`, (data: string) => {
        term.write(data);
      });

      // Receive stderr
      EventsOn(`exec:stderr:${sessionId}`, (data: string) => {
        term.write(data);
      });

      // Handle exit
      EventsOn(`exec:exit:${sessionId}`, (msg: string) => {
        term.write(`\r\n\x1b[90m[Session ended${msg ? `: ${msg}` : ""}]\x1b[0m\r\n`);
      });
    });

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(termRef.current);

    return () => {
      resizeObserver.disconnect();
      if (sessionIdRef.current) {
        CloseExec(sessionIdRef.current);
      }
      term.dispose();
    };
  }, [namespace, podName, containerName]);

  return <div ref={termRef} className="h-full w-full" />;
}
```

---

## 6.3 — Cluster Events Feed

### Backend

Events use the same watch mechanism from Phase 3, filtering for `Event` resources.

```go
// ListEvents returns recent cluster events, sorted by last timestamp.
func (h *ResourceHandler) ListEvents(namespace string, limit int) ([]EventInfo, error) {
    client, err := h.clusterMgr.ActiveClient()
    if err != nil {
        return nil, err
    }

    opts := metav1.ListOptions{
        Limit: int64(limit),
    }
    var events *corev1.EventList
    if namespace != "" {
        events, err = client.Typed.CoreV1().Events(namespace).List(h.ctx, opts)
    } else {
        events, err = client.Typed.CoreV1().Events("").List(h.ctx, opts)
    }
    if err != nil {
        return nil, err
    }

    // Sort by last timestamp, newest first
    sort.Slice(events.Items, func(i, j int) bool {
        return events.Items[i].LastTimestamp.After(events.Items[j].LastTimestamp.Time)
    })

    result := make([]EventInfo, 0, len(events.Items))
    for _, e := range events.Items {
        result = append(result, EventInfo{
            Type:           e.Type,
            Reason:         e.Reason,
            Message:        e.Message,
            ObjectKind:     e.InvolvedObject.Kind,
            ObjectName:     e.InvolvedObject.Name,
            ObjectNS:       e.InvolvedObject.Namespace,
            Count:          e.Count,
            FirstTimestamp: e.FirstTimestamp.Time.Format(time.RFC3339),
            LastTimestamp:  e.LastTimestamp.Time.Format(time.RFC3339),
        })
    }
    return result, nil
}
```

### Frontend: Events Panel

The events panel shows in the bottom tray and on the cluster overview page.

```tsx
// components/events/EventsFeed.tsx
export function EventsFeed() {
  const { data: events } = useKubeEvents();

  return (
    <div className="overflow-auto h-full">
      {events?.map((event, i) => (
        <div
          key={i}
          className="flex items-start gap-3 px-3 py-2 hover:bg-bg-hover border-b border-border/50 text-sm"
        >
          {/* Type indicator */}
          <span className={cn(
            "shrink-0 mt-0.5",
            event.type === "Warning" ? "text-status-pending" : "text-status-info"
          )}>
            {event.type === "Warning" ? "⚠" : "ℹ"}
          </span>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-text-secondary text-xs font-medium">
                {event.objectKind}/{event.objectName}
              </span>
              <span className="text-text-tertiary text-xs">{event.reason}</span>
            </div>
            <p className="text-text-primary text-xs mt-0.5 truncate">{event.message}</p>
          </div>

          {/* Timestamp */}
          <span className="text-text-tertiary text-xs shrink-0 tabular-nums">
            {formatRelativeTime(event.lastTimestamp)}
          </span>

          {/* Count badge */}
          {event.count > 1 && (
            <span className="text-2xs bg-bg-tertiary text-text-secondary px-1.5 py-0.5 rounded-full tabular-nums">
              {event.count}x
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
```

---

## 6.4 — Port Forwarding

### Backend

```go
// PortForwardOptions configures a port forward.
type PortForwardOptions struct {
    Namespace string `json:"namespace"`
    PodName   string `json:"podName"`
    PodPort   int    `json:"podPort"`
    LocalPort int    `json:"localPort"` // 0 for auto-assign
}

// PortForwardResult contains the active port forward details.
type PortForwardResult struct {
    LocalPort int    `json:"localPort"`
    PodPort   int    `json:"podPort"`
    PodName   string `json:"podName"`
}

// StartPortForward creates a port forward to a pod.
func (h *StreamHandler) StartPortForward(opts PortForwardOptions) (*PortForwardResult, error) {
    // Implementation using client-go's portforward package
    // ...
}

// StopPortForward terminates an active port forward.
func (h *StreamHandler) StopPortForward(podName string, localPort int) error {
    // ...
}

// ListPortForwards returns all active port forwards.
func (h *StreamHandler) ListPortForwards() ([]PortForwardResult, error) {
    // ...
}
```

### Frontend integration

Port forwarding is accessible from:
1. Pod detail panel → Actions menu → "Port Forward..."
2. Service detail panel → Actions menu → "Port Forward..."
3. Right-click context menu on any pod/service row

A dialog collects the local port (defaulting to the pod port) and starts the forward. Active forwards show in the bottom tray status bar.

---

## 6.5 — Bottom Tray Integration

All three real-time features render as tabs in the bottom tray.

```tsx
// layouts/BottomTray.tsx
export function BottomTray() {
  const { bottomTrayOpen, bottomTrayHeight, bottomTrayTab, setBottomTrayTab } = useUIStore();
  const { selectedPod } = useSelectionStore();

  if (!bottomTrayOpen) return null;

  return (
    <div
      className="border-t border-border bg-bg-secondary"
      style={{ height: bottomTrayHeight }}
    >
      {/* Drag handle */}
      <DragHandle onDrag={(delta) => { /* resize logic */ }} />

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-3 h-8 border-b border-border">
        <TrayTab
          label="Logs"
          icon={FileTextIcon}
          active={bottomTrayTab === "logs"}
          onClick={() => setBottomTrayTab("logs")}
          badge={selectedPod?.name}
        />
        <TrayTab
          label="Terminal"
          icon={TerminalSquareIcon}
          active={bottomTrayTab === "terminal"}
          onClick={() => setBottomTrayTab("terminal")}
        />
        <TrayTab
          label="Events"
          icon={ZapIcon}
          active={bottomTrayTab === "events"}
          onClick={() => setBottomTrayTab("events")}
        />

        <div className="flex-1" />

        {/* Active port forwards indicator */}
        <PortForwardIndicator />
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {bottomTrayTab === "logs" && selectedPod && (
          <LogViewer
            namespace={selectedPod.namespace}
            podName={selectedPod.name}
            containers={selectedPod.containers}
          />
        )}
        {bottomTrayTab === "terminal" && selectedPod && (
          <Terminal
            namespace={selectedPod.namespace}
            podName={selectedPod.name}
            containerName={selectedPod.containers[0]}
          />
        )}
        {bottomTrayTab === "events" && <EventsFeed />}
      </div>
    </div>
  );
}
```

---

## 6.6 — Context-Aware Actions

When a pod is selected (via table click or detail panel), actions become available:

| Action | Trigger | Behaviour |
|--------|---------|-----------|
| **View Logs** | Detail panel button, or `L` shortcut | Opens bottom tray Logs tab for this pod |
| **Exec Shell** | Detail panel button, or `X` shortcut | Opens bottom tray Terminal tab, starts exec |
| **Port Forward** | Detail panel menu | Dialog to configure and start port forward |
| **Delete Pod** | Detail panel menu | Confirmation dialog, then deletes |
| **Describe** | Detail panel menu | Shows `kubectl describe` equivalent (full event + condition dump) |

---

## 6.7 — Acceptance Criteria

- [ ] Log streaming starts when selecting a pod and choosing "View Logs"
- [ ] Logs auto-scroll in follow mode, disengage on manual scroll up
- [ ] Log search highlights matching terms
- [ ] Container selector appears for multi-container pods
- [ ] "Previous" toggle shows logs from crashed container instances
- [ ] Terminal opens with a working shell in the selected container
- [ ] Keystrokes in the terminal are sent to the container and output renders correctly
- [ ] Terminal supports ANSI colors and cursor movement
- [ ] Terminal resizes correctly when the bottom tray is resized
- [ ] Events feed shows real-time cluster events with type indicators
- [ ] Events auto-update without manual refresh
- [ ] Port forwarding creates a working local → pod tunnel
- [ ] Active port forwards are listed and can be stopped
- [ ] Bottom tray tabs switch between logs, terminal, and events
- [ ] Log and terminal streams are properly cleaned up when switching pods or closing the tray
- [ ] Memory usage stays stable during extended log streaming (line buffer cap works)

---

## 6.8 — Multi-Container Log Viewer

When a pod has multiple containers, allow viewing all streams simultaneously in split panes.

### Backend: `internal/stream/multilog.go`

```go
package stream

import (
    "context"
    "fmt"
    "sync"
)

// ContainerLogStream holds state for one container's log stream.
type ContainerLogStream struct {
    ContainerName string
    Cancel        context.CancelFunc
}

// MultiLogStreamer manages concurrent log streams for all containers in a pod.
type MultiLogStreamer struct {
    streamer *LogStreamer
    mu       sync.Mutex
    streams  map[string]*ContainerLogStream // containerName → stream
}

func NewMultiLogStreamer(streamer *LogStreamer) *MultiLogStreamer {
    return &MultiLogStreamer{
        streamer: streamer,
        streams:  make(map[string]*ContainerLogStream),
    }
}

// StartAll opens a log stream for each container, calling onLine with the container name tagged.
func (m *MultiLogStreamer) StartAll(
    parentCtx context.Context,
    namespace, podName string,
    containers []string,
    tailLines int64,
    onLine func(LogLine),
) {
    m.StopAll()
    for _, c := range containers {
        containerName := c
        ctx, cancel := context.WithCancel(parentCtx)
        m.mu.Lock()
        m.streams[containerName] = &ContainerLogStream{ContainerName: containerName, Cancel: cancel}
        m.mu.Unlock()

        go func() {
            opts := LogOptions{
                Namespace:     namespace,
                PodName:       podName,
                ContainerName: containerName,
                Follow:        true,
                TailLines:     tailLines,
                Timestamps:    true,
            }
            _ = m.streamer.Stream(ctx, opts, onLine)
        }()
    }
}

// StopAll cancels every active container stream.
func (m *MultiLogStreamer) StopAll() {
    m.mu.Lock()
    defer m.mu.Unlock()
    for _, s := range m.streams {
        s.Cancel()
    }
    m.streams = make(map[string]*ContainerLogStream)
}

// Stop cancels the stream for a single container.
func (m *MultiLogStreamer) Stop(containerName string) {
    m.mu.Lock()
    defer m.mu.Unlock()
    if s, ok := m.streams[containerName]; ok {
        s.Cancel()
        delete(m.streams, containerName)
    }
}
```

### Handler: `handlers/stream_handler.go` additions

```go
// StreamAllContainerLogs starts parallel log streams for every container in a pod.
// Lines are emitted on "logs:all:<namespace>/<podName>".
func (h *StreamHandler) StreamAllContainerLogs(
    namespace, podName string,
    containers []string,
    tailLines int64,
) error {
    key := fmt.Sprintf("%s/%s", namespace, podName)
    if existing, ok := h.multiStreamers.Load(key); ok {
        existing.(*stream.MultiLogStreamer).StopAll()
    }

    client, err := h.clusterMgr.ActiveClient()
    if err != nil {
        return err
    }
    s := stream.NewMultiLogStreamer(stream.NewLogStreamer(client.Typed))
    h.multiStreamers.Store(key, s)

    eventName := fmt.Sprintf("logs:all:%s", key)
    s.StartAll(h.ctx, namespace, podName, containers, tailLines, func(line stream.LogLine) {
        wailsRuntime.EventsEmit(h.ctx, eventName, line)
    })
    return nil
}

// StopAllContainerLogs stops all container streams for a pod.
func (h *StreamHandler) StopAllContainerLogs(namespace, podName string) {
    key := fmt.Sprintf("%s/%s", namespace, podName)
    if existing, ok := h.multiStreamers.Load(key); ok {
        existing.(*stream.MultiLogStreamer).StopAll()
        h.multiStreamers.Delete(key)
    }
}
```

### Frontend: `components/logs/MultiContainerLogViewer.tsx`

```tsx
import { useEffect, useRef, useState } from "react";
import { EventsOn, EventsOff } from "@/wailsjs/runtime";
import {
  StreamAllContainerLogs,
  StopAllContainerLogs,
} from "@/wailsjs/go/handlers/StreamHandler";
import type { stream } from "@/wailsjs/go/models";

interface MultiContainerLogViewerProps {
  namespace: string;
  podName: string;
  containers: string[];
}

type ContainerLines = Record<string, stream.LogLine[]>;

const MAX_LINES_PER_CONTAINER = 5_000;

export function MultiContainerLogViewer({
  namespace,
  podName,
  containers,
}: MultiContainerLogViewerProps) {
  const [allLines, setAllLines] = useState<ContainerLines>(() =>
    Object.fromEntries(containers.map((c) => [c, []]))
  );
  const [mode, setMode] = useState<"split" | "merged">("split");
  const scrollRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const eventName = `logs:all:${namespace}/${podName}`;

  useEffect(() => {
    setAllLines(Object.fromEntries(containers.map((c) => [c, []])));
    StreamAllContainerLogs(namespace, podName, containers, 200);

    const off = EventsOn(eventName, (line: stream.LogLine) => {
      setAllLines((prev) => {
        const prev_c = prev[line.container] ?? [];
        const next_c = [...prev_c, line];
        return {
          ...prev,
          [line.container]:
            next_c.length > MAX_LINES_PER_CONTAINER
              ? next_c.slice(-MAX_LINES_PER_CONTAINER)
              : next_c,
        };
      });
    });

    return () => {
      off();
      StopAllContainerLogs(namespace, podName);
    };
  }, [namespace, podName, containers.join(",")]);

  // Merged view: interleave all lines sorted by timestamp
  const mergedLines = Object.entries(allLines)
    .flatMap(([container, lines]) =>
      lines.map((l) => ({ ...l, container }))
    )
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return (
    <div className="flex flex-col h-full">
      {/* Mode toggle */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border">
        <span className="text-xs text-text-tertiary">View:</span>
        {(["split", "merged"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`text-xs px-2 py-0.5 rounded capitalize ${
              mode === m
                ? "bg-accent text-white"
                : "bg-bg-tertiary text-text-secondary hover:text-text-primary"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {mode === "split" ? (
        /* Split panes — one per container */
        <div className="flex flex-1 overflow-hidden divide-x divide-border">
          {containers.map((c) => (
            <div key={c} className="flex flex-col flex-1 min-w-0">
              <div className="text-2xs font-semibold text-text-tertiary uppercase px-2 py-1 bg-bg-tertiary border-b border-border">
                {c}
              </div>
              <div
                ref={(el) => { scrollRefs.current[c] = el; }}
                className="flex-1 overflow-auto font-mono text-xs p-2 leading-5"
              >
                {(allLines[c] ?? []).map((line, i) => (
                  <div key={i} className="flex gap-2 hover:bg-bg-hover">
                    {line.timestamp && (
                      <span className="text-text-tertiary shrink-0 select-none">
                        {line.timestamp.slice(11, 19)}
                      </span>
                    )}
                    <span className="text-text-primary whitespace-pre-wrap break-all">
                      {line.content}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Merged interleaved view */
        <div className="flex-1 overflow-auto font-mono text-xs p-2 leading-5">
          {mergedLines.map((line, i) => (
            <div key={i} className="flex gap-2 hover:bg-bg-hover">
              <span className="text-text-tertiary shrink-0 select-none w-16">
                {line.timestamp?.slice(11, 19)}
              </span>
              <span className="text-accent shrink-0 select-none w-24 truncate">
                {line.container}
              </span>
              <span className="text-text-primary whitespace-pre-wrap break-all">
                {line.content}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## 6.9 — Log Feature Extensions

### Log Download

```go
// DownloadLogs fetches the full (non-streaming) log for a container and returns it as a string.
// The frontend triggers a file-save dialog via the Wails dialog API.
func (h *StreamHandler) DownloadLogs(opts stream.LogOptions) (string, error) {
    client, err := h.clusterMgr.ActiveClient()
    if err != nil {
        return "", err
    }
    tailLines := opts.TailLines
    if tailLines == 0 {
        tailLines = 100_000
    }
    req := client.Typed.CoreV1().Pods(opts.Namespace).GetLogs(opts.PodName, &corev1.PodLogOptions{
        Container:  opts.ContainerName,
        TailLines:  &tailLines,
        Timestamps: opts.Timestamps,
    })
    rc, err := req.Stream(h.ctx)
    if err != nil {
        return "", err
    }
    defer rc.Close()
    data, err := io.ReadAll(rc)
    if err != nil {
        return "", err
    }
    return string(data), nil
}
```

```tsx
// Save logs to file using Wails dialog
async function handleDownload(namespace: string, podName: string, container: string) {
  const content = await DownloadLogs({
    namespace,
    podName,
    containerName: container,
    follow: false,
    tailLines: 100_000,
    timestamps: true,
  });
  const path = await SaveFileDialog({
    defaultFilename: `${podName}-${container}.log`,
    filters: [{ displayName: "Log files", pattern: "*.log" }],
  });
  if (path) {
    await WriteFile(path, content);
  }
}
```

### Log Line Severity Coloring: `components/logs/LogLine.tsx`

```tsx
const SEVERITY_PATTERNS: Array<{ pattern: RegExp; className: string }> = [
  { pattern: /\b(FATAL|CRITICAL|PANIC)\b/i,  className: "text-red-400 font-bold" },
  { pattern: /\b(ERROR|ERR|EXCEPTION)\b/i,    className: "text-red-400" },
  { pattern: /\b(WARN|WARNING)\b/i,           className: "text-yellow-400" },
  { pattern: /\b(INFO|INFORMATION)\b/i,       className: "text-sky-400" },
  { pattern: /\b(DEBUG|TRACE|VERBOSE)\b/i,    className: "text-text-tertiary" },
];

function detectSeverity(content: string): string {
  for (const { pattern, className } of SEVERITY_PATTERNS) {
    if (pattern.test(content)) return className;
  }
  return "text-text-primary";
}

interface LogLineProps {
  line: stream.LogLine;
  searchTerm: string;
  timestampMode: "hidden" | "relative" | "absolute";
  wrapLines: boolean;
}

export function LogLine({ line, searchTerm, timestampMode, wrapLines }: LogLineProps) {
  const severityClass = detectSeverity(line.content);
  const displayTs =
    timestampMode === "hidden"   ? null
    : timestampMode === "relative" ? formatRelativeTime(line.timestamp)
    :                               line.timestamp?.slice(0, 23); // absolute

  const content = searchTerm
    ? highlightRegex(line.content, searchTerm)
    : line.content;

  return (
    <div className="flex gap-2 hover:bg-bg-hover px-1">
      {displayTs && (
        <span className="text-text-tertiary shrink-0 select-none tabular-nums text-2xs w-28">
          {displayTs}
        </span>
      )}
      <span
        className={`${severityClass} ${wrapLines ? "whitespace-pre-wrap break-all" : "whitespace-pre truncate"}`}
      >
        {content}
      </span>
    </div>
  );
}

// Highlight regex matches in log content
function highlightRegex(content: string, pattern: string): React.ReactNode {
  let regex: RegExp;
  try {
    regex = new RegExp(`(${pattern})`, "gi");
  } catch {
    // Invalid regex — fall back to plain text
    return content;
  }
  const parts = content.split(regex);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="bg-yellow-400/30 text-yellow-200 rounded-sm">
        {part}
      </mark>
    ) : (
      part
    )
  );
}
```

### Updated Log Viewer Controls

```tsx
// Toolbar additions to LogViewer.tsx

type TimestampMode = "hidden" | "relative" | "absolute";

// State additions
const [wrapLines, setWrapLines]           = useState(false);
const [timestampMode, setTimestampMode]   = useState<TimestampMode>("relative");
const [regexSearch, setRegexSearch]       = useState(false);
const [showPrevious, setShowPrevious]     = useState(false);

// Toolbar additions
<button
  onClick={() => setWrapLines((w) => !w)}
  title="Toggle line wrap"
  className={controlBtn(wrapLines)}
>
  Wrap
</button>

<select
  value={timestampMode}
  onChange={(e) => setTimestampMode(e.target.value as TimestampMode)}
  className="text-xs bg-bg-tertiary border border-border rounded px-2 py-1"
>
  <option value="hidden">No timestamps</option>
  <option value="relative">Relative time</option>
  <option value="absolute">Absolute time</option>
</select>

<button
  onClick={() => setRegexSearch((r) => !r)}
  title="Toggle regex search"
  className={controlBtn(regexSearch)}
>
  .*
</button>

<button
  onClick={() => setShowPrevious((p) => !p)}
  title="Show logs from previous container instance"
  className={controlBtn(showPrevious)}
>
  Previous
</button>

// Use LogLine component in the list
{filteredLines.map((line, i) => (
  <LogLine
    key={i}
    line={line}
    searchTerm={searchTerm}
    timestampMode={timestampMode}
    wrapLines={wrapLines}
  />
))}
```

---

## 6.10 — Enhanced Terminal: Multiple Sessions

### Backend: `internal/stream/execregistry.go`

```go
package stream

import (
    "fmt"
    "sync"
    "sync/atomic"
)

// ExecRegistry tracks all active exec sessions.
type ExecRegistry struct {
    mu       sync.RWMutex
    sessions map[string]*ExecSession
    counter  atomic.Int64
}

func NewExecRegistry() *ExecRegistry {
    return &ExecRegistry{sessions: make(map[string]*ExecSession)}
}

func (r *ExecRegistry) Register(s *ExecSession) string {
    id := fmt.Sprintf("exec-%d", r.counter.Add(1))
    s.ID = id
    r.mu.Lock()
    r.sessions[id] = s
    r.mu.Unlock()
    return id
}

func (r *ExecRegistry) Get(id string) (*ExecSession, bool) {
    r.mu.RLock()
    defer r.mu.RUnlock()
    s, ok := r.sessions[id]
    return s, ok
}

func (r *ExecRegistry) Remove(id string) {
    r.mu.Lock()
    delete(r.sessions, id)
    r.mu.Unlock()
}

func (r *ExecRegistry) All() []*ExecSession {
    r.mu.RLock()
    defer r.mu.RUnlock()
    result := make([]*ExecSession, 0, len(r.sessions))
    for _, s := range r.sessions {
        result = append(result, s)
    }
    return result
}

func (r *ExecRegistry) CloseAll() {
    r.mu.Lock()
    sessions := make([]*ExecSession, 0, len(r.sessions))
    for _, s := range r.sessions {
        sessions = append(sessions, s)
    }
    r.sessions = make(map[string]*ExecSession)
    r.mu.Unlock()
    for _, s := range sessions {
        s.Close()
    }
}
```

### Frontend: `stores/terminalStore.ts`

```ts
// stores/terminalStore.ts
import { create } from "zustand";

export interface TerminalTab {
  id: string;
  label: string; // editable user label e.g. "nginx:debug"
  namespace: string;
  podName: string;
  containerName: string;
  sessionId: string | null;
}

interface TerminalStore {
  tabs: TerminalTab[];
  activeTabId: string | null;
  fontSize: number;
  theme: string; // key into THEMES map
  addTab: (tab: Omit<TerminalTab, "id" | "sessionId">) => string;
  removeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  setSessionId: (tabId: string, sessionId: string) => void;
  renameTab: (tabId: string, label: string) => void;
  setFontSize: (size: number) => void;
  setTheme: (theme: string) => void;
}

export const useTerminalStore = create<TerminalStore>((set) => ({
  tabs: [],
  activeTabId: null,
  fontSize: 13,
  theme: "dark",

  addTab: (tab) => {
    const id = crypto.randomUUID();
    set((s) => ({
      tabs: [...s.tabs, { ...tab, id, sessionId: null }],
      activeTabId: id,
    }));
    return id;
  },

  removeTab: (id) =>
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === id);
      const newTabs = s.tabs.filter((t) => t.id !== id);
      const newActive =
        s.activeTabId === id
          ? newTabs[Math.max(0, idx - 1)]?.id ?? null
          : s.activeTabId;
      return { tabs: newTabs, activeTabId: newActive };
    }),

  setActiveTab: (id) => set({ activeTabId: id }),
  setSessionId: (tabId, sessionId) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, sessionId } : t)),
    })),
  renameTab: (tabId, label) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, label } : t)),
    })),
  setFontSize: (fontSize) => set({ fontSize }),
  setTheme: (theme) => set({ theme }),
}));
```

### Frontend: `components/terminal/TerminalTabsBar.tsx`

```tsx
import { PlusIcon, XIcon, PencilIcon } from "lucide-react";
import { useTerminalStore } from "@/stores/terminalStore";

export function TerminalTabsBar() {
  const { tabs, activeTabId, setActiveTab, removeTab, renameTab } = useTerminalStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  function startRename(tab: TerminalTab) {
    setEditingId(tab.id);
    setEditValue(tab.label);
  }

  function commitRename() {
    if (editingId && editValue.trim()) {
      renameTab(editingId, editValue.trim());
    }
    setEditingId(null);
  }

  return (
    <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-none px-2 py-1 border-b border-border">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={`group flex items-center gap-1 px-2 py-0.5 rounded text-xs cursor-pointer min-w-0 max-w-[160px] ${
            tab.id === activeTabId
              ? "bg-bg-tertiary text-text-primary"
              : "text-text-tertiary hover:text-text-secondary hover:bg-bg-hover"
          }`}
        >
          {editingId === tab.id ? (
            <input
              autoFocus
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => { if (e.key === "Enter") commitRename(); }}
              className="bg-transparent outline-none w-24 text-xs"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="truncate">{tab.label}</span>
          )}

          <button
            className="opacity-0 group-hover:opacity-100 shrink-0"
            onClick={(e) => { e.stopPropagation(); startRename(tab); }}
          >
            <PencilIcon className="w-2.5 h-2.5" />
          </button>
          <button
            className="opacity-0 group-hover:opacity-100 shrink-0"
            onClick={(e) => { e.stopPropagation(); removeTab(tab.id); }}
          >
            <XIcon className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
```

### Terminal Themes and Search: `components/terminal/Terminal.tsx` additions

```tsx
import { SearchAddon } from "@xterm/addon-search";

// Theme definitions
export const THEMES: Record<string, ITheme> = {
  dark: {
    background: "#0A0A0B", foreground: "#EDEDEF",
    cursor: "#7C5CFC", selectionBackground: "#7C5CFC33",
    black: "#1A1A1E", red: "#F87171", green: "#4ADE80",
    yellow: "#FBBF24", blue: "#60A5FA", magenta: "#C084FC",
    cyan: "#22D3EE", white: "#EDEDEF",
    brightBlack: "#52525B", brightRed: "#FCA5A5",
    brightGreen: "#86EFAC", brightYellow: "#FDE68A",
    brightBlue: "#93C5FD", brightMagenta: "#D8B4FE",
    brightCyan: "#67E8F9", brightWhite: "#F4F4F5",
  },
  light: {
    background: "#FFFFFF", foreground: "#18181B",
    cursor: "#7C5CFC", selectionBackground: "#7C5CFC22",
    black: "#18181B", red: "#DC2626", green: "#16A34A",
    yellow: "#CA8A04", blue: "#2563EB", magenta: "#9333EA",
    cyan: "#0891B2", white: "#F4F4F5",
  },
  monokai: {
    background: "#272822", foreground: "#F8F8F2",
    cursor: "#F8F8F0", selectionBackground: "#49483E",
    black: "#272822", red: "#F92672", green: "#A6E22E",
    yellow: "#F4BF75", blue: "#66D9EF", magenta: "#AE81FF",
    cyan: "#A1EFE4", white: "#F8F8F2",
  },
  solarized: {
    background: "#002B36", foreground: "#839496",
    cursor: "#839496", selectionBackground: "#073642",
    black: "#073642", red: "#DC322F", green: "#859900",
    yellow: "#B58900", blue: "#268BD2", magenta: "#D33682",
    cyan: "#2AA198", white: "#EEE8D5",
  },
};

// In Terminal component — add SearchAddon support
const searchAddon = new SearchAddon();
term.loadAddon(searchAddon);

// Search controls (shown in terminal toolbar)
const [termSearch, setTermSearch] = useState("");
const [termSearchOpen, setTermSearchOpen] = useState(false);

useEffect(() => {
  if (termSearch) {
    searchAddon.findNext(termSearch, { caseSensitive: false, decorations: {
      matchBackground: "#FBBF2440",
      matchBorder: "#FBBF24",
      matchOverviewRuler: "#FBBF24",
      activeMatchBackground: "#FBBF2480",
      activeMatchBorder: "#FBBF24",
      activeMatchColorOverviewRuler: "#FBBF24",
    }});
  } else {
    searchAddon.clearDecorations();
  }
}, [termSearch]);
```

---

## 6.11 — Enhanced Port Forwarding

### Service-Level Port Forwarding

```go
// StartServicePortForward resolves a Service to one of its backing Pods and then
// starts a port forward to that pod.
func (h *StreamHandler) StartServicePortForward(
    namespace, serviceName string,
    servicePort, localPort int,
) (*PortForwardResult, error) {
    client, err := h.clusterMgr.ActiveClient()
    if err != nil {
        return nil, err
    }

    // Resolve service → endpoints → pod
    eps, err := client.Typed.CoreV1().Endpoints(namespace).Get(h.ctx, serviceName, metav1.GetOptions{})
    if err != nil {
        return nil, fmt.Errorf("get endpoints for %s/%s: %w", namespace, serviceName, err)
    }

    var targetPod, targetIP string
    var targetPort int32

    outer:
    for _, subset := range eps.Subsets {
        for _, port := range subset.Ports {
            if int(port.Port) == servicePort || servicePort == 0 {
                targetPort = port.Port
                for _, addr := range subset.Addresses {
                    if addr.TargetRef != nil && addr.TargetRef.Kind == "Pod" {
                        targetPod = addr.TargetRef.Name
                        targetIP = addr.IP
                        break outer
                    }
                    targetIP = addr.IP
                }
            }
        }
    }
    _ = targetIP // used for logging
    if targetPod == "" {
        return nil, fmt.Errorf("no ready pods found behind service %s/%s", namespace, serviceName)
    }

    return h.StartPortForward(PortForwardOptions{
        Namespace: namespace,
        PodName:   targetPod,
        PodPort:   int(targetPort),
        LocalPort: localPort,
    })
}
```

### Port Conflict Detection

```go
import "net"

// isPortInUse checks if a TCP port is already bound on localhost.
func isPortInUse(port int) bool {
    ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
    if err != nil {
        return true // assume in use
    }
    ln.Close()
    return false
}

// StartPortForward with conflict detection
func (h *StreamHandler) StartPortForward(opts PortForwardOptions) (*PortForwardResult, error) {
    if opts.LocalPort != 0 && isPortInUse(opts.LocalPort) {
        return nil, fmt.Errorf("local port %d is already in use", opts.LocalPort)
    }
    // ... existing implementation
}
```

### Auto-Reconnect with Exponential Backoff

```go
// PortForwardSession wraps a port forward with reconnect logic.
type PortForwardSession struct {
    opts      PortForwardOptions
    active    bool
    mu        sync.Mutex
    stopCh    chan struct{}
    localPort int
}

func (h *StreamHandler) startWithReconnect(opts PortForwardOptions) (*PortForwardSession, error) {
    sess := &PortForwardSession{
        opts:   opts,
        stopCh: make(chan struct{}),
    }

    result, err := h.doPortForward(opts)
    if err != nil {
        return nil, err
    }
    sess.localPort = result.LocalPort
    sess.active = true

    go func() {
        backoff := 2 * time.Second
        const maxBackoff = 30 * time.Second
        for {
            select {
            case <-sess.stopCh:
                return
            case <-h.pfDoneCh(result.LocalPort): // channel that closes when PF dies
                sess.mu.Lock()
                sess.active = false
                sess.mu.Unlock()
                wailsRuntime.EventsEmit(h.ctx, "portforward:reconnecting", result.LocalPort)

                select {
                case <-time.After(backoff):
                case <-sess.stopCh:
                    return
                }
                backoff = min(backoff*2, maxBackoff)

                newResult, err := h.doPortForward(opts)
                if err == nil {
                    result = newResult
                    sess.mu.Lock()
                    sess.active = true
                    sess.mu.Unlock()
                    backoff = 2 * time.Second
                    wailsRuntime.EventsEmit(h.ctx, "portforward:reconnected", result.LocalPort)
                }
            }
        }
    }()

    return sess, nil
}
```

### Frontend: `components/portforward/PortForwardDashboard.tsx`

```tsx
interface PortForward {
  podName: string;
  namespace: string;
  localPort: number;
  podPort: number;
  status: "active" | "reconnecting" | "stopped";
}

export function PortForwardDashboard() {
  const [forwards, setForwards] = useState<PortForward[]>([]);

  // Refresh every 5 seconds
  useQuery({
    queryKey: ["portforwards"],
    queryFn: async () => {
      const list = await ListPortForwards();
      setForwards(list);
      return list;
    },
    refetchInterval: 5_000,
  });

  // Listen for reconnect events
  useEffect(() => {
    const offReconnecting = EventsOn("portforward:reconnecting", (port: number) => {
      setForwards((fws) =>
        fws.map((fw) =>
          fw.localPort === port ? { ...fw, status: "reconnecting" } : fw
        )
      );
    });
    const offReconnected = EventsOn("portforward:reconnected", (port: number) => {
      setForwards((fws) =>
        fws.map((fw) =>
          fw.localPort === port ? { ...fw, status: "active" } : fw
        )
      );
    });
    return () => { offReconnecting(); offReconnected(); };
  }, []);

  return (
    <div className="p-3">
      <h3 className="text-sm font-semibold text-text-primary mb-3">Active Port Forwards</h3>
      {forwards.length === 0 ? (
        <p className="text-xs text-text-tertiary">No active port forwards.</p>
      ) : (
        <div className="space-y-2">
          {forwards.map((fw) => (
            <div
              key={`${fw.namespace}/${fw.podName}:${fw.localPort}`}
              className="flex items-center gap-3 p-2 rounded-lg bg-bg-tertiary border border-border text-xs"
            >
              {/* Status dot */}
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  fw.status === "active"
                    ? "bg-green-400"
                    : fw.status === "reconnecting"
                    ? "bg-yellow-400 animate-pulse"
                    : "bg-red-400"
                }`}
              />

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-text-primary truncate">
                  {fw.namespace}/{fw.podName}
                </p>
                <p className="text-text-tertiary">
                  localhost:{fw.localPort} → :{fw.podPort}
                </p>
              </div>

              {/* Open in browser */}
              <a
                href={`http://localhost:${fw.localPort}`}
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline"
              >
                Open
              </a>

              {/* Stop */}
              <button
                onClick={() => StopPortForward(fw.podName, fw.localPort)}
                className="text-text-tertiary hover:text-red-400"
              >
                Stop
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## 6.12 — Enhanced Events Feed

### Backend: Filtered Events

```go
// EventFilter specifies optional filters for listing events.
type EventFilter struct {
    Namespace    string `json:"namespace"`    // empty = all namespaces
    Reason       string `json:"reason"`       // e.g. "BackOff"
    InvolvedKind string `json:"involvedKind"` // e.g. "Pod"
    InvolvedName string `json:"involvedName"` // e.g. "my-pod"
    WarningOnly  bool   `json:"warningOnly"`  // only "Warning" type events
    Limit        int    `json:"limit"`
}

// ListFilteredEvents returns events matching the given filter.
func (h *ResourceHandler) ListFilteredEvents(f EventFilter) ([]EventInfo, error) {
    client, err := h.clusterMgr.ActiveClient()
    if err != nil {
        return nil, err
    }

    limit := int64(f.Limit)
    if limit == 0 {
        limit = 200
    }

    var items []corev1.Event
    if f.Namespace != "" {
        list, err := client.Typed.CoreV1().Events(f.Namespace).List(
            h.ctx, metav1.ListOptions{Limit: limit})
        if err != nil {
            return nil, err
        }
        items = list.Items
    } else {
        list, err := client.Typed.CoreV1().Events("").List(
            h.ctx, metav1.ListOptions{Limit: limit})
        if err != nil {
            return nil, err
        }
        items = list.Items
    }

    // Apply in-process filters
    result := make([]EventInfo, 0, len(items))
    for _, e := range items {
        if f.WarningOnly && e.Type != "Warning" {
            continue
        }
        if f.Reason != "" && !strings.EqualFold(e.Reason, f.Reason) {
            continue
        }
        if f.InvolvedKind != "" && !strings.EqualFold(e.InvolvedObject.Kind, f.InvolvedKind) {
            continue
        }
        if f.InvolvedName != "" && e.InvolvedObject.Name != f.InvolvedName {
            continue
        }
        result = append(result, toEventInfo(e))
    }

    // Sort: newest first
    sort.Slice(result, func(i, j int) bool {
        return result[i].LastTimestamp > result[j].LastTimestamp
    })

    return result, nil
}
```

### Frontend: `components/events/EventCorrelationView.tsx`

```tsx
// Groups events by their involvedObject for correlation view.
interface EventGroup {
  key: string; // "<kind>/<namespace>/<name>"
  kind: string;
  name: string;
  namespace: string;
  events: EventInfo[];
  warningCount: number;
}

export function EventCorrelationView({ events }: { events: EventInfo[] }) {
  const groups = useMemo<EventGroup[]>(() => {
    const map = new Map<string, EventGroup>();
    for (const e of events) {
      const key = `${e.objectKind}/${e.objectNS}/${e.objectName}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          kind: e.objectKind,
          name: e.objectName,
          namespace: e.objectNS,
          events: [],
          warningCount: 0,
        });
      }
      const g = map.get(key)!;
      g.events.push(e);
      if (e.type === "Warning") g.warningCount++;
    }
    return Array.from(map.values()).sort((a, b) => b.warningCount - a.warningCount);
  }, [events]);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  return (
    <div className="overflow-auto h-full divide-y divide-border">
      {groups.map((g) => (
        <div key={g.key}>
          {/* Group header */}
          <button
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-bg-hover text-left"
            onClick={() =>
              setExpanded((s) => {
                const next = new Set(s);
                next.has(g.key) ? next.delete(g.key) : next.add(g.key);
                return next;
              })
            }
          >
            <span className="text-text-tertiary text-xs font-mono w-16 shrink-0">{g.kind}</span>
            <span className="text-text-primary text-xs font-medium flex-1 truncate">{g.name}</span>
            {g.warningCount > 0 && (
              <span className="text-xs text-yellow-400 tabular-nums">
                {g.warningCount} warn
              </span>
            )}
            <span className="text-xs text-text-tertiary">{g.events.length} events</span>
          </button>

          {/* Expanded events */}
          {expanded.has(g.key) && (
            <div className="pl-6 border-l border-border ml-3 mb-1">
              {g.events.map((e, i) => (
                <div key={i} className="flex gap-2 py-1 text-xs">
                  <span
                    className={`shrink-0 ${e.type === "Warning" ? "text-yellow-400" : "text-sky-400"}`}
                  >
                    {e.type === "Warning" ? "⚠" : "ℹ"}
                  </span>
                  <span className="text-text-tertiary shrink-0">{e.reason}</span>
                  <span className="text-text-primary truncate">{e.message}</span>
                  <span className="text-text-tertiary shrink-0 tabular-nums">
                    {formatRelativeTime(e.lastTimestamp)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

### Frontend: `components/events/EventFilterBar.tsx`

```tsx
interface EventFilters {
  warningOnly: boolean;
  reason: string;
  involvedKind: string;
}

const KNOWN_REASONS = [
  "BackOff", "Failed", "Killing", "OOMKilling",
  "Unhealthy", "FailedMount", "FailedScheduling",
  "Pulled", "Started", "Created", "Scheduled",
];

const KNOWN_KINDS = ["Pod", "Node", "Deployment", "ReplicaSet", "Job", "CronJob"];

export function EventFilterBar({
  filters,
  onChange,
}: {
  filters: EventFilters;
  onChange: (f: EventFilters) => void;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border flex-wrap">
      {/* Warnings only toggle */}
      <button
        onClick={() => onChange({ ...filters, warningOnly: !filters.warningOnly })}
        className={`text-xs px-2 py-0.5 rounded ${
          filters.warningOnly
            ? "bg-yellow-400/20 text-yellow-400 border border-yellow-400/40"
            : "bg-bg-tertiary text-text-secondary hover:text-text-primary border border-border"
        }`}
      >
        Warnings only
      </button>

      {/* Reason picker */}
      <select
        value={filters.reason}
        onChange={(e) => onChange({ ...filters, reason: e.target.value })}
        className="text-xs bg-bg-tertiary border border-border rounded px-2 py-0.5 text-text-primary"
      >
        <option value="">All reasons</option>
        {KNOWN_REASONS.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>

      {/* Kind picker */}
      <select
        value={filters.involvedKind}
        onChange={(e) => onChange({ ...filters, involvedKind: e.target.value })}
        className="text-xs bg-bg-tertiary border border-border rounded px-2 py-0.5 text-text-primary"
      >
        <option value="">All kinds</option>
        {KNOWN_KINDS.map((k) => (
          <option key={k} value={k}>{k}</option>
        ))}
      </select>

      {/* Clear filters */}
      {(filters.warningOnly || filters.reason || filters.involvedKind) && (
        <button
          onClick={() => onChange({ warningOnly: false, reason: "", involvedKind: "" })}
          className="text-xs text-text-tertiary hover:text-red-400"
        >
          Clear
        </button>
      )}
    </div>
  );
}
```

---

## 6.13 — Live Resource Metrics Streaming

### Backend: `internal/stream/metricspoller.go`

```go
package stream

import (
    "context"
    "time"

    metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
    metricsv1beta1 "k8s.io/metrics/pkg/apis/metrics/v1beta1"
    metricsclient "k8s.io/metrics/pkg/client/clientset/versioned"
)

// ResourceMetricsPoint is a single metrics observation emitted to the frontend.
type ResourceMetricsPoint struct {
    Timestamp  string            `json:"timestamp"`
    PodMetrics []PodMetricsSample `json:"podMetrics"`
    NodeMetrics []NodeMetricsSample `json:"nodeMetrics"`
}

type PodMetricsSample struct {
    Namespace  string                  `json:"namespace"`
    PodName    string                  `json:"podName"`
    Containers []ContainerMetricsSample `json:"containers"`
}

type ContainerMetricsSample struct {
    Name      string `json:"name"`
    CPUMillis int64  `json:"cpuMillis"`  // millicores
    MemoryMiB int64  `json:"memoryMiB"`
}

type NodeMetricsSample struct {
    NodeName  string `json:"nodeName"`
    CPUMillis int64  `json:"cpuMillis"`
    MemoryMiB int64  `json:"memoryMiB"`
}

// MetricsPoller polls the metrics-server at a fixed interval and emits results.
type MetricsPoller struct {
    metricsClient metricsclient.Interface
    interval      time.Duration
    namespace     string
    emit          func(ResourceMetricsPoint)
}

func NewMetricsPoller(
    mc metricsclient.Interface,
    namespace string,
    interval time.Duration,
    emit func(ResourceMetricsPoint),
) *MetricsPoller {
    if interval == 0 {
        interval = 15 * time.Second
    }
    return &MetricsPoller{
        metricsClient: mc,
        interval:      interval,
        namespace:     namespace,
        emit:          emit,
    }
}

// Start runs the metrics polling loop until ctx is cancelled.
func (p *MetricsPoller) Start(ctx context.Context) {
    ticker := time.NewTicker(p.interval)
    defer ticker.Stop()

    // Emit immediately on start
    p.poll(ctx)

    for {
        select {
        case <-ctx.Done():
            return
        case <-ticker.C:
            p.poll(ctx)
        }
    }
}

func (p *MetricsPoller) poll(ctx context.Context) {
    point := ResourceMetricsPoint{
        Timestamp: time.Now().UTC().Format(time.RFC3339),
    }

    // Pod metrics
    podList, err := p.metricsClient.MetricsV1beta1().
        PodMetricses(p.namespace).List(ctx, metav1.ListOptions{})
    if err == nil {
        for _, pm := range podList.Items {
            sample := PodMetricsSample{
                Namespace: pm.Namespace,
                PodName:   pm.Name,
            }
            for _, c := range pm.Containers {
                sample.Containers = append(sample.Containers, ContainerMetricsSample{
                    Name:      c.Name,
                    CPUMillis: c.Usage.Cpu().MilliValue(),
                    MemoryMiB: c.Usage.Memory().Value() / (1024 * 1024),
                })
            }
            point.PodMetrics = append(point.PodMetrics, sample)
        }
    }

    // Node metrics
    nodeList, err := p.metricsClient.MetricsV1beta1().
        NodeMetricses().List(ctx, metav1.ListOptions{})
    if err == nil {
        for _, nm := range nodeList.Items {
            point.NodeMetrics = append(point.NodeMetrics, NodeMetricsSample{
                NodeName:  nm.Name,
                CPUMillis: nm.Usage.Cpu().MilliValue(),
                MemoryMiB: nm.Usage.Memory().Value() / (1024 * 1024),
            })
        }
    }

    p.emit(point)
}
```

### Handler: `handlers/metrics_handler.go`

```go
// StartMetricsStream begins polling metrics and emitting Wails events.
// Event name: "metrics:update"
func (h *StreamHandler) StartMetricsStream(namespace string) error {
    mc, err := h.clusterMgr.ActiveMetricsClient()
    if err != nil {
        return fmt.Errorf("metrics-server not available: %w", err)
    }

    h.cancelMetrics() // stop any existing poller

    ctx, cancel := context.WithCancel(h.ctx)
    h.metricsCancelMu.Lock()
    h.metricsCancel = cancel
    h.metricsCancelMu.Unlock()

    poller := stream.NewMetricsPoller(mc, namespace, 15*time.Second, func(pt stream.ResourceMetricsPoint) {
        wailsRuntime.EventsEmit(h.ctx, "metrics:update", pt)
    })
    go poller.Start(ctx)
    return nil
}

// StopMetricsStream stops the metrics poller.
func (h *StreamHandler) StopMetricsStream() {
    h.cancelMetrics()
}
```

### Frontend: `components/metrics/MetricsSparkline.tsx`

```tsx
import {
  LineChart, Line, Tooltip, ResponsiveContainer, YAxis,
} from "recharts";
import { EventsOn } from "@/wailsjs/runtime";
import type { stream } from "@/wailsjs/go/models";

interface DataPoint {
  time: number; // epoch ms
  cpu: number;  // millicores
  mem: number;  // MiB
}

const MAX_POINTS = 60; // 15 min of history at 15s interval

interface MetricsSparklineProps {
  podName: string;
  containerName?: string;
}

export function MetricsSparkline({ podName, containerName }: MetricsSparklineProps) {
  const [cpuData, setCpuData] = useState<DataPoint[]>([]);
  const [memData, setMemData] = useState<DataPoint[]>([]);

  useEffect(() => {
    const off = EventsOn("metrics:update", (pt: stream.ResourceMetricsPoint) => {
      const sample = pt.podMetrics?.find((p) => p.podName === podName);
      if (!sample) return;

      const containers = containerName
        ? sample.containers.filter((c) => c.name === containerName)
        : sample.containers;

      const cpu = containers.reduce((s, c) => s + c.cpuMillis, 0);
      const mem = containers.reduce((s, c) => s + c.memoryMiB, 0);
      const point: DataPoint = { time: Date.now(), cpu, mem };

      setCpuData((prev) => [...prev, point].slice(-MAX_POINTS));
      setMemData((prev) => [...prev, point].slice(-MAX_POINTS));
    });
    return off;
  }, [podName, containerName]);

  return (
    <div className="flex gap-4">
      <SparkChart data={cpuData} dataKey="cpu" color="#60A5FA" label="CPU" unit="m" />
      <SparkChart data={memData} dataKey="mem" color="#4ADE80" label="MEM" unit="MiB" />
    </div>
  );
}

function SparkChart({
  data, dataKey, color, label, unit,
}: {
  data: DataPoint[];
  dataKey: keyof DataPoint;
  color: string;
  label: string;
  unit: string;
}) {
  const latest = data[data.length - 1];
  return (
    <div className="flex flex-col gap-0.5 w-28">
      <div className="flex items-baseline justify-between">
        <span className="text-2xs text-text-tertiary uppercase">{label}</span>
        {latest && (
          <span className="text-2xs font-mono text-text-secondary tabular-nums">
            {latest[dataKey]}{unit}
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={32}>
        <LineChart data={data}>
          <YAxis domain={["auto", "auto"]} hide />
          <Tooltip
            contentStyle={{ background: "#1A1A1E", border: "none", fontSize: 10 }}
            formatter={(v: number) => [`${v}${unit}`, label]}
          />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            dot={false}
            strokeWidth={1.5}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

### Frontend: `components/metrics/ResourceUsageBar.tsx`

```tsx
interface ResourceUsageBarProps {
  used: number;       // current usage (same unit as request/limit)
  request?: number;   // resource request
  limit?: number;     // resource limit
  unit: string;       // e.g. "m" for millicores, "MiB"
  label: string;
}

export function ResourceUsageBar({
  used,
  request,
  limit,
  unit,
  label,
}: ResourceUsageBarProps) {
  const max = limit ?? (request ? request * 2 : used * 2 || 100);
  const usedPct = Math.min((used / max) * 100, 100);
  const requestPct = request ? Math.min((request / max) * 100, 100) : null;

  // Color coding: green < 70%, yellow 70-90%, red > 90%
  const barColor =
    usedPct > 90 ? "bg-red-500"
    : usedPct > 70 ? "bg-yellow-400"
    : "bg-green-400";

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between text-2xs">
        <span className="text-text-tertiary uppercase">{label}</span>
        <span className="font-mono text-text-secondary tabular-nums">
          {used}{unit}
          {limit ? ` / ${limit}${unit}` : ""}
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-bg-tertiary overflow-hidden">
        {/* Usage bar */}
        <div
          className={`absolute left-0 top-0 h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${usedPct}%` }}
        />
        {/* Request marker */}
        {requestPct !== null && (
          <div
            className="absolute top-0 bottom-0 w-px bg-white/60"
            style={{ left: `${requestPct}%` }}
            title={`Request: ${request}${unit}`}
          />
        )}
      </div>
    </div>
  );
}
```

### Frontend: `hooks/usePodMetricsLive.ts`

```ts
// hooks/usePodMetricsLive.ts
import { useEffect, useState } from "react";
import { EventsOn } from "@/wailsjs/runtime";
import type { stream } from "@/wailsjs/go/models";

export interface LivePodMetrics {
  cpuMillis: number;
  memoryMiB: number;
  history: Array<{ time: number; cpuMillis: number; memoryMiB: number }>;
}

const MAX_HISTORY = 60;

export function usePodMetricsLive(podName: string): LivePodMetrics | null {
  const [metrics, setMetrics] = useState<LivePodMetrics | null>(null);

  useEffect(() => {
    const off = EventsOn("metrics:update", (pt: stream.ResourceMetricsPoint) => {
      const sample = pt.podMetrics?.find((p) => p.podName === podName);
      if (!sample) return;

      const cpuMillis = sample.containers.reduce((s, c) => s + c.cpuMillis, 0);
      const memoryMiB = sample.containers.reduce((s, c) => s + c.memoryMiB, 0);
      const point = { time: Date.now(), cpuMillis, memoryMiB };

      setMetrics((prev) => ({
        cpuMillis,
        memoryMiB,
        history: [...(prev?.history ?? []), point].slice(-MAX_HISTORY),
      }));
    });
    return off;
  }, [podName]);

  return metrics;
}
```

---

## 6.14 — Updated Acceptance Criteria

### Phase 6 complete acceptance checklist

- [ ] Log streaming starts when selecting a pod and choosing "View Logs"
- [ ] Logs auto-scroll in follow mode; disengages when user scrolls up
- [ ] Log search highlights matching terms (plain text and regex modes)
- [ ] Container selector appears for multi-container pods
- [ ] "Previous" toggle shows logs from crashed container instances
- [ ] Line wrapping toggle works correctly
- [ ] Timestamp mode cycles: hidden / relative / absolute
- [ ] Log severity coloring: ERROR=red, WARN=yellow, INFO=blue, DEBUG=dim
- [ ] Multi-container view shows split panes and merged interleaved view
- [ ] Download logs saves a file via the native OS save dialog
- [ ] Terminal opens with a working shell in the selected container
- [ ] Keystrokes in the terminal reach the container; output renders correctly
- [ ] Terminal supports ANSI colors and cursor movement
- [ ] Terminal resizes correctly when the bottom tray is resized
- [ ] Multiple terminal tabs can be open simultaneously
- [ ] Terminal tabs can be renamed by double-clicking
- [ ] Terminal themes (dark, light, monokai, solarized) apply immediately
- [ ] Terminal font size is adjustable via settings
- [ ] Terminal search (Ctrl+F) highlights and navigates matches using xterm SearchAddon
- [ ] Events feed shows real-time cluster events with type indicators (Warning=yellow, Normal=blue)
- [ ] Events filter bar: warning-only, by reason, by involved kind
- [ ] Event correlation view groups events by involvedObject, sorted by warning count
- [ ] Port forwarding creates a working local → pod tunnel
- [ ] Port forwarding resolves services to backing pods (service-level port forward)
- [ ] Port conflict detection: error shown if local port is already bound
- [ ] Auto-reconnect retries with exponential backoff after port forward disconnect
- [ ] Port forward dashboard shows status (active / reconnecting) with "Open" and "Stop" actions
- [ ] Active port forwards are listed and can be stopped from the dashboard
- [ ] Metrics sparklines appear in the pod detail panel (requires metrics-server)
- [ ] ResourceUsageBar shows usage vs. request/limit with color threshold coding
- [ ] Metrics history maintains up to 60 data points (15 min at 15s interval)
- [ ] Log and terminal streams are properly cleaned up when switching pods or closing the tray
- [ ] Memory usage stays stable during extended log streaming (line buffer cap enforced)
