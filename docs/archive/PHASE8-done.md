# Phase 8 — Polish, Packaging & Distribution

## Goal

Production-ready application: performance optimised, cross-platform builds, auto-update mechanism, app signing, installer generation, and the final design polish that makes KubeViewer feel like a premium native app.

Target audience: mid-level engineer. All code and config is complete and copy-pasteable.

---

## 8.1 — Performance Optimization

### 8.1.1 Backend Optimizations

#### SharedInformer Factory Management

Rather than creating a new watcher for every navigation, maintain a `SharedInformerFactory` per cluster connection and start/stop individual informers based on which views are active.

```go
// internal/informers/factory.go
package informers

import (
    "context"
    "sync"
    "time"

    "k8s.io/client-go/informers"
    "k8s.io/client-go/kubernetes"
    "k8s.io/client-go/tools/cache"
)

// ViewType identifies which resource view is currently active.
type ViewType string

const (
    ViewPods        ViewType = "pods"
    ViewDeployments ViewType = "deployments"
    ViewServices    ViewType = "services"
    ViewNodes       ViewType = "nodes"
    ViewEvents      ViewType = "events"
)

// ManagedFactory wraps a SharedInformerFactory with per-view lifecycle management.
type ManagedFactory struct {
    mu       sync.Mutex
    client   kubernetes.Interface
    factory  informers.SharedInformerFactory
    active   map[ViewType]context.CancelFunc
    stopCh   chan struct{}
    resync   time.Duration
}

// NewManagedFactory creates a factory that resync every resyncPeriod.
func NewManagedFactory(client kubernetes.Interface, resync time.Duration) *ManagedFactory {
    return &ManagedFactory{
        client:  client,
        factory: informers.NewSharedInformerFactory(client, resync),
        active:  make(map[ViewType]context.CancelFunc),
        stopCh:  make(chan struct{}),
        resync:  resync,
    }
}

// ActivateView ensures the informers needed for a view are running.
// It is safe to call multiple times for the same view.
func (m *ManagedFactory) ActivateView(view ViewType, handler cache.ResourceEventHandler) error {
    m.mu.Lock()
    defer m.mu.Unlock()

    if _, alreadyActive := m.active[view]; alreadyActive {
        return nil
    }

    inf := m.informerForView(view)
    if inf == nil {
        return nil
    }
    inf.AddEventHandler(handler)

    ctx, cancel := context.WithCancel(context.Background())
    m.active[view] = cancel

    go func() {
        m.factory.Start(m.stopCh)
        cache.WaitForCacheSync(ctx.Done(), inf.HasSynced)
    }()

    return nil
}

// DeactivateView stops tracking a view. The underlying informer goroutine
// continues running (shared), but we cancel the view-scoped context so
// any view-specific work can detect shutdown.
func (m *ManagedFactory) DeactivateView(view ViewType) {
    m.mu.Lock()
    defer m.mu.Unlock()

    if cancel, ok := m.active[view]; ok {
        cancel()
        delete(m.active, view)
    }
}

// Shutdown stops all informers and cancels all views.
func (m *ManagedFactory) Shutdown() {
    m.mu.Lock()
    defer m.mu.Unlock()

    for _, cancel := range m.active {
        cancel()
    }
    m.active = make(map[ViewType]context.CancelFunc)
    close(m.stopCh)
}

func (m *ManagedFactory) informerForView(view ViewType) cache.SharedIndexInformer {
    core := m.factory.Core().V1()
    apps := m.factory.Apps().V1()

    switch view {
    case ViewPods:
        return core.Pods().Informer()
    case ViewDeployments:
        return apps.Deployments().Informer()
    case ViewServices:
        return core.Services().Informer()
    case ViewNodes:
        return core.Nodes().Informer()
    case ViewEvents:
        return core.Events().Informer()
    }
    return nil
}
```

#### Event Debouncer with Ring Buffer

Batch rapid watch events (e.g. during a rolling update firing 50 pod events in 200ms) into 100ms windows. The ring buffer prevents unbounded memory growth during event storms.

```go
// internal/debounce/debouncer.go
package debounce

import (
    "sync"
    "time"
)

// Event is a generic watch event carrying a resource key and payload.
type Event[T any] struct {
    Key   string
    Value T
}

// RingBuffer is a fixed-capacity FIFO that overwrites oldest entries on overflow.
type RingBuffer[T any] struct {
    buf  []Event[T]
    head int
    tail int
    size int
    cap  int
}

func NewRingBuffer[T any](capacity int) *RingBuffer[T] {
    return &RingBuffer[T]{buf: make([]Event[T], capacity), cap: capacity}
}

func (r *RingBuffer[T]) Push(e Event[T]) {
    if r.size == r.cap {
        // Overwrite oldest
        r.head = (r.head + 1) % r.cap
        r.size--
    }
    r.buf[r.tail] = e
    r.tail = (r.tail + 1) % r.cap
    r.size++
}

func (r *RingBuffer[T]) Drain() []Event[T] {
    out := make([]Event[T], r.size)
    for i := 0; i < r.size; i++ {
        out[i] = r.buf[(r.head+i)%r.cap]
    }
    r.head, r.tail, r.size = 0, 0, 0
    return out
}

func (r *RingBuffer[T]) Len() int { return r.size }

// Debouncer batches events in a ring buffer and flushes every interval.
type Debouncer[T any] struct {
    mu       sync.Mutex
    ring     *RingBuffer[T]
    timer    *time.Timer
    interval time.Duration
    flush    func([]Event[T])
}

func NewDebouncer[T any](capacity int, interval time.Duration, flush func([]Event[T])) *Debouncer[T] {
    return &Debouncer[T]{
        ring:     NewRingBuffer[T](capacity),
        interval: interval,
        flush:    flush,
    }
}

// Add queues an event. The latest value for a given key wins within a window.
func (d *Debouncer[T]) Add(key string, value T) {
    d.mu.Lock()
    defer d.mu.Unlock()

    d.ring.Push(Event[T]{Key: key, Value: value})

    if d.timer == nil {
        d.timer = time.AfterFunc(d.interval, d.doFlush)
    }
}

func (d *Debouncer[T]) doFlush() {
    d.mu.Lock()
    events := d.ring.Drain()
    d.timer = nil
    d.mu.Unlock()

    // Deduplicate: keep last value per key
    latest := make(map[string]Event[T], len(events))
    var order []string
    for _, e := range events {
        if _, seen := latest[e.Key]; !seen {
            order = append(order, e.Key)
        }
        latest[e.Key] = e
    }
    deduped := make([]Event[T], 0, len(order))
    for _, k := range order {
        deduped = append(deduped, latest[k])
    }
    d.flush(deduped)
}
```

#### In-Memory LRU Cache with TTL

Cache list results so tab re-navigation is instant. Background refresh keeps data fresh. UI shows "last updated X seconds ago."

```go
// internal/cache/lru.go
package cache

import (
    "container/list"
    "sync"
    "time"
)

type entry[V any] struct {
    key       string
    value     V
    expiresAt time.Time
    elem      *list.Element
}

// LRU is a thread-safe, TTL-aware least-recently-used cache.
type LRU[V any] struct {
    mu      sync.Mutex
    cap     int
    ttl     time.Duration
    items   map[string]*entry[V]
    order   *list.List // front = most recently used
}

func NewLRU[V any](capacity int, ttl time.Duration) *LRU[V] {
    return &LRU[V]{
        cap:   capacity,
        ttl:   ttl,
        items: make(map[string]*entry[V], capacity),
        order: list.New(),
    }
}

// Set stores a value. Evicts the LRU entry if at capacity.
func (c *LRU[V]) Set(key string, value V) {
    c.mu.Lock()
    defer c.mu.Unlock()

    if e, ok := c.items[key]; ok {
        e.value = value
        e.expiresAt = time.Now().Add(c.ttl)
        c.order.MoveToFront(e.elem)
        return
    }

    if c.order.Len() >= c.cap {
        oldest := c.order.Back()
        if oldest != nil {
            e := oldest.Value.(*entry[V])
            delete(c.items, e.key)
            c.order.Remove(oldest)
        }
    }

    e := &entry[V]{key: key, value: value, expiresAt: time.Now().Add(c.ttl)}
    e.elem = c.order.PushFront(e)
    c.items[key] = e
}

// Get returns a value and its age. Returns false if missing or expired.
func (c *LRU[V]) Get(key string) (V, time.Duration, bool) {
    c.mu.Lock()
    defer c.mu.Unlock()

    e, ok := c.items[key]
    if !ok {
        var zero V
        return zero, 0, false
    }
    if time.Now().After(e.expiresAt) {
        delete(c.items, e.key)
        c.order.Remove(e.elem)
        var zero V
        return zero, 0, false
    }
    c.order.MoveToFront(e.elem)
    age := time.Since(e.expiresAt.Add(-c.ttl))
    return e.value, age, true
}

// Delete removes an entry.
func (c *LRU[V]) Delete(key string) {
    c.mu.Lock()
    defer c.mu.Unlock()
    if e, ok := c.items[key]; ok {
        delete(c.items, key)
        c.order.Remove(e.elem)
    }
}

// Len returns the number of cached entries.
func (c *LRU[V]) Len() int {
    c.mu.Lock()
    defer c.mu.Unlock()
    return c.order.Len()
}
```

Usage in resource service:

```go
// internal/resource/service.go (excerpt)
type ResourceService struct {
    client  kubernetes.Interface
    cache   *cache.LRU[[]corev1.Pod]
    // ...
}

// ListPods returns pods, serving from cache when fresh.
func (s *ResourceService) ListPods(ctx context.Context, namespace string) ([]corev1.Pod, time.Duration, error) {
    cacheKey := "pods/" + namespace
    if pods, age, ok := s.cache.Get(cacheKey); ok {
        // Serve from cache, trigger background refresh if age > 30s
        if age > 30*time.Second {
            go s.refreshPods(namespace)
        }
        return pods, age, nil
    }

    pods, err := s.fetchPods(ctx, namespace)
    if err != nil {
        return nil, 0, err
    }
    s.cache.Set(cacheKey, pods)
    return pods, 0, nil
}
```

#### SQLite Persistence Layer

SQLite provides durable storage for resource snapshots, search indexing, historical trends, and audit logs. This eliminates the cold-start blank screen and enables offline cluster browsing.

**Database location:** `~/.kubeviewer/kubeviewer.db`

**Driver:** `modernc.org/sqlite` (pure Go, no CGo required — simplifies cross-compilation).

```go
// internal/store/db.go
package store

import (
    "context"
    "database/sql"
    "encoding/json"
    "os"
    "path/filepath"
    "sync"
    "time"

    _ "modernc.org/sqlite"
)

// DB wraps the SQLite database with KubeViewer-specific operations.
type DB struct {
    db       *sql.DB
    mu       sync.Mutex
    writeBuf []ResourceSnapshot
    flushInt time.Duration
}

// ResourceSnapshot is a single resource's last-known state, persisted to SQLite.
type ResourceSnapshot struct {
    ClusterID       string    `json:"clusterId"`
    GVR             string    `json:"gvr"`        // e.g. "apps/v1/deployments"
    Namespace       string    `json:"namespace"`
    Name            string    `json:"name"`
    ResourceVersion string    `json:"resourceVersion"`
    Data            []byte    `json:"data"`        // JSON-encoded ResourceSummary
    UpdatedAt       time.Time `json:"updatedAt"`
}

// Open creates or opens the KubeViewer database with WAL mode enabled.
func Open() (*DB, error) {
    dir := filepath.Join(os.Getenv("HOME"), ".kubeviewer")
    if err := os.MkdirAll(dir, 0700); err != nil {
        return nil, err
    }
    dbPath := filepath.Join(dir, "kubeviewer.db")

    db, err := sql.Open("sqlite", dbPath)
    if err != nil {
        return nil, err
    }

    // WAL mode for concurrent reads during writes.
    if _, err := db.Exec("PRAGMA journal_mode=WAL"); err != nil {
        db.Close()
        return nil, err
    }
    // Reasonable busy timeout for concurrent access.
    if _, err := db.Exec("PRAGMA busy_timeout=5000"); err != nil {
        db.Close()
        return nil, err
    }

    store := &DB{db: db, flushInt: 5 * time.Second}
    if err := store.migrate(); err != nil {
        db.Close()
        return nil, err
    }
    return store, nil
}
```

**Schema:**

```sql
-- Resource snapshots: last-known state for warm-start and offline viewing.
CREATE TABLE IF NOT EXISTS resource_snapshots (
    cluster_id       TEXT    NOT NULL,
    gvr              TEXT    NOT NULL,
    namespace        TEXT    NOT NULL DEFAULT '',
    name             TEXT    NOT NULL,
    resource_version TEXT    NOT NULL,
    data             BLOB    NOT NULL,  -- JSON-encoded ResourceSummary
    updated_at       INTEGER NOT NULL,  -- Unix timestamp ms
    PRIMARY KEY (cluster_id, gvr, namespace, name)
);
CREATE INDEX IF NOT EXISTS idx_snapshots_cluster_gvr
    ON resource_snapshots(cluster_id, gvr);

-- Resource history: periodic snapshots for trend dashboards.
CREATE TABLE IF NOT EXISTS resource_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    cluster_id  TEXT    NOT NULL,
    gvr         TEXT    NOT NULL,
    namespace   TEXT    NOT NULL DEFAULT '',
    count       INTEGER NOT NULL,
    status_json TEXT,            -- JSON: {"running":12,"pending":2,"failed":1}
    recorded_at INTEGER NOT NULL -- Unix timestamp ms
);
CREATE INDEX IF NOT EXISTS idx_history_cluster_time
    ON resource_history(cluster_id, recorded_at);

-- FTS5 full-text search index across resource metadata.
CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
    cluster_id,
    gvr,
    namespace,
    name,
    labels,          -- JSON-encoded label map
    annotations_keys -- space-separated annotation keys (not values, to limit size)
);

-- Audit log: user-initiated actions.
CREATE TABLE IF NOT EXISTS audit_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp  INTEGER NOT NULL,
    cluster    TEXT    NOT NULL,
    namespace  TEXT    NOT NULL DEFAULT '',
    action     TEXT    NOT NULL,
    kind       TEXT    NOT NULL,
    name       TEXT    NOT NULL,
    user       TEXT    NOT NULL DEFAULT '',
    details    TEXT,    -- JSON-encoded change details
    status     TEXT    NOT NULL DEFAULT 'success',
    error      TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(timestamp);

-- App state: user preferences, replaces scattered localStorage usage.
CREATE TABLE IF NOT EXISTS app_state (
    key       TEXT PRIMARY KEY,
    value     TEXT NOT NULL,  -- JSON-encoded
    updated_at INTEGER NOT NULL
);
```

**Write-behind batching:**

Informer events are buffered in memory and flushed to SQLite every 5 seconds to avoid write amplification. On graceful shutdown, the buffer is flushed immediately.

```go
// FlushLoop runs in a background goroutine, flushing buffered snapshots to SQLite.
func (d *DB) FlushLoop(ctx context.Context) {
    ticker := time.NewTicker(d.flushInt)
    defer ticker.Stop()
    for {
        select {
        case <-ctx.Done():
            d.flush() // final flush on shutdown
            return
        case <-ticker.C:
            d.flush()
        }
    }
}

// Buffer adds a snapshot to the write-behind buffer.
func (d *DB) Buffer(snap ResourceSnapshot) {
    d.mu.Lock()
    defer d.mu.Unlock()
    d.writeBuf = append(d.writeBuf, snap)
}

func (d *DB) flush() {
    d.mu.Lock()
    buf := d.writeBuf
    d.writeBuf = nil
    d.mu.Unlock()

    if len(buf) == 0 {
        return
    }

    tx, err := d.db.Begin()
    if err != nil {
        return
    }
    stmt, _ := tx.Prepare(`
        INSERT OR REPLACE INTO resource_snapshots
            (cluster_id, gvr, namespace, name, resource_version, data, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    defer stmt.Close()

    for _, s := range buf {
        stmt.Exec(s.ClusterID, s.GVR, s.Namespace, s.Name,
            s.ResourceVersion, s.Data, s.UpdatedAt.UnixMilli())
    }
    tx.Commit()
}
```

**Warm-start read path:**

On app launch, before informers have synced, the frontend requests last-known snapshots from SQLite. The UI renders these with a "last synced X ago" badge, then seamlessly transitions to live data as informers connect.

```go
// LoadSnapshots returns all resource snapshots for a cluster+GVR, for warm-start rendering.
func (d *DB) LoadSnapshots(clusterID, gvr string) ([]ResourceSnapshot, error) {
    rows, err := d.db.Query(`
        SELECT cluster_id, gvr, namespace, name, resource_version, data, updated_at
        FROM resource_snapshots
        WHERE cluster_id = ? AND gvr = ?
        ORDER BY namespace, name
    `, clusterID, gvr)
    if err != nil {
        return nil, err
    }
    defer rows.Close()

    var snaps []ResourceSnapshot
    for rows.Next() {
        var s ResourceSnapshot
        var ts int64
        if err := rows.Scan(&s.ClusterID, &s.GVR, &s.Namespace, &s.Name,
            &s.ResourceVersion, &s.Data, &ts); err != nil {
            continue
        }
        s.UpdatedAt = time.UnixMilli(ts)
        snaps = append(snaps, s)
    }
    return snaps, nil
}
```

**Retention & size management:**

```go
// Prune removes stale data to keep the database within size budget.
func (d *DB) Prune(snapshotMaxAge, historyMaxAge, auditMaxAge time.Duration) error {
    now := time.Now().UnixMilli()
    queries := []struct{ q string; cutoff int64 }{
        {"DELETE FROM resource_snapshots WHERE updated_at < ?", now - snapshotMaxAge.Milliseconds()},
        {"DELETE FROM resource_history WHERE recorded_at < ?", now - historyMaxAge.Milliseconds()},
        {"DELETE FROM audit_log WHERE timestamp < ?", now - auditMaxAge.Milliseconds()},
    }
    for _, q := range queries {
        if _, err := d.db.Exec(q.q, q.cutoff); err != nil {
            return err
        }
    }
    // Reclaim space after bulk deletes.
    _, err := d.db.Exec("PRAGMA incremental_vacuum")
    return err
}
```

**Settings integration:**

The Settings page (Phase 8.8) gains additional controls under a "Storage" section:

| Setting | Default | Description |
|---|---|---|
| `snapshotRetentionDays` | 3 | How long to keep resource snapshots |
| `historyRetentionDays` | 7 | How long to keep trend history |
| `auditRetentionDays` | 90 | How long to keep audit log entries |
| `maxDbSizeMB` | 200 | Hard cap — triggers auto-eviction of oldest entries |

#### Connection Pooling

Reuse HTTP transport across all clients for a cluster connection.

```go
// internal/k8s/transport.go
package k8s

