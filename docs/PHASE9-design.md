# Phase 9 — Competitive Feature Parity: Troubleshooting, GitOps, Security, Mobile & Extensibility

## Goal

Close the remaining feature gaps identified from the leading Kubernetes GUI tools (Komodor, Rancher, Lens, Headlamp, Cyclops, K9s, Portainer). This phase adds guided troubleshooting, form-based deployment wizards, GitOps integration, alerting, security scanning, custom dashboards, a plugin system, backup/restore, graph visualizations for RBAC and network policies, audit trails, and an application catalog — plus a responsive/mobile-first design that ensures KubeViewer works on tablets and phones.

Target audience: mid-level engineer. All sections describe the feature, its architecture, and its implementation approach.

---

## Table of Contents

1. [Mobile & Responsive Access](#91--mobile--responsive-access)
2. [Guided Troubleshooting & Root Cause Analysis](#92--guided-troubleshooting--root-cause-analysis)
3. [Deployment Wizards & Form-Based Resource Creation](#93--deployment-wizards--form-based-resource-creation)
4. [YAML Templates & Template Library](#94--yaml-templates--template-library)
5. [Application Catalog & Marketplace](#95--application-catalog--marketplace)
6. [GitOps Integration (ArgoCD / Flux)](#96--gitops-integration-argocd--flux)
7. [Plugin & Extension System](#97--plugin--extension-system)
8. [Alerting & Notifications](#98--alerting--notifications)
9. [Backup & Restore](#99--backup--restore)
10. [Security Scanning & Vulnerability Assessment](#910--security-scanning--vulnerability-assessment)
11. [Custom Dashboards & Role-Based Views](#911--custom-dashboards--role-based-views)
12. [Audit Trail & Change History](#912--audit-trail--change-history)
13. [RBAC Visualization (Graph)](#913--rbac-visualization-graph)
14. [Network Policy Visualization (Graph)](#914--network-policy-visualization-graph)

---

## Cross-Cutting Concern: Mobile & Responsive Access

Mobile access is a goal **across the board** at every phase, not just Phase 9. The architecture must support touch-first, small-screen interaction from Phase 2 onward.

### Retrofit Requirements for Earlier Phases

| Phase | Retrofit |
|---|---|
| Phase 2 (Project Setup) | Add PWA manifest, service worker scaffolding, responsive viewport meta tag. Wails app continues as desktop target; a parallel `pnpm build:web` target produces a standalone SPA deployable behind any HTTP server. |
| Phase 4 (Frontend Shell) | Sidebar must collapse to bottom tab bar on screens < 768px. Topbar must stack vertically. Command palette must be full-screen on mobile. Touch targets must be >= 44px. |
| Phase 5 (Resource Views) | Tables must switch to card layout on mobile. Detail panel must go full-screen instead of slide-in. Swipe gestures for navigation. |
| Phase 6 (Real-Time Features) | Log viewer and terminal must be usable in landscape on mobile. Pinch-to-zoom on log text. |
| Phase 7 (Advanced Features) | YAML editor must use a mobile-friendly code editor (CodeMirror 6 as fallback for Monaco which does not support mobile). Helm values editor same. |
| Phase 8 (Packaging) | Add web build target alongside desktop. Dockerized web server for self-hosted deployment. |

---

## 9.1 — Mobile & Responsive Access

### Overview

KubeViewer must be usable on tablets and phones. This covers two delivery modes:

1. **Progressive Web App (PWA):** The React frontend is built as a standalone SPA with a service worker for offline caching. Deployed behind any HTTP server or as a container image. Users access it via a mobile browser and can "Add to Home Screen."
2. **Responsive Desktop:** The existing Wails desktop app adapts to narrow window sizes (e.g., side-by-side with a terminal).

### Architecture

```
┌──────────────────────────────────────────────────┐
│  React Frontend (shared codebase)                │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐ │
│  │ Desktop    │  │ Tablet     │  │ Mobile     │ │
│  │ >= 1024px  │  │ 768-1023px │  │ < 768px    │ │
│  └────────────┘  └────────────┘  └────────────┘ │
├──────────────────────────────────────────────────┤
│  Backend (two modes)                             │
│  ┌──────────────────┐  ┌──────────────────────┐  │
│  │ Wails (desktop)  │  │ Go HTTP server (web) │  │
│  │ IPC bindings     │  │ REST + WebSocket     │  │
│  └──────────────────┘  └──────────────────────┘  │
└──────────────────────────────────────────────────┘
```

### Web Backend Mode

When running as a web app, the Go backend serves the SPA and exposes the same handler methods as REST endpoints plus WebSocket channels for streaming (logs, events, exec).

```go
// internal/server/web.go
package server

// WebServer wraps all bound handlers behind HTTP routes.
// Each Wails bound method maps 1:1 to a POST /api/<handler>/<method> endpoint.
// Wails events map to WebSocket messages on /ws.
type WebServer struct {
    cluster  *handlers.ClusterHandler
    resource *handlers.ResourceHandler
    stream   *handlers.StreamHandler
    helm     *handlers.HelmHandler
    config   *handlers.ConfigHandler
}
```

### Responsive Layout Breakpoints

```css
/* Breakpoints */
--breakpoint-mobile: 768px;
--breakpoint-tablet: 1024px;

/* Mobile: bottom tab bar replaces sidebar */
@media (max-width: 767px) {
    .sidebar { display: none; }
    .bottom-tabs { display: flex; }
    .detail-panel { position: fixed; inset: 0; }
    .resource-table { display: none; }
    .resource-cards { display: flex; flex-direction: column; }
}

/* Tablet: collapsed sidebar, full content area */
@media (min-width: 768px) and (max-width: 1023px) {
    .sidebar { width: var(--sidebar-collapsed); }
    .detail-panel { width: 50%; }
}
```

### PWA Configuration

```json
{
    "name": "KubeViewer",
    "short_name": "KubeViewer",
    "start_url": "/",
    "display": "standalone",
    "background_color": "#0a0a0b",
    "theme_color": "#6366f1",
    "icons": [
        { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
        { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
    ]
}
```

---

## 9.2 — Guided Troubleshooting & Root Cause Analysis

### Overview

The single biggest competitive gap versus Komodor. When a pod crashes, a deployment stalls, or a node goes NotReady, users today must manually correlate events, logs, and config changes across multiple resources. KubeViewer should automate this.

### Feature Design

1. **Change Timeline:** Track all resource mutations (create, update, delete) observed via informer watches. Store a rolling window of changes (last 24h, configurable) in an in-memory timeline indexed by resource and timestamp.

2. **Correlation Engine:** When a warning event or unhealthy status is detected, automatically walk the owner reference chain and timeline to identify:
   - What changed just before the problem started
   - Which related resources are also unhealthy
   - Common root causes (OOMKilled, ImagePullBackOff, CrashLoopBackOff, node pressure, quota exceeded)

3. **Troubleshooting Panel:** A guided UI that presents:
   - The problem summary (what is wrong, since when)
   - A timeline of related changes
   - Suggested remediation steps
   - Quick actions (view logs, restart pod, scale up, check events)

### Architecture

```
┌───────────────────────────────────────────────────┐
│  Informer Watches (all resource types)            │
│  ┌─────────────┐                                  │
│  │ Change       │ ← OnAdd/OnUpdate/OnDelete       │
│  │ Recorder     │                                  │
│  └──────┬──────┘                                  │
│         ▼                                         │
│  ┌─────────────┐     ┌─────────────────────────┐  │
│  │ Timeline    │────▶│ Correlation Engine       │  │
│  │ Store       │     │ - Owner ref traversal    │  │
│  │ (ring buf)  │     │ - Pattern matching       │  │
│  └─────────────┘     │ - Root cause heuristics  │  │
│                      └──────────┬──────────────┘  │
│                                 ▼                  │
│                      ┌─────────────────────────┐  │
│                      │ Troubleshooting          │  │
│                      │ Recommendations          │  │
│                      └─────────────────────────┘  │
└───────────────────────────────────────────────────┘
```

### Backend: `internal/troubleshoot/engine.go`

```go
package troubleshoot

import "time"

// ChangeRecord represents a single observed resource mutation.
type ChangeRecord struct {
    Timestamp   time.Time         `json:"timestamp"`
    Kind        string            `json:"kind"`
    Namespace   string            `json:"namespace"`
    Name        string            `json:"name"`
    ChangeType  string            `json:"changeType"` // "created", "updated", "deleted"
    FieldDiffs  []FieldDiff       `json:"fieldDiffs,omitempty"`
    OwnerChain  []OwnerRef        `json:"ownerChain"`
}

// FieldDiff captures a single field change.
type FieldDiff struct {
    Path     string `json:"path"`     // e.g., "spec.replicas"
    OldValue string `json:"oldValue"`
    NewValue string `json:"newValue"`
}

// Investigation is a structured troubleshooting report.
type Investigation struct {
    ResourceKind  string          `json:"resourceKind"`
    ResourceName  string          `json:"resourceName"`
    Namespace     string          `json:"namespace"`
    Problem       string          `json:"problem"`
    Since         time.Time       `json:"since"`
    RootCause     string          `json:"rootCause,omitempty"`
    RelatedChanges []ChangeRecord `json:"relatedChanges"`
    Suggestions   []Suggestion    `json:"suggestions"`
}

// Suggestion is a recommended remediation action.
type Suggestion struct {
    Title       string `json:"title"`
    Description string `json:"description"`
    ActionType  string `json:"actionType"` // "view_logs", "restart", "scale", "describe", "link"
    ActionRef   string `json:"actionRef"`  // resource reference or route
}
```

### Root Cause Heuristics

| Symptom | Heuristic | Suggested Cause |
|---|---|---|
| Pod `CrashLoopBackOff` | Container exit code != 0, restartCount > 3 | Application error — check logs |
| Pod `OOMKilled` | Container last state reason = OOMKilled | Memory limit too low — increase `resources.limits.memory` |
| Pod `ImagePullBackOff` | Event reason = Failed, message contains "image" | Wrong image name/tag or missing pull secret |
| Pod `Pending` | No events, node has `MemoryPressure`/`DiskPressure` | Node resource exhaustion — scale cluster or evict workloads |
| Pod `Pending` | Event reason = `FailedScheduling`, insufficient CPU/memory | Resource quota exceeded or requests too high |
| Deployment `Progressing=False` | New RS has 0 ready replicas | Rollout stuck — check pod events |
| Node `NotReady` | Condition `Ready=False` | Node health issue — check kubelet logs |
| Service no endpoints | Selector matches 0 pods | Label mismatch or pods not running |

### Frontend: Troubleshooting Panel

```
┌─────────────────────────────────────────────────────────────┐
│  ⚠ Troubleshooting: api-server-7f4bc-xyz89                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Problem: CrashLoopBackOff since 14:32 UTC (47 min ago)    │
│  Restarts: 14 │ Last Exit Code: 137 (SIGKILL / OOMKilled)  │
│                                                             │
│  Root Cause: Container exceeded memory limit (256Mi)        │
│                                                             │
│  Timeline:                                                  │
│  14:30  Deployment "api-server" updated                     │
│         spec.template.spec.containers[0].image changed      │
│         → myrepo/api:v2.3.1 → myrepo/api:v2.4.0            │
│  14:31  ReplicaSet "api-server-7f4bc" created               │
│  14:32  Pod "api-server-7f4bc-xyz89" started                │
│  14:32  Container "api" OOMKilled (exit 137)                │
│  14:33  Pod restarted (attempt 1)                           │
│  ...                                                        │
│                                                             │
│  Suggestions:                                               │
│  [View Logs]  [Increase Memory Limit]  [Rollback Deployment]│
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 9.3 — Deployment Wizards & Form-Based Resource Creation

### Overview

Tools like Kubernetes Dashboard and Cyclops offer visual forms for creating resources without writing YAML. KubeViewer should offer form-based creation for the most common resource types.

### Supported Resource Wizards

| Resource | Form Fields |
|---|---|
| Deployment | Name, namespace, image, replicas, port, resource requests/limits, env vars, labels |
| Service | Name, namespace, type (ClusterIP/NodePort/LoadBalancer), selector, ports |
| ConfigMap | Name, namespace, key-value pairs (add/remove rows) |
| Secret | Name, namespace, type (Opaque/TLS/DockerConfig), key-value pairs with base64 toggle |
| CronJob | Name, namespace, schedule (cron expression with helper), image, command, restart policy |
| Ingress | Name, namespace, hosts, paths, TLS config, backend services |
| Namespace | Name, labels, resource quota (optional), limit range (optional) |
| PVC | Name, namespace, storage class, access mode, size |

### Architecture

Each wizard is a multi-step form that:
1. Collects input via typed form fields
2. Generates a Kubernetes resource manifest (JSON/YAML)
3. Shows the generated YAML for review before applying
4. Applies via `resource.Create()` (server-side apply)

```
┌──────────────────────────────────────────────────┐
│  Create Deployment                          [1/3]│
├──────────────────────────────────────────────────┤
│                                                  │
│  Name         [my-app                    ]       │
│  Namespace    [default                ▼  ]       │
│  Image        [nginx:1.25             ▼  ]       │
│  Replicas     [── 3 ──]                          │
│                                                  │
│  Container Port  [80     ]                       │
│  Protocol        [TCP  ▼ ]                       │
│                                                  │
│  ┌ Resources ──────────────────────────────────┐ │
│  │  CPU Request    [100m  ]  Limit  [500m  ]   │ │
│  │  Memory Request [128Mi ]  Limit  [512Mi ]   │ │
│  └─────────────────────────────────────────────┘ │
│                                                  │
│  ┌ Environment Variables ──────────────────────┐ │
│  │  KEY              VALUE                     │ │
│  │  [NODE_ENV     ]  [production           ]   │ │
│  │  [+ Add variable]                           │ │
│  └─────────────────────────────────────────────┘ │
│                                                  │
│                    [Cancel]  [Next: Labels →]    │
└──────────────────────────────────────────────────┘
```

### Backend: `internal/wizards/deployment.go`

```go
package wizards

// DeploymentSpec defines the wizard input for creating a Deployment.
type DeploymentSpec struct {
    Name            string            `json:"name"`
    Namespace       string            `json:"namespace"`
    Image           string            `json:"image"`
    Replicas        int32             `json:"replicas"`
    ContainerPort   int32             `json:"containerPort,omitempty"`
    Protocol        string            `json:"protocol,omitempty"`
    CPURequest      string            `json:"cpuRequest,omitempty"`
    CPULimit        string            `json:"cpuLimit,omitempty"`
    MemoryRequest   string            `json:"memoryRequest,omitempty"`
    MemoryLimit     string            `json:"memoryLimit,omitempty"`
    EnvVars         map[string]string `json:"envVars,omitempty"`
    Labels          map[string]string `json:"labels,omitempty"`
    ServicePort     int32             `json:"servicePort,omitempty"`
    CreateService   bool              `json:"createService,omitempty"`
}

// ToManifest converts the wizard spec into a Kubernetes Deployment manifest.
// Returns YAML string for review and the unstructured object for apply.
func (s *DeploymentSpec) ToManifest() (string, error) {
    // Build typed appsv1.Deployment from spec fields
    // Marshal to YAML for preview
    // Return both YAML string and structured object
    return "", nil
}
```

---

## 9.4 — YAML Templates & Template Library

### Overview

Inspired by Cyclops's YAML templates with variables and Portainer's template library. Users can save, version, and reuse parameterized templates.

### Feature Design

1. **Template Format:** Templates are standard Kubernetes YAML manifests with `{{ .variable }}` Go template placeholders. A frontmatter block declares variables with types, defaults, and descriptions.

2. **Template Library:** A built-in library of common templates (web server, database, queue, cron job) plus user-created templates stored locally.

3. **Template Versioning:** Templates stored in `~/.kubeviewer/templates/` with Git-style versioning (each save creates a new version).

### Template Format

```yaml
# kubeviewer-template: v1
# name: Web Application
# description: Nginx-based web application with service
# variables:
#   - name: appName
#     type: string
#     required: true
#     description: Application name
#   - name: replicas
#     type: integer
#     default: 3
#     description: Number of replicas
#   - name: image
#     type: string
#     required: true
#     description: Container image
#   - name: port
#     type: integer
#     default: 80
#     description: Container port
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .appName }}
  labels:
    app: {{ .appName }}
spec:
  replicas: {{ .replicas }}
  selector:
    matchLabels:
      app: {{ .appName }}
  template:
    metadata:
      labels:
        app: {{ .appName }}
    spec:
      containers:
        - name: {{ .appName }}
          image: {{ .image }}
          ports:
            - containerPort: {{ .port }}
---
apiVersion: v1
kind: Service
metadata:
  name: {{ .appName }}
spec:
  selector:
    app: {{ .appName }}
  ports:
    - port: {{ .port }}
      targetPort: {{ .port }}
```

### Backend: `internal/templates/engine.go`

```go
package templates

// Template represents a parameterized Kubernetes manifest template.
type Template struct {
    Name        string     `json:"name"`
    Description string     `json:"description"`
    Version     int        `json:"version"`
    Variables   []Variable `json:"variables"`
    Body        string     `json:"body"` // raw YAML with Go template placeholders
    BuiltIn     bool       `json:"builtIn"`
    CreatedAt   string     `json:"createdAt"`
}

// Variable defines a template parameter.
type Variable struct {
    Name        string `json:"name"`
    Type        string `json:"type"` // "string", "integer", "boolean", "enum"
    Required    bool   `json:"required"`
    Default     any    `json:"default,omitempty"`
    Description string `json:"description"`
    Options     []string `json:"options,omitempty"` // for enum type
}

// RenderResult is the output of template rendering.
type RenderResult struct {
    YAML      string   `json:"yaml"`
    Resources []string `json:"resources"` // list of "kind/name" for preview
    Errors    []string `json:"errors,omitempty"`
}
```

---

## 9.5 — Application Catalog & Marketplace

### Overview

Extends the Phase 7 Helm chart browser (Artifact Hub) into a full application catalog experience with categories, search, screenshots, and one-click install.

### Feature Design

1. **Catalog Sources:**
   - Artifact Hub API (default, community charts)
   - User-configured Helm repositories
   - Curated "Featured" list maintained by KubeViewer (top 50 charts with verified descriptions and icons)

2. **Catalog UI:**
   - Grid/list view with chart icons, names, descriptions, and star counts
   - Category filters (databases, monitoring, networking, storage, CI/CD, etc.)
   - Search with autocomplete
   - Chart detail page: README, values reference, versions, dependencies
   - One-click install with values form (generated from `values.schema.json`)

3. **Install Flow:**
   - Select chart → configure values via form → review generated YAML → install

```
┌────────────────────────────────────────────────────────────────┐
│  Application Catalog                              🔍 Search   │
├────────────────────────────────────────────────────────────────┤
│  Categories: All │ Databases │ Monitoring │ Networking │ ...   │
│                                                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │ 🐘       │  │ 🔴       │  │ 📊       │  │ 🐰       │      │
│  │PostgreSQL│  │  Redis   │  │Prometheus │  │ RabbitMQ │      │
│  │ Bitnami  │  │ Bitnami  │  │Community  │  │ Bitnami  │      │
│  │ ★ 4.8    │  │ ★ 4.7    │  │ ★ 4.9    │  │ ★ 4.5    │      │
│  │ [Install]│  │ [Install]│  │ [Install] │  │ [Install]│      │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘      │
│                                                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │ 🌐       │  │ 🔒       │  │ 📝       │  │ 🗄        │      │
│  │  Nginx   │  │Cert-Mgr  │  │ Grafana  │  │  MySQL   │      │
│  │ Ingress  │  │ Jetstack │  │Community  │  │ Bitnami  │      │
│  │ ★ 4.8    │  │ ★ 4.9    │  │ ★ 4.8    │  │ ★ 4.6    │      │
│  │ [Install]│  │ [Install]│  │ [Install] │  │ [Install]│      │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘      │
└────────────────────────────────────────────────────────────────┘
```

---

## 9.6 — GitOps Integration (ArgoCD / Flux)

### Overview

Rancher has Fleet, Portainer has Git-based stacks, and OpenShift integrates ArgoCD. KubeViewer should detect and surface GitOps tool state.

### Feature Design

KubeViewer does **not** ship its own GitOps engine. Instead, it detects ArgoCD and Flux installations in the cluster and provides a native UI for browsing their custom resources.

1. **Auto-Detection:** On cluster connect, check for:
   - ArgoCD: `argoproj.io/v1alpha1` API group (`Application`, `AppProject`)
   - Flux: `source.toolkit.fluxcd.io`, `kustomize.toolkit.fluxcd.io`, `helm.toolkit.fluxcd.io` API groups

2. **ArgoCD Integration:**
   - List `Application` CRs with sync status, health, source repo, target revision
   - Application detail: sync status, health tree, diff view, sync history
   - Quick actions: Sync, Refresh, Rollback (via ArgoCD API if available, or CR patch)
   - Link to ArgoCD web UI for full management

3. **Flux Integration:**
   - List `Kustomization`, `HelmRelease`, `GitRepository`, `HelmRepository` CRs
   - Status badges: Ready/Not Ready, last applied revision
   - Quick actions: Reconcile (annotate with `reconcile.fluxcd.io/requestedAt`)

### Sidebar Addition

```
GitOps
  ├── ArgoCD Applications    (if detected)
  ├── ArgoCD Projects        (if detected)
  ├── Flux Kustomizations    (if detected)
  ├── Flux Helm Releases     (if detected)
  └── Flux Sources           (if detected)
```

### Backend: `internal/gitops/detector.go`

```go
package gitops

// Provider represents a detected GitOps tool.
type Provider string

const (
    ProviderArgoCD Provider = "argocd"
    ProviderFlux   Provider = "flux"
)

// Detection result for a cluster.
type DetectionResult struct {
    Providers []DetectedProvider `json:"providers"`
}

// DetectedProvider holds info about a detected GitOps installation.
type DetectedProvider struct {
    Provider  Provider `json:"provider"`
    Version   string   `json:"version,omitempty"`
    Namespace string   `json:"namespace"` // where the controller runs
    Resources []string `json:"resources"` // available CRD kinds
}
```

---

## 9.7 — Plugin & Extension System

### Overview

Lens has extensions, Headlamp has plugins, K9s has custom plugins. KubeViewer Phase 1 deferred this as "Future." Phase 9 defines and ships it.

### Architecture

Plugins are **iframe-sandboxed web apps** that communicate with the host via a versioned `postMessage` API. This provides security isolation, crash isolation, and language/framework independence.

```
┌──────────────────────────────────────────┐
│  KubeViewer Host                         │
│  ┌────────────────────────────────────┐  │
│  │ Plugin Manager                     │  │
│  │ - Discovers plugins                │  │
│  │ - Manages lifecycle                │  │
│  │ - Routes postMessage API calls     │  │
│  └─────────────┬──────────────────────┘  │
│                │ postMessage              │
│  ┌─────────────▼──────────────────────┐  │
│  │ <iframe sandbox="allow-scripts">   │  │
│  │   Plugin A (React app)             │  │
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │ <iframe sandbox="allow-scripts">   │  │
│  │   Plugin B (Vue app)               │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

### Plugin Manifest

```json
{
    "name": "my-kubeviewer-plugin",
    "version": "1.0.0",
    "displayName": "Cost Dashboard",
    "description": "Visualizes resource costs using OpenCost data",
    "entrypoint": "index.html",
    "permissions": ["read:pods", "read:nodes", "read:metrics"],
    "contributes": {
        "sidebarItems": [
            { "label": "Cost Dashboard", "route": "/plugins/cost-dashboard", "icon": "dollar" }
        ],
        "detailTabs": [
            { "label": "Costs", "resourceKinds": ["Pod", "Deployment", "Namespace"] }
        ],
        "columns": [
            { "label": "Est. Cost", "resourceKind": "Pod", "position": "after:age" }
        ]
    }
}
```

### Plugin API (postMessage)

```typescript
// Plugin SDK types
interface KubeViewerPluginAPI {
    // Resource access (scoped to declared permissions)
    listResources(gvr: GroupVersionResource, namespace?: string): Promise<ResourceList>;
    getResource(gvr: GroupVersionResource, namespace: string, name: string): Promise<Resource>;
    watchResource(gvr: GroupVersionResource, namespace?: string, callback: WatchCallback): Unsubscribe;

    // UI integration
    showNotification(message: string, severity: 'info' | 'warning' | 'error'): void;
    navigateTo(route: string): void;
    getTheme(): Promise<ThemeInfo>;

    // Cluster info
    getActiveCluster(): Promise<ClusterInfo>;
    getActiveNamespace(): Promise<string>;
}
```

### Plugin Storage

Plugins are installed to `~/.kubeviewer/plugins/<name>/`. Each plugin is a directory containing the manifest and static assets. Plugins can be installed from:
- Local directory
- Git repository URL
- Future: KubeViewer plugin registry

---

## 9.8 — Alerting & Notifications

### Overview

Rancher includes built-in alerting. Komodor provides automated anomaly alerts. KubeViewer should let users define alert rules and receive notifications.

### Feature Design

1. **Alert Rules:** User-defined rules evaluated against the informer cache and metrics. Rules are stored locally in `~/.kubeviewer/alerts.yaml`.

2. **Built-in Alert Rules (defaults, user can disable):**
   - Pod in `CrashLoopBackOff` for > 5 minutes
   - Pod in `Pending` for > 10 minutes
   - Node `NotReady` for > 2 minutes
   - Deployment has 0 available replicas
   - PVC in `Pending` for > 5 minutes
   - Container restart count > 10 in last hour
   - Node CPU/memory usage > 90%

3. **Notification Channels:**
   - In-app notification center (bell icon in topbar, badge count)
   - Desktop notifications (OS native via Wails)
   - Webhook (user-configured URL, for Slack/PagerDuty/Teams integration)
   - Sound alert (optional, configurable)

### Alert Rule Format

```yaml
# ~/.kubeviewer/alerts.yaml
rules:
  - name: pod-crashloop
    description: Pod in CrashLoopBackOff
    resource: pods
    condition: status.containerStatuses[].state.waiting.reason == "CrashLoopBackOff"
    duration: 5m
    severity: warning
    enabled: true
    channels: [in-app, desktop]

  - name: node-not-ready
    description: Node not ready
    resource: nodes
    condition: status.conditions[type=Ready].status != "True"
    duration: 2m
    severity: critical
    enabled: true
    channels: [in-app, desktop, webhook]
```

### Backend: `internal/alerts/engine.go`

```go
package alerts

import "time"

// Rule defines an alert condition.
type Rule struct {
    Name        string   `json:"name" yaml:"name"`
    Description string   `json:"description" yaml:"description"`
    Resource    string   `json:"resource" yaml:"resource"`
    Condition   string   `json:"condition" yaml:"condition"`
    Duration    string   `json:"duration" yaml:"duration"`
    Severity    string   `json:"severity" yaml:"severity"` // "info", "warning", "critical"
    Enabled     bool     `json:"enabled" yaml:"enabled"`
    Channels    []string `json:"channels" yaml:"channels"`
}

// Alert is a fired alert instance.
type Alert struct {
    Rule        Rule      `json:"rule"`
    Resource    string    `json:"resource"`    // "pods/default/my-pod"
    Message     string    `json:"message"`
    FiredAt     time.Time `json:"firedAt"`
    ResolvedAt  *time.Time `json:"resolvedAt,omitempty"`
    Acknowledged bool     `json:"acknowledged"`
}
```

### Frontend: Notification Center

```
┌─ Topbar ─────────────────────────────────────────────────┐
│  ... breadcrumbs ...                    🔔 3  [Cmd+K]    │
└──────────────────────────────────────────┬────────────────┘
                                           │
                          ┌────────────────▼────────────────┐
                          │  Notifications              ✕   │
                          ├─────────────────────────────────┤
                          │  ⚠ Pod "api-server" crashloop  │
                          │    default namespace · 12m ago  │
                          │    [View] [Acknowledge] [Mute]  │
                          │  ─────────────────────────────  │
                          │  🔴 Node "worker-3" NotReady    │
                          │    cluster · 5m ago             │
                          │    [View] [Acknowledge]         │
                          │  ─────────────────────────────  │
                          │  ⚠ PVC "data-vol" Pending      │
                          │    production namespace · 8m    │
                          │    [View] [Acknowledge]         │
                          └─────────────────────────────────┘
```

---

## 9.9 — Backup & Restore

### Overview

Rancher offers backup/restore for cluster state. KubeViewer integrates with Velero (the de facto standard) and also provides lightweight resource export/import.

### Feature Design

1. **Velero Integration (if installed):**
   - Auto-detect Velero installation (check for `velero.io/v1` API group)
   - List backups, restores, schedules, backup storage locations
   - Create backup (full cluster or namespace-scoped)
   - Restore from backup
   - View backup/restore logs

2. **Resource Export/Import (built-in, no dependencies):**
   - Export selected resources (or entire namespace) as a YAML bundle
   - Strips server-managed fields (`status`, `resourceVersion`, `uid`, `creationTimestamp`, `managedFields`)
   - Import YAML bundle into a different namespace or cluster
   - Dry-run mode shows what would be created/updated

### Sidebar Addition

```
Backup & Restore
  ├── Velero Backups         (if detected)
  ├── Velero Schedules       (if detected)
  ├── Export Resources
  └── Import Resources
```

### Backend: `internal/backup/export.go`

```go
package backup

// ExportOptions configures a resource export.
type ExportOptions struct {
    Namespace   string   `json:"namespace"`   // empty = all namespaces
    Kinds       []string `json:"kinds"`       // empty = all kinds
    Labels      string   `json:"labels"`      // label selector
    StripStatus bool     `json:"stripStatus"` // remove status fields
    StripMeta   bool     `json:"stripMeta"`   // remove server-managed metadata
}

// ExportResult contains the exported YAML and summary.
type ExportResult struct {
    YAML          string `json:"yaml"`
    ResourceCount int    `json:"resourceCount"`
    Kinds         []string `json:"kinds"`
}

// ImportOptions configures a resource import.
type ImportOptions struct {
    YAML            string `json:"yaml"`
    TargetNamespace string `json:"targetNamespace,omitempty"` // override namespace
    DryRun          bool   `json:"dryRun"`
}

// ImportResult summarizes what was imported.
type ImportResult struct {
    Created  []string `json:"created"`
    Updated  []string `json:"updated"`
    Skipped  []string `json:"skipped"`
    Errors   []string `json:"errors"`
}
```

---

## 9.10 — Security Scanning & Vulnerability Assessment

### Overview

Enterprise tools like OpenShift include security features. KubeViewer integrates with Trivy (the most widely used open-source scanner) for image vulnerability scanning.

### Feature Design

1. **Trivy Operator Integration (if installed):**
   - Auto-detect `aquasecurity.github.io/v1alpha1` CRDs (`VulnerabilityReport`, `ConfigAuditReport`)
   - List vulnerability reports per workload with severity counts
   - Detail view: CVE list with severity, package, fixed version, link
   - Config audit results: misconfigurations in resource specs

2. **Security Overview Dashboard:**
   - Aggregate vulnerability counts by severity (Critical, High, Medium, Low)
   - Top 10 most vulnerable workloads
   - Image list with vulnerability status
   - Workloads running as root
   - Workloads with no resource limits
   - Workloads with no security context

3. **Pod Security Standards Check:**
   - Evaluate pods against Kubernetes Pod Security Standards (Restricted, Baseline, Privileged)
   - Flag violations inline in pod detail panel
   - Namespace-level compliance summary

### Sidebar Addition

```
Security
  ├── Vulnerability Reports   (if Trivy detected)
  ├── Config Audit            (if Trivy detected)
  ├── Security Overview
  └── Pod Security Standards
```

### Backend: `internal/security/scanner.go`

```go
package security

// VulnerabilitySummary aggregates vulnerability data for a workload.
type VulnerabilitySummary struct {
    Workload    string `json:"workload"`
    Namespace   string `json:"namespace"`
    Image       string `json:"image"`
    Critical    int    `json:"critical"`
    High        int    `json:"high"`
    Medium      int    `json:"medium"`
    Low         int    `json:"low"`
    LastScanned string `json:"lastScanned"`
}

// PodSecurityCheck evaluates a pod against Pod Security Standards.
type PodSecurityCheck struct {
    PodName    string           `json:"podName"`
    Namespace  string           `json:"namespace"`
    Level      string           `json:"level"` // "privileged", "baseline", "restricted"
    Violations []SecurityIssue  `json:"violations"`
}

// SecurityIssue is a single security finding.
type SecurityIssue struct {
    Severity    string `json:"severity"` // "critical", "warning", "info"
    Category    string `json:"category"` // "privilege-escalation", "host-access", "capabilities", etc.
    Message     string `json:"message"`
    Field       string `json:"field"`    // spec path, e.g., "spec.containers[0].securityContext"
    Remediation string `json:"remediation"`
}
```

---

## 9.11 — Custom Dashboards & Role-Based Views

### Overview

The Komodor article recommends customizing dashboards for different user roles. KubeViewer should let users create and save custom dashboard layouts.

### Feature Design

1. **Dashboard Builder:**
   - Drag-and-drop grid layout (CSS Grid based)
   - Widget library: metric card, resource table, chart, event feed, status summary, markdown note
   - Save/load dashboard configurations to `~/.kubeviewer/dashboards/`
   - Share dashboards as JSON files

2. **Built-in Dashboards:**
   - **Operator Dashboard:** Cluster health, node status, resource utilization, recent warnings
   - **Developer Dashboard:** My deployments (filtered by label), pod status, recent deploys, log errors
   - **SRE Dashboard:** Error rate, restart counts, pending pods, node capacity, top resource consumers

3. **Widget Types:**

| Widget | Data Source | Configurable |
|---|---|---|
| Metric Card | metrics-server, informer cache | Resource type, aggregation, threshold colors |
| Resource Table | informer cache | Resource type, columns, filters, namespace |
| Time Series Chart | Prometheus (if available) | PromQL query, time range, chart type |
| Event Feed | event watcher | Severity filter, namespace, resource kind |
| Status Grid | informer cache | Resource type, grouping, color coding |
| Markdown Note | user input | Free-form text |

### Dashboard Configuration Format

```json
{
    "name": "SRE Dashboard",
    "layout": {
        "columns": 12,
        "rowHeight": 80
    },
    "widgets": [
        {
            "id": "w1",
            "type": "metric-card",
            "title": "Cluster CPU",
            "position": { "x": 0, "y": 0, "w": 3, "h": 2 },
            "config": {
                "metric": "cpu-usage",
                "scope": "cluster",
                "thresholds": { "warning": 70, "critical": 90 }
            }
        },
        {
            "id": "w2",
            "type": "resource-table",
            "title": "Failing Pods",
            "position": { "x": 3, "y": 0, "w": 9, "h": 4 },
            "config": {
                "resource": "pods",
                "filter": "status != Running",
                "columns": ["name", "namespace", "status", "restarts", "age"]
            }
        }
    ]
}
```

---

## 9.12 — Audit Trail & Change History

### Overview

Komodor provides audit trails showing who changed what and when. KubeViewer records all user-initiated actions locally.

### Feature Design

This is a **local audit trail** — it records actions taken through KubeViewer, not all cluster activity (which requires K8s API server audit logging).

1. **Recorded Actions:**
   - Resource create/update/delete
   - Scale operations
   - Restart/rollout actions
   - Helm install/upgrade/rollback/uninstall
   - Port forward start/stop
   - Template apply
   - Backup/restore operations

2. **Audit Log Storage:** `audit_log` table in the shared SQLite database at `~/.kubeviewer/kubeviewer.db` (see Phase 8.1 — SQLite Persistence Layer). Retention: 90 days (configurable). Sharing the database with resource snapshots and search indexing avoids multiple SQLite files and enables cross-table queries (e.g., correlating audit actions with resource history trends).

3. **Audit Log UI:** Searchable, filterable table showing:
   - Timestamp
   - Cluster and namespace
   - Action (create, update, delete, scale, restart, etc.)
   - Resource (kind/namespace/name)
   - User (from kubeconfig context)
   - Details (what changed)

### Backend: `internal/audit/logger.go`

```go
package audit

import "time"

// Entry represents a single audit log entry.
type Entry struct {
    ID        int64     `json:"id"`
    Timestamp time.Time `json:"timestamp"`
    Cluster   string    `json:"cluster"`
    Namespace string    `json:"namespace"`
    Action    string    `json:"action"`
    Kind      string    `json:"kind"`
    Name      string    `json:"name"`
    User      string    `json:"user"`
    Details   string    `json:"details"` // JSON-encoded change details
    Status    string    `json:"status"`  // "success", "failed"
    Error     string    `json:"error,omitempty"`
}

// Logger records audit entries to the local database.
type Logger interface {
    Log(entry Entry) error
    Query(filter QueryFilter) ([]Entry, error)
    Prune(olderThan time.Duration) (int, error)
}
```

### Sidebar Addition

```
Audit
  └── Activity Log
```

---

## 9.13 — RBAC Visualization (Graph)

### Overview

Phase 1 deferred RBAC visualization as a graph. Phase 9 ships it.

### Feature Design

An interactive graph showing the relationships between:
- Users / Groups / ServiceAccounts (subjects)
- Roles / ClusterRoles (permission sets)
- RoleBindings / ClusterRoleBindings (the edges)
- Resources and verbs (what actions are allowed)

### Graph Layout

```
┌──────────────────────────────────────────────────────────────┐
│  RBAC Visualization                                          │
│  [Subjects ▼] [Roles ▼] [Namespace ▼]  🔍 Search            │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────┐     ┌──────────────┐     ┌──────────────────┐  │
│  │ 👤 alice │────▶│ RoleBinding   │────▶│ Role: pod-reader │  │
│  └─────────┘     │ "alice-pods"  │     │ pods: get, list  │  │
│                  └──────────────┘     │ pods/log: get    │  │
│                                       └──────────────────┘  │
│                                                              │
│  ┌─────────┐     ┌──────────────┐     ┌──────────────────┐  │
│  │ 👤 bob   │────▶│ ClusterRole   │────▶│ CR: admin        │  │
│  │          │     │ Binding       │     │ *: *             │  │
│  └─────────┘     │ "bob-admin"   │     └──────────────────┘  │
│                  └──────────────┘                            │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ SA: default   │─▶│ RoleBinding   │─▶│ Role: view       │   │
│  │ (kube-system) │  │ "default-view"│  │ pods,svc: get    │   │
│  └──────────────┘  └──────────────┘  │ deploy: get,list │   │
│                                       └──────────────────┘   │
│                                                              │
│  View: [Graph] [Matrix] [Table]                              │
└──────────────────────────────────────────────────────────────┘
```

### Implementation

- **Graph rendering:** D3.js force-directed layout or ELK.js (layered layout, better for directional graphs)
- **Matrix view:** Permission matrix (subjects × resources × verbs) as a heatmap
- **Query mode:** "Can user X do Y on resource Z?" — calls `SelfSubjectAccessReview` / `SubjectAccessReview`

---

## 9.14 — Network Policy Visualization (Graph)

### Overview

Phase 1 deferred network policy graph visualization. Phase 9 ships it.

### Feature Design

A visual graph showing pod-to-pod communication as allowed/denied by NetworkPolicy resources.

### Graph Layout

```
┌──────────────────────────────────────────────────────────────┐
│  Network Policy Visualization                                │
│  [Namespace ▼]  [Policy ▼]  🔍 Search                       │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│              ┌─────────────┐                                 │
│              │  frontend   │                                 │
│              │  (3 pods)   │                                 │
│              └──────┬──────┘                                 │
│                     │ allow: TCP/8080                        │
│                     ▼                                        │
│              ┌─────────────┐     ┌─────────────┐            │
│              │  api-server │────▶│  database   │            │
│              │  (2 pods)   │     │  (1 pod)    │            │
│              └──────┬──────┘     └─────────────┘            │
│                     │ allow: TCP/5432                        │
│                     │                                        │
│              ┌──────▼──────┐                                 │
│              │  cache      │                                 │
│              │  (2 pods)   │                                 │
│              └─────────────┘                                 │
│                                                              │
│  Legend:  ──▶ Allowed   ──✕ Denied   ─ ─▶ No policy        │
│  View: [Graph] [Matrix] [List]                               │
└──────────────────────────────────────────────────────────────┘
```

### Implementation

- **Pod grouping:** Pods are grouped by label selector (matching the NetworkPolicy `podSelector`)
- **Edge computation:** For each policy, compute allowed ingress/egress and render as directed edges
- **Default stance:** Pods with no matching policy show dashed edges (default allow)
- **Isolation highlight:** Pods matched by a policy but with no ingress/egress rules are highlighted as isolated
- **Graph rendering:** Same engine as RBAC graph (D3.js / ELK.js)

### Backend: `internal/netpol/graph.go`

```go
package netpol

// NetworkGraph represents the computed network topology.
type NetworkGraph struct {
    Groups []PodGroup       `json:"groups"`
    Edges  []NetworkEdge    `json:"edges"`
}

// PodGroup is a set of pods matched by a common label selector.
type PodGroup struct {
    ID        string            `json:"id"`
    Name      string            `json:"name"`      // derived from deployment/service name
    Namespace string            `json:"namespace"`
    Labels    map[string]string `json:"labels"`
    PodCount  int               `json:"podCount"`
    Isolated  bool              `json:"isolated"`   // matched by a policy
}

// NetworkEdge represents an allowed or denied connection.
type NetworkEdge struct {
    From      string `json:"from"`      // PodGroup ID
    To        string `json:"to"`        // PodGroup ID
    Port      int    `json:"port"`
    Protocol  string `json:"protocol"`  // TCP, UDP, SCTP
    Allowed   bool   `json:"allowed"`
    PolicyRef string `json:"policyRef"` // name of the NetworkPolicy
}
```

---

## Dependencies on Earlier Phases

| Phase 9 Feature | Depends On |
|---|---|
| Mobile/Responsive | Phase 2 (build targets), Phase 4 (layout), Phase 5 (tables), Phase 8 (packaging) |
| Troubleshooting | Phase 3 (informers, relationships), Phase 6 (events) |
| Deployment Wizards | Phase 3 (resource CRUD), Phase 5 (detail panels) |
| Templates | Phase 7 (YAML editor) |
| App Catalog | Phase 7 (Helm SDK) |
| GitOps | Phase 3 (dynamic client for CRDs) |
| Plugin System | Phase 8 (stable core) |
| Alerting | Phase 3 (informers, metrics), Phase 8 (desktop notifications) |
| Backup/Restore | Phase 3 (resource CRUD, dynamic client) |
| Security Scanning | Phase 3 (dynamic client for CRDs) |
| Custom Dashboards | Phase 5 (resource views), Phase 3 (metrics) |
| Audit Trail | Phase 7 (resource actions) |
| RBAC Graph | Phase 3 (RBAC data) |
| Network Policy Graph | Phase 3 (network policy data) |

---

## Implementation Order

Features should be implemented in this order to maximise value and minimise rework:

1. **Mobile & Responsive Access** (9.1) — cross-cutting, affects all UI work
2. **Alerting & Notifications** (9.8) — high value, low complexity, builds on existing informers
3. **Guided Troubleshooting** (9.2) — highest competitive gap, builds on informers + events
4. **Deployment Wizards** (9.3) — high user demand, builds on existing CRUD
5. **YAML Templates** (9.4) — extends wizards with reusability
6. **Audit Trail** (9.12) — low complexity, wraps existing action handlers
7. **RBAC Graph** (9.13) — visual differentiator
8. **Network Policy Graph** (9.14) — same graph engine as RBAC
9. **GitOps Integration** (9.6) — detects existing CRDs, read-only to start
10. **Security Scanning** (9.10) — detects existing CRDs, read-only
11. **Backup & Restore** (9.9) — Velero detection + export/import
12. **Application Catalog** (9.5) — extends Phase 7 Helm work
13. **Custom Dashboards** (9.11) — most complex UI work
14. **Plugin System** (9.7) — ship last, requires stable API surface
