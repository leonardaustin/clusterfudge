# Phase 1 — Vision, Architecture & Tech Stack

## Product Vision

**KubeViewer** is a fast, beautiful desktop application for managing Kubernetes clusters. It combines the operational power of Lens with the design quality and speed of Linear.

### Design Principles

1. **Speed is a feature** — every interaction must feel instant. Optimistic UI updates, local-first data, sub-100ms navigation.
2. **Keyboard-first, mouse-friendly** — full keyboard navigation with discoverable shortcuts shown in context menus. Power users never touch the mouse.
3. **Progressive disclosure** — show the right information at the right time. Cluster → resource category → resource list → detail panel.
4. **Dark by default** — a premium dark theme using perceptually uniform color spaces (LCH). Light theme available but dark is the primary design target.
5. **Dense but not cramped** — information-rich views with careful typography, spacing, and visual hierarchy.

---

## Lens Feature Parity Map

This table maps every major Lens capability to KubeViewer's planned implementation. The Phase column indicates which release milestone delivers each feature. "Done" means the feature is complete when that phase ships.

### Multi-Cluster Management

| Lens Feature | KubeViewer Implementation | Phase | Notes |
|---|---|---|---|
| Read kubeconfig from `~/.kube/config` | `internal/cluster/kubeconfig.go` parses all contexts using `client-go/tools/clientcmd` | 1 | Honors `KUBECONFIG` env var and merged configs |
| Multiple kubeconfig files | `KUBECONFIG=a:b:c` environment variable honored; UI allows adding extra kubeconfig files | 2 | Stored in app config, not env |
| Simultaneous multi-cluster connections | Each cluster gets its own `ClusterConnection` struct with independent `client-go` REST client | 1 | Goroutines are isolated per cluster |
| Cluster health indicator (green/yellow/red) | Background goroutine pings `/healthz` every 15s; status emitted via Wails event | 1 | Color-coded in sidebar |
| Switch active cluster | Single click or `Ctrl+1…9` keyboard shortcut; Zustand `activeClusterId` triggers refetch | 1 | Sub-50ms perceived switch |
| Per-cluster namespace filter | Namespace filter state stored per cluster ID in `uiStore`; all resource queries respect filter | 1 | "All namespaces" is default |
| Add cluster from kubeconfig | File picker dialog; parsed and added to cluster registry | 2 | |
| Cluster rename / remove | Soft-delete from app config; underlying kubeconfig untouched | 2 | |
| Cluster-level resource counts in sidebar | Derived from informer cache counts, updated via events | 2 | |

### Resource Browser

| Lens Feature | KubeViewer Implementation | Phase | Notes |
|---|---|---|---|
| Core workloads: Pods, ReplicaSets, Deployments, StatefulSets, DaemonSets, Jobs, CronJobs | Individual views and detail panels for each; fetched via typed informers | 1 | |
| Services, Endpoints, Ingresses, IngressClasses | Networking section; full CRUD where applicable | 1 | |
| ConfigMaps, Secrets | Config section; Secrets masked by default | 1 | |
| Namespaces | Management view with create/delete and quota rollup | 1 | |
| Nodes | Node list with CPU/memory gauges; management actions | 1 | |
| PersistentVolumes, PersistentVolumeClaims, StorageClasses | Storage section | 1 | |
| ServiceAccounts, Roles, ClusterRoles, RoleBindings, ClusterRoleBindings | RBAC section (read-only in Phase 1) | 2 | |
| NetworkPolicies | Network section; read-only visualization | 2 | |
| ResourceQuotas, LimitRanges | Resource governance section | 2 | |
| HorizontalPodAutoscalers | HPA view with current/desired/min/max replicas | 2 | |
| PodDisruptionBudgets | PDB view under Workloads | 2 | |
| PriorityClasses | Scheduling section | 2 | |
| LeasesEndpointSlices | Discovery section | 2 | |
| CRD discovery and browsing | `internal/k8s/discovery.go` enumerates all CRDs; dynamic client fetches custom resources | 2 | CRDs appear in sidebar dynamically |
| CRD schema-aware detail view | Uses OpenAPI schema from CRD spec to render a typed detail panel | 3 | Falls back to raw YAML |
| Arbitrary resource group/version/resource browsing | Generic resource table view accepting GVR; power user escape hatch | 2 | |

### Pod Management

| Lens Feature | KubeViewer Implementation | Phase | Notes |
|---|---|---|---|
| Pod list with status, restarts, age, node | TanStack Table; status column uses colored badge component | 1 | |
| Pod detail panel (labels, annotations, conditions, volumes, init containers, containers) | Multi-tab detail panel rendered from pod spec/status | 1 | |
| Live log streaming | `internal/stream/logs.go` opens `PodLogOptions{Follow: true}`; streams via Wails event `log-line:{podID}` | 1 | Circular buffer of 50k lines in Go; frontend virtualizes with xterm |
| Log filtering (grep, regex, level) | Client-side filter applied to buffered lines in frontend; no round-trip | 1 | |
| Log download | Go handler writes buffered + remaining stream to temp file; opens save dialog | 2 | |
| Pod exec / interactive shell | `internal/stream/exec.go` opens SPDY exec stream; binary WebSocket bridge to xterm in frontend | 1 | Multiple simultaneous sessions supported |
| Port forwarding | `internal/stream/portforward.go` calls `client-go/tools/portforward`; local port opened on loopback; frontend shows active forwards | 2 | |
| Delete pod | Bound handler calls `CoreV1().Pods().Delete()`; optimistic removal from list | 1 | |
| Restart pod (delete and let RS recreate) | Same as delete; informer watch picks up new pod | 1 | |
| View events for pod | Filtered event list in detail panel; live-updated | 1 | |
| Container resource usage (CPU/mem) | metrics-server `PodMetrics` via `metrics.k8s.io/v1beta1`; polled every 10s | 2 | |
| Init container logs | Same log streaming; container selector dropdown | 1 | |
| Ephemeral container support | Attach debug container via `EphemeralContainers` subresource | 3 | |

### Deployment Management

| Lens Feature | KubeViewer Implementation | Phase | Notes |
|---|---|---|---|
| Deployment list with ready/desired, strategy, age | TanStack Table with rollout progress bar | 1 | |
| Detail panel with pod template, conditions, rollout history | Multi-tab detail panel | 1 | |
| Scale replicas | Dialog with number input; calls `Scale` subresource | 1 | |
| Rolling restart | Patches `spec.template.metadata.annotations["kubectl.kubernetes.io/restartedAt"]` | 1 | |
| Pause / Resume rollout | Patches `spec.paused`; button toggles based on current state | 2 | |
| Rollout history | `apps/v1` `ReplicaSet` list filtered by owner ref; shows revision, change-cause annotation | 2 | |
| Rollback to revision | `AppsV1().Deployments().Patch()` with revision annotation; or recreate from RS template | 2 | |
| View related ReplicaSets and Pods | Relationship panel: deployment → RS list → pod list | 2 | |
| Edit deployment YAML | Monaco editor with apply on save; diff view before commit | 2 | |
| Delete deployment | Calls `Delete()`; propagation policy `Foreground` | 1 | |

### StatefulSet / DaemonSet / Job Management

| Lens Feature | KubeViewer Implementation | Phase | Notes |
|---|---|---|---|
| StatefulSet scale | `Scale` subresource; ordered pod recreation | 1 | |
| StatefulSet rolling restart | Same restart annotation patch | 1 | |
| DaemonSet rollout restart | Restart annotation patch; DaemonSet handles per-node rollout | 1 | |
| Job re-run | Delete + recreate from spec (strips `status`, `resourceVersion`, `uid`) | 2 | |
| CronJob suspend / resume | Patches `spec.suspend` | 2 | |
| CronJob trigger manually | Creates `Job` from CronJob `jobTemplate`; appends timestamp to name | 2 | |

### Node Management

| Lens Feature | KubeViewer Implementation | Phase | Notes |
|---|---|---|---|
| Node list with role, status, CPU/mem capacity, version | TanStack Table; `node-role.kubernetes.io/*` labels determine role | 1 | |
| Node detail panel (conditions, taints, labels, annotations, capacity, allocatable) | Multi-tab detail panel | 1 | |
| Cordon node | Patches `spec.unschedulable = true` | 2 | |
| Uncordon node | Patches `spec.unschedulable = false` | 2 | |
| Drain node | Uses `policy/v1beta1` eviction API in sequence; respects PodDisruptionBudgets; progress shown | 2 | Warns if PDBs would block |
| Add / remove taint | PATCH `spec.taints` array | 2 | |
| Add / remove label | PATCH `metadata.labels` | 2 | |
| Node resource usage (CPU/mem) | metrics-server `NodeMetrics` via `metrics.k8s.io/v1beta1` | 2 | |
| Node events | Filtered event list in detail panel | 1 | |
| Pods running on node | Pod list filtered by `spec.nodeName` | 1 | |