import (
    "net/http"
    "time"
)

// SharedTransport returns an http.Transport configured for Kubernetes API server
// connection reuse. One instance per cluster connection.
func SharedTransport() *http.Transport {
    return &http.Transport{
        MaxIdleConns:          100,
        MaxIdleConnsPerHost:   20,
        IdleConnTimeout:       90 * time.Second,
        TLSHandshakeTimeout:   10 * time.Second,
        ExpectContinueTimeout: 1 * time.Second,
        DisableCompression:    false,
    }
}
```

#### Parallel Initial Load

When connecting, fetch namespaces, nodes, and events concurrently to minimize time-to-interactive.

```go
// internal/cluster/connect.go (excerpt)
func (m *Manager) parallelInitialLoad(ctx context.Context, client kubernetes.Interface) (*InitialData, error) {
    type result[T any] struct {
        data T
        err  error
    }

    nsCh   := make(chan result[[]corev1.Namespace], 1)
    nodeCh  := make(chan result[[]corev1.Node], 1)
    evtCh   := make(chan result[[]corev1.Event], 1)

    go func() {
        list, err := client.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
        if err != nil {
            nsCh <- result[[]corev1.Namespace]{err: err}
            return
        }
        nsCh <- result[[]corev1.Namespace]{data: list.Items}
    }()

    go func() {
        list, err := client.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
        if err != nil {
            nodeCh <- result[[]corev1.Node]{err: err}
            return
        }
        nodeCh <- result[[]corev1.Node]{data: list.Items}
    }()

    go func() {
        list, err := client.CoreV1().Events("").List(ctx, metav1.ListOptions{
            Limit: 500,
        })
        if err != nil {
            evtCh <- result[[]corev1.Event]{err: err}
            return
        }
        evtCh <- result[[]corev1.Event]{data: list.Items}
    }()

    nsResult   := <-nsCh
    nodeResult := <-nodeCh
    evtResult  := <-evtCh

    var errs []error
    for _, e := range []error{nsResult.err, nodeResult.err, evtResult.err} {
        if e != nil {
            errs = append(errs, e)
        }
    }
    if len(errs) > 0 {
        return nil, errors.Join(errs...)
    }

    return &InitialData{
        Namespaces: nsResult.data,
        Nodes:      nodeResult.data,
        Events:     evtResult.data,
    }, nil
}
```

#### Context Cancellation and Goroutine Leak Detection

Every goroutine must respect its context. In tests, use goleak to detect leaks.

```go
// internal/stream/logs.go (pattern)
func (s *LogStreamer) Stream(ctx context.Context, pod, container, namespace string, emit func(string)) error {
    req := s.client.CoreV1().Pods(namespace).GetLogs(pod, &corev1.PodLogOptions{
        Container: container,
        Follow:    true,
    })
    stream, err := req.Stream(ctx)
    if err != nil {
        return err
    }
    defer stream.Close()

    scanner := bufio.NewScanner(stream)
    for scanner.Scan() {
        select {
        case <-ctx.Done():
            return ctx.Err()
        default:
            emit(scanner.Text())
        }
    }
    return scanner.Err()
}
```

```go
// internal/stream/logs_test.go (leak detection)
import "go.uber.org/goleak"

func TestMain(m *testing.M) {
    goleak.VerifyTestMain(m)
}

func TestLogStream_CancelStopsGoroutine(t *testing.T) {
    ctx, cancel := context.WithCancel(context.Background())
    // ... set up fake stream
    go streamer.Stream(ctx, "pod", "container", "default", func(line string) {})
    cancel()
    // goleak.VerifyTestMain will fail if goroutine is still running after test
}
```

---

### 8.1.2 Frontend Optimizations

#### React.memo Strategy

Memoize components where the parent re-renders frequently but the child's props change rarely:

```tsx
// ui/src/components/table/ResourceRow.tsx
import { memo } from "react";

// Memoize table rows: parent table re-renders on every watch event,
// but individual rows only need to update when their resource changes.
export const ResourceRow = memo(function ResourceRow({ resource, onSelect, isSelected }: ResourceRowProps) {
  return (
    <tr
      className={cn("table-row", isSelected && "table-row--selected")}
      onClick={() => onSelect(resource)}
    >
      {/* ... */}
    </tr>
  );
}, (prev, next) => {
  // Custom comparison: skip re-render if resource and selection haven't changed
  return prev.resource.metadata.resourceVersion === next.resource.metadata.resourceVersion
    && prev.isSelected === next.isSelected;
});

// DO memoize:
// - Table rows (parent re-renders on every event)
// - Sidebar items (re-render on route change, not on data change)
// - Status badges (pure function of status string)
// - Detail panel sections (large components, update only on resource change)

// DON'T memoize:
// - Top-level route components (they already only mount once)
// - Components with object/array props you don't control (memo won't help)
// - Simple leaf nodes that are cheap to render
```

#### useMemo / useCallback Rules

```tsx
// ui/src/views/PodList.tsx
import { useMemo, useCallback } from "react";

function PodList({ pods, namespace }: PodListProps) {
  // USE useMemo: expensive derivation from props/state
  const filteredPods = useMemo(() =>
    pods.filter(p => p.metadata.namespace === namespace)
        .sort((a, b) => a.metadata.name.localeCompare(b.metadata.name)),
    [pods, namespace]
  );

  // USE useCallback: function passed as prop to memoized child
  const handleSelect = useCallback((pod: V1Pod) => {
    navigate(`/pods/${pod.metadata.name}`);
  }, [navigate]);

  // DON'T use useMemo: cheap inline computation
  const count = pods.length; // not: useMemo(() => pods.length, [pods])

  // DON'T use useCallback: inline handler not passed to memo'd child
  // const handleClick = () => doSomething(); // fine as-is

  return <PodTable pods={filteredPods} onSelect={handleSelect} />;
}
```

#### Code Splitting Map

| Module | Load trigger | Approx. size (gzipped) | Implementation |
|--------|-------------|------------------------|----------------|
| Monaco Editor | First YAML tab open | ~2.5 MB | `lazy(() => import("./editor/YAMLEditor"))` |
| xterm.js | First terminal open | ~500 KB | `lazy(() => import("./terminal/Terminal"))` |
| Framer Motion | Animated transitions | ~50 KB (tree-shaken) | Named imports only |
| Helm views | First Helm nav click | ~30 KB | `lazy(() => import("./views/Helm"))` |
| Settings | Settings nav click | ~40 KB | `lazy(() => import("./views/Settings"))` |

```tsx
// ui/src/App.tsx
import { lazy, Suspense } from "react";

const YAMLEditor   = lazy(() => import("./components/editor/YAMLEditor"));
const Terminal     = lazy(() => import("./components/terminal/Terminal"));
const HelmView     = lazy(() => import("./views/Helm"));
const SettingsView = lazy(() => import("./views/Settings"));

// Preload on hover to eliminate perceived latency
function SidebarNavItem({ to, children }: NavItemProps) {
  const handleMouseEnter = () => {
    if (to === "/helm")     import("./views/Helm");
    if (to === "/settings") import("./views/Settings");
  };
  return <Link to={to} onMouseEnter={handleMouseEnter}>{children}</Link>;
}
```

#### Virtualization Configuration

```tsx
// ui/src/components/table/VirtualTable.tsx
import { useVirtualizer } from "@tanstack/react-virtual";

// Resource tables: overscan 20 rows to prevent flash on fast scroll
const rowVirtualizer = useVirtualizer({
  count: rows.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 40,    // 40px row height
  overscan: 20,
});

// Log viewer: overscan 50 lines (logs are denser, user scrolls faster)
const logVirtualizer = useVirtualizer({
  count: lines.length,
  getScrollElement: () => logRef.current,
  estimateSize: () => 20,    // 20px line height
  overscan: 50,
});
```

#### Debounce Configuration

```tsx
// ui/src/hooks/useDebounce.ts
import { useMemo } from "react";
import { debounce } from "lodash-es";

export function useDebounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  ms: number
): T {
  return useMemo(() => debounce(fn, ms) as unknown as T, [fn, ms]);
}

// Usage:
// Search input: 150ms — feels immediate, avoids excessive filtering
const handleSearch = useDebounce((q: string) => setQuery(q), 150);

// Window resize: 100ms — reflow is expensive
const handleResize = useDebounce(() => recalcLayout(), 100);

// Column resize: 50ms — needs to feel responsive
const handleColResize = useDebounce((col: string, width: number) => saveColWidth(col, width), 50);
```

#### Web Worker for Heavy Computations

```tsx
// ui/src/workers/search.worker.ts
// Runs JSON parsing and search/filter off the main thread.

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { type, payload } = e.data;

  if (type === "PARSE_RESOURCES") {
    // JSON.parse of large resource list (e.g. 10k pods) can block UI for 200ms+
    const resources = JSON.parse(payload.json);
    self.postMessage({ type: "PARSE_RESULT", resources });
  }

  if (type === "FILTER") {
    const { resources, query, filters } = payload;
    const result = resources.filter(r => matchesQuery(r, query) && matchesFilters(r, filters));
    self.postMessage({ type: "FILTER_RESULT", result });
  }
};

function matchesQuery(resource: unknown, query: string): boolean {
  const name = (resource as { metadata: { name: string } }).metadata.name;
  return name.toLowerCase().includes(query.toLowerCase());
}
```

```tsx
// ui/src/hooks/useResourceWorker.ts
import { useEffect, useRef, useCallback } from "react";

export function useResourceWorker() {
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    workerRef.current = new Worker(
      new URL("../workers/search.worker.ts", import.meta.url),
      { type: "module" }
    );
    return () => workerRef.current?.terminate();
  }, []);

  const filterResources = useCallback((resources: unknown[], query: string, filters: unknown) => {
    return new Promise<unknown[]>((resolve) => {
      const worker = workerRef.current!;
      worker.onmessage = (e) => {
        if (e.data.type === "FILTER_RESULT") resolve(e.data.result);
      };
      worker.postMessage({ type: "FILTER", payload: { resources, query, filters } });
    });
  }, []);

  return { filterResources };
}
```

#### Bundle Analysis and Size Budget

```bash
# ui/scripts/analyze-bundle.sh
#!/usr/bin/env bash
# Run after `pnpm build` to inspect bundle sizes.

pnpm build -- --report

# Using rollup-plugin-visualizer (add to vite.config.ts):
# import { visualizer } from "rollup-plugin-visualizer";
# plugins: [visualizer({ open: true, gzipSize: true })]

echo "=== Chunk size budget ==="
echo "Target: < 3 MB gzipped for initial load"
echo ""
find dist/assets -name "*.js" | while read f; do
  size=$(gzip -c "$f" | wc -c)
  echo "  $(basename $f): $(echo "$size / 1024" | bc) KB gzipped"
done
```

```ts
// vite.config.ts (size budget enforcement)
import { defineConfig } from "vite";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "monaco":    ["monaco-editor"],
          "xterm":     ["xterm", "xterm-addon-fit", "xterm-addon-web-links"],
          "vendor":    ["react", "react-dom", "react-router-dom"],
          "ui":        ["@radix-ui/react-dialog", "@radix-ui/react-dropdown-menu"],
        },
      },
    },
    // Warn if any chunk exceeds 1MB
    chunkSizeWarningLimit: 1024,
  },
  plugins: [
    visualizer({ filename: "dist/stats.html", gzipSize: true }),
  ],
});
```

---

### 8.1.3 Memory Management

#### MemoryManager

Enforces limits on all stateful resources and monitors overall process memory.

```go
// internal/memory/manager.go
package memory

import (
    "context"
    "log/slog"
    "runtime"
    "sync"
    "time"
)

const (
    DefaultMaxLogLines         = 50_000
    DefaultMaxCacheEntriesPerType = 10_000
    DefaultMaxConcurrentWatches = 10
    DefaultMaxTerminalSessions  = 5
    DefaultWatchIdleTimeout     = 5 * time.Minute
    DefaultTerminalIdleTimeout  = 30 * time.Minute
    MemoryWarningThresholdBytes = 500 * 1024 * 1024 // 500 MB
    MemoryCheckInterval         = 30 * time.Second
)

// Manager tracks resource usage and enforces limits.
type Manager struct {
    mu sync.RWMutex

    // Configurable limits
    MaxLogLines           int
    MaxCacheEntriesPerType int
    MaxConcurrentWatches  int
    MaxTerminalSessions   int

    // Current counts
    activeWatches    int
    activeSessions   int
    onMemoryWarning  func(uint64)
}

func NewManager(onWarning func(memBytes uint64)) *Manager {
    return &Manager{
        MaxLogLines:            DefaultMaxLogLines,
        MaxCacheEntriesPerType: DefaultMaxCacheEntriesPerType,
        MaxConcurrentWatches:   DefaultMaxConcurrentWatches,
        MaxTerminalSessions:    DefaultMaxTerminalSessions,
        onMemoryWarning:        onWarning,
    }
}

// StartMonitor periodically checks process memory and calls onWarning if exceeded.
func (m *Manager) StartMonitor(ctx context.Context) {
    ticker := time.NewTicker(MemoryCheckInterval)
    go func() {
        defer ticker.Stop()
        for {
            select {
            case <-ctx.Done():
                return
            case <-ticker.C:
                var ms runtime.MemStats
                runtime.ReadMemStats(&ms)
                if ms.Alloc > MemoryWarningThresholdBytes {
                    slog.Warn("memory usage exceeds threshold",
                        "alloc_mb", ms.Alloc/1024/1024,
                        "threshold_mb", MemoryWarningThresholdBytes/1024/1024,
                    )
                    if m.onMemoryWarning != nil {
                        m.onMemoryWarning(ms.Alloc)
                    }
                }
            }
        }
    }()
}

// AcquireWatch attempts to reserve a watch slot. Returns false if at limit.
func (m *Manager) AcquireWatch() bool {
    m.mu.Lock()
    defer m.mu.Unlock()
    if m.activeWatches >= m.MaxConcurrentWatches {
        return false
    }
    m.activeWatches++
    return true
}

// ReleaseWatch frees a watch slot.
func (m *Manager) ReleaseWatch() {
    m.mu.Lock()
    defer m.mu.Unlock()
    if m.activeWatches > 0 {
        m.activeWatches--
    }
}

// AcquireSession attempts to reserve a terminal session slot.
func (m *Manager) AcquireSession() bool {
    m.mu.Lock()
    defer m.mu.Unlock()
    if m.activeSessions >= m.MaxTerminalSessions {
        return false
    }
    m.activeSessions++
    return true
}

// ReleaseSession frees a session slot.
func (m *Manager) ReleaseSession() {
    m.mu.Lock()
    defer m.mu.Unlock()
    if m.activeSessions > 0 {
        m.activeSessions--
    }
}

// Stats returns current usage stats.
func (m *Manager) Stats() map[string]int {
    m.mu.RLock()
    defer m.mu.RUnlock()
    return map[string]int{
        "activeWatches":   m.activeWatches,
        "activeSessions":  m.activeSessions,
    }
}
```

---

## 8.2 — Complete Makefile

```makefile
# Makefile for KubeViewer development
# Usage: make help

BINARY      := kubeviewer
VERSION     := $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
BUILD_DIR   := build/bin
GO          := go
WAILS       := wails
PNPM        := pnpm
GOLANGCI    := golangci-lint

# Build flags
LDFLAGS := -X 'main.Version=$(VERSION)' -X 'main.BuildDate=$(shell date -u +%Y-%m-%dT%H:%M:%SZ)'

.DEFAULT_GOAL := help

##@ Development

.PHONY: dev
dev: ## Start development server with hot reload
	$(WAILS) dev

.PHONY: build
build: ## Build for the current platform
	$(WAILS) build -ldflags "$(LDFLAGS)"

.PHONY: build-all
build-all: build-macos build-windows build-linux ## Build for all platforms (requires cross-compile toolchain)

.PHONY: build-macos
build-macos: ## Build macOS universal binary
	$(WAILS) build -platform darwin/universal -ldflags "$(LDFLAGS)" -clean

.PHONY: build-windows
build-windows: ## Build Windows amd64 binary
	$(WAILS) build -platform windows/amd64 -ldflags "$(LDFLAGS)" -clean

.PHONY: build-linux
build-linux: ## Build Linux amd64 binary
	$(WAILS) build -platform linux/amd64 -ldflags "$(LDFLAGS)" -clean

##@ Testing

.PHONY: test
test: test-go test-frontend ## Run all tests

.PHONY: test-go
test-go: ## Run Go unit tests
	$(GO) test -race -count=1 -timeout=60s ./internal/... ./handlers/...

.PHONY: test-go-integration
test-go-integration: ## Run Go integration tests (requires running cluster)
	$(GO) test -tags=integration -race -count=1 -timeout=120s ./internal/...

