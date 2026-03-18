# Clusterfudge Architecture

A fast, keyboard-first Kubernetes desktop app built with Go + React.

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Desktop framework | Wails v2 | Native window with Go backend, embedded web frontend, no Electron overhead |
| Backend | Go 1.25 | Strong K8s client-go ecosystem, goroutines for concurrent watches |
| Frontend | React 19, TypeScript | Component model, lazy loading, virtual DOM for large lists |
| Styling | Tailwind CSS 3 | Utility-first, dark theme default, fast iteration |
| State management | Zustand | Minimal boilerplate, devtools support, per-store slices |
| UI primitives | Radix UI | Accessible, unstyled components (dialogs, menus, tooltips) |
| Tables | TanStack Table v8 | Headless, sortable, filterable, column customization |
| Virtualization | TanStack Virtual | Renders only visible rows for 10k+ resource lists |
| Terminal | xterm.js v6 | Pod exec shells, log viewing |
| Editor | Monaco Editor | YAML editing with syntax highlighting, diff view |
| Routing | React Router v7 | Hash-based routing inside the Wails webview |
| Helm | Helm v3 SDK | Direct SDK integration, no CLI shelling |
| Kubernetes | client-go, dynamic client, metrics API | Typed + dynamic resource access |

---

## Project Layout

```
clusterfudge/
  main.go                  # Wails app bootstrap, service wiring
  app.go                   # Lifecycle (startup/shutdown), event emitter setup
  wails.json               # Wails project config

  handlers/                # Wails-bound handler structs (frontend-callable API)
    cluster_handler.go     # Connect, disconnect, switch context, RBAC, metrics
    resource_handler.go    # Generic CRUD, watch, scale, restart, cordon/drain
    stream_handler.go      # Log streaming, exec sessions, port forwarding
    helm_handler.go        # Helm release management
    secret_handler.go      # Masked secret access with audit logging
    config_handler.go      # App settings persistence
    alert_handler.go       # Alert rules and notifications
    audit_handler.go       # Audit log queries
    backup_handler.go      # Resource manifest export
    gitops_handler.go      # ArgoCD/Flux detection
    netpol_handler.go      # Network policy graph builder
    rbac_handler.go        # RBAC relationship graph builder
    security_scan_handler.go # Pod security scanning
    template_handler.go    # YAML template engine
    troubleshoot_handler.go # Guided troubleshooting
    update_handler.go      # Auto-update checks
    wizard_handler.go      # Deployment/Service/ConfigMap/Secret wizards

  internal/                # Private Go packages
    cluster/               # Kubeconfig parsing, connection management, reconnect
    k8s/                   # SharedInformerFactory, dynamic client, GVR registry
    resource/              # Generic resource CRUD service
    stream/                # Log streaming, exec sessions, port forwarding
    helm/                  # Helm v3 SDK wrapper
    config/                # JSON config store with file persistence
    events/                # Wails event emitter abstraction
    cache/                 # LRU cache for API responses
    audit/                 # Audit trail logger
    alerts/                # Alert rule engine and store
    backup/                # Resource manifest export/strip
    gitops/                # ArgoCD/Flux CRD detection
    netpol/                # Network policy graph builder
    rbacgraph/             # RBAC relationship graph builder
    security/              # Pod security scanner, secret detection
    templates/             # YAML template engine with builtins
    troubleshoot/          # Root cause analysis engine
    updater/               # GitHub release checker, scheduler
    wizards/               # Manifest generators for common resources

  ui/                      # React/TypeScript frontend
    src/
      App.tsx              # Route definitions (50+ routes)
      layouts/AppShell.tsx # Main layout: sidebar + topbar + content + bottom tray
      pages/               # One file per resource view (PodList, DeploymentDetail, etc.)
      components/          # Reusable UI components
        sidebar/           # Collapsible navigation sidebar
        topbar/            # Title bar with namespace selector
        bottom-tray/       # Logs, events, terminal tabs
        table/             # ResourceTable, BatchActionBar, search, skeletons
        detail/            # Detail panel, container cards, log viewer
        cells/             # StatusDot, LabelChips, MetricsBar, RelativeTime
        dialogs/           # Scale, Restart, Delete, Drain, ContextMenu
        command-palette/   # Cmd+K command palette
        editor/            # Monaco YAML editor
        settings/          # Settings UI primitives
        hex/               # Hex grid visualization (node map)
        shortcuts/         # Keyboard shortcut overlay
      stores/              # Zustand state stores
        clusterStore.ts    # Active cluster, connection state
        uiStore.ts         # Sidebar, tray, theme preferences
        selectionStore.ts  # Multi-select state for batch operations
        favoritesStore.ts  # Cluster favorites
        settingsStore.ts   # App configuration
        toastStore.ts      # Toast notifications
      hooks/               # Custom React hooks
      lib/                 # Column definitions, formatters, CSV export
      wailsjs/             # Auto-generated Wails bindings (Go handler → TS)
      providers/           # ThemeProvider, SettingsProvider

  test/e2e/                # End-to-end tests (24 test files)
  scripts/                 # Build and utility scripts
  build/                   # Platform-specific build assets
```