### Helm v3

| Lens Feature | KubeViewer Implementation | Phase | Notes |
|---|---|---|---|
| Releases list (name, namespace, chart, version, status, last deployed) | Helm SDK `action.List`; TanStack Table | 2 | |
| Release detail (values, notes, hooks, manifests) | Multi-tab panel; values shown in Monaco editor | 2 | |
| Upgrade release | Helm SDK `action.Upgrade`; values editor before confirm | 3 | |
| Rollback release to revision | Helm SDK `action.Rollback` | 3 | |
| Uninstall release | Helm SDK `action.Uninstall` | 2 | |
| Chart browser (search Artifact Hub or configured repos) | Artifact Hub REST API search; results cached for 5 min | 3 | |
| Install chart from browser | Helm SDK `action.Install` with namespace/name/values inputs | 3 | |
| Add/remove Helm repositories | Helm SDK `repo.Add` / `repo.Remove`; stored in Helm's `~/.config/helm/repositories.yaml` | 3 | |
| OCI registry chart pull | Helm SDK OCI support; `oci://` URLs supported | 3 | |
| Values YAML editor with schema validation | Monaco editor; values schema from `Chart.yaml` `valuesSchema` | 3 | |
| Release history | Helm SDK `action.History` | 2 | |

### Real-Time Features

| Lens Feature | KubeViewer Implementation | Phase | Notes |
|---|---|---|---|
| Live resource updates (pod status, deployment ready count) | `client-go` informer watches per resource type; Go handler emits Wails events | 1 | |
| Live event feed | `CoreV1().Events()` watch stream; frontend event feed component; ring buffer of 500 events | 1 | |
| Live log streaming | `Follow: true` log stream; see Pod Management | 1 | |
| Resource metrics polling | 10s ticker calls metrics-server; emits via Wails event `metrics-update:{clusterID}` | 2 | |
| Cluster-wide event feed | "All namespaces" event watcher; filterable by severity, kind, reason | 2 | |
| Terminal resize propagation | xterm `onResize` calls bound handler which sends SIGWINCH to exec stream | 1 | |

### YAML Editor

| Lens Feature | KubeViewer Implementation | Phase | Notes |
|---|---|---|---|
| View resource YAML | `resourceStore` marshals cached object to YAML; displayed in Monaco read-only | 1 | |
| Edit and apply resource YAML | Monaco edit mode; save calls `resource.Apply()` which uses `kubectl apply` semantics (server-side apply) | 2 | |
| Diff before apply | Go handler computes 3-way merge diff; frontend shows Monaco diff editor | 2 | |
| YAML validation | Monaco YAML language server; `kubernetes` schema from `schemastore.org` for all standard types | 2 | |
| CRD-specific YAML schema | Dynamic schema from CRD `spec.validation.openAPIV3Schema` | 3 | |
| Create resource from YAML | Monaco editor in "create" mode; calls `resource.Create()` | 2 | |

### Integrated Terminal

| Lens Feature | KubeViewer Implementation | Phase | Notes |
|---|---|---|---|
| Pod exec shell session | xterm.js + SPDY exec; multiple tabs in BottomTray | 1 | |
| Shell type selection (bash/sh/zsh) | Dropdown in session header; defaults to `/bin/sh` | 1 | |
| Multiple simultaneous sessions | BottomTray tab strip; each session is independent SPDY stream | 1 | |
| Copy / paste in terminal | xterm clipboard integration; `Ctrl+Shift+C/V` | 1 | |
| Terminal font size | Persisted to `uiStore`; `ITerminalOptions.fontSize` | 2 | |
| Clear terminal | Button + `Ctrl+L` | 1 | |
| Session naming | Editable tab label | 2 | |

### ConfigMap & Secret Management

| Lens Feature | KubeViewer Implementation | Phase | Notes |
|---|---|---|---|
| ConfigMap list and detail (key-value table) | Standard resource view; keys shown in detail panel | 1 | |
| Edit ConfigMap values | Monaco editor (YAML); calls update on save | 2 | |
| Secret list and detail | Standard resource view; values masked by default | 1 | |
| Decode / reveal secret values | "Reveal" button calls `atob()` in frontend; value never sent decoded to backend | 1 | Decode is entirely client-side |
| Encode new secret value | `btoa()` in frontend before calling create/update | 1 | |
| Create / delete ConfigMap or Secret | Standard CRUD | 2 | |

### Namespace Management

| Lens Feature | KubeViewer Implementation | Phase | Notes |
|---|---|---|---|
| Namespace list with status, age, labels | Standard resource view | 1 | |
| Namespace filter dropdown (all or specific) | Filter bar in topbar; persisted per cluster in `uiStore` | 1 | |
| Create namespace | Dialog; calls `CoreV1().Namespaces().Create()` | 2 | |
| Delete namespace | Confirmation dialog; propagation `Foreground` | 2 | |
| Namespace ResourceQuota rollup | Quota usage shown in namespace detail | 2 | |

### RBAC Resources

| Lens Feature | KubeViewer Implementation | Phase | Notes |
|---|---|---|---|
| Browse Roles, ClusterRoles | RBAC section; read-only; policy rules displayed in detail | 2 | |
| Browse RoleBindings, ClusterRoleBindings | Subjects and roleRef shown | 2 | |
| ServiceAccount list and detail | Shows imagePullSecrets, secrets, tokens | 2 | |
| Permission check for current user | `SelfSubjectAccessReview` for each action; drives button enabled/disabled state | 2 | |

### Storage Management

| Lens Feature | KubeViewer Implementation | Phase | Notes |
|---|---|---|---|
| PersistentVolume list (capacity, access modes, reclaim policy, status) | Storage section; TanStack Table | 1 | |
| PersistentVolumeClaim list (bound PV, status, access modes) | Claims show binding status and consuming pods | 1 | |
| StorageClass list (provisioner, reclaim, binding mode) | Standard resource view | 1 | |
| PVC delete | Confirmation dialog; warns if pods are using the claim | 2 | |

### Networking

| Lens Feature | KubeViewer Implementation | Phase | Notes |
|---|---|---|---|
| Ingress list with hosts, rules, TLS | Networking section; rules table in detail panel | 1 | |
| Service list (type, cluster IP, external IP, ports) | Standard resource view; port-forward action from service | 1 | |
| Endpoint slices | Read-only; shows addresses and ports | 2 | |
| NetworkPolicy list | Networking section; read-only | 2 | |

### Resource Quotas & Limits

| Lens Feature | KubeViewer Implementation | Phase | Notes |
|---|---|---|---|
| ResourceQuota list with used/hard gauges | Gauges per resource type; color thresholds at 80% / 95% | 2 | |
| LimitRange list | Shows default, default request, max, min per container | 2 | |
| HPA list (current/desired replicas, metrics) | Autoscaling section; live current replica count | 2 | |

### Resource Relationships

| Lens Feature | KubeViewer Implementation | Phase | Notes |
|---|---|---|---|
| Deployment → ReplicaSet → Pod | `ownerReferences` traversal; rendered as relationship panel | 2 | |
| Service → Endpoints → Pods | Label selector matching; rendered as relationship panel | 2 | |
| CronJob → Job → Pod | ownerReferences traversal | 2 | |
| PVC → PV | Bound PV shown in PVC detail | 1 | |
| Pod → ServiceAccount | serviceAccountName link; links to SA detail | 2 | |
| Pod → ConfigMap / Secret (volumes / envFrom) | Volume and envFrom refs shown in pod detail as hyperlinks | 2 | |

### Cluster Health Dashboard

| Lens Feature | KubeViewer Implementation | Phase | Notes |
|---|---|---|---|
| Node status overview (ready/not-ready/unknown count) | Dashboard view; status aggregation from informer cache | 2 | |
| Component status (etcd, scheduler, controller-manager) | `CoreV1().ComponentStatuses()` | 2 | |
| Overall pod status breakdown (Running/Pending/Failed/Succeeded) | Dashboard view | 2 | |
| Cluster-wide resource capacity vs allocatable | Aggregated from all node metrics | 2 | |
| Recent events (warnings/errors) | Last 50 warning events from event watch | 1 | |