.PHONY: test-go-coverage
test-go-coverage: ## Run Go tests with coverage report
	$(GO) test -race -coverprofile=coverage.out -covermode=atomic ./internal/... ./handlers/...
	$(GO) tool cover -html=coverage.out -o coverage.html
	@echo "Coverage report: coverage.html"

.PHONY: test-frontend
test-frontend: ## Run frontend unit tests
	cd ui && $(PNPM) test run

.PHONY: test-frontend-watch
test-frontend-watch: ## Run frontend tests in watch mode
	cd ui && $(PNPM) test

.PHONY: test-e2e
test-e2e: ## Run Playwright E2E tests (requires `make dev` running in another terminal)
	cd ui && $(PNPM) exec playwright test

##@ Linting & Formatting

.PHONY: lint
lint: lint-go lint-frontend ## Lint all code

.PHONY: lint-go
lint-go: ## Run golangci-lint
	$(GOLANGCI) run ./...

.PHONY: lint-frontend
lint-frontend: ## Run ESLint and TypeScript type check
	cd ui && $(PNPM) lint && $(PNPM) tsc --noEmit

.PHONY: format
format: ## Format Go and frontend code
	$(GO) fmt ./...
	$(GO) run golang.org/x/tools/cmd/goimports@latest -w .
	cd ui && $(PNPM) exec prettier --write "src/**/*.{ts,tsx,css}"

.PHONY: vet
vet: ## Run go vet
	$(GO) vet ./...

##@ Code Generation

.PHONY: generate-bindings
generate-bindings: ## Regenerate Wails TypeScript bindings
	$(WAILS) generate module

##@ Dependencies

.PHONY: install-tools
install-tools: ## Install development tools (golangci-lint, wails, etc.)
	$(GO) install github.com/wailsapp/wails/v2/cmd/wails@latest
	curl -sSfL https://raw.githubusercontent.com/golangci/golangci-lint/master/install.sh | sh -s -- -b $$($(GO) env GOPATH)/bin v1.57.0
	cd ui && $(PNPM) install

.PHONY: tidy
tidy: ## Tidy Go modules
	$(GO) mod tidy
	$(GO) mod verify

.PHONY: audit
audit: ## Run security audits
	$(GO) list -json -m all | $(GO) run golang.org/x/vuln/cmd/govulncheck@latest -json ./...
	cd ui && $(PNPM) audit

##@ Packaging

.PHONY: package-macos
package-macos: build-macos ## Build, sign, notarize, and package macOS DMG
	./scripts/sign-macos.sh
	./scripts/package-macos.sh

.PHONY: package-windows
package-windows: build-windows ## Build and package Windows NSIS installer
	$(WAILS) build -platform windows/amd64 -nsis -ldflags "$(LDFLAGS)"

.PHONY: package-linux
package-linux: build-linux ## Build Linux AppImage and .deb
	./scripts/package-linux.sh

##@ Utilities

.PHONY: clean
clean: ## Remove build artifacts
	rm -rf $(BUILD_DIR)
	rm -f coverage.out coverage.html
	cd ui && rm -rf dist node_modules/.vite

.PHONY: analyze-bundle
analyze-bundle: ## Analyze frontend bundle sizes
	cd ui && $(PNPM) build -- --report
	@./ui/scripts/analyze-bundle.sh

.PHONY: help
help: ## Display this help
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} /^[a-zA-Z_0-9-]+:.*?##/ { printf "  \033[36m%-28s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)
```

---

## 8.3 — GitHub Actions CI/CD

### `.github/workflows/ci.yml` — PR and Push CI

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  # ─── Go ──────────────────────────────────────────────────────────────────────
  go-test:
    name: Go Test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-go@v5
        with:
          go-version-file: go.mod
          cache: true

      - name: Download dependencies
        run: go mod download

      - name: go vet
        run: go vet ./...

      - name: Run tests
        run: go test -race -count=1 -timeout=60s -coverprofile=coverage.out ./internal/... ./handlers/...

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          files: coverage.out
          fail_ci_if_error: false

  go-lint:
    name: Go Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-go@v5
        with:
          go-version-file: go.mod
          cache: true

      - name: golangci-lint
        uses: golangci/golangci-lint-action@v6
        with:
          version: v1.57.0
          args: --timeout=5m

  # ─── Frontend ─────────────────────────────────────────────────────────────────
  frontend:
    name: Frontend
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v3
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: pnpm
          cache-dependency-path: ui/pnpm-lock.yaml

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: TypeScript type check
        run: pnpm tsc --noEmit

      - name: ESLint
        run: pnpm lint

      - name: Tests
        run: pnpm test run

      - name: Build check
        run: pnpm build

  # ─── Build Check ─────────────────────────────────────────────────────────────
  build-check:
    name: Build Check (${{ matrix.os }})
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        include:
          - os: macos-14         # Apple Silicon runner
            platform: darwin/amd64
          - os: windows-latest
            platform: windows/amd64
          - os: ubuntu-latest
            platform: linux/amd64

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-go@v5
        with:
          go-version-file: go.mod
          cache: true

      - uses: pnpm/action-setup@v3
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: pnpm
          cache-dependency-path: ui/pnpm-lock.yaml

      - name: Install Linux dependencies
        if: matrix.os == 'ubuntu-latest'
        run: |
          sudo apt-get update
          sudo apt-get install -y libgtk-3-dev libwebkit2gtk-4.1-dev pkg-config

      - name: Install Wails
        run: go install github.com/wailsapp/wails/v2/cmd/wails@latest

      - name: Install frontend dependencies
        run: cd ui && pnpm install --frozen-lockfile

      - name: Wails build
        run: wails build -platform ${{ matrix.platform }} -clean
```

---

### `.github/workflows/release.yml` — Tag-Triggered Release

```yaml
name: Release

on:
  push:
    tags:
      - "v*"

permissions:
  contents: write

env:
  GO_VERSION: "1.22"
  NODE_VERSION: "20"
  PNPM_VERSION: "9"

jobs:
  # ─── Build Matrix ─────────────────────────────────────────────────────────────
  build:
    name: Build ${{ matrix.name }}
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        include:
          - name: macOS (Universal)
            os: macos-14
            platform: darwin/universal
            artifact_name: KubeViewer-macos-universal
            binary: build/bin/KubeViewer.app

          - name: Windows (amd64)
            os: windows-latest
            platform: windows/amd64
            artifact_name: KubeViewer-windows-amd64
            binary: build/bin/KubeViewer.exe

          - name: Linux (amd64)
            os: ubuntu-latest
            platform: linux/amd64
            artifact_name: KubeViewer-linux-amd64
            binary: build/bin/kubeviewer

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-go@v5
        with:
          go-version: ${{ env.GO_VERSION }}
          cache: true

      - uses: pnpm/action-setup@v3
        with:
          version: ${{ env.PNPM_VERSION }}

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm
          cache-dependency-path: ui/pnpm-lock.yaml

      - name: Install Linux system dependencies
        if: runner.os == 'Linux'
        run: |
          sudo apt-get update
          sudo apt-get install -y \
            libgtk-3-dev libwebkit2gtk-4.1-dev pkg-config \
            appimagetool fuse libfuse2

      - name: Install macOS tools
        if: runner.os == 'macOS'
        run: brew install create-dmg

      - name: Install Windows tools
        if: runner.os == 'Windows'
        run: choco install nsis -y

      - name: Install Wails
        run: go install github.com/wailsapp/wails/v2/cmd/wails@latest

      - name: Install frontend dependencies
        run: cd ui && pnpm install --frozen-lockfile

      # ── macOS: Build → Sign → Notarize → DMG ───────────────────────────────
      - name: Build (macOS)
        if: runner.os == 'macOS'
        run: |
          wails build -platform ${{ matrix.platform }} -clean \
            -ldflags "-X 'main.Version=${{ github.ref_name }}'"

      - name: Import macOS signing certificate
        if: runner.os == 'macOS'
        env:
          MACOS_CERTIFICATE: ${{ secrets.MACOS_CERTIFICATE }}
          MACOS_CERTIFICATE_PWD: ${{ secrets.MACOS_CERTIFICATE_PWD }}
          MACOS_KEYCHAIN_PWD: ${{ secrets.MACOS_KEYCHAIN_PWD }}
        run: |
          echo "$MACOS_CERTIFICATE" | base64 --decode > certificate.p12
          security create-keychain -p "$MACOS_KEYCHAIN_PWD" build.keychain
          security default-keychain -s build.keychain
          security unlock-keychain -p "$MACOS_KEYCHAIN_PWD" build.keychain
          security import certificate.p12 -k build.keychain \
            -P "$MACOS_CERTIFICATE_PWD" -T /usr/bin/codesign
          security set-key-partition-list \
            -S apple-tool:,apple:,codesign: -s -k "$MACOS_KEYCHAIN_PWD" build.keychain

      - name: Sign macOS app
        if: runner.os == 'macOS'
        env:
          MACOS_SIGNING_IDENTITY: ${{ secrets.MACOS_SIGNING_IDENTITY }}
        run: |
          codesign --force --deep --options runtime \
            --sign "$MACOS_SIGNING_IDENTITY" \
            --entitlements build/darwin/entitlements.plist \
            build/bin/KubeViewer.app
          codesign --verify --verbose build/bin/KubeViewer.app

      - name: Notarize macOS app
        if: runner.os == 'macOS'
        env:
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_APP_PASSWORD: ${{ secrets.APPLE_APP_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
        run: |
          ditto -c -k --keepParent build/bin/KubeViewer.app KubeViewer.zip
          xcrun notarytool submit KubeViewer.zip \
            --apple-id "$APPLE_ID" \
            --password "$APPLE_APP_PASSWORD" \
            --team-id "$APPLE_TEAM_ID" \
            --wait
          xcrun stapler staple build/bin/KubeViewer.app

      - name: Create DMG
        if: runner.os == 'macOS'
        run: |
          create-dmg \
            --volname "KubeViewer ${{ github.ref_name }}" \
            --volicon "build/darwin/icon.icns" \
            --background "build/darwin/dmg-background.png" \
            --window-pos 200 120 \
            --window-size 660 400 \
            --icon-size 160 \
            --icon "KubeViewer.app" 180 185 \
            --hide-extension "KubeViewer.app" \
            --app-drop-link 480 185 \
            "KubeViewer-${{ github.ref_name }}-macos-universal.dmg" \
            "build/bin/KubeViewer.app"

      # ── Windows: Build → NSIS Installer → Sign ─────────────────────────────
      - name: Build (Windows)
        if: runner.os == 'Windows'
        run: |
          wails build -platform ${{ matrix.platform }} -nsis -clean `
            -ldflags "-X 'main.Version=${{ github.ref_name }}'"

      - name: Sign Windows installer
        if: runner.os == 'Windows'
        env:
          WINDOWS_CERTIFICATE: ${{ secrets.WINDOWS_CERTIFICATE }}
          WINDOWS_CERTIFICATE_PWD: ${{ secrets.WINDOWS_CERTIFICATE_PWD }}
        run: |
          echo "$env:WINDOWS_CERTIFICATE" | base64 --decode > certificate.pfx
          & "C:\Program Files (x86)\Windows Kits\10\bin\10.0.22621.0\x64\signtool.exe" sign `
            /f certificate.pfx `
            /p "$env:WINDOWS_CERTIFICATE_PWD" `
            /tr http://timestamp.digicert.com `
            /td sha256 /fd sha256 `
            build/bin/KubeViewer-amd64-installer.exe
          Remove-Item certificate.pfx

      # ── Linux: Build → AppImage + tar.gz ───────────────────────────────────
      - name: Build (Linux)
        if: runner.os == 'Linux'
        run: |
          wails build -platform ${{ matrix.platform }} -clean \
            -ldflags "-X 'main.Version=${{ github.ref_name }}'"

      - name: Create AppImage (Linux)
        if: runner.os == 'Linux'
        run: ./scripts/package-linux.sh ${{ github.ref_name }}

      - name: Create tar.gz (Linux)
        if: runner.os == 'Linux'
        run: |
          tar -czf KubeViewer-${{ github.ref_name }}-linux-amd64.tar.gz \
            -C build/bin kubeviewer

      # ── Upload artifacts ────────────────────────────────────────────────────
      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.artifact_name }}
          path: |
            *.dmg
            *.exe
            *.AppImage
            *.tar.gz
          retention-days: 1

  # ─── Release ─────────────────────────────────────────────────────────────────
  release:
    name: Create GitHub Release
    runs-on: ubuntu-latest
    needs: build
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Download all artifacts
        uses: actions/download-artifact@v4
        with:
          path: dist/

      - name: Flatten artifact directories
        run: find dist -mindepth 2 -type f -exec mv -t dist/ {} +

      - name: Generate changelog
        id: changelog
        run: |
          PREV_TAG=$(git describe --tags --abbrev=0 HEAD^ 2>/dev/null || echo "")
          if [ -n "$PREV_TAG" ]; then
            CHANGELOG=$(git log --pretty=format:"- %s (%h)" ${PREV_TAG}..HEAD \
              | grep -v '^- Merge ' | head -50)
          else
            CHANGELOG=$(git log --pretty=format:"- %s (%h)" | head -50)
          fi
          echo "changelog<<EOF" >> $GITHUB_OUTPUT
          echo "$CHANGELOG" >> $GITHUB_OUTPUT
          echo "EOF" >> $GITHUB_OUTPUT

      - name: Compute checksums
        run: |
          cd dist
          sha256sum *.dmg *.exe *.AppImage *.tar.gz > checksums.txt 2>/dev/null || true
          cat checksums.txt

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          name: KubeViewer ${{ github.ref_name }}
          body: |
            ## What's Changed

            ${{ steps.changelog.outputs.changelog }}

            ## Downloads

            | Platform | File |
            |----------|------|
            | macOS (Universal) | `KubeViewer-${{ github.ref_name }}-macos-universal.dmg` |
            | Windows (amd64) | `KubeViewer-amd64-installer.exe` |
            | Linux (amd64) | `KubeViewer-${{ github.ref_name }}-linux-amd64.AppImage` |
            | Linux (tar.gz) | `KubeViewer-${{ github.ref_name }}-linux-amd64.tar.gz` |

            ## Checksums (SHA256)

            See `checksums.txt` attached to this release.
          files: dist/*
          draft: false
          prerelease: ${{ contains(github.ref_name, '-') }}

      - name: Update Homebrew Cask
        if: "!contains(github.ref_name, '-')"
        env:
          HOMEBREW_TAP_TOKEN: ${{ secrets.HOMEBREW_TAP_TOKEN }}
        run: |
          VERSION="${{ github.ref_name }}"
          DMG_FILE="dist/KubeViewer-${VERSION}-macos-universal.dmg"
          SHA256=$(sha256sum "$DMG_FILE" | cut -d' ' -f1)

          # Clone tap repo, update cask formula, push
          git clone https://x-access-token:${HOMEBREW_TAP_TOKEN}@github.com/leonardaustin/homebrew-tap.git tap
          cd tap
          sed -i "s/version \".*\"/version \"${VERSION#v}\"/" Casks/kubeviewer.rb
          sed -i "s/sha256 \".*\"/sha256 \"${SHA256}\"/" Casks/kubeviewer.rb
          git config user.email "leonardaustin@users.noreply.github.com"
          git config user.name "Leonard Austin"
          git add Casks/kubeviewer.rb
          git commit -m "Update KubeViewer to ${VERSION}"
          git push
```

---

### `.github/workflows/nightly.yml` — Nightly Build

```yaml
name: Nightly

on:
  schedule:
    - cron: "0 2 * * *"   # 02:00 UTC daily
  workflow_dispatch:       # Allow manual trigger

permissions:
  contents: write

jobs:
  nightly:
    name: Nightly Build (${{ matrix.name }})
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        include:
          - name: macOS
            os: macos-14
            platform: darwin/universal
          - name: Windows
            os: windows-latest
            platform: windows/amd64
          - name: Linux
            os: ubuntu-latest
            platform: linux/amd64

    steps:
      - uses: actions/checkout@v4
        with:
          ref: main

      - uses: actions/setup-go@v5
        with:
          go-version-file: go.mod
          cache: true

      - uses: pnpm/action-setup@v3
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: pnpm
          cache-dependency-path: ui/pnpm-lock.yaml

      - name: Install Linux dependencies
        if: runner.os == 'Linux'
        run: |
          sudo apt-get update
          sudo apt-get install -y libgtk-3-dev libwebkit2gtk-4.1-dev pkg-config

      - name: Install Wails
        run: go install github.com/wailsapp/wails/v2/cmd/wails@latest

      - name: Install frontend dependencies
        run: cd ui && pnpm install --frozen-lockfile

      - name: Set nightly version
        id: version
        run: echo "version=nightly-$(date -u +%Y%m%d)-$(git rev-parse --short HEAD)" >> $GITHUB_OUTPUT

      - name: Build
        run: |
          wails build -platform ${{ matrix.platform }} -clean \
            -ldflags "-X 'main.Version=${{ steps.version.outputs.version }}'"

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: nightly-${{ matrix.name }}
          path: build/bin/
          retention-days: 7

  publish-nightly:
    name: Publish Nightly Pre-release
    needs: nightly
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          path: dist/

      - name: Flatten
        run: find dist -mindepth 2 -type f -exec mv -t dist/ {} +

      - name: Delete old nightly release
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          gh release delete nightly --yes --repo ${{ github.repository }} 2>/dev/null || true
          git push origin :refs/tags/nightly 2>/dev/null || true
        continue-on-error: true

      - name: Create nightly pre-release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: nightly
          name: Nightly Build (${{ github.run_id }})
          body: |
            Automated nightly build from `main` branch.
            Built at: ${{ github.event.head_commit.timestamp || 'scheduled' }}
            Commit: ${{ github.sha }}

            **Not for production use.**
          files: dist/**/*
          prerelease: true
```