---

## Data Flow

```
┌──────────────────────────────────────────────────┐
│                    Frontend                       │
│                                                   │
│  Zustand Store ←→ React Component ←→ Wails Call   │
│       ↕                                   ↕       │
│  Event Listener              Wails Runtime Bridge  │
└───────────────────────┬──────────────────────────┘
                        │  Wails IPC (JSON)
┌───────────────────────┴──────────────────────────┐
│                   Go Backend                      │
│                                                   │
│  Handler ──→ Internal Service ──→ client-go       │
│     ↕                                ↕            │
│  events.Emitter              K8s API Server       │
│  (push events to frontend)                        │
└──────────────────────────────────────────────────┘
```

1. **Frontend → Backend**: The frontend calls handler methods via Wails-generated TypeScript bindings (e.g., `ClusterHandler.Connect("my-context")`). These are synchronous RPC-style calls that return typed results.

2. **Backend → Frontend**: For real-time data (log lines, watch events, health status), the backend uses `events.Emitter` to push events over the Wails event bus. The frontend subscribes with `EventsOn("topic", callback)`.

3. **Kubernetes API**: All K8s access goes through `client-go`. Typed clients for core resources, dynamic client for CRDs. SharedInformerFactories maintain local caches with list/watch.

---

## Key Design Decisions

### Wails over Electron

Wails produces a native binary (~15 MB) vs Electron's ~150 MB. The Go backend runs natively rather than in a Node.js process, giving direct access to the client-go SDK without an HTTP bridge layer.

### Handler Pattern

Each handler struct groups related Wails-callable methods. Handlers are thin adapters that delegate to `internal/` packages. This keeps business logic testable independently of the Wails runtime.

### Generic Resource Service

`resource.Service` provides `List`, `Get`, `Apply`, `Delete` for any Kubernetes resource via GVR (Group/Version/Resource) parameters. This avoids writing per-resource-type handler methods for basic CRUD. Typed operations (scale, restart, cordon) are implemented as specific handler methods.

### Event-Driven UI Updates

Resource watches push `ADDED`/`MODIFIED`/`DELETED` events to the frontend. The frontend merges these into its local state for instant UI updates without re-fetching entire lists.

### Lazy Loading

All page-level components are `React.lazy()` loaded. Only `ClusterOverview` (the landing page) is eagerly loaded. This keeps initial bundle small and subsequent navigation fast.

### Audit Trail for Sensitive Operations

Secret access (view and reveal) is logged through `audit.Logger`. The audit system records who accessed what and when, producing a queryable audit log.

### RBAC Pre-flight Checks

Before performing mutations (delete, scale, apply), the frontend can call `CheckRBACPermission` to verify the user has the required Kubernetes RBAC permissions. This provides clear error messages instead of opaque 403s.

---

## Connection Lifecycle

```
Disconnected ──→ Connecting ──→ Connected
                     ↓               ↓
                   Error        Reconnecting ──→ Connected
                                     ↓
                                   Error
```

- `cluster.Manager` owns the active connection and client bundle (typed + dynamic + metrics clients).
- `PreflightCheck` validates reachability and authentication before connecting.
- `kubeconfig_watcher.go` monitors kubeconfig files for changes and emits `kubeconfig:changed` events.

---

## Configuration

App settings are stored in `config.json` (platform-appropriate config directory). The `config.Store` provides thread-safe read/write with file persistence. Settings cover:

- General: default namespace, startup behavior, update checks
- Appearance: theme (dark/light/system), accent color, font size
- Kubeconfig: custom paths, auto-reload
- Editor: tab size, word wrap, minimap
- Terminal: font size, cursor style, shell command, copy-on-select
- Advanced: cache TTL, max log lines, K8s client QPS/burst/timeout
- Window state: position, size, sidebar width, bottom tray state, active route