### UX Features

| Lens Feature | KubeViewer Implementation | Phase | Notes |
|---|---|---|---|
| Command palette (Cmd+K / Ctrl+K) | `cmdk` component; searches clusters, resources, recent views, actions | 1 | |
| Keyboard shortcuts for every action | `useShortcuts` hook with global and context-scoped bindings; help overlay (`?`) | 1 | |
| Hotbar / pinned views | `uiStore.pinnedViews`; drag-reorderable sidebar items | 3 | |
| Recently visited resources | Ring buffer of 20 in `uiStore`; shown in command palette | 2 | |
| Table column customization | Column visibility and order persisted to `uiStore` per resource type | 2 | |
| Table search / filter | Fuzzy search on all visible columns; TanStack Table `globalFilter` | 1 | |
| Table sort | Click column header; multi-sort with Shift+click | 1 | |
| Detail panel slide-in | Right-side panel; resizable; escape to close | 1 | |
| Context menu on right-click | Radix `ContextMenu`; shows available actions for selected resource | 2 | |
| Bulk select and delete | TanStack Table row selection; batch delete action | 3 | |

### Prometheus Integration

| Lens Feature | KubeViewer Implementation | Phase | Notes |
|---|---|---|---|
| Auto-detect in-cluster Prometheus | Scan for `prometheus` Services in common namespaces | 3 | |
| Custom Prometheus URL configuration | Settings page | 3 | |
| Pod CPU/memory time-series graph | Line chart in pod detail panel; PromQL query via Go HTTP client | 3 | |
| Node CPU/memory time-series graph | Node detail panel | 3 | |
| Namespace resource consumption graph | Dashboard panel | 3 | |

### Extension Architecture (Future)

| Feature | Notes |
|---|---|
| Plugin API | Not in Phase 1-3. Will define after core is stable. Likely Wails plugin system or iframe sandbox |
| Custom sidebar items | Plugin-contributed views |
| Custom columns | Plugin-contributed table columns |

---

## Detailed Architecture

### System Diagram

```
┌───────────────────────────────────────────────────────────────────────┐
│                          KubeViewer Desktop                           │
│                                                                       │
│  ┌────────────────────────────────────┐                               │
│  │         React Frontend             │                               │
│  │  ┌──────────┐  ┌────────────────┐  │                               │
│  │  │  Views   │  │  Zustand       │  │                               │
│  │  │  (React  │◄─│  Stores        │  │                               │
│  │  │  Router) │  │  (cluster,     │  │                               │
│  │  └──────────┘  │   resource,    │  │                               │
│  │  ┌──────────┐  │   ui)          │  │                               │
│  │  │  Hooks   │◄─└────────────────┘  │                               │
│  │  │  (wails, │                      │                               │
│  │  │   query) │                      │                               │
│  └──┼──────────┼──────────────────────┘                               │
│     │  bindings│  events                                              │
│     ▼          ▼                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                    Wails v2 IPC Bridge                          │  │
│  │   Method Calls (Go→TS generated stubs) + Event Bus (bidirect.)  │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│     │          ▲                                                       │
│     ▼          │                                                       │
│  ┌────────────────────────────────────┐                               │
│  │            Go Backend              │                               │
│  │  ┌──────────────────────────────┐  │                               │
│  │  │         handlers/            │  │                               │
│  │  │  ClusterHandler              │  │                               │
│  │  │  ResourceHandler             │  │                               │
│  │  │  StreamHandler               │  │                               │
│  │  │  HelmHandler                 │  │                               │
│  │  │  ConfigHandler               │  │                               │
│  │  └──────────────┬───────────────┘  │                               │
│  │                 │                  │                               │
│  │  ┌──────────────▼───────────────┐  │                               │
│  │  │       internal services      │  │                               │
│  │  │  cluster  │ resource         │  │                               │
│  │  │  stream   │ helm             │  │                               │
│  │  │  k8s      │ config           │  │                               │
│  │  └──────────────┬───────────────┘  │                               │
│  │                 │                  │                               │
│  └─────────────────┼──────────────────┘                               │
│                    │                                                   │
│           ┌────────▼────────┐                                         │
│           │  client-go      │                                         │
│           │  informers,     │                                         │
│           │  REST client,   │                                         │
│           │  dynamic client │                                         │
│           └────────┬────────┘                                         │
└────────────────────┼──────────────────────────────────────────────────┘
                     │  HTTPS/mTLS
                     ▼
              Kubernetes API Server
```

### Data Flow: Resource Request

The following describes the complete round-trip when the user navigates to the Pods view and the frontend requests the pod list.

```
1. User clicks "Pods" in sidebar
   └─ React Router navigates to /clusters/:id/pods

2. Pods.tsx mounts → useKubeResource("pods", namespace) hook fires
   └─ Checks resourceStore: is data stale or absent?
      ├─ Fresh: render immediately from store (sub-5ms)
      └─ Stale/absent: call Wails binding

3. Frontend calls:  window.go.handlers.ResourceHandler.ListResources(clusterID, "pods", namespace)
   └─ Wails IPC serialises args to JSON, sends to Go runtime

4. Go: ResourceHandler.ListResources(ctx, clusterID, gvr, namespace) is called
   └─ Looks up ClusterConnection by clusterID from ClusterManager
   └─ Calls resource.Service.List(ctx, conn, gvr, namespace)

5. resource.Service.List:
   └─ Checks informer cache (SharedIndexInformer.GetStore())
      ├─ Cache warm: returns slice immediately (zero network)
      └─ Cache cold: falls through to direct API call
         └─ conn.DynamicClient.Resource(gvr).Namespace(ns).List(ctx, metav1.ListOptions{})

6. Serialise result:
   └─ []unstructured.Unstructured → []ResourceSummary (trimmed struct for IPC efficiency)
   └─ Return to Wails runtime

7. Wails IPC serialises Go return value → JSON → JavaScript Promise resolves

8. useKubeResource hook receives []ResourceSummary
   └─ Writes to resourceStore.setResources(clusterID, "pods", namespace, data)
   └─ Sets lastFetched timestamp

9. React re-renders Pods.tsx with new data
   └─ TanStack Table virtualizes the list
   └─ User sees updated pod list
```

**Latency breakdown (warm cache, 100 pods):**
- Steps 1–3: ~2ms (React state transition + IPC serialization)
- Steps 4–6: ~1ms (cache lookup, struct conversion)
- Steps 7–8: ~2ms (deserialization, store write)
- Step 9: ~3ms (React render + virtualizer)
- **Total: ~8ms** perceived from click to pixels

### Event System: Real-Time Watch Architecture

Watches propagate changes from the Kubernetes API through the entire stack. This path is critical for correctness — stale UI is a major UX failure.

```
K8s API Server
  │  (watch stream, chunked HTTP/2)
  ▼
client-go SharedInformer
  │  EventHandler interface:
  │    OnAdd(obj)
  │    OnUpdate(oldObj, newObj)
  │    OnDelete(obj)
  ▼
internal/resource/watcher.go  InformerEventHandler
  │  Converts K8s event to KubeViewer WatchEvent struct:
  │    {ClusterID, GVR, EventType, ResourceSummary}
  │  Calls eventEmitter.Emit(topic, event)
  ▼
internal/events/emitter.go  EventEmitter
  │  Topic: "resource:{clusterID}:{group}/{version}/{resource}"
  │  Calls wails runtime:  runtime.EventsEmit(ctx, topic, payload)
  ▼
Wails IPC event bus
  │  Serialises payload to JSON
  │  Delivers to all registered frontend listeners
  ▼
ui/src/hooks/useWatchResource.ts
  │  Registered via:  runtime.EventsOn(topic, handler)
  │  handler: (event: WatchEvent) => {
  │    resourceStore.applyWatchEvent(event)
  │  }
  ▼
resourceStore.applyWatchEvent()
  │  switch event.type:
  │    ADDED:    store.resources.push(event.object)
  │    MODIFIED: store.resources[i] = event.object  (by name+namespace key)
  │    DELETED:  store.resources.splice(i, 1)
  ▼
Zustand notifies all subscribers
  ▼
React components re-render (only those subscribed to affected slice)
  ▼
User sees real-time update (≤100ms from K8s API event)
```

**Key design decisions:**
- One watch per resource type per cluster per active view. Watches are started when the relevant view mounts and stopped when it unmounts via the hook cleanup function.
- `SharedIndexInformer` from client-go is used rather than raw watch streams. Informers handle reconnection, resync, and provide a consistent list+watch start sequence.
- The event topic includes cluster ID and GVR, so multiple clusters can have simultaneous watches without collision.
- Frontend applies patch operations (add/modify/delete) rather than replacing the full list on every event. This keeps React re-renders minimal.