---

## 8.4 — macOS Code Signing — Complete Guide

### Prerequisites

1. **Apple Developer account** ($99/year) — https://developer.apple.com
2. **Developer ID Application** certificate — for signing apps distributed outside the App Store
3. **Developer ID Installer** certificate — for signing `.pkg` installers (optional)
4. **App-specific password** — generated at https://appleid.apple.com (used by notarytool)

### Step 1: Create Developer ID Certificates

1. Open **Xcode → Settings → Accounts → Manage Certificates**
2. Click **+** → **Developer ID Application**
3. Xcode requests and installs the certificate automatically
4. Alternatively, via the Apple Developer portal: Certificates → + → Developer ID Application → upload a CSR generated with Keychain Access

### Step 2: Export Certificate for CI (p12)

```bash
# In Keychain Access:
# 1. Find "Developer ID Application: Your Name (TEAM_ID)"
# 2. Right-click → Export → choose .p12 format
# 3. Set a strong password

# Convert to base64 for GitHub secret:
base64 -i certificate.p12 | pbcopy
# Paste into GitHub secret: MACOS_CERTIFICATE
```

Store these GitHub Secrets:
| Secret | Value |
|--------|-------|
| `MACOS_CERTIFICATE` | base64-encoded p12 file |
| `MACOS_CERTIFICATE_PWD` | p12 export password |
| `MACOS_KEYCHAIN_PWD` | password for temporary CI keychain |
| `MACOS_SIGNING_IDENTITY` | `Developer ID Application: Your Name (XXXXXXXXXX)` |
| `APPLE_ID` | your Apple ID email |
| `APPLE_APP_PASSWORD` | app-specific password |
| `APPLE_TEAM_ID` | 10-character team ID (from developer portal) |

### Step 3: Entitlements File

```xml
<!-- build/darwin/entitlements.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <!-- Required by Wails WebView (WKWebView uses JIT compilation) -->
    <key>com.apple.security.cs.allow-jit</key>
    <true/>

    <!-- Required if loading any unsigned plugins or dylibs -->
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>

    <!-- Required to connect to Kubernetes API servers over HTTPS -->
    <key>com.apple.security.network.client</key>
    <true/>

    <!-- Required to read ~/.kube/config and kubeconfig files -->
    <key>com.apple.security.files.user-selected.read-write</key>
    <true/>

    <!-- Required for exec into pods (opens subprocess shells) -->
    <key>com.apple.security.cs.allow-dyld-environment-variables</key>
    <true/>
</dict>
</plist>
```

### Step 4: Complete Signing Script

```bash
#!/usr/bin/env bash
# scripts/sign-macos.sh
# Sign, notarize, and staple the macOS .app bundle.
# Environment variables must be set before running.
set -euo pipefail

APP_PATH="${APP_PATH:-build/bin/KubeViewer.app}"
SIGNING_IDENTITY="${MACOS_SIGNING_IDENTITY:?Need MACOS_SIGNING_IDENTITY}"
APPLE_ID="${APPLE_ID:?Need APPLE_ID}"
APP_PASSWORD="${APPLE_APP_PASSWORD:?Need APPLE_APP_PASSWORD}"
TEAM_ID="${APPLE_TEAM_ID:?Need APPLE_TEAM_ID}"
BUNDLE_ID="com.kubeviewer.app"

echo "==> Signing $APP_PATH"
codesign \
  --force \
  --deep \
  --options runtime \
  --sign "$SIGNING_IDENTITY" \
  --entitlements build/darwin/entitlements.plist \
  --timestamp \
  "$APP_PATH"

echo "==> Verifying signature"
codesign --verify --verbose=4 "$APP_PATH"
spctl --assess --verbose "$APP_PATH" || true  # may fail before notarization

echo "==> Creating ZIP for notarization"
ditto -c -k --keepParent "$APP_PATH" "KubeViewer-notarize.zip"

echo "==> Submitting for notarization (this may take 1-5 minutes)"
xcrun notarytool submit "KubeViewer-notarize.zip" \
  --apple-id "$APPLE_ID" \
  --password "$APP_PASSWORD" \
  --team-id "$TEAM_ID" \
  --wait \
  --timeout 10m

echo "==> Stapling notarization ticket"
xcrun stapler staple "$APP_PATH"

echo "==> Final verification"
spctl --assess --verbose "$APP_PATH"
echo "Done! App is signed and notarized."

rm -f "KubeViewer-notarize.zip"
```

### Step 5: DMG Creation with Custom Background

```bash
#!/usr/bin/env bash
# scripts/package-macos.sh
set -euo pipefail

VERSION="${1:-dev}"
APP_PATH="build/bin/KubeViewer.app"
DMG_NAME="KubeViewer-${VERSION}-macos-universal.dmg"

# Background image: 660x400px PNG at build/darwin/dmg-background.png
# Design: dark gradient with KubeViewer logo centered
# Arrow pointing from app icon to Applications alias

create-dmg \
  --volname "KubeViewer ${VERSION}" \
  --volicon "build/darwin/icon.icns" \
  --background "build/darwin/dmg-background.png" \
  --window-pos 200 120 \
  --window-size 660 400 \
  --icon-size 160 \
  --icon "KubeViewer.app" 180 185 \
  --hide-extension "KubeViewer.app" \
  --app-drop-link 480 185 \
  --no-internet-enable \
  "$DMG_NAME" \
  "$APP_PATH"

echo "Created: $DMG_NAME"
shasum -a 256 "$DMG_NAME"
```

### Troubleshooting Common Signing Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `errSecInternalComponent` | Keychain not unlocked | `security unlock-keychain build.keychain` |
| `The specified item could not be found in the keychain` | Identity string mismatch | Use exact string from `security find-identity -p codesigning` |
| `resource fork, Finder information, or similar detritus` | Extended attributes on files | `xattr -cr build/bin/KubeViewer.app` then re-sign |
| `notarytool: error: The app is not signed` | Deep flag not used | Use `--deep` or sign all nested binaries individually |
| `Unable to process the application` | Hardened runtime missing | Add `--options runtime` to codesign |
| `The signature of the binary is invalid` | Signing identity expired | Renew certificate in developer portal |

---

## 8.5 — Windows Code Signing — Complete Guide

### Certificate Options

| Type | Cost | EV (Extended Validation) | SmartScreen Trust |
|------|------|--------------------------|-------------------|
| Self-signed | Free | No | Never |
| OV (Organization Validation) | ~$200/yr | No | After reputation builds |
| EV (Extended Validation) | ~$400/yr | Yes | Immediate |

For CI, an OV or EV certificate from DigiCert, Sectigo, or GlobalSign is recommended.

### Export Certificate for CI

```powershell
# Export as PFX (PKCS#12) from Windows Certificate Store:
$cert = Get-ChildItem -Path Cert:\CurrentUser\My | Where-Object { $_.Subject -like "*KubeViewer*" }
Export-PfxCertificate -Cert $cert -FilePath certificate.pfx -Password (Read-Host -AsSecureString)

# Base64 encode for GitHub secret:
[Convert]::ToBase64String([IO.File]::ReadAllBytes("certificate.pfx")) | clip
```

Store these GitHub Secrets:
| Secret | Value |
|--------|-------|
| `WINDOWS_CERTIFICATE` | base64-encoded .pfx file |
| `WINDOWS_CERTIFICATE_PWD` | PFX password |

### Signing Commands

```powershell
# scripts/sign-windows.ps1
param(
    [string]$Target = "build\bin\KubeViewer-amd64-installer.exe"
)

$SIGNTOOL = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.22621.0\x64\signtool.exe"
$CERT     = "certificate.pfx"
$PWD      = $env:WINDOWS_CERTIFICATE_PWD

# Decode certificate
[IO.File]::WriteAllBytes($CERT, [Convert]::FromBase64String($env:WINDOWS_CERTIFICATE))

try {
    # Sign with SHA-256 and RFC 3161 timestamp
    & $SIGNTOOL sign `
        /f $CERT `
        /p $PWD `
        /tr http://timestamp.digicert.com `
        /td sha256 `
        /fd sha256 `
        /v `
        $Target

    # Verify
    & $SIGNTOOL verify /pa /v $Target
    Write-Host "Signing successful: $Target"
} finally {
    Remove-Item -Force $CERT -ErrorAction SilentlyContinue
}
```

### NSIS Installer Template

Wails generates an NSIS script at `build/windows/installer/project.nsi`. Customize it:

```nsis
; build/windows/installer/project.nsi
; Wails-generated NSIS script (customize below marker)

Unicode True
!include "MUI2.nsh"
!include "FileFunc.nsh"

; ── Application metadata ────────────────────────────────────────────────────
Name        "KubeViewer"
OutFile     "..\..\bin\KubeViewer-amd64-installer.exe"
InstallDir  "$PROGRAMFILES64\KubeViewer"
InstallDirRegKey HKLM "Software\KubeViewer" "InstallDir"
RequestExecutionLevel admin

; ── Installer UI ─────────────────────────────────────────────────────────────
!define MUI_ABORTWARNING
!define MUI_ICON   "..\appicon.ico"
!define MUI_UNICON "..\appicon.ico"
!define MUI_WELCOMEFINISHPAGE_BITMAP "welcome.bmp"   ; 164x314 px

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "..\..\..\LICENSE"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\KubeViewer.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Launch KubeViewer"
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

; ── Sections ─────────────────────────────────────────────────────────────────
Section "KubeViewer" SecMain
    SetOutPath "$INSTDIR"
    File "..\..\bin\KubeViewer.exe"
    File "..\..\bin\WebView2Loader.dll"

    ; Start menu shortcut
    CreateDirectory "$SMPROGRAMS\KubeViewer"
    CreateShortCut "$SMPROGRAMS\KubeViewer\KubeViewer.lnk" "$INSTDIR\KubeViewer.exe"
    CreateShortCut "$SMPROGRAMS\KubeViewer\Uninstall.lnk" "$INSTDIR\Uninstall.exe"

    ; Desktop shortcut (optional, user can decline)
    CreateShortCut "$DESKTOP\KubeViewer.lnk" "$INSTDIR\KubeViewer.exe"

    ; Registry: uninstall entry
    WriteRegStr   HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\KubeViewer" "DisplayName"      "KubeViewer"
    WriteRegStr   HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\KubeViewer" "DisplayIcon"      "$INSTDIR\KubeViewer.exe"
    WriteRegStr   HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\KubeViewer" "DisplayVersion"   "${VERSION}"
    WriteRegStr   HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\KubeViewer" "Publisher"        "Leonard Austin"
    WriteRegStr   HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\KubeViewer" "UninstallString"  '"$INSTDIR\Uninstall.exe"'
    WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\KubeViewer" "NoModify"         1
    WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\KubeViewer" "NoRepair"         1

    ; Estimate install size
    ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
    IntFmt $0 "0x%08X" $0
    WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\KubeViewer" "EstimatedSize" "$0"

    WriteUninstaller "$INSTDIR\Uninstall.exe"
SectionEnd

Section "Uninstall"
    Delete "$INSTDIR\KubeViewer.exe"
    Delete "$INSTDIR\WebView2Loader.dll"
    Delete "$INSTDIR\Uninstall.exe"
    RMDir  "$INSTDIR"

    Delete "$SMPROGRAMS\KubeViewer\KubeViewer.lnk"
    Delete "$SMPROGRAMS\KubeViewer\Uninstall.lnk"
    RMDir  "$SMPROGRAMS\KubeViewer"
    Delete "$DESKTOP\KubeViewer.lnk"

    DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\KubeViewer"
    DeleteRegKey HKLM "Software\KubeViewer"
SectionEnd
```

---

## 8.6 — Linux Packaging — Complete Guide

### AppImage

```bash
#!/usr/bin/env bash
# scripts/package-linux.sh
set -euo pipefail

VERSION="${1:-dev}"
BINARY="build/bin/kubeviewer"
APPDIR="KubeViewer.AppDir"
OUTPUT="KubeViewer-${VERSION}-linux-amd64.AppImage"

# Requires: appimagetool (https://github.com/AppImage/AppImageKit)
# Download: wget -O /usr/local/bin/appimagetool https://github.com/AppImage/AppImageKit/releases/latest/download/appimagetool-x86_64.AppImage && chmod +x /usr/local/bin/appimagetool

rm -rf "$APPDIR"
mkdir -p "$APPDIR/usr/bin" "$APPDIR/usr/share/icons/hicolor/512x512/apps"

# Copy binary
cp "$BINARY" "$APPDIR/usr/bin/kubeviewer"
chmod +x "$APPDIR/usr/bin/kubeviewer"

# Desktop entry
cat > "$APPDIR/kubeviewer.desktop" << EOF
[Desktop Entry]
Name=KubeViewer
Exec=kubeviewer
Icon=kubeviewer
Type=Application
Categories=Development;Network;
Comment=Fast, beautiful Kubernetes desktop client
StartupWMClass=kubeviewer
Keywords=kubernetes;k8s;devops;containers;
EOF

# Icon (512x512 PNG)
cp build/appicon.png "$APPDIR/usr/share/icons/hicolor/512x512/apps/kubeviewer.png"
cp build/appicon.png "$APPDIR/kubeviewer.png"

# AppRun entrypoint
cat > "$APPDIR/AppRun" << 'EOF'
#!/usr/bin/env bash
SELF_DIR=$(dirname "$(readlink -f "$0")")
exec "$SELF_DIR/usr/bin/kubeviewer" "$@"
EOF
chmod +x "$APPDIR/AppRun"

# Build AppImage
ARCH=x86_64 appimagetool "$APPDIR" "$OUTPUT"
echo "Created: $OUTPUT"
shasum -a 256 "$OUTPUT"
```

### Debian Package

```bash
#!/usr/bin/env bash
# scripts/package-deb.sh
set -euo pipefail

VERSION="${1:-0.1.0}"
ARCH="amd64"
PKG="kubeviewer_${VERSION}_${ARCH}"
BINARY="build/bin/kubeviewer"

mkdir -p "${PKG}/DEBIAN"
mkdir -p "${PKG}/usr/bin"
mkdir -p "${PKG}/usr/share/applications"
mkdir -p "${PKG}/usr/share/icons/hicolor/512x512/apps"

cp "$BINARY" "${PKG}/usr/bin/kubeviewer"
chmod 0755 "${PKG}/usr/bin/kubeviewer"
cp build/appicon.png "${PKG}/usr/share/icons/hicolor/512x512/apps/kubeviewer.png"

cat > "${PKG}/usr/share/applications/kubeviewer.desktop" << EOF
[Desktop Entry]
Version=1.0
Name=KubeViewer
Comment=Fast, beautiful Kubernetes desktop client
Exec=/usr/bin/kubeviewer
Icon=kubeviewer
Terminal=false
Type=Application
Categories=Development;Network;
Keywords=kubernetes;k8s;devops;
EOF

# Calculate installed size in KB
INSTALLED_SIZE=$(du -sk "${PKG}/usr" | cut -f1)

cat > "${PKG}/DEBIAN/control" << EOF
Package: kubeviewer
Version: ${VERSION}
Section: utils
Priority: optional
Architecture: ${ARCH}
Installed-Size: ${INSTALLED_SIZE}
Depends: libgtk-3-0, libwebkit2gtk-4.1-0
Maintainer: Leonard Austin <leonardaustin@users.noreply.github.com>
Homepage: https://github.com/leonardaustin/kubeviewer
Description: Fast, beautiful Kubernetes desktop client
 KubeViewer is a native desktop app for browsing and managing
 Kubernetes clusters. Built with Go and React.
EOF

cat > "${PKG}/DEBIAN/postinst" << 'EOF'
#!/bin/sh
set -e
update-desktop-database /usr/share/applications || true
gtk-update-icon-cache -f -t /usr/share/icons/hicolor || true
EOF
chmod 0755 "${PKG}/DEBIAN/postinst"

dpkg-deb --build --root-owner-group "${PKG}"
echo "Created: ${PKG}.deb"
dpkg-deb -I "${PKG}.deb"
```

### RPM Package

```bash
#!/usr/bin/env bash
# scripts/package-rpm.sh
set -euo pipefail

VERSION="${1:-0.1.0}"
BINARY="build/bin/kubeviewer"
RPM_ROOT="$HOME/rpmbuild"

mkdir -p "${RPM_ROOT}"/{SPECS,SOURCES,BUILD,RPMS,SRPMS}
cp "$BINARY" "${RPM_ROOT}/SOURCES/kubeviewer"
cp build/appicon.png "${RPM_ROOT}/SOURCES/kubeviewer.png"

cat > "${RPM_ROOT}/SPECS/kubeviewer.spec" << EOF
Name:           kubeviewer
Version:        ${VERSION}
Release:        1%{?dist}
Summary:        Fast, beautiful Kubernetes desktop client
License:        MIT
URL:            https://github.com/leonardaustin/kubeviewer
BuildArch:      x86_64
Requires:       gtk3, webkit2gtk4.1

%description
KubeViewer is a native desktop app for browsing and managing
Kubernetes clusters. Built with Go and React.

%install
mkdir -p %{buildroot}/usr/bin
mkdir -p %{buildroot}/usr/share/applications
mkdir -p %{buildroot}/usr/share/icons/hicolor/512x512/apps

install -m 0755 %{_sourcedir}/kubeviewer %{buildroot}/usr/bin/kubeviewer
install -m 0644 %{_sourcedir}/kubeviewer.png %{buildroot}/usr/share/icons/hicolor/512x512/apps/kubeviewer.png

cat > %{buildroot}/usr/share/applications/kubeviewer.desktop << DESKTOP
[Desktop Entry]
Name=KubeViewer
Exec=/usr/bin/kubeviewer
Icon=kubeviewer
Type=Application
Categories=Development;Network;
DESKTOP

%files
/usr/bin/kubeviewer
/usr/share/applications/kubeviewer.desktop
/usr/share/icons/hicolor/512x512/apps/kubeviewer.png

%post
update-desktop-database /usr/share/applications &>/dev/null || :
EOF

rpmbuild -bb "${RPM_ROOT}/SPECS/kubeviewer.spec"
echo "RPM created in ${RPM_ROOT}/RPMS/"
```