### Caching Strategy

KubeViewer has a three-layer cache: an authoritative Go-side informer cache, a read-through frontend Zustand cache, and a SQLite persistence layer for warm-start, offline viewing, and historical data.

**Layer 1: Go informer cache (source of truth)**

```
SharedInformer
  ├── List: GET /api/v1/namespaces/{ns}/pods?resourceVersion=0
  │     Populates in-memory Store (thread-safe, uses indexers)
  └── Watch: GET /api/v1/namespaces/{ns}/pods?watch=true&resourceVersion={rv}
        Continuously updates Store as events arrive

Store characteristics:
  - Keyed by namespace/name
  - Indexed by namespace (for namespace-scoped queries)
  - No TTL — data is always current (watch keeps it fresh)
  - Memory usage: ~1–3KB per resource object (unstructured form)
```

**Layer 2: Frontend Zustand cache (read-through)**

```typescript
interface ResourceState {
  // Key: `${clusterID}:${gvr}:${namespace}`
  resources: Map<string, ResourceSummary[]>
  lastFetched: Map<string, number>  // Unix timestamp ms
  staleness: 30_000  // ms — only re-fetch if > 30s old
}
```

**Layer 3: SQLite persistence (warm-start & history)**

```
~/.kubeviewer/kubeviewer.db

Tables:
  resource_snapshots  — last-known state of each resource (warm-start on launch)
  resource_history    — periodic snapshots for trend data (pod count over time, etc.)
  search_index        — FTS5 full-text search across all resource metadata
  audit_log           — user-initiated actions (create/update/delete/scale/etc.)
  app_state           — user preferences, column widths, sidebar state (replaces localStorage)

Characteristics:
  - WAL mode for concurrent reads during writes
  - Write-behind: informer events are batched and flushed to SQLite every 5s
  - Read-on-startup: UI renders last-known state from SQLite while informers sync
  - Retention: resource_history pruned to 7 days, audit_log to 90 days (configurable)
  - Size budget: ~50MB typical, 200MB hard cap with auto-eviction
```

**Why SQLite:**
- Eliminates cold-start blank screen — the UI shows last-known cluster state immediately while informers perform initial list+watch.
- Enables offline browsing of last-known cluster state when disconnected.
- FTS5 provides sub-millisecond full-text search across all resources without scanning the informer cache.
- Historical trend data (resource counts, status transitions) persists across restarts for dashboards.
- Single-file, zero-configuration, embedded — no external dependencies. Ships as part of the Go binary via `modernc.org/sqlite` (pure Go) or `mattn/go-sqlite3` (CGo).
- Unifies persistence: audit logs, app preferences, and resource data in one database instead of scattered across SQLite, YAML files, and localStorage.

When a view mounts:
1. Read from Zustand cache. If `lastFetched < staleness`, render immediately.
2. If Zustand cache is empty (cold start), read from SQLite `resource_snapshots` and render with a "last synced X ago" indicator.
3. In background, start watch subscription (Go watch → Wails event → store patch).
4. If cache is stale or absent, call bound method to fetch from informer/API.
5. Write-behind: as informer events arrive, batch and flush to SQLite every 5s.

**Cache invalidation:**
- Watch events continuously patch the store — no TTL needed for watched resources.
- If the watch reconnects (network blip), informer performs a re-list before resuming the watch, ensuring no events are missed.
- Namespace filter change: clears the frontend cache for all resource types and re-fetches.
- Cluster disconnect: purges all cache entries for that cluster ID. SQLite snapshots are retained for offline viewing.

**What is NOT cached:**
- Log lines: streamed directly to the xterm buffer, not stored in Zustand or SQLite.
- Exec sessions: stateful WebSocket/SPDY connections managed in `StreamHandler`.
- Helm release values: fetched on demand, not cached (often large and rarely needed).
- Prometheus metrics: cached for 10s in frontend `metricsStore`, then re-polled.

### Connection Lifecycle

Each cluster connection follows a well-defined lifecycle managed by `internal/cluster/manager.go`.

```
Kubeconfig loaded
  │
  ▼
ClusterManager.Connect(contextName)
  ├── Parse kubeconfig context, user, cluster fields
  ├── Build rest.Config (handles certificates, token, exec auth, OIDC)
  ├── Create kubernetes.Clientset (typed client)
  ├── Create dynamic.Interface (dynamic client for custom resources)
  ├── Create metrics client (metrics.k8s.io)
  ├── Set connectTimeout = 10s
  └── POST /apis/authorization.k8s.io/v1/selfsubjectaccessreviews
        (smoke test — confirms reachability and valid credentials)

Connected state:
  ├── Background goroutine: healthCheck() every 15s → GET /healthz
  │     ├── Success: emit "cluster-health:{id}" status=green
  │     ├── Slow (>3s): emit status=yellow
  │     └── Fail: emit status=red, start reconnect loop
  └── Background goroutine: informerFactory.Start(stopCh)
        Starts one SharedIndexInformer per active resource type

Reconnect loop (on health check failure):
  ├── Exponential backoff: 2s, 4s, 8s, 16s, 32s, cap at 60s
  ├── Jitter: ±20% to avoid thundering herd on resume
  ├── Re-creates rest.Config (token may have refreshed)
  └── On success: re-starts informers, emits status=green

Disconnect:
  ├── Cancel context → all goroutines with that context terminate
  ├── Close informer stopCh → all informer goroutines exit
  ├── Close any active log stream / exec session goroutines
  └── Purge cluster entry from ClusterManager map
```

**Authentication token refresh:**
- For short-lived tokens (exec-based auth, OIDC), `client-go`'s `rest.Config` with `ExecProvider` handles token refresh transparently.
- Token is never stored beyond the `rest.Config` lifetime. When the connection is closed, the memory is GC'd.
- `kubeconfig` files are read at connect time; changes to the file require a reconnect to take effect.

### Concurrency Model

KubeViewer uses structured concurrency with explicit context propagation and lifecycle boundaries.

**Goroutine hierarchy:**

```
main goroutine (Wails runtime)
  │
  ├── ClusterManager goroutines (one context per cluster)
  │     ├── healthCheck loop  (ticker + context.Done())
  │     ├── informerFactory goroutines (managed by client-go)
  │     │     ├── SharedInformer for pods
  │     │     ├── SharedInformer for deployments
  │     │     └── ... (one per active resource type)
  │     └── metricsPoller loop  (ticker + context.Done())
  │
  ├── StreamHandler goroutines (one per active stream)
  │     ├── logStream goroutine  (context from handler call)
  │     ├── execSession goroutine  (context from handler call)
  │     └── portForward goroutine  (context from handler call)
  │
  └── Handler goroutines (Wails spawns one per bound method call)
        These are short-lived; complete within the method call.
```

**Context discipline:**
- Every goroutine receives a `context.Context` with a cancel function.
- `ClusterManager` holds the master cancel for a cluster's context. Calling `Disconnect()` cancels this context, which propagates to all child goroutines.
- `StreamHandler` creates child contexts from the cluster context. If the cluster disconnects, all streams for that cluster also terminate.
- Bound handler methods receive the Wails `ctx` which is cancelled when the app shuts down.

**Goroutine leak prevention:**
- No goroutine is started without an associated context and a registered cancel path.
- Integration tests verify no leaked goroutines using `goleak`.
- `StreamHandler` tracks active sessions in a `sync.Map`; on app shutdown, it cancels all sessions.

**Mutex usage:**
- `ClusterManager.mu sync.RWMutex` protects the cluster map.
- `EventEmitter` uses channel-based fanout (no mutex) for event delivery to avoid blocking informer goroutines.
- `StreamHandler` sessions map uses `sync.Map` for concurrent access without mutex contention.

### Error Propagation

Errors flow from K8s API through Go to the frontend, where they are displayed in context.

```
K8s API returns error
  │  e.g., 403 Forbidden, 404 Not Found, 500 InternalServerError
  ▼
client-go returns typed error
  │  e.g., *errors.StatusError{ErrStatus: metav1.Status{Code: 403}}
  ▼
internal service layer wraps error
  │  fmt.Errorf("listing pods in %s: %w", namespace, err)
  │  Preserves type for upstream inspection with errors.As()
  ▼
handler returns (result, error)
  │  If error != nil, Wails serialises to:
  │    {"error": {"code": 403, "message": "...", "reason": "Forbidden"}}
  ▼
Frontend TypeScript receives rejection
  │  Wails generated binding returns Promise<T>
  │  On rejection: catch(err) → err is { message: string, code?: number }
  ▼
useKubeResource hook catches error
  │  Sets errorStore.setError(key, { message, code, isPermission: code === 403 })
  ▼
ErrorBoundary or inline error component renders
  │  403: "You don't have permission to list pods in this namespace"
  │  404: "Resource not found (may have been deleted)"
  │  503: "API server unavailable — check cluster connectivity"
  │  other: raw message + "Copy details" button
```

**Special error cases:**
- **Watch stream disconnect**: Informer handles reconnection transparently. If reconnect fails after 60s, emits `cluster-health` status=red. No error is surfaced to the user for brief blips.
- **Partial failure (multi-cluster)**: An error in one cluster does not affect others. Each cluster has isolated error state.
- **Concurrent modification conflict (409)**: YAML editor shows "Resource was modified while you were editing. Reload and re-apply?" dialog.
- **Token expiry during operation**: `client-go` refreshes tokens automatically. If refresh fails (OIDC session expired), a re-authentication dialog is shown.

---

## Package Design

### Go Backend

#### `internal/k8s` ✅ Implemented

**Responsibility:** Build and manage Kubernetes REST clients from kubeconfig. This package knows how to authenticate. It does NOT know about multiple clusters, caching, or business logic.

**Public API:**
```go
// BuildRestConfig creates a rest.Config from a kubeconfig context name.
// Handles all auth methods: certificate, token, exec, OIDC.
func BuildRestConfig(kubeconfigPath, contextName string) (*rest.Config, error)

// NewClients creates all client types from a rest.Config.
// Returns typed, dynamic, and metrics clients.
func NewClients(cfg *rest.Config) (*Clients, error)

type Clients struct {
    Typed    kubernetes.Interface        // for core/apps/etc typed API
    Dynamic  dynamic.Interface           // for CRDs and generic resources
    Metrics  versioned.Interface         // for metrics.k8s.io
    REST     *rest.RESTClient            // for raw requests (exec, portforward)
    Config   *rest.Config                // retained for informer factory construction
}

// DiscoverAPIResources returns all API groups and resources the server supports.
// Used to build the sidebar resource tree and validate GVRs.
func DiscoverAPIResources(client kubernetes.Interface) ([]APIGroup, error)
```

**Dependencies:** `k8s.io/client-go`, `k8s.io/apimachinery`

**Design patterns:** Factory pattern for client construction. No state held — purely functional.

---

#### `internal/cluster` ✅ Implemented

**Responsibility:** Multi-cluster lifecycle. Manages the map of connected clusters, health checking, informer factories, and reconnection. This package knows about multiple clusters. It does NOT know about specific resource types.

**Public API:**
```go
// Manager holds all active cluster connections.
type Manager struct { /* private */ }

func NewManager(appCtx context.Context, emitter *events.Emitter) *Manager

// Connect reads the kubeconfig and establishes a connection.
// Returns immediately; connection is established asynchronously.
// Emits "cluster-connecting:{id}", "cluster-connected:{id}", or "cluster-error:{id}".
func (m *Manager) Connect(kubeconfigPath, contextName, id string) error

// Disconnect cancels the cluster context, stops informers, closes streams.
func (m *Manager) Disconnect(id string) error

// Get returns the ClusterConnection for a cluster ID.
// Returns (nil, ErrNotFound) if not connected.
func (m *Manager) Get(id string) (*ClusterConnection, error)

// List returns all currently tracked cluster IDs and their status.
func (m *Manager) List() []ClusterStatus

type ClusterConnection struct {
    ID       string
    Clients  *k8s.Clients
    Informers factory.SharedInformerFactory
    Ctx      context.Context  // cancelled on Disconnect
    Cancel   context.CancelFunc
}

type ClusterStatus struct {
    ID      string
    Name    string
    Health  HealthStatus  // Green, Yellow, Red, Connecting, Disconnected
}
```

**Dependencies:** `internal/k8s`, `internal/events`

**Design patterns:** Registry pattern for cluster map. Observer pattern via `events.Emitter` for health state changes.

---

#### `internal/resource` ✅ Implemented

**Responsibility:** Generic CRUD and watch operations for any K8s resource. Accepts a `schema.GroupVersionResource` to work with any resource type, including CRDs. Does NOT know about clusters (takes a `ClusterConnection`), does NOT contain business logic.

**Public API:**
```go
// Service provides generic resource operations.
type Service struct { /* private */ }

func NewService(emitter *events.Emitter) *Service

// List returns all resources of a type, optionally scoped to a namespace.
// Checks informer cache first; falls back to direct API call on cache miss.
func (s *Service) List(ctx context.Context, conn *cluster.ClusterConnection,
    gvr schema.GroupVersionResource, namespace string) ([]ResourceSummary, error)

// Get returns a single resource by name and namespace.
func (s *Service) Get(ctx context.Context, conn *cluster.ClusterConnection,
    gvr schema.GroupVersionResource, namespace, name string) (*unstructured.Unstructured, error)

// Apply performs a server-side apply. Creates if not exists, updates if exists.
func (s *Service) Apply(ctx context.Context, conn *cluster.ClusterConnection,
    obj *unstructured.Unstructured) error

// Delete deletes a resource. Uses Foreground propagation by default.
func (s *Service) Delete(ctx context.Context, conn *cluster.ClusterConnection,
    gvr schema.GroupVersionResource, namespace, name string) error

// Patch applies a strategic merge patch.
func (s *Service) Patch(ctx context.Context, conn *cluster.ClusterConnection,
    gvr schema.GroupVersionResource, namespace, name string, patch []byte) error

// StartWatch registers an informer for a GVR and begins emitting watch events.
// Idempotent — calling for the same GVR+cluster+namespace is a no-op.
func (s *Service) StartWatch(conn *cluster.ClusterConnection,
    gvr schema.GroupVersionResource, namespace string) error

// StopWatch stops and removes the informer for the given GVR+cluster+namespace.
func (s *Service) StopWatch(conn *cluster.ClusterConnection,
    gvr schema.GroupVersionResource, namespace string)

// ResourceSummary is a trimmed representation safe for IPC serialisation.
// The full Unstructured object is only sent when explicitly requested (YAML view).
type ResourceSummary struct {
    Name              string
    Namespace         string
    UID               types.UID
    ResourceVersion   string
    Labels            map[string]string
    Annotations       map[string]string
    CreationTimestamp metav1.Time
    // Type-specific fields are in a map[string]any for extensibility
    // (avoids a giant union type)
    Fields            map[string]any
}
```

**Dependencies:** `internal/cluster`, `internal/events`, `k8s.io/client-go`

**Design patterns:** Repository pattern over the K8s API. Cache-aside pattern (check cache, then API). The `ResourceSummary` type is a DTO that decouples the IPC representation from the K8s API types.

---

#### `internal/stream` ✅ Implemented

**Responsibility:** Long-lived streaming connections: logs, exec, port-forward, events. Manages goroutine lifetimes for streams. Does NOT buffer to disk — log buffering is in-memory only.

**Public API:**
```go
// Handler manages all active streaming sessions.
type Handler struct { /* private, uses sync.Map for sessions */ }

func NewHandler(emitter *events.Emitter) *Handler

// StreamLogs starts streaming logs from a container.
// Lines are emitted as Wails events: "log-line:{sessionID}".
// Returns a sessionID; caller uses it to stop the stream.
func (h *Handler) StreamLogs(ctx context.Context, conn *cluster.ClusterConnection,
    namespace, pod, container string, opts LogOptions) (sessionID string, err error)

type LogOptions struct {
    Follow     bool
    TailLines  int64
    Since      *metav1.Time
    Timestamps bool
}

// StopStream cancels an active stream by sessionID.
func (h *Handler) StopStream(sessionID string)

// ExecCreate opens a new exec session.
// Emits "exec-output:{sessionID}" events for terminal data.
// Returns sessionID; frontend sends input via ExecInput().
func (h *Handler) ExecCreate(ctx context.Context, conn *cluster.ClusterConnection,
    namespace, pod, container string, command []string, tty bool) (sessionID string, err error)

// ExecInput sends stdin data to an exec session.
func (h *Handler) ExecInput(sessionID string, data string) error

// ExecResize sends a terminal resize event to the exec session.
func (h *Handler) ExecResize(sessionID string, rows, cols uint16) error

// PortForwardCreate opens a local port forward.
func (h *Handler) PortForwardCreate(ctx context.Context, conn *cluster.ClusterConnection,
    namespace, pod string, localPort, remotePort int) (sessionID string, err error)
```