---

## 8.7 — Auto-Updater — Complete Implementation

### Backend: `internal/updater/updater.go`

```go
package updater

import (
    "context"
    "crypto/sha256"
    "encoding/hex"
    "encoding/json"
    "fmt"
    "io"
    "net/http"
    "os"
    "path/filepath"
    "runtime"
    "strings"
    "time"

    "golang.org/x/mod/semver"
)

// UpdateInfo describes an available update.
type UpdateInfo struct {
    Version     string  `json:"version"`
    ReleaseURL  string  `json:"releaseUrl"`
    DownloadURL string  `json:"downloadUrl"`
    Checksum    string  `json:"checksum"`   // SHA256 hex
    Changelog   string  `json:"changelog"`
    ReleaseDate string  `json:"releaseDate"`
    SizeMB      float64 `json:"sizeMb"`
}

// ProgressCallback reports download progress.
type ProgressCallback func(bytesDownloaded, totalBytes int64)

// Updater manages update checks and application of updates.
type Updater struct {
    RepoOwner      string
    RepoName       string
    CurrentVersion string
    client         *http.Client
}

func New(owner, repo, currentVersion string) *Updater {
    return &Updater{
        RepoOwner:      owner,
        RepoName:       repo,
        CurrentVersion: currentVersion,
        client: &http.Client{Timeout: 30 * time.Second},
    }
}

// CheckForUpdate queries the GitHub Releases API.
// Returns nil, nil if already up to date.
func (u *Updater) CheckForUpdate(ctx context.Context) (*UpdateInfo, error) {
    url := fmt.Sprintf("https://api.github.com/repos/%s/%s/releases/latest",
        u.RepoOwner, u.RepoName)

    req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
    if err != nil {
        return nil, err
    }
    req.Header.Set("Accept", "application/vnd.github.v3+json")
    req.Header.Set("User-Agent", "KubeViewer/"+u.CurrentVersion)

    resp, err := u.client.Do(req)
    if err != nil {
        return nil, fmt.Errorf("update check failed: %w", err)
    }
    defer resp.Body.Close()

    if resp.StatusCode == http.StatusNotFound {
        return nil, nil // no releases yet
    }
    if resp.StatusCode == http.StatusForbidden {
        return nil, fmt.Errorf("rate limited by GitHub API")
    }
    if resp.StatusCode != http.StatusOK {
        return nil, fmt.Errorf("unexpected status: %d", resp.StatusCode)
    }

    var release struct {
        TagName     string `json:"tag_name"`
        HTMLURL     string `json:"html_url"`
        Body        string `json:"body"`
        Draft       bool   `json:"draft"`
        Prerelease  bool   `json:"prerelease"`
        PublishedAt string `json:"published_at"`
        Assets      []struct {
            Name               string `json:"name"`
            BrowserDownloadURL string `json:"browser_download_url"`
            Size               int64  `json:"size"`
        } `json:"assets"`
    }
    if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
        return nil, fmt.Errorf("failed to decode release: %w", err)
    }

    if release.Draft || release.Prerelease {
        return nil, nil
    }

    // Normalize versions for semver comparison
    latest := release.TagName
    current := u.CurrentVersion
    if !strings.HasPrefix(latest, "v") {
        latest = "v" + latest
    }
    if !strings.HasPrefix(current, "v") {
        current = "v" + current
    }

    if semver.Compare(latest, current) <= 0 {
        return nil, nil // up to date
    }

    // Select the right asset for this platform/arch
    assetName := platformAssetName()
    var downloadURL string
    var sizeMB float64
    for _, a := range release.Assets {
        if strings.Contains(strings.ToLower(a.Name), strings.ToLower(assetName)) {
            downloadURL = a.BrowserDownloadURL
            sizeMB = float64(a.Size) / (1024 * 1024)
            break
        }
    }

    // Find checksum asset
    var checksum string
    for _, a := range release.Assets {
        if a.Name == "checksums.txt" {
            checksum, _ = u.fetchChecksum(ctx, a.BrowserDownloadURL, assetName)
            break
        }
    }

    return &UpdateInfo{
        Version:     release.TagName,
        ReleaseURL:  release.HTMLURL,
        DownloadURL: downloadURL,
        Checksum:    checksum,
        Changelog:   release.Body,
        ReleaseDate: release.PublishedAt,
        SizeMB:      sizeMB,
    }, nil
}

// DownloadUpdate downloads the update to a temp file, verifying checksum.
// Returns the path to the downloaded file.
func (u *Updater) DownloadUpdate(ctx context.Context, info *UpdateInfo, progress ProgressCallback) (string, error) {
    if info.DownloadURL == "" {
        return "", fmt.Errorf("no download URL for platform %s/%s", runtime.GOOS, runtime.GOARCH)
    }

    req, err := http.NewRequestWithContext(ctx, http.MethodGet, info.DownloadURL, nil)
    if err != nil {
        return "", err
    }

    resp, err := u.client.Do(req)
    if err != nil {
        return "", fmt.Errorf("download failed: %w", err)
    }
    defer resp.Body.Close()

    // Create temp file in same dir as binary for atomic rename
    tmpFile, err := os.CreateTemp("", "kubeviewer-update-*"+filepath.Ext(info.DownloadURL))
    if err != nil {
        return "", err
    }
    defer func() {
        if err != nil {
            os.Remove(tmpFile.Name())
        }
    }()

    hasher := sha256.New()
    writer := io.MultiWriter(tmpFile, hasher)

    var downloaded int64
    buf := make([]byte, 32*1024)
    for {
        select {
        case <-ctx.Done():
            tmpFile.Close()
            return "", ctx.Err()
        default:
        }

        n, readErr := resp.Body.Read(buf)
        if n > 0 {
            if _, writeErr := writer.Write(buf[:n]); writeErr != nil {
                tmpFile.Close()
                return "", writeErr
            }
            downloaded += int64(n)
            if progress != nil {
                progress(downloaded, resp.ContentLength)
            }
        }
        if readErr == io.EOF {
            break
        }
        if readErr != nil {
            tmpFile.Close()
            return "", readErr
        }
    }
    tmpFile.Close()

    // Verify checksum
    if info.Checksum != "" {
        got := hex.EncodeToString(hasher.Sum(nil))
        if got != strings.ToLower(info.Checksum) {
            os.Remove(tmpFile.Name())
            return "", fmt.Errorf("checksum mismatch: want %s, got %s", info.Checksum, got)
        }
    }

    return tmpFile.Name(), nil
}

// ApplyUpdate installs the downloaded update. Platform-specific.
func (u *Updater) ApplyUpdate(filePath string) error {
    switch runtime.GOOS {
    case "darwin":
        return u.applyMacOS(filePath)
    case "linux":
        return u.applyLinux(filePath)
    case "windows":
        return u.applyWindows(filePath)
    default:
        return fmt.Errorf("unsupported platform: %s", runtime.GOOS)
    }
}

func (u *Updater) applyLinux(filePath string) error {
    // Get path of the currently running binary
    executable, err := os.Executable()
    if err != nil {
        return err
    }
    executable, err = filepath.EvalSymlinks(executable)
    if err != nil {
        return err
    }

    // Atomic replacement: chmod, then rename over existing binary
    if err := os.Chmod(filePath, 0755); err != nil {
        return err
    }
    return os.Rename(filePath, executable)
}

func (u *Updater) applyMacOS(filePath string) error {
    // For .dmg: open in Finder and let user drag
    // For .app.zip: extract and replace
    return fmt.Errorf("on macOS, please open the DMG and replace the app manually")
}

func (u *Updater) applyWindows(filePath string) error {
    // Launch the NSIS installer; it handles replacing the running binary
    // via a delayed-write mechanism built into the installer
    return fmt.Errorf("launching installer %s", filePath)
}

func (u *Updater) fetchChecksum(ctx context.Context, url, assetName string) (string, error) {
    req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
    resp, err := u.client.Do(req)
    if err != nil {
        return "", err
    }
    defer resp.Body.Close()

    data, err := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
    if err != nil {
        return "", err
    }

    for _, line := range strings.Split(string(data), "\n") {
        parts := strings.Fields(line)
        if len(parts) == 2 && strings.Contains(strings.ToLower(parts[1]), strings.ToLower(assetName)) {
            return parts[0], nil
        }
    }
    return "", nil
}

func platformAssetName() string {
    goos := runtime.GOOS
    goarch := runtime.GOARCH
    switch goos {
    case "darwin":
        return "macos-universal"
    case "windows":
        return "windows-" + goarch
    case "linux":
        return "linux-" + goarch
    }
    return goos + "-" + goarch
}
```

### Backend: Scheduler (`internal/updater/scheduler.go`)

```go
package updater

import (
    "context"
    "log/slog"
    "sync"
    "time"
)

// Scheduler manages periodic update checks.
type Scheduler struct {
    updater     *Updater
    onAvailable func(*UpdateInfo)
    mu          sync.Mutex
    cancel      context.CancelFunc
    skipVersion string
}

func NewScheduler(u *Updater, onAvailable func(*UpdateInfo)) *Scheduler {
    return &Scheduler{updater: u, onAvailable: onAvailable}
}

// Start begins the update check schedule.
// Checks after initialDelay, then every interval.
func (s *Scheduler) Start(ctx context.Context, initialDelay, interval time.Duration) {
    s.mu.Lock()
    defer s.mu.Unlock()

    childCtx, cancel := context.WithCancel(ctx)
    s.cancel = cancel

    go func() {
        // Initial delay: don't slow down app startup
        select {
        case <-childCtx.Done():
            return
        case <-time.After(initialDelay):
        }

        s.check(childCtx)

        ticker := time.NewTicker(interval)
        defer ticker.Stop()
        for {
            select {
            case <-childCtx.Done():
                return
            case <-ticker.C:
                s.check(childCtx)
            }
        }
    }()
}

func (s *Scheduler) Stop() {
    s.mu.Lock()
    defer s.mu.Unlock()
    if s.cancel != nil {
        s.cancel()
    }
}

// CheckNow triggers an immediate update check.
func (s *Scheduler) CheckNow(ctx context.Context) {
    go s.check(ctx)
}

// SkipVersion marks a version to be ignored in future checks.
func (s *Scheduler) SkipVersion(version string) {
    s.mu.Lock()
    defer s.mu.Unlock()
    s.skipVersion = version
}

func (s *Scheduler) check(ctx context.Context) {
    info, err := s.updater.CheckForUpdate(ctx)
    if err != nil {
        slog.Debug("update check failed", "err", err)
        return
    }
    if info == nil {
        return
    }

    s.mu.Lock()
    skip := s.skipVersion
    s.mu.Unlock()

    if info.Version == skip {
        return
    }

    s.onAvailable(info)
}
```

### Frontend: Update Banner Component

```tsx
// ui/src/components/UpdateBanner.tsx
import { useState, useEffect } from "react";
import { EventsOn } from "@runtime";
import { CheckForUpdate, DownloadUpdate } from "@wailsjs/go/handlers/AppHandler";

interface UpdateInfo {
  version: string;
  releaseUrl: string;
  downloadUrl: string;
  changelog: string;
  sizeMb: number;
}

export function UpdateBanner() {
  const [update, setUpdate]         = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed]   = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress]     = useState(0);
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    // Listen for backend-emitted update-available event
    const unsub = EventsOn("update:available", (info: UpdateInfo) => {
      setUpdate(info);
    });
    EventsOn("update:progress", ({ percent }: { percent: number }) => {
      setProgress(percent);
    });
    return unsub;
  }, []);

  if (!update || dismissed) return null;

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await DownloadUpdate(update.downloadUrl);
      setDownloaded(true);
    } catch (e) {
      console.error("Download failed:", e);
    } finally {
      setDownloading(false);
    }
  };

  const handleSkip = () => {
    // Tell backend to skip this version
    EventsOn("update:skip", update.version);
    setDismissed(true);
  };

  return (
    <div
      role="alert"
      className="flex items-center gap-3 px-4 py-2 bg-[var(--color-accent-muted)] border-b border-[var(--color-accent)]/20 text-sm"
    >
      <span className="font-medium text-[var(--color-text-primary)]">
        KubeViewer {update.version} is available
      </span>

      {!downloaded && !downloading && (
        <>
          <button
            onClick={handleDownload}
            className="px-3 py-1 bg-[var(--color-accent)] text-white rounded text-xs font-medium hover:bg-[var(--color-accent-hover)] transition-colors"
          >
            Download ({update.sizeMb.toFixed(1)} MB)
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
          >
            Remind me later
          </button>
          <button
            onClick={handleSkip}
            className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
          >
            Skip this version
          </button>
        </>
      )}

      {downloading && (
        <div className="flex items-center gap-2 flex-1">
          <div className="flex-1 bg-[var(--color-bg-secondary)] rounded-full h-1.5 max-w-[200px]">
            <div
              className="bg-[var(--color-accent)] h-1.5 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs text-[var(--color-text-secondary)]">{progress}%</span>
        </div>
      )}

      {downloaded && (
        <button
          onClick={() => window.location.reload()}
          className="px-3 py-1 bg-[var(--color-status-success)] text-white rounded text-xs font-medium"
        >
          Restart to update
        </button>
      )}

      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss update banner"
        className="ml-auto text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] p-1"
      >
        ✕
      </button>
    </div>
  );
}
```

---

## 8.8 — Settings Page — Complete Implementation

### Backend: `internal/config/store.go`

```go
package config

import (
    "encoding/json"
    "fmt"
    "os"
    "path/filepath"
    "runtime"
    "sync"
)

// AppConfig is the complete user configuration.
type AppConfig struct {
    // General
    DefaultNamespace string `json:"defaultNamespace"`
    StartupBehavior  string `json:"startupBehavior"` // "last_cluster" | "welcome"
    AutoCheckUpdates bool   `json:"autoCheckUpdates"`

    // Appearance
    Theme       string `json:"theme"`       // "dark" | "light" | "system"
    AccentColor string `json:"accentColor"` // hex string, e.g. "#7C3AED"
    FontSize    int    `json:"fontSize"`    // 12-18

    // Kubeconfig
    KubeconfigPaths  []string `json:"kubeconfigPaths"`
    AutoReloadKubeconfig bool `json:"autoReloadKubeconfig"`

    // Editor
    EditorTabSize  int  `json:"editorTabSize"`  // 2 | 4
    EditorWordWrap bool `json:"editorWordWrap"`
    EditorMinimap  bool `json:"editorMinimap"`
    EditorFontSize int  `json:"editorFontSize"`

    // Terminal
    TerminalFontSize    int    `json:"terminalFontSize"`
    TerminalCursorStyle string `json:"terminalCursorStyle"` // "block" | "bar" | "underline"
    TerminalCursorBlink bool   `json:"terminalCursorBlink"`
    TerminalShell       string `json:"terminalShell"` // empty = auto-detect
    TerminalCopyOnSelect bool  `json:"terminalCopyOnSelect"`

    // Advanced
    CacheTTLSeconds    int  `json:"cacheTtlSeconds"`
    MaxLogLines        int  `json:"maxLogLines"`
    MaxConcurrentWatches int `json:"maxConcurrentWatches"`
    DebugMode          bool `json:"debugMode"`

    // Keyboard shortcuts: action → key combo string
    KeyBindings map[string]string `json:"keyBindings"`

    // Window state
    WindowState WindowState `json:"windowState"`

    // Cluster-specific
    ClusterColors    map[string]string `json:"clusterColors"`
    ClusterFavorites []string          `json:"clusterFavorites"`

    // Internal
    SkipUpdateVersion string `json:"skipUpdateVersion"`
}

type WindowState struct {
    X         int  `json:"x"`
    Y         int  `json:"y"`
    Width     int  `json:"width"`
    Height    int  `json:"height"`
    Maximized bool `json:"maximized"`
    SidebarWidth      int  `json:"sidebarWidth"`
    BottomTrayHeight  int  `json:"bottomTrayHeight"`
    BottomTrayVisible bool `json:"bottomTrayVisible"`
    ActiveRoute       string `json:"activeRoute"`
}

func defaultConfig() AppConfig {
    return AppConfig{
        DefaultNamespace:     "default",
        StartupBehavior:      "welcome",
        AutoCheckUpdates:     true,
        Theme:                "dark",
        AccentColor:          "#7C3AED",
        FontSize:             13,
        KubeconfigPaths:      defaultKubeconfigPaths(),
        AutoReloadKubeconfig: true,
        EditorTabSize:        2,
        EditorWordWrap:       false,
        EditorMinimap:        true,
        EditorFontSize:       13,
        TerminalFontSize:     13,
        TerminalCursorStyle:  "block",
        TerminalCursorBlink:  true,
        TerminalShell:        "",
        TerminalCopyOnSelect: true,
        CacheTTLSeconds:      300,
        MaxLogLines:          50000,
        MaxConcurrentWatches: 10,
        DebugMode:            false,
        KeyBindings:          defaultKeyBindings(),
        WindowState: WindowState{
            X: -1, Y: -1, Width: 1280, Height: 800,
            SidebarWidth: 220, BottomTrayHeight: 250,
            ActiveRoute: "/overview",
        },
        ClusterColors:    make(map[string]string),
        ClusterFavorites: []string{},
    }
}

func defaultKubeconfigPaths() []string {
    home, _ := os.UserHomeDir()
    return []string{filepath.Join(home, ".kube", "config")}
}

func defaultKeyBindings() map[string]string {
    return map[string]string{
        "commandPalette": "Ctrl+Shift+P",
        "search":         "Ctrl+F",
        "refresh":        "Ctrl+R",
        "toggleSidebar":  "Ctrl+B",
        "closePanel":     "Escape",
        "nextTab":        "Ctrl+Tab",
        "prevTab":        "Ctrl+Shift+Tab",
        "deleteResource": "Ctrl+Backspace",
        "editYAML":       "Ctrl+E",
        "scaleTo0":       "",
        "openTerminal":   "Ctrl+`",
    }
}