**Dependencies:** `internal/cluster`, `internal/events`

**Design patterns:** Session management with `sync.Map`. Each session is a struct with a cancel function. The handler is a registry and router, not a single-instance.

---

#### `internal/helm` ✅ Implemented

**Responsibility:** Helm v3 release management using the official Helm SDK (`helm.sh/helm/v3`). Does NOT manage chart repositories on behalf of the user beyond what the Helm SDK naturally provides.

**Public API:**
```go
type Client struct { /* private; holds helm action.Configuration */ }

// NewClient creates a Helm client scoped to a namespace and cluster.
func NewClient(restConfig *rest.Config, namespace string) (*Client, error)

func (c *Client) ListReleases() ([]*release.Release, error)
func (c *Client) GetRelease(name string) (*release.Release, error)
func (c *Client) GetReleaseHistory(name string) ([]*release.Release, error)
func (c *Client) Uninstall(name string) error
func (c *Client) Rollback(name string, version int) error
// Install and Upgrade take chart path and values map
func (c *Client) Install(name, chartPath string, values map[string]any) (*release.Release, error)
func (c *Client) Upgrade(name, chartPath string, values map[string]any) (*release.Release, error)
```

**Dependencies:** `helm.sh/helm/v3`, `internal/cluster`

**Design patterns:** Facade over the Helm SDK action classes. Each `Client` is scoped to a namespace; the handler creates one per namespace on demand.

---

#### `internal/events` ✅ Implemented

**Responsibility:** Fan-out event emitter that decouples internal Go subsystems from the Wails runtime. This package is the only place that calls `runtime.EventsEmit`. All other packages call `emitter.Emit()`.

**Public API:**
```go
type Emitter struct { /* private; holds wails ctx */ }

func NewEmitter(wailsCtx context.Context) *Emitter

// Emit sends an event to the frontend.
// topic should follow the pattern: "domain:clusterID:detail"
func (e *Emitter) Emit(topic string, payload any)
```

**Dependencies:** `github.com/wailsapp/wails/v2/pkg/runtime`

**Design patterns:** Adapter pattern — wraps the Wails event API behind a clean internal interface, making internal packages independent of the Wails framework and easier to test.

---

#### `internal/config` ✅ Implemented

**Responsibility:** Persist and restore application settings that are independent of kubeconfig. This includes cluster aliases, UI preferences, window state, pinned resources, and column configurations.

**Public API:**
```go
type Store struct { /* private; JSON on disk */ }

// Path: ${XDG_CONFIG_HOME}/kubeviewer/config.json (or ~/Library/... on macOS)
func NewStore() (*Store, error)

func (s *Store) GetClusters() []ClusterEntry
func (s *Store) AddCluster(entry ClusterEntry) error
func (s *Store) RemoveCluster(id string) error
func (s *Store) GetUIPreferences() UIPreferences
func (s *Store) SetUIPreferences(prefs UIPreferences) error
func (s *Store) GetWindowState() WindowState
func (s *Store) SetWindowState(state WindowState) error

type ClusterEntry struct {
    ID             string
    DisplayName    string
    KubeconfigPath string
    ContextName    string
    Color          string  // sidebar indicator color
    Order          int
}

type UIPreferences struct {
    Theme            string  // "dark" | "light"
    SidebarWidth     int
    DefaultNamespace string
    // Column visibility per resource type
    ColumnConfig map[string][]ColumnState
}
```

**Dependencies:** Standard library only (`encoding/json`, `os`, `path/filepath`)

**Design patterns:** Persisted value object. Atomic writes (write to temp file, rename) to prevent corruption on crash.

---

#### `handlers/` ✅ Implemented

**Responsibility:** Thin Wails-bound structs. Each handler method is the adapter between the frontend's request (JSON-serializable arguments) and the internal service layer. Handlers do not contain business logic. They validate inputs, call services, and translate errors.

```go
// ClusterHandler handles cluster management operations.
type ClusterHandler struct {
    manager *cluster.Manager
    config  *config.Store
}

// ResourceHandler handles generic K8s resource operations.
type ResourceHandler struct {
    svc     *resource.Service
    manager *cluster.Manager
}

// StreamHandler handles log, exec, and port-forward operations.
type StreamHandler struct {
    handler *stream.Handler
    manager *cluster.Manager
}

// HelmHandler handles Helm release operations.
type HelmHandler struct {
    manager *cluster.Manager
}

// ConfigHandler handles app configuration persistence.
type ConfigHandler struct {
    store *config.Store
}
```

Each bound method follows the signature: `func (h *XHandler) MethodName(ctx context.Context, args...) (ReturnType, error)`

The `ctx` is the Wails context (cancelled on app shutdown). All methods are safe to call concurrently from the frontend.

---

### React Frontend

#### `src/stores/`

**`clusterStore.ts`**

Holds cluster metadata and connection status. Updated by Wails events from `ClusterHandler`.

```typescript
interface ClusterStore {
  clusters: ClusterEntry[]          // All known clusters
  activeClusterId: string | null    // Currently selected cluster
  connectionStatus: Map<string, ConnectionStatus>  // Per-cluster health
  setActiveCluster: (id: string) => void
  updateStatus: (id: string, status: ConnectionStatus) => void
}
```

**`resourceStore.ts`**

Holds cached resource data. Two operations: full replace (on initial fetch) and patch (on watch event).

```typescript
interface ResourceStore {
  // Key: `${clusterId}:${gvr}:${namespace}`
  cache: Map<string, { items: ResourceSummary[]; lastFetched: number }>
  setResources: (key: string, items: ResourceSummary[]) => void
  applyWatchEvent: (event: WatchEvent) => void
  invalidate: (clusterId: string) => void  // On cluster disconnect
}
```

**`uiStore.ts`**

Holds all UI state that should persist across navigation but not across app restarts (window-lifetime state). Persisted state (column config, theme) is loaded from `ConfigHandler.GetUIPreferences()` on startup.

```typescript
interface UIStore {
  sidebarWidth: number
  theme: 'dark' | 'light'
  activeNamespace: Map<string, string>  // Per cluster
  columnConfig: Map<string, ColumnState[]>  // Per resource type
  commandPaletteOpen: boolean
  recentResources: ResourceRef[]  // Ring buffer of 20
  activeSessions: SessionInfo[]  // Exec/log sessions in tray
}
```

#### `src/hooks/`

**`useKubeResource.ts`**

The primary data-fetching hook. Manages fetch lifecycle, cache reads, watch subscriptions, and error state.

```typescript
function useKubeResource<T extends ResourceSummary>(
  gvr: string,         // "apps/v1/deployments"
  namespace: string,   // "" = all namespaces
  options?: { watch?: boolean; refetchInterval?: number }
): { data: T[]; loading: boolean; error: KubeError | null }
```

Internally:
1. Reads from `resourceStore` — renders immediately if cache is fresh.
2. Calls `ResourceHandler.ListResources()` if stale.
3. Registers a Wails event listener for the resource's watch topic if `watch: true`.
4. Cleans up the event listener on unmount.

**`useLogStream.ts`**

```typescript
function useLogStream(
  clusterID: string, namespace: string, pod: string, container: string,
  opts: LogOptions
): { lines: LogLine[]; status: 'connecting' | 'streaming' | 'ended' | 'error' }
```

**`useShortcuts.ts`**

Global keyboard shortcut registry. Scoped shortcuts (e.g., delete in resource table) are registered by components and automatically cleaned up on unmount.

```typescript
function useShortcut(
  key: string,         // e.g., "ctrl+k", "meta+k", "delete"
  handler: () => void,
  options?: { scope?: string; enabled?: boolean }
): void
```

#### `src/views/`

Each view is a route component. Views are thin — they use hooks for data and delegate rendering to components.

```
ClusterOverview.tsx    → Dashboard: node counts, pod status, recent events
Workloads.tsx          → Route wrapper for workload sub-routes
Pods.tsx               → Pod list + detail panel
Deployments.tsx        → Deployment list + detail panel
StatefulSets.tsx
DaemonSets.tsx
Jobs.tsx
CronJobs.tsx
Services.tsx
Ingresses.tsx
ConfigMaps.tsx
Secrets.tsx
Namespaces.tsx
Nodes.tsx
PersistentVolumes.tsx
PersistentVolumeClaims.tsx
HelmReleases.tsx
Settings.tsx
```

Each view follows the same pattern:
1. Call `useKubeResource` with the appropriate GVR.
2. Pass data to `<ResourceTable>` component.
3. On row selection, render `<ResourceDetailPanel>` with the selected resource.
4. Detail panel shows tabs: Overview, YAML, Events, (resource-specific tabs).

#### `src/components/`

**`ui/`** — Base primitives, all unstyled from Radix UI with Tailwind classes applied:
- `Button`, `Badge`, `Dialog`, `DropdownMenu`, `Tooltip`, `ContextMenu`
- `Tabs`, `Separator`, `Input`, `Select`, `Switch`
- All components accept `className` and forward refs.
- No external class names from Radix are used; all styling is bespoke.

**`table/`** — Resource table built on TanStack Table:
- `ResourceTable` — main table with virtualisation, column resize, sort, filter
- `ColumnHeader` — sortable header with column settings
- `StatusBadge` — colored badge for pod/deployment status
- `AgeCell` — relative age with tooltip showing absolute time

**`editor/`** — Monaco YAML editor wrapper:
- `YAMLEditor` — Monaco instance with kubernetes schema, save handler, read-only mode
- `YAMLDiff` — Monaco diff editor for comparing before/after apply

**`command-palette/`** — cmdk-based command palette:
- Searches across: clusters (switch), resources (navigate), recent views, actions (delete, restart, scale)
- Categories shown with icons; keyboard-navigable

---

## Security Model

### RBAC Enforcement

KubeViewer respects Kubernetes RBAC. It does not implement its own authorization — it relies entirely on the K8s API server to enforce permissions. However, it improves UX by proactively checking permissions and disabling actions the user cannot perform.

**SelfSubjectAccessReview (SSAR) checks:**

When a resource detail panel opens, the `ResourceHandler` fires a batch of SSAR checks:

```go
// CheckPermissions checks whether the current user can perform common actions
// on a specific resource. Returns a map of action → allowed.
func (h *ResourceHandler) CheckPermissions(
    ctx context.Context, clusterID string,
    namespace, resource, name string,
) (map[string]bool, error)
```

The checks include: `get`, `list`, `update`, `patch`, `delete`, `create`, `exec` (for pods).

The frontend receives this map and uses it to:
- Disable action buttons (delete, edit, scale) with a tooltip explaining the missing permission.
- Hide the YAML edit button if `update` is not allowed.
- Hide the exec button if `pods/exec` subresource is not allowed.

**Important:** These checks are UI hints only. The actual authorization is enforced by the API server. If a check incorrectly returns `allowed: true` (e.g., due to RBAC changes between check and action), the API server will return 403, which the error handling system will display.

SSAR checks are cached for 60 seconds per resource to avoid flooding the API server on every panel open.

### Credential Handling

- `rest.Config` objects hold the authentication credentials. These live only in heap memory for the duration of the cluster connection.
- Tokens are never written to app config. Only the kubeconfig path and context name are persisted.
- On `Disconnect`, the `ClusterConnection` struct is removed from the manager's map; the GC will collect the `rest.Config` and its embedded token.
- The exec-credential provider in `client-go` is called on demand when tokens expire. The resulting token is stored only in the `rest.Config` in memory.
- KubeViewer never logs credential values. All log output from `internal/` packages uses structured logging with explicit field allowlisting.

### kubeconfig Security

- The app reads kubeconfig files at the path the user specifies (or the default `~/.kube/config`). It does not copy or cache the file content.
- File permissions: if the kubeconfig file is group- or world-readable (permissions > `0600`), a warning is shown in the cluster connection UI. The connection proceeds — KubeViewer does not enforce file permissions on behalf of the OS.
- Certificate data embedded in kubeconfig (`certificate-authority-data`, `client-certificate-data`, `client-key-data`) is held only in the parsed `rest.Config`; not extracted to separate files and not logged.
- The `token` field in kubeconfig (static tokens) is similarly held in memory only.

### Frontend Security (Electron/WebView considerations)

Wails v2 on macOS uses WebKit; on Windows it uses WebView2. Both are system webviews with some restrictions:

- **No eval()**: The frontend does not use `eval()`, `new Function()`, or dynamic script injection. ESLint rule `no-eval` is enforced.
- **No dangerouslySetInnerHTML**: All user-visible data (pod names, annotations, log lines) is rendered via React's standard JSX escaping. The YAML editor uses Monaco's sanitised renderer.
- **Content Security Policy**: Wails does not support HTTP-based CSP headers for WebView. Instead, the app avoids loading remote resources; all assets are bundled. No external CDN URLs appear in the frontend code.
- **Secret decoding is client-side**: Secret values are decoded from base64 in the frontend (`atob()`), never sent decoded over the IPC bridge. The Go backend only sees the raw `data` map with base64-encoded values.
- **Log line injection**: Log lines are rendered in xterm.js which handles escape codes safely. Raw log content is never set as `innerHTML`.

### Secret Masking

- Secrets are fetched and displayed like any other resource, but `data` values are masked with `••••••` by default in the detail panel.
- "Reveal" button decodes and shows the value client-side. The revealed value is shown for 30 seconds, then re-masked. This is implemented with a `useTimeout` hook.
- Secret values are never included in telemetry, log output, or error messages.
- In the resource table view, the `data` column is hidden for Secret resources by default. Column configuration cannot make secret values visible in the table (only in the detail panel with explicit reveal).

### Input Validation

- All handler method arguments are validated before use:
  - Cluster ID: must exist in `ClusterManager`; otherwise return `ErrUnknownCluster`.
  - Namespace: validated against `[a-z0-9-]` pattern; empty is allowed (means all namespaces).
  - Resource name: validated against K8s DNS subdomain rules.
  - GVR strings: parsed and validated against discovered API resources.
- YAML content submitted for apply is parsed by `k8s.io/apimachinery/pkg/util/yaml` before being sent to the API server. Parsing errors are returned to the frontend before any API call is made.
- Port numbers in port-forward are validated to be in `[1, 65535]` and not in reserved ranges by default.

---

## Performance Targets

### Startup Time

| Metric | Target | Measurement |
|---|---|---|
| App window visible (first paint) | < 500ms | From OS launch to first non-blank frame |
| Sidebar rendered with cluster list | < 800ms | From OS launch to interactive sidebar |
| First resource list visible after launch | < 1500ms | Includes kubeconfig parse + first cluster connect |
| Cold start on slow disk | < 2000ms | With 10MB kubeconfig, slow SSD |

**How targets are met:**
- Wails builds a single binary; no JVM or interpreter startup cost.
- The Go backend is ready to serve IPC calls within ~100ms of process start.
- The React frontend is a pre-built bundle; no on-the-fly compilation.
- Cluster connection is started immediately on startup if a "default cluster" is configured.
- The resource list view renders a skeleton immediately; data fills in as the first informer sync completes.

### Memory Budget

| Component | Budget | Notes |
|---|---|---|
| Go backend baseline | < 50MB RSS | Before any cluster is connected |
| Per cluster overhead | < 30MB RSS | Informer caches for 10 resource types |
| 1,000 pods in cache | < 15MB | ~15KB per pod in unstructured form |
| 10,000 pods in cache | < 150MB | Linear scaling |
| SQLite database (disk) | ~50MB typical | Resource snapshots + history + audit + FTS index; 200MB hard cap |
| Log buffer (50k lines) | < 25MB | Circular buffer; lines are strings |
| WebView (frontend) | < 150MB | Typical WebKit/WebView2 for a dense SPA |
| **Total for typical cluster** | **< 300MB RSS** | 500 pods, 50 nodes, 200 services (SQLite is on disk, not RSS) |
| **Large cluster ceiling** | **< 600MB RSS** | 10k pods, 1k nodes, all resource types active |

**How budget is maintained:**
- `ResourceSummary` is a trimmed struct — full `Unstructured` objects are not held in memory beyond informer cache lifetime.
- Informers for resource types not currently viewed are not started. `StartWatch` is called when a view mounts; `StopWatch` when it unmounts and there are no other active subscribers.
- Log circular buffer enforces 50k line limit; oldest lines are dropped.
- Frontend Zustand store only holds `ResourceSummary` arrays, not full YAML. Full YAML is fetched on demand for the detail YAML tab and not stored in Zustand.
- Go GC is tuned with `GOGC=100` (default). No special GC tuning needed at these memory levels.

### Large Cluster Handling