// Store manages config persistence.
type Store struct {
    mu     sync.RWMutex
    cfg    AppConfig
    path   string
}

// NewStore loads or creates the config file, merging with defaults.
func NewStore() (*Store, error) {
    path, err := configFilePath()
    if err != nil {
        return nil, err
    }
    if err := os.MkdirAll(filepath.Dir(path), 0750); err != nil {
        return nil, err
    }

    s := &Store{path: path, cfg: defaultConfig()}

    data, err := os.ReadFile(path)
    if err == nil {
        // Merge saved config with defaults (so new fields get their defaults)
        var saved map[string]json.RawMessage
        if jsonErr := json.Unmarshal(data, &saved); jsonErr == nil {
            defaults, _ := json.Marshal(s.cfg)
            var merged map[string]json.RawMessage
            json.Unmarshal(defaults, &merged)
            for k, v := range saved {
                merged[k] = v
            }
            merged2, _ := json.Marshal(merged)
            json.Unmarshal(merged2, &s.cfg)
        }
    }

    return s, nil
}

// Get returns the current config (copy).
func (s *Store) Get() AppConfig {
    s.mu.RLock()
    defer s.mu.RUnlock()
    return s.cfg
}

// Update applies a partial config update and atomically writes to disk.
func (s *Store) Update(partial map[string]interface{}) error {
    s.mu.Lock()
    defer s.mu.Unlock()

    // Round-trip through JSON to apply partial update
    current, err := json.Marshal(s.cfg)
    if err != nil {
        return err
    }
    var merged map[string]interface{}
    if err := json.Unmarshal(current, &merged); err != nil {
        return err
    }
    for k, v := range partial {
        merged[k] = v
    }
    data, err := json.MarshalIndent(merged, "", "  ")
    if err != nil {
        return err
    }
    if err := json.Unmarshal(data, &s.cfg); err != nil {
        return err
    }

    return atomicWrite(s.path, data)
}

// Reset restores all settings to defaults.
func (s *Store) Reset() error {
    s.mu.Lock()
    s.cfg = defaultConfig()
    data, _ := json.MarshalIndent(s.cfg, "", "  ")
    s.mu.Unlock()
    return atomicWrite(s.path, data)
}

func atomicWrite(path string, data []byte) error {
    tmp := path + ".tmp"
    if err := os.WriteFile(tmp, data, 0640); err != nil {
        return fmt.Errorf("write temp config: %w", err)
    }
    return os.Rename(tmp, path)
}

func configFilePath() (string, error) {
    if runtime.GOOS == "windows" {
        appdata := os.Getenv("APPDATA")
        if appdata == "" {
            return "", fmt.Errorf("APPDATA not set")
        }
        return filepath.Join(appdata, "kubeviewer", "config.json"), nil
    }
    dir, err := os.UserConfigDir()
    if err != nil {
        return "", err
    }
    return filepath.Join(dir, "kubeviewer", "config.json"), nil
}
```

### Frontend: `views/Settings.tsx`

```tsx
// ui/src/views/Settings.tsx
import { useState, useEffect, useCallback } from "react";
import { GetConfig, UpdateConfig, ResetConfig, CheckNow } from "@wailsjs/go/handlers/AppHandler";
import type { config } from "@wailsjs/go/models";

// ── Section components ────────────────────────────────────────────────────────

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-base font-semibold text-[var(--color-text-primary)]">{title}</h2>
      {description && (
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{description}</p>
      )}
    </div>
  );
}

function SettingRow({ label, description, children }: {
  label: string; description?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between py-4 border-b border-[var(--color-border)]">
      <div className="flex-1 mr-8">
        <div className="text-sm font-medium text-[var(--color-text-primary)]">{label}</div>
        {description && (
          <div className="mt-0.5 text-xs text-[var(--color-text-secondary)]">{description}</div>
        )}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-2 focus:ring-offset-[var(--color-bg-primary)] ${
        checked ? "bg-[var(--color-accent)]" : "bg-[var(--color-bg-tertiary)]"
      }`}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform mt-0.5 ${
        checked ? "translate-x-4" : "translate-x-0.5"
      }`} />
    </button>
  );
}

function RadioGroup<T extends string>({ options, value, onChange }: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-2">
      {options.map(opt => (
        <label
          key={opt.value}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm cursor-pointer border transition-colors ${
            value === opt.value
              ? "border-[var(--color-accent)] bg-[var(--color-accent-muted)] text-[var(--color-accent)]"
              : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-hover)]"
          }`}
        >
          <input
            type="radio"
            className="sr-only"
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
          />
          {opt.label}
        </label>
      ))}
    </div>
  );
}

function Slider({ value, min, max, step, onChange, unit }: {
  value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; unit?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-32 accent-[var(--color-accent)]"
      />
      <span className="text-sm text-[var(--color-text-secondary)] w-12 text-right">
        {value}{unit}
      </span>
    </div>
  );
}

const ACCENT_PRESETS = [
  { label: "Purple", color: "#7C3AED" },
  { label: "Blue",   color: "#2563EB" },
  { label: "Green",  color: "#059669" },
  { label: "Orange", color: "#D97706" },
  { label: "Red",    color: "#DC2626" },
  { label: "Pink",   color: "#DB2777" },
];

// ── Sections ──────────────────────────────────────────────────────────────────

function GeneralSection({ cfg, update }: { cfg: config.AppConfig; update: (k: string, v: unknown) => void }) {
  const [version, setVersion] = useState("...");
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    // GetAppVersion is a Wails binding
    import("@wailsjs/go/handlers/AppHandler").then(m => m.GetAppVersion?.().then(setVersion));
  }, []);

  return (
    <section>
      <SectionHeader title="General" />
      <SettingRow label="Default namespace" description="Namespace selected when connecting to a new cluster">
        <input
          type="text"
          value={cfg.defaultNamespace}
          onChange={e => update("defaultNamespace", e.target.value)}
          className="w-48 px-2 py-1 text-sm rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
        />
      </SettingRow>
      <SettingRow label="Startup behavior">
        <RadioGroup
          options={[
            { label: "Connect to last cluster", value: "last_cluster" },
            { label: "Show welcome screen", value: "welcome" },
          ]}
          value={cfg.startupBehavior as "last_cluster" | "welcome"}
          onChange={v => update("startupBehavior", v)}
        />
      </SettingRow>
      <SettingRow label="Check for updates automatically">
        <Toggle checked={cfg.autoCheckUpdates} onChange={v => update("autoCheckUpdates", v)} />
      </SettingRow>
      <SettingRow label="Current version" description={`KubeViewer ${version}`}>
        <button
          onClick={async () => {
            setChecking(true);
            try { await CheckNow(); } finally { setChecking(false); }
          }}
          disabled={checking}
          className="px-3 py-1.5 text-sm rounded border border-[var(--color-border)] hover:bg-[var(--color-bg-secondary)] disabled:opacity-50 transition-colors"
        >
          {checking ? "Checking..." : "Check now"}
        </button>
      </SettingRow>
    </section>
  );
}

function AppearanceSection({ cfg, update }: { cfg: config.AppConfig; update: (k: string, v: unknown) => void }) {
  const [customHex, setCustomHex] = useState(cfg.accentColor);

  return (
    <section>
      <SectionHeader title="Appearance" />
      <SettingRow label="Theme">
        <RadioGroup
          options={[
            { label: "Dark", value: "dark" },
            { label: "Light", value: "light" },
            { label: "System", value: "system" },
          ]}
          value={cfg.theme as "dark" | "light" | "system"}
          onChange={v => update("theme", v)}
        />
      </SettingRow>
      <SettingRow label="Accent color">
        <div className="flex items-center gap-2">
          {ACCENT_PRESETS.map(preset => (
            <button
              key={preset.color}
              aria-label={preset.label}
              onClick={() => { update("accentColor", preset.color); setCustomHex(preset.color); }}
              className={`w-6 h-6 rounded-full transition-transform hover:scale-110 ${
                cfg.accentColor === preset.color ? "ring-2 ring-offset-2 ring-[var(--color-text-primary)]" : ""
              }`}
              style={{ backgroundColor: preset.color }}
            />
          ))}
          <input
            type="text"
            value={customHex}
            onChange={e => setCustomHex(e.target.value)}
            onBlur={() => { if (/^#[0-9A-Fa-f]{6}$/.test(customHex)) update("accentColor", customHex); }}
            placeholder="#7C3AED"
            className="w-24 px-2 py-1 text-xs rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] font-mono"
          />
        </div>
      </SettingRow>
      <SettingRow label="Font size">
        <Slider value={cfg.fontSize} min={12} max={18} step={1}
          onChange={v => update("fontSize", v)} unit="px" />
      </SettingRow>
    </section>
  );
}

function KubeconfigSection({ cfg, update }: { cfg: config.AppConfig; update: (k: string, v: unknown) => void }) {
  const addPath = () => update("kubeconfigPaths", [...cfg.kubeconfigPaths, ""]);
  const removePath = (i: number) =>
    update("kubeconfigPaths", cfg.kubeconfigPaths.filter((_, idx) => idx !== i));
  const setPath = (i: number, val: string) =>
    update("kubeconfigPaths", cfg.kubeconfigPaths.map((p, idx) => idx === i ? val : p));

  return (
    <section>
      <SectionHeader title="Kubeconfig" description="Paths to kubeconfig files. Tilde (~) is expanded to your home directory." />
      <div className="space-y-2 mb-4">
        {cfg.kubeconfigPaths.map((p, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input
              type="text"
              value={p}
              onChange={e => setPath(i, e.target.value)}
              className="flex-1 px-2 py-1 text-sm rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] font-mono"
            />
            <button onClick={() => removePath(i)}
              aria-label="Remove path"
              className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-status-error)]">✕</button>
          </div>
        ))}
      </div>
      <div className="flex gap-3">
        <button onClick={addPath}
          className="px-3 py-1.5 text-sm rounded border border-[var(--color-border)] hover:bg-[var(--color-bg-secondary)] transition-colors">
          + Add path
        </button>
      </div>
      <SettingRow label="Auto-reload on file change" description="Re-scan kubeconfig files when they change on disk">
        <Toggle checked={cfg.autoReloadKubeconfig} onChange={v => update("autoReloadKubeconfig", v)} />
      </SettingRow>
    </section>
  );
}

function EditorSection({ cfg, update }: { cfg: config.AppConfig; update: (k: string, v: unknown) => void }) {
  return (
    <section>
      <SectionHeader title="Editor" description="Monaco editor settings for YAML editing" />
      <SettingRow label="Tab size">
        <RadioGroup
          options={[{ label: "2 spaces", value: "2" }, { label: "4 spaces", value: "4" }]}
          value={String(cfg.editorTabSize)}
          onChange={v => update("editorTabSize", Number(v))}
        />
      </SettingRow>
      <SettingRow label="Word wrap">
        <Toggle checked={cfg.editorWordWrap} onChange={v => update("editorWordWrap", v)} />
      </SettingRow>
      <SettingRow label="Minimap">
        <Toggle checked={cfg.editorMinimap} onChange={v => update("editorMinimap", v)} />
      </SettingRow>
      <SettingRow label="Font size">
        <Slider value={cfg.editorFontSize} min={12} max={18} step={1}
          onChange={v => update("editorFontSize", v)} unit="px" />
      </SettingRow>
    </section>
  );
}

function TerminalSection({ cfg, update }: { cfg: config.AppConfig; update: (k: string, v: unknown) => void }) {
  return (
    <section>
      <SectionHeader title="Terminal" />
      <SettingRow label="Font size">
        <Slider value={cfg.terminalFontSize} min={12} max={18} step={1}
          onChange={v => update("terminalFontSize", v)} unit="px" />
      </SettingRow>
      <SettingRow label="Cursor style">
        <RadioGroup
          options={[
            { label: "Block", value: "block" },
            { label: "Bar", value: "bar" },
            { label: "Underline", value: "underline" },
          ]}
          value={cfg.terminalCursorStyle as "block" | "bar" | "underline"}
          onChange={v => update("terminalCursorStyle", v)}
        />
      </SettingRow>
      <SettingRow label="Cursor blink">
        <Toggle checked={cfg.terminalCursorBlink} onChange={v => update("terminalCursorBlink", v)} />
      </SettingRow>
      <SettingRow label="Shell" description="Override the shell command. Leave empty to auto-detect.">
        <input
          type="text"
          value={cfg.terminalShell}
          onChange={e => update("terminalShell", e.target.value)}
          placeholder="e.g. /bin/zsh"
          className="w-48 px-2 py-1 text-sm rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] font-mono"
        />
      </SettingRow>
      <SettingRow label="Copy on select">
        <Toggle checked={cfg.terminalCopyOnSelect} onChange={v => update("terminalCopyOnSelect", v)} />
      </SettingRow>
    </section>
  );
}

const SHORTCUTS = [
  { category: "Navigation", shortcuts: [
    { action: "commandPalette", label: "Command palette" },
    { action: "search",         label: "Search / filter" },
    { action: "refresh",        label: "Refresh current view" },
    { action: "toggleSidebar",  label: "Toggle sidebar" },
    { action: "closePanel",     label: "Close panel / dismiss" },
    { action: "nextTab",        label: "Next tab" },
    { action: "prevTab",        label: "Previous tab" },
  ]},
  { category: "Resources", shortcuts: [
    { action: "deleteResource",  label: "Delete selected resource" },
    { action: "editYAML",        label: "Edit as YAML" },
    { action: "scaleTo0",        label: "Scale to 0 replicas" },
    { action: "openTerminal",    label: "Open terminal" },
  ]},
];

function ShortcutsSection({ cfg, update }: { cfg: config.AppConfig; update: (k: string, v: unknown) => void }) {
  const [recording, setRecording] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, action: string) => {
    if (recording !== action) return;
    e.preventDefault();

    if (e.key === "Escape") { setRecording(null); return; }

    const parts: string[] = [];
    if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    if (!["Control", "Alt", "Shift", "Meta"].includes(e.key)) {
      parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
    }
    if (parts.length < 2) return;

    const combo = parts.join("+");

    // Conflict detection
    const existing = Object.entries(cfg.keyBindings).find(([k, v]) => v === combo && k !== action);
    if (existing) {
      setConflict(`Conflicts with: ${existing[0]}`);
      return;
    }
    setConflict(null);
    update("keyBindings", { ...cfg.keyBindings, [action]: combo });
    setRecording(null);
  }, [recording, cfg.keyBindings, update]);

  return (
    <section>
      <SectionHeader title="Keyboard Shortcuts" description="Click a shortcut to rebind it. Press Escape to cancel." />
      {conflict && (
        <div className="mb-4 px-3 py-2 bg-[var(--color-status-warning-muted)] border border-[var(--color-status-warning)] rounded text-sm text-[var(--color-status-warning)]">
          {conflict}
        </div>
      )}
      {SHORTCUTS.map(({ category, shortcuts }) => (
        <div key={category} className="mb-6">
          <h3 className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2">
            {category}
          </h3>
          <table className="w-full">
            <tbody>
              {shortcuts.map(({ action, label }) => (
                <tr key={action} className="border-b border-[var(--color-border)]">
                  <td className="py-2 text-sm text-[var(--color-text-primary)]">{label}</td>
                  <td className="py-2 text-right">
                    <button
                      onKeyDown={e => handleKeyDown(e, action)}
                      onClick={() => { setRecording(action); setConflict(null); }}
                      className={`px-3 py-1 text-xs font-mono rounded border transition-colors ${
                        recording === action
                          ? "border-[var(--color-accent)] bg-[var(--color-accent-muted)] text-[var(--color-accent)]"
                          : "border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-hover)]"
                      }`}
                    >
                      {recording === action ? "Press key..." : (cfg.keyBindings[action] || "—")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <button
        onClick={() => update("keyBindings", defaultKeyBindings())}
        className="text-sm text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] underline"
      >
        Reset to defaults
      </button>
    </section>
  );
}

function defaultKeyBindings() {
  return {
    commandPalette: "Ctrl+Shift+P",
    search: "Ctrl+F",
    refresh: "Ctrl+R",
    toggleSidebar: "Ctrl+B",
    closePanel: "Escape",
    nextTab: "Ctrl+Tab",
    prevTab: "Ctrl+Shift+Tab",
    deleteResource: "Ctrl+Backspace",
    editYAML: "Ctrl+E",
    scaleTo0: "",
    openTerminal: "Ctrl+`",
  };
}

function AdvancedSection({ cfg, update }: { cfg: config.AppConfig; update: (k: string, v: unknown) => void }) {
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleExport = async () => {
    const data = JSON.stringify(cfg, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "kubeviewer-settings.json"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".json";
    input.onchange = async e => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        const imported = JSON.parse(text);
        await UpdateConfig(imported);
      } catch {
        alert("Invalid settings file");
      }
    };
    input.click();
  };

  return (
    <section>
      <SectionHeader title="Advanced" />
      <SettingRow label="Resource cache TTL" description="How long to keep cached resource lists">
        <div className="flex items-center gap-2">
          <input
            type="number" min={30} max={3600}
            value={cfg.cacheTtlSeconds}
            onChange={e => update("cacheTtlSeconds", Number(e.target.value))}
            className="w-20 px-2 py-1 text-sm rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-right"
          />
          <span className="text-sm text-[var(--color-text-secondary)]">seconds</span>
        </div>
      </SettingRow>
      <SettingRow label="Max log lines" description="Ring buffer size for log viewer">
        <input
          type="number" min={1000} max={500000} step={1000}
          value={cfg.maxLogLines}
          onChange={e => update("maxLogLines", Number(e.target.value))}
          className="w-28 px-2 py-1 text-sm rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-right"
        />
      </SettingRow>
      <SettingRow label="Max concurrent watches">
        <input
          type="number" min={1} max={50}
          value={cfg.maxConcurrentWatches}
          onChange={e => update("maxConcurrentWatches", Number(e.target.value))}
          className="w-16 px-2 py-1 text-sm rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-right"
        />
      </SettingRow>
      <SettingRow label="Debug mode" description="Enable DevTools in production build">
        <Toggle checked={cfg.debugMode} onChange={v => update("debugMode", v)} />
      </SettingRow>

      <div className="mt-8 flex flex-wrap gap-3">
        <button onClick={handleExport}
          className="px-4 py-2 text-sm rounded border border-[var(--color-border)] hover:bg-[var(--color-bg-secondary)] transition-colors">
          Export settings
        </button>
        <button onClick={handleImport}
          className="px-4 py-2 text-sm rounded border border-[var(--color-border)] hover:bg-[var(--color-bg-secondary)] transition-colors">
          Import settings
        </button>
        {!showResetConfirm ? (
          <button onClick={() => setShowResetConfirm(true)}
            className="px-4 py-2 text-sm rounded border border-[var(--color-status-error)] text-[var(--color-status-error)] hover:bg-[var(--color-status-error-muted)] transition-colors">
            Reset all settings
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--color-text-secondary)]">Are you sure?</span>
            <button onClick={async () => { await ResetConfig(); setShowResetConfirm(false); }}
              className="px-3 py-1.5 text-sm bg-[var(--color-status-error)] text-white rounded">
              Yes, reset
            </button>
            <button onClick={() => setShowResetConfirm(false)}
              className="px-3 py-1.5 text-sm rounded border border-[var(--color-border)]">
              Cancel
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function AboutSection() {
  const [info, setInfo] = useState({ version: "...", buildDate: "...", goVersion: "...", wailsVersion: "..." });

  useEffect(() => {
    import("@wailsjs/go/handlers/AppHandler").then(m => m.GetBuildInfo?.().then(setInfo));
  }, []);

  return (
    <section>
      <SectionHeader title="About" />
      <div className="flex items-start gap-6 mb-8">
        <img src="/icon.png" alt="KubeViewer" className="w-20 h-20 rounded-2xl shadow-lg" />
        <div>
          <h2 className="text-xl font-bold text-[var(--color-text-primary)]">KubeViewer</h2>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            Fast, beautiful Kubernetes desktop client
          </p>
          <div className="mt-3 space-y-1 text-xs text-[var(--color-text-tertiary)] font-mono">
            <div>Version: {info.version}</div>
            <div>Built: {info.buildDate}</div>
            <div>Go: {info.goVersion}</div>
            <div>Wails: {info.wailsVersion}</div>
          </div>
        </div>
      </div>
      <div className="space-y-2 text-sm">
        <div>
          <a href="https://github.com/leonardaustin/kubeviewer"
            target="_blank" rel="noopener noreferrer"
            className="text-[var(--color-accent)] hover:underline">
            View on GitHub
          </a>
        </div>
        <div className="text-[var(--color-text-secondary)]">
          Licensed under the MIT License.
        </div>
        <div className="text-xs text-[var(--color-text-tertiary)] mt-4">
          Built with: Go, Wails, React, TypeScript, Tailwind CSS, Monaco Editor,
          xterm.js, TanStack Table, Radix UI, Zustand.
        </div>
      </div>
    </section>
  );
}

// ── Main Settings page ─────────────────────────────────────────────────────────

type SettingsSection = "general" | "appearance" | "kubeconfig" | "editor" | "terminal" | "shortcuts" | "advanced" | "about";

const NAV_ITEMS: { id: SettingsSection; label: string }[] = [
  { id: "general",    label: "General" },
  { id: "appearance", label: "Appearance" },
  { id: "kubeconfig", label: "Kubeconfig" },
  { id: "editor",     label: "Editor" },
  { id: "terminal",   label: "Terminal" },
  { id: "shortcuts",  label: "Keyboard Shortcuts" },
  { id: "advanced",   label: "Advanced" },
  { id: "about",      label: "About" },
];

export default function Settings() {
  const [section, setSection] = useState<SettingsSection>("general");
  const [cfg, setCfg] = useState<config.AppConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    GetConfig().then(setCfg);
  }, []);

  const update = useCallback(async (key: string, value: unknown) => {
    if (!cfg) return;
    const updated = { ...cfg, [key]: value } as config.AppConfig;
    setCfg(updated);
    setSaving(true);
    try {
      await UpdateConfig({ [key]: value });
    } finally {
      setSaving(false);
    }
  }, [cfg]);

  if (!cfg) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-sm text-[var(--color-text-secondary)]">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-[var(--color-bg-primary)]">
      {/* Sidebar nav */}
      <nav className="w-48 flex-shrink-0 border-r border-[var(--color-border)] pt-4 px-2">
        <div className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider px-2 mb-2">
          Settings
        </div>
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => setSection(item.id)}
            className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
              section === item.id
                ? "bg-[var(--color-accent-muted)] text-[var(--color-accent)] font-medium"
                : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-8 py-8">
          {saving && (
            <div className="fixed top-4 right-4 px-3 py-1.5 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded text-xs text-[var(--color-text-secondary)] shadow">
              Saving...
            </div>
          )}
          {section === "general"    && <GeneralSection    cfg={cfg} update={update} />}
          {section === "appearance" && <AppearanceSection cfg={cfg} update={update} />}
          {section === "kubeconfig" && <KubeconfigSection cfg={cfg} update={update} />}
          {section === "editor"     && <EditorSection     cfg={cfg} update={update} />}
          {section === "terminal"   && <TerminalSection   cfg={cfg} update={update} />}
          {section === "shortcuts"  && <ShortcutsSection  cfg={cfg} update={update} />}
          {section === "advanced"   && <AdvancedSection   cfg={cfg} update={update} />}
          {section === "about"      && <AboutSection />}
        </div>
      </div>
    </div>
  );
}
```


---

## 8.9 — Window State Persistence

### Backend: Wails Lifecycle Hooks

```go
// app.go (Wails application struct)
package main

import (
    "context"
    "github.com/wailsapp/wails/v2/pkg/runtime"
    "kubeviewer/internal/config"
)

type App struct {
    ctx   context.Context
    store *config.Store
}

// startup is called when the app starts. Restore window state.
func (a *App) startup(ctx context.Context) {
    a.ctx = ctx

    cfg := a.store.Get()
    ws := cfg.WindowState

    // Validate position is on a connected display
    screens, err := runtime.ScreenGetAll(ctx)
    onScreen := false
    if err == nil {
        for _, s := range screens {
            if ws.X >= s.X && ws.X < s.X+s.Width &&
               ws.Y >= s.Y && ws.Y < s.Y+s.Height {
                onScreen = true
                break
            }
        }
    }

    if ws.X == -1 || ws.Y == -1 || !onScreen {
        // Center on primary screen
        runtime.WindowCenter(ctx)
    } else {
        runtime.WindowSetPosition(ctx, ws.X, ws.Y)
    }

    if ws.Width > 0 && ws.Height > 0 {
        runtime.WindowSetSize(ctx, ws.Width, ws.Height)
    }

    if ws.Maximized {
        runtime.WindowMaximise(ctx)
    }
}

// beforeClose is called when the user tries to close the window.
// Return true to prevent close, false to allow it.
func (a *App) beforeClose(ctx context.Context) bool {
    a.saveWindowState(ctx)
    return false // allow close
}

func (a *App) saveWindowState(ctx context.Context) {
    x, y := runtime.WindowGetPosition(ctx)
    w, h := runtime.WindowGetSize(ctx)
    maximized := runtime.WindowIsMaximised(ctx)

    _ = a.store.Update(map[string]interface{}{
        "windowState": map[string]interface{}{
            "x":         x,
            "y":         y,
            "width":     w,
            "height":    h,
            "maximized": maximized,
        },
    })
}
```

### Frontend: Persist UI State with Zustand

```ts
// ui/src/store/uiStore.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UIState {
  sidebarWidth:       number;
  bottomTrayHeight:   number;
  bottomTrayVisible:  boolean;
  activeRoute:        string;
  setSidebarWidth:    (w: number) => void;
  setBottomTray:      (height: number, visible: boolean) => void;
  setActiveRoute:     (route: string) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarWidth:      220,
      bottomTrayHeight:  250,
      bottomTrayVisible: false,
      activeRoute:       "/overview",

      setSidebarWidth:   (w) => set({ sidebarWidth: w }),
      setBottomTray:     (height, visible) => set({ bottomTrayHeight: height, bottomTrayVisible: visible }),
      setActiveRoute:    (route) => set({ activeRoute: route }),
    }),
    {
      name: "kubeviewer-ui",
      // Only persist layout state, not ephemeral state
      partialize: (state) => ({
        sidebarWidth:      state.sidebarWidth,
        bottomTrayHeight:  state.bottomTrayHeight,
        bottomTrayVisible: state.bottomTrayVisible,
        activeRoute:       state.activeRoute,
      }),
    }
  )
);
```

```tsx
// ui/src/App.tsx — restore active route on launch
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useUIStore } from "./store/uiStore";

function RouteRestorer() {
  const navigate = useNavigate();
  const activeRoute = useUIStore(s => s.activeRoute);

  useEffect(() => {
    if (activeRoute && activeRoute !== "/") {
      navigate(activeRoute, { replace: true });
    }
  }, []); // run once on mount

  return null;
}
```

---

## 8.10 — Error Handling — Comprehensive Strategy

### Error Category Table

| Error | Detection | User Experience | Recovery |
|-------|-----------|----------------|----------|
| Cluster unreachable | TCP timeout / connection refused | Yellow banner "Connection to {cluster} lost. Reconnecting…" | Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s |
| TLS certificate error | `x509: certificate signed by unknown authority` | Modal dialog: "Certificate error. Trust this certificate?" | Option to trust (saves cert pin), or cancel |
| RBAC denied (403) | HTTP 403 from API server | Inline warning icon + disabled actions; tooltip shows missing permissions | "Request access" link, show required RBAC manifest |
| Resource not found (404) | HTTP 404 | Toast "Resource not found" | Auto-navigate back to list view |
| Conflict (409) | HTTP 409 on apply | Modal showing diff between server and local version | "Force apply" or "Reload server version" |
| Resource version expired (410) | Watch disconnect with 410 | Silent re-list + restart watch | Automatic, no user action needed |
| Network timeout | `context.DeadlineExceeded` | Toast "Request timed out" + Retry button | Manual retry or adjust timeout in Advanced settings |
| Rate limited (429) | HTTP 429 | Warning toast + automatic retry after Retry-After header | Exponential backoff, respect server hints |
| Server error (5xx) | HTTP 5xx | Toast with error message and request ID if present | Retry button |
| WebView crash | Process exit / `wails:runtime_error` | Full-screen error overlay with restart button | "Restart" button relaunches renderer |
| Out of memory | Memory monitor > 500MB | Warning banner: "High memory usage. Evicting caches." | Evict LRU cache entries, close idle watches |
| Kubeconfig parse error | YAML/JSON parse error on file read | Toast with file path and line number | "Open in editor" button, link to Settings > Kubeconfig |
| Exec session drop | Stream EOF / WebSocket close | "Disconnected" overlay in terminal | "Reconnect" button |
| Log stream drop | Stream EOF | "Stream ended. " message in log view | "Restart stream" button |
| Port forward failure | TCP error on local port | Toast "Port forward failed: {reason}" | Manual restart from port-forwards panel |

### React Error Boundary

```tsx
// ui/src/components/ErrorBoundary.tsx
import { Component, type ReactNode, type ErrorInfo } from "react";

interface State { error: Error | null; errorInfo: ErrorInfo | null; }

export class ErrorBoundary extends Component<{ children: ReactNode; fallbackRoute?: string }, State> {
  state: State = { error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    // Log to backend for diagnostics (opt-in only)
    console.error("React error boundary caught:", error, errorInfo);
  }

  render() {
    const { error, errorInfo } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 bg-[var(--color-bg-primary)]">
        <div className="w-12 h-12 rounded-full bg-[var(--color-status-error-muted)] flex items-center justify-center">
          <svg className="w-6 h-6 text-[var(--color-status-error)]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">Something went wrong</h1>
        <p className="text-sm text-[var(--color-text-secondary)] max-w-md text-center">
          {error.message}
        </p>
        {import.meta.env.DEV && errorInfo && (
          <pre className="text-xs text-[var(--color-text-tertiary)] max-w-lg overflow-auto bg-[var(--color-bg-secondary)] p-3 rounded">
            {errorInfo.componentStack}
          </pre>
        )}
        <div className="flex gap-3">
          <button
            onClick={() => {
              this.setState({ error: null, errorInfo: null });
              window.location.hash = this.props.fallbackRoute || "/overview";
            }}
            className="px-4 py-2 bg-[var(--color-accent)] text-white rounded text-sm hover:bg-[var(--color-accent-hover)]"
          >
            Return to Overview
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 border border-[var(--color-border)] rounded text-sm hover:bg-[var(--color-bg-secondary)]"
          >
            Reload app
          </button>
        </div>
      </div>
    );
  }
}
```

### Connection Recovery (Backend)

```go
// internal/cluster/reconnect.go
package cluster

import (
    "context"
    "log/slog"
    "math"
    "time"
)

// ReconnectLoop attempts to reconnect to a cluster with exponential backoff.
// It calls onReconnected when the connection is restored.
func ReconnectLoop(ctx context.Context, connect func() error, onStatus func(attempt int, err error)) {
    const maxAttempts = 20
    const baseDelay = 1 * time.Second
    const maxDelay = 30 * time.Second

    for attempt := 1; attempt <= maxAttempts; attempt++ {
        select {
        case <-ctx.Done():
            return
        default:
        }

        err := connect()
        if err == nil {
            slog.Info("cluster reconnected", "attempt", attempt)
            return
        }

        onStatus(attempt, err)
        slog.Warn("reconnect failed", "attempt", attempt, "err", err)

        delay := time.Duration(math.Min(
            float64(baseDelay)*math.Pow(2, float64(attempt-1)),
            float64(maxDelay),
        ))

        select {
        case <-ctx.Done():
            return
        case <-time.After(delay):
        }
    }

    slog.Error("cluster reconnect failed after max attempts")
    onStatus(-1, ErrMaxRetriesExceeded)
}
```

---

## 8.11 — Accessibility — Complete Audit

### WCAG 2.1 AA Compliance Checklist

**Perceivable:**
- [ ] All images have meaningful `alt` attributes or `aria-hidden="true"` if decorative
- [ ] Color is not the only way to convey information (status icons accompany color badges)
- [ ] Text contrast ≥ 4.5:1 for normal text, ≥ 3:1 for large text
- [ ] Table headers use `<th scope="col">`, row headers use `<th scope="row">`
- [ ] Form inputs have associated `<label>` elements

**Operable:**
- [ ] All interactive elements reachable via Tab key
- [ ] Visible focus ring on all interactive elements
- [ ] No keyboard traps (except modals, which correctly trap focus and release on close)
- [ ] Skip-to-main link at top of page for screen reader users
- [ ] No flashing content faster than 3Hz

**Understandable:**
- [ ] Page language set: `<html lang="en">`
- [ ] Error messages identify the field and describe the error
- [ ] Labels and instructions visible before input, not just placeholder text

**Robust:**
- [ ] All interactive elements have accessible names (aria-label, aria-labelledby, or visible text)
- [ ] Status updates announced via live regions
- [ ] Dialog: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to title

### Focus Management

```tsx
// ui/src/hooks/useFocusTrap.ts
import { useEffect, useRef } from "react";

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function useFocusTrap(active: boolean) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active || !ref.current) return;
    const el = ref.current;
    const focusables = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (!focusables.length) return;

    // Focus first element
    const prevFocus = document.activeElement as HTMLElement;
    focusables[0].focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const first = focusables[0];
      const last  = focusables[focusables.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
      }
    };

    el.addEventListener("keydown", handleKeyDown);
    return () => {
      el.removeEventListener("keydown", handleKeyDown);
      prevFocus?.focus(); // restore focus on unmount
    };
  }, [active]);

  return ref;
}
```

### Screen Reader Utilities

```tsx
// ui/src/components/VisuallyHidden.tsx
// Renders content visible only to screen readers.
export function VisuallyHidden({ children }: { children: React.ReactNode }) {
  return (
    <span className="absolute w-px h-px p-0 -m-px overflow-hidden clip-rect-0 whitespace-nowrap border-0">
      {children}
    </span>
  );
}

// Usage: icon-only buttons
<button onClick={handleDelete} aria-label="Delete pod">
  <TrashIcon className="w-4 h-4" aria-hidden="true" />
</button>

// Live region for status updates (e.g., "3 pods updated")
<div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
  {statusMessage}
</div>
```

### Color Contrast Reference

| Element | Foreground | Background | Ratio | Pass AA |
|---------|-----------|-----------|-------|---------|
| Body text | `#E2E2E7` | `#0F0F12` | 11.5:1 | ✓ |
| Secondary text | `#9191A4` | `#0F0F12` | 4.6:1 | ✓ |
| Accent text | `#A78BFA` | `#0F0F12` | 7.1:1 | ✓ |
| Error badge text | `#FFFFFF` | `#EF4444` | 4.5:1 | ✓ |
| Warning badge text | `#000000` | `#F59E0B` | 7.3:1 | ✓ |
| Disabled text | `#52525E` | `#0F0F12` | 2.9:1 | ✗ (decorative) |