| Scenario | Target behavior |
|---|---|
| 10,000 pods | Pod list renders in < 200ms; table virtualizes (only ~30 rows rendered in DOM at once) |
| 1,000 nodes | Node list renders in < 100ms; same virtualisation |
| 100 namespaces | Namespace filter dropdown remains responsive; uses cmdk for fuzzy search |
| 500 CRDs | CRD discovery completes in < 5s; sidebar dynamically populates |
| 1,000 events/min | Event feed ring buffer drops oldest; frontend renders at 60fps with no jank |
| 100 concurrent informers | Go handles without issue; each informer is a single goroutine + HTTP/2 stream |

**Scaling techniques:**
- **Virtualised tables**: TanStack Table's `@tanstack/react-virtual` renders only visible rows. A list of 10k pods renders identically to a list of 10 in terms of DOM nodes.
- **Incremental watch events**: Watch events apply patch operations to the Zustand store. A single pod status change does not cause a full re-render of the pods list.
- **Informer indexers**: `client-go` informer `Store` supports `IndexFunc` for O(1) namespace lookups. The resource service uses this to avoid full-list scans on namespace-filtered queries.
- **Debounced event fan-out**: If a burst of 1,000 watch events arrives (e.g., rolling update of 100 pods), the `EventEmitter` batches events into 50ms windows. The frontend receives one batch instead of 1,000 individual messages.

### Event Throughput

| Metric | Target |
|---|---|
| Watch events processed by Go | > 10,000 events/sec |
| Watch events delivered to frontend | > 1,000 events/sec (batched at 50ms window) |
| Log lines streamed | > 10,000 lines/sec per pod (line-buffered) |
| IPC method call latency (p95) | < 20ms (excluding K8s API time) |
| IPC event delivery latency | < 50ms (from `EventsEmit` to frontend handler) |

---

## Non-Goals (Phase 1–3)

These features are explicitly out of scope. Each entry explains **why** to prevent scope creep.

### Multi-Window Support
**Why not:** Wails v2 supports only one window per process. Multi-window would require v3 (still alpha) or a multi-process architecture. The single-window model is consistent with Lens and sufficient for the target use case. Revisit when Wails v3 stabilises.

### Plugin / Extension System
**Why not:** Building a stable, versioned plugin API requires the core API to be stable first. Designing a plugin system on an evolving API would require constant breaking changes. The extension architecture will be defined in Phase 4 after Phase 1–3 have validated the core design. Building hooks for a plugin system too early leads to over-engineering.

### Cloud-Specific Integrations (EKS, AKS, GKE auto-discovery)
**Why not:** Cloud provider SDKs are large dependencies and their auth flows change frequently. Users can configure their clusters in kubeconfig using standard tools (`aws eks update-kubeconfig`, `az aks get-credentials`). KubeViewer benefits from these existing tools rather than duplicating them. Cloud-native integrations would also require separate builds for each cloud provider or a plugin approach.

### AI / LLM Features (explain errors, suggest YAML)
**Why not:** LLM API calls require internet connectivity and API key management. They introduce latency, cost, and privacy considerations (K8s resource data sent to third parties). KubeViewer is designed as an offline-capable desktop tool. AI features belong in a separate plugin after the core is stable and after explicit user consent flows are designed.

### Cluster Provisioning and Lifecycle Management
**Why not:** Creating, upgrading, and deleting clusters is a complex domain that varies significantly by provider (kubeadm, Cluster API, EKS, GKE, k3s). This is out of scope by design — KubeViewer manages resources inside running clusters, not the cluster infrastructure itself. This scope boundary keeps the product focused and prevents feature overlap with tools like Rancher, Cluster API UI, and cloud consoles.

### Cost Analysis and FinOps
**Why not:** Accurate cost analysis requires cloud billing APIs which are provider-specific, require credentials beyond kubeconfig, and depend on pricing data that changes frequently. Cost analysis tools (Kubecost, OpenCost) are purpose-built for this and expose K8s-native APIs. KubeViewer can show resource requests/limits (which are inputs to cost estimation) but not costs themselves.

### RBAC Visualization (graph view)
**Why not:** RBAC visualization (who can do what, permission graphs) is a standalone capability that requires substantial graph rendering work and careful UX design. Phase 1 focuses on RBAC resource browsing (list roles and bindings). A full visualization will be a dedicated feature in Phase 3 or later.

### Network Policy Visualization (graph view)
**Why not:** Same reasoning as RBAC visualization. Policy graphs are valuable but require significant custom rendering and are rarely the day-to-day task. Phase 2 handles listing NetworkPolicy resources; a graph view is Phase 3+.

### Audit Log Streaming
**Why not:** Kubernetes audit logs require API server configuration (`--audit-log-path`, `--audit-webhook-config`) that is cluster-specific and often not exposed via the API. This is an operational concern for cluster administrators, not the daily driver use case KubeViewer targets.

### Multi-Tenancy (shared instance serving multiple users)
**Why not:** KubeViewer is a single-user desktop application. Each user runs their own instance with their own kubeconfig credentials. There is no server component and no concept of multi-tenancy. This keeps the security model simple — each process has exactly the permissions of the user who launched it.

### Windows ARM64 Support (Phase 1)
**Why not:** Wails v2 Windows builds target x64. Windows ARM64 (Surface Pro X, Snapdragon PCs) is a small market segment and cross-compilation is more complex. macOS (Apple Silicon via universal binary) and Linux ARM64 are supported. Windows ARM64 is a Phase 2 consideration after validating the x64 build.

---

## Key Architectural Decisions (Rationale)

### Wails v2 over v3
v3 is alpha and its API surface changes between releases. v2 (2.9.x) is stable, production-tested, and has a clear migration path. The single-window limitation in v2 is acceptable — Lens also operates in a single window. If v3 reaches stability before Phase 3 ships, the migration is documented and involves mainly handler registration changes.

### Multiple Bound Structs over Monolithic App
One giant `App` struct bound to Wails leads to a god object. Five focused handlers (`ClusterHandler`, `ResourceHandler`, `StreamHandler`, `HelmHandler`, `ConfigHandler`) keep each handler unit-testable, keep the generated TypeScript bindings organized into logical namespaces, and allow different handlers to be swapped for mocks in tests.

### Zustand over Redux
Zustand stores require no provider wrapper, no action constants, no reducers, no connect() HOC. For a Wails frontend that needs to react to Go-pushed events, Zustand's `getState()` API (callable outside React components, from event handler callbacks) is critical. Redux's architecture is optimised for user-initiated actions flowing through a predictable pipeline; our architecture has a significant reverse channel (Go pushing events to frontend), which Zustand handles more naturally.

### Tailwind + Radix UI over a Component Library (MUI, Chakra, etc.)
Achieving the Linear design quality requires pixel-level control. Every component library imposes visual opinions that need to be overridden. Radix provides the behavioural correctness (focus traps, ARIA roles, keyboard navigation, screen reader support) without any visual opinions. Tailwind applies styling exactly as designed. The result is a fully custom design that passes accessibility audits without managing a fork of a third-party component library.

### TanStack Table over Pre-Built Tables (AG Grid, MUI DataGrid)
Resource tables are the primary UI surface — most user time is spent looking at lists of pods, deployments, services. We need: row virtualisation for 10k+ rows, fully custom cell renderers (status badges, age cells, action buttons), custom column ordering and visibility persistence, and multi-sort. TanStack Table is headless and provides all of this with no bundle size overhead from unneeded features. AG Grid's enterprise features are unnecessary and its license is a compliance consideration.

### client-go over Raw HTTP
client-go handles: exec-based authentication providers, OIDC token refresh, certificate verification, API version negotiation (preferred version selection for resources that exist in multiple API groups), watch reconnection and resync, informer caching, typed API methods, and the entire `SharedInformer` infrastructure. Reimplementing this would be many months of work and would produce a worse result. The only trade-off is that `client-go` is a large dependency, but for a desktop app shipping as a static binary, this is not a concern.

### Events for Push, Method Calls for Pull
This maps cleanly to K8s semantics. K8s supports both request/response (GET resources) and watch streams (watch resources). Method calls are request/response: the frontend asks for data, Go returns it. Events are push: Go detects a change and notifies the frontend. This bidirectional model means the frontend never needs to poll — it is always up-to-date through the watch mechanism, and can also refresh on demand via method calls.

### Dynamic Client for CRDs
`client-go` typed clients require code generation for each resource type. CRDs are defined at runtime by the cluster operator. Using `dynamic.Interface` with `unstructured.Unstructured` allows KubeViewer to work with any CRD without code generation. The cost is losing compile-time type safety for CRD fields, but `ResourceSummary.Fields map[string]any` makes this explicit at the IPC boundary.