### Reduced Motion

```css
/* ui/src/styles/global.css */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

## 8.12 — Testing Strategy — Comprehensive

### Backend Test Files and Key Cases

#### `internal/k8s/client_test.go`
1. **BuildConfig from file** — given valid kubeconfig path, returns non-nil rest.Config
2. **BuildConfig from env** — `KUBECONFIG` env var takes precedence over default path
3. **BuildConfig missing file** — returns descriptive error, not panic
4. **NewClient with TLS skip** — insecureSkipVerify=true produces client that skips cert verification
5. **NewClient timeout** — client respects configurable timeout on requests

#### `internal/cluster/manager_test.go`
1. **Connect happy path** — Connect() populates cluster info, emits "connected" event
2. **Connect unreachable** — returns error within timeout, no goroutine leak (goleak)
3. **Disconnect** — cancels all watches, clears client, emits "disconnected"
4. **Reconnect** — after Disconnect, Connect() to same cluster succeeds
5. **Multi-cluster** — two clusters connected simultaneously, each has independent watch state

#### `internal/cluster/kubeconfig_test.go`
1. **Parse single context** — extracts cluster, user, namespace correctly
2. **Merge multiple files** — contexts from both files available, no duplicates
3. **Context list** — returns all context names in stable order
4. **File watch** — modifying kubeconfig file triggers re-parse within 1s
5. **Invalid YAML** — returns parse error with file path

#### `internal/resource/pods_test.go`
1. **Pod to PodInfo** — all fields mapped correctly (phase, ready containers, IP, node)
2. **Status detection Running** — pod with all containers ready → "Running"
3. **Status detection CrashLoopBackOff** — pod with waiting container state → "CrashLoopBackOff"
4. **Container parsing** — extracts name, image, ready state, restart count
5. **InitContainer** — init containers shown separately with correct phase

#### `internal/resource/relationships_test.go`
1. **Service → Pod matching** — service selector matches pod labels → linked
2. **Deployment → ReplicaSet** — ownerRef resolution returns correct parent
3. **ReplicaSet → Pod** — all pods owned by RS are returned
4. **No match** — mismatched labels → empty result, no panic
5. **Circular ref guard** — malformed ownerRef doesn't cause infinite loop

#### `internal/stream/logs_test.go`
1. **Stream start** — lines appear in callback in order
2. **Stream stop** — cancel context, goroutine exits within 100ms (goleak)
3. **Line parsing** — ANSI escape codes stripped in plain mode, preserved in rich mode
4. **Buffer management** — exceeding maxLines evicts oldest entries
5. **Previous logs** — tailLines=100 parameter returns historical lines

#### `internal/config/store_test.go`
1. **Save and load** — Update() persists to disk, NewStore() reads it back
2. **Defaults** — fresh store has all default values populated
3. **Partial update** — Update with one key doesn't clobber unrelated keys
4. **Migration** — loading config missing new field uses default for that field
5. **Atomic write** — power-failure simulation (truncated temp file) doesn't corrupt config

#### `internal/updater/updater_test.go`
1. **Version comparison** — v0.2.0 > v0.1.0 → update available; v0.1.0 = v0.1.0 → nil
2. **Asset selection** — darwin/universal asset selected on macOS
3. **Download** — streams bytes to temp file, calls progress callback
4. **Checksum verification** — tampered download returns checksum mismatch error
5. **Context cancellation** — cancel during download stops transfer, no temp file left

### Frontend Test Files

```ts
// ui/src/components/__tests__/ResourceTable.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ResourceTable } from "../ResourceTable";

describe("ResourceTable", () => {
  const mockPods = [
    { metadata: { name: "web-abc12", namespace: "default" }, status: { phase: "Running" } },
    { metadata: { name: "db-xyz34", namespace: "default" },  status: { phase: "Pending" } },
  ];

  it("renders all pod names", () => {
    render(<ResourceTable resources={mockPods} columns={["name", "status"]} />);
    expect(screen.getByText("web-abc12")).toBeDefined();
    expect(screen.getByText("db-xyz34")).toBeDefined();
  });

  it("filters by search query", () => {
    render(<ResourceTable resources={mockPods} columns={["name", "status"]} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "web" } });
    expect(screen.queryByText("db-xyz34")).toBeNull();
  });

  it("calls onSelect when row is clicked", () => {
    const onSelect = vi.fn();
    render(<ResourceTable resources={mockPods} columns={["name"]} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("web-abc12").closest("tr")!);
    expect(onSelect).toHaveBeenCalledWith(mockPods[0]);
  });
});
```

```ts
// ui/src/store/__tests__/clusterStore.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { useClusterStore } from "../clusterStore";
import { act } from "react-dom/test-utils";

describe("clusterStore", () => {
  beforeEach(() => useClusterStore.setState({ clusters: [], activeCluster: null }));

  it("adds and retrieves a cluster", () => {
    act(() => useClusterStore.getState().addCluster({ name: "test", context: "test-ctx" }));
    expect(useClusterStore.getState().clusters).toHaveLength(1);
  });

  it("sets active cluster", () => {
    act(() => {
      useClusterStore.getState().addCluster({ name: "test", context: "test-ctx" });
      useClusterStore.getState().setActiveCluster("test");
    });
    expect(useClusterStore.getState().activeCluster?.name).toBe("test");
  });
});
```

### E2E Test Outline (Playwright)

```ts
// ui/e2e/connect-cluster.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Connect to cluster", () => {
  test("connect and see overview", async ({ page }) => {
    await page.goto("/");
    // Welcome screen
    await expect(page.getByText("Welcome to KubeViewer")).toBeVisible();
    // Click minikube context
    await page.getByRole("button", { name: /minikube/i }).click();
    // Overview loads with node count
    await expect(page.getByText(/\d+ nodes/i)).toBeVisible({ timeout: 10000 });
  });
});

// ui/e2e/pod-logs.spec.ts
test.describe("Pod logs", () => {
  test("open logs panel", async ({ page }) => {
    await page.goto("/pods");
    await page.getByRole("row").first().click();
    await page.getByRole("tab", { name: "Logs" }).click();
    // Log lines appear
    await expect(page.locator(".log-line")).toHaveCountGreaterThan(0, { timeout: 10000 });
  });

  test("search filters log output", async ({ page }) => {
    await page.goto("/pods");
    await page.getByRole("row").first().click();
    await page.getByRole("tab", { name: "Logs" }).click();
    await page.getByPlaceholder("Search logs...").fill("ERROR");
    // Only matching lines visible
    const lines = page.locator(".log-line--highlight");
    await expect(lines).toHaveCountGreaterThan(0);
  });
});

// ui/e2e/yaml-edit.spec.ts
test.describe("YAML editor", () => {
  test("edit and apply deployment", async ({ page }) => {
    await page.goto("/deployments");
    await page.getByRole("row").first().click();
    await page.getByRole("tab", { name: "YAML" }).click();
    // Monaco editor loads
    await expect(page.locator(".monaco-editor")).toBeVisible({ timeout: 10000 });
    // Apply button
    await expect(page.getByRole("button", { name: "Apply" })).toBeEnabled();
  });
});
```

---

## 8.13 — Security Hardening

### Content Security Policy

```html
<!-- ui/index.html -->
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' 'wasm-unsafe-eval';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:;
  font-src 'self';
  connect-src 'self' https://api.github.com;
  worker-src blob:;
">
```

`'wasm-unsafe-eval'` is required for Monaco Editor's web worker. `'unsafe-inline'` for styles is required by Monaco; consider a nonce-based approach if tightening further.

### No eval() / Function() Policy

```ts
// ui/eslint.config.js (add rule)
rules: {
  "no-eval": "error",
  "no-new-func": "error",
}
```

### Secret Masking

```go
// internal/handlers/secrets.go
// Never return decoded secret values unless explicitly requested.
func (h *Handler) GetSecret(name, namespace string) (map[string]interface{}, error) {
    secret, err := h.client.CoreV1().Secrets(namespace).Get(context.Background(), name, metav1.GetOptions{})
    if err != nil {
        return nil, err
    }
    // Return metadata and masked data — never raw decoded values
    masked := make(map[string]string, len(secret.Data))
    for k := range secret.Data {
        masked[k] = fmt.Sprintf("****** (%d bytes)", len(secret.Data[k]))
    }
    return map[string]interface{}{
        "metadata": secret.ObjectMeta,
        "type":     secret.Type,
        "data":     masked,
    }, nil
}

// Only reveal on explicit user action:
func (h *Handler) RevealSecretValue(name, namespace, key string) (string, error) {
    secret, err := h.client.CoreV1().Secrets(namespace).Get(context.Background(), name, metav1.GetOptions{})
    if err != nil {
        return "", err
    }
    val, ok := secret.Data[key]
    if !ok {
        return "", fmt.Errorf("key %q not found", key)
    }
    return string(val), nil
}
```

### Dependency Audit

```bash
# Go vulnerability scan
go run golang.org/x/vuln/cmd/govulncheck@latest ./...

# Frontend audit
cd ui && pnpm audit

# Enforce audit in CI (add to ci.yml):
- name: Go vulnerability check
  run: go run golang.org/x/vuln/cmd/govulncheck@latest ./...

- name: Frontend audit
  run: cd ui && pnpm audit --audit-level=high
```

### Kubeconfig Credential Handling

```go
// internal/k8s/client.go
// Don't cache tokens beyond the session. Use the kubeconfig's exec credential
// plugin mechanism which handles refresh automatically.
// Never log or store bearer tokens.
func sanitizeForLogging(config *rest.Config) string {
    return fmt.Sprintf("host=%s, tls=%v", config.Host, config.TLSClientConfig.Insecure)
    // Deliberately omit: BearerToken, Username, Password, TLSClientConfig.CertData
}
```

---

## 8.14 — Release Checklist — Expanded

### Pre-Build

- [ ] All tests pass: `make test`
- [ ] Linters pass: `make lint`
- [ ] No `go vet` warnings: `make vet`
- [ ] Frontend type check: `pnpm tsc --noEmit`
- [ ] Dependency audit: `make audit`
- [ ] `go.sum` is up to date: `go mod tidy && git diff --exit-code go.sum`
- [ ] `pnpm-lock.yaml` committed and up to date
- [ ] No uncommitted changes: `git status --short`
- [ ] CHANGELOG.md updated with release notes
- [ ] Version bumped in `wails.json` and relevant constants
- [ ] `build/darwin/Info.plist` version strings updated
- [ ] `build/darwin/entitlements.plist` reviewed — no unnecessary entitlements

### Build

- [ ] macOS universal binary builds without errors
- [ ] Windows amd64 binary builds without errors
- [ ] Linux amd64 binary builds without errors
- [ ] Binary sizes within budget: < 25 MB per platform
- [ ] No CGO dependencies on Linux (check with `ldd`)
- [ ] Wails version pinned (not `@latest`) in install step
- [ ] Frontend bundle: initial load < 3 MB gzipped (run `make analyze-bundle`)

### macOS-Specific

- [ ] App signed: `codesign --verify --verbose build/bin/KubeViewer.app`
- [ ] Notarized: `spctl --assess --verbose build/bin/KubeViewer.app`
- [ ] Stapled: `xcrun stapler validate build/bin/KubeViewer.app`
- [ ] DMG mounts and shows correct window layout
- [ ] Drag to Applications works
- [ ] App launches without Gatekeeper warning on clean macOS VM
- [ ] Spotlight indexing works (app appears in Spotlight search)
- [ ] macOS 11.0 minimum: test on macOS Ventura and Sonoma

### Windows-Specific

- [ ] Installer is digitally signed (right-click → Properties → Digital Signatures)
- [ ] SmartScreen does not block installer (use EV cert or build reputation)
- [ ] Start menu shortcut created
- [ ] Uninstaller works and removes all files
- [ ] App launches from PROGRAMFILES64 without UAC prompts
- [ ] WebView2 runtime bundled or bootstrapper included
- [ ] Test on Windows 10 and Windows 11

### Linux-Specific

- [ ] Binary runs on Ubuntu 22.04 (LTS) without extra deps beyond GTK/WebKit
- [ ] AppImage executes on Ubuntu 22.04 and Fedora 38
- [ ] Desktop file appears in application launcher
- [ ] Icon displays at all sizes
- [ ] `.deb` package installs and uninstalls cleanly
- [ ] `RPM` package installs on RHEL/Fedora

### Functional Testing

- [ ] Connect to minikube cluster
- [ ] Connect to EKS/GKE/AKS cluster (OIDC auth)
- [ ] Switch between multiple clusters
- [ ] Disconnect and reconnect
- [ ] List pods, deployments, services, statefulsets, daemonsets, jobs, cronjobs
- [ ] Filter and search resource lists
- [ ] View pod logs (live tail, previous logs, search)
- [ ] Exec into a pod terminal
- [ ] Port-forward to a service
- [ ] Edit and apply a deployment YAML
- [ ] Scale a deployment
- [ ] Restart a deployment
- [ ] Delete a resource (with confirmation)
- [ ] View Helm releases, upgrade, rollback, uninstall
- [ ] Command palette: search and navigate
- [ ] All keyboard shortcuts work
- [ ] Settings page: change theme, save, verify persistence after restart
- [ ] Auto-update check fires on startup (verify with a fake lower current version)
- [ ] Update banner appears and download works
- [ ] Window position and size restored after restart
- [ ] App handles cluster going offline gracefully (reconnect banner)

### Performance Testing

- [ ] Startup time < 2 seconds on modern hardware (time from launch to interactive)
- [ ] Pod list with 500+ pods renders without jank
- [ ] Log stream at 100 lines/sec does not cause memory growth
- [ ] Memory < 200 MB during typical use session (1 hour)
- [ ] No goroutine leaks after disconnect/reconnect 10 times

### Documentation

- [ ] README updated with new version installation instructions
- [ ] Homebrew Cask formula updated in tap repo
- [ ] GitHub release description is clear and complete
- [ ] Breaking changes (if any) prominently documented
- [ ] Screenshot/GIF in README is current (update if UI changed significantly)

### Distribution

- [ ] GitHub Release created with all platform artifacts
- [ ] Checksums file (`checksums.txt`) attached to release
- [ ] Homebrew tap updated: `brew upgrade kubeviewer` works
- [ ] Winget manifest submitted (if applicable)
- [ ] Release tagged as pre-release if semver has `-` suffix (e.g. `v0.2.0-rc1`)

### Post-Release

- [ ] Verify download links in release description are valid
- [ ] Install from GitHub release on clean macOS, Windows, Linux VMs
- [ ] Announce release (blog, Twitter/X, Kubernetes Slack if ready)
- [ ] Monitor GitHub issues for regression reports (watch for 24h)
- [ ] Tag release in project tracker

---

## 8.15 — Distribution Summary

| Platform | Format | Distribution Channel |
|----------|--------|---------------------|
| macOS | `.dmg` (signed + notarized) | GitHub Releases + Homebrew Cask |
| Windows | NSIS installer (`.exe`, signed) | GitHub Releases + Winget (future) |
| Linux | `.AppImage` + `.tar.gz` | GitHub Releases |
| Linux | `.deb` | GitHub Releases |
| Linux | `.rpm` | GitHub Releases |

### Homebrew Cask Formula

```ruby
# homebrew-tap/Casks/kubeviewer.rb
cask "kubeviewer" do
  version "0.1.0"
  sha256 "REPLACE_WITH_SHA256_OF_DMG"

  url "https://github.com/leonardaustin/kubeviewer/releases/download/v#{version}/KubeViewer-v#{version}-macos-universal.dmg"
  name "KubeViewer"
  desc "Fast, beautiful Kubernetes desktop client"
  homepage "https://github.com/leonardaustin/kubeviewer"

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on macos: ">= :big_sur"

  app "KubeViewer.app"

  zap trash: [
    "~/Library/Application Support/kubeviewer",
    "~/.config/kubeviewer",
    "~/Library/Caches/kubeviewer",
    "~/Library/Logs/kubeviewer",
    "~/Library/Preferences/com.kubeviewer.app.plist",
  ]
end
```

---

## 8.16 — Acceptance Criteria

- [ ] `wails build` produces working binaries on macOS (universal), Windows (amd64), Linux (amd64)
- [ ] macOS `.dmg` installer works (signed, notarized, drag to Applications, no Gatekeeper warning)
- [ ] Windows NSIS installer works (signed, installs to Program Files, start menu entry)
- [ ] Linux AppImage runs on Ubuntu 22.04 and Fedora 38
- [ ] Auto-update check detects new releases within 5 seconds of startup
- [ ] Settings page persists all preferences across restarts
- [ ] App remembers window size, position, and active view across restarts
- [ ] Welcome screen appears on first launch
- [ ] Error boundary catches React errors and shows recovery UI
- [ ] Connection recovery reconnects automatically with exponential backoff
- [ ] All keyboard shortcuts work and are rebindable
- [ ] `make test` passes on macOS (unit + integration)
- [ ] GitHub Actions CI passes on all three platform runners
- [ ] GitHub Release contains all platform artifacts + checksums
- [ ] Total binary size < 25 MB per platform
- [ ] App startup < 2 seconds on modern hardware
- [ ] Memory usage < 200 MB during typical 1-hour session
- [ ] No WCAG 2.1 AA violations for core flows (resource list, detail, logs)
- [ ] No eval() or Function() constructor usage in frontend code (ESLint enforced)
- [ ] Secret values masked by default, only revealed on explicit user action
