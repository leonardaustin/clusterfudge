# Remaining Tasks

Unchecked acceptance criteria extracted from PHASE 4-8 docs. These are manual verification items and unimplemented features that need to be completed before release.

**Last audited:** 2026-03-07 (automated codebase scan)

---

## ~~Unreachable Pages — Sidebar Navigation Missing~~ RESOLVED (PR #80)

**Last audited:** 2026-03-12

All pages now have sidebar navigation links. The beta feature gate was removed — Tools, Security, and Operations sections always render in the sidebar.

---

## Tech Debt

### Kubeconfig loaded multiple times during preflight

`PreflightCheck` in `handlers/cluster_handler.go` loads the kubeconfig three times:
1. `ListContexts()` calls `Load()` internally
2. `ValidateContext()` calls `Load()` again
3. `DetectProvider()` calls `Load()` a third time

Each `Load()` reads and parses `~/.kube/config` from disk. This should be refactored to load once and pass the parsed config through. Not a correctness issue — just unnecessary I/O on every preflight check.

---

## Release Priority Summary

### Truly Blocking (must-fix for v1.0) -- ALL RESOLVED

| # | Item | Phase | Status |
|---|------|-------|--------|
| 1 | CHANGELOG.md does not exist | P8 | DONE (PR #47) |
| 2 | `make audit` target missing (dependency audit) | P8 | DONE (PR #47) |
| 3 | `make analyze-bundle` target missing | P8 | DONE (PR #47) |
| 4 | Version bump procedure undocumented | P8 | DONE (PR #47) |
| 5 | Cross-platform build verification not in CI | P8 | DONE (PR #47) |
| 6 | Secret viewer with decoded value show/hide toggle | P7 | DONE (PR #49) |
| 7 | CRD detail page (instances table + schema tab) | P7 | DONE (PR #49) |
| 8 | Events filter bar (warning-only, by reason, by kind) | P6 | DONE (PR #49) |
| 9 | Terminal search (Ctrl+F via xterm SearchAddon) | P6 | DONE (PR #48) |
| 10 | YAML diff view before apply (server dry-run) | P7 | DONE (PR #48) |

### Should-fix (important UX but not blocking) -- ALL RESOLVED

| # | Item | Phase | Status |
|---|------|-------|--------|
| 11 | Log search regex mode toggle | P6 | DONE (PR #51) |
| 12 | Terminal multiple tabs (simultaneous sessions) | P6 | DONE (PR #51) |
| 13 | Terminal themes (monokai, solarized, light) | P6 | DONE (PR #51) |
| 14 | Port forward auto-reconnect with backoff | P6 | DONE (PR #50) |
| 15 | Port forward "Open in browser" action | P6 | DONE (PR #50) |
| 16 | Service-level port forwarding (resolve to pods) | P6 | DONE (PR #50) |
| 17 | Metrics sparklines in pod detail panel | P6 | DONE (PR #52) |
| 18 | Inline label editor (add/edit/delete) + PatchLabels backend | P5 | DONE (PR #52) |
| 19 | Relationships tabs (services backing pods, nodes scheduled pods) | P5 | DONE (PR #52) |
| 20 | Accessibility: skip-to-main link | P8 | DONE (PR #52) |
| 21 | Accessibility: aria-live regions for toasts | P8 | DONE (PR #52) |
| 22 | Accessibility: table header `scope` attributes | P8 | DONE (PR #52) |

### Nice-to-have (defer to post-v1.0) -- ALL RESOLVED

| # | Item | Phase | Status |
|---|------|-------|--------|
| 23 | Helm chart repositories (add/remove/list) | P7 | DONE (PR #54) |
| 24 | Helm chart search from repo indexes | P7 | DONE (PR #54) |
| 25 | Helm OCI chart reference resolution | P7 | DONE (PR #54) |
| 26 | YAML schema validation + K8s autocomplete | P7 | DONE (PR #55) |
| 27 | Multi-document YAML tabs | P7 | DONE (PR #55) |
| 28 | Deployment pause/resume rollout | P7 | DONE (PR #53) |
| 29 | Deployment rollout history viewer | P7 | DONE (PR #53) |
| 30 | Node taint add/remove | P7 | DONE (PR #53) |
| 31 | Create Job from CronJob | P7 | DONE (PR #53) |
| 32 | Create docker-registry / TLS secrets | P7 | DONE (PR #55) |
| 33 | Namespace creation dialog | P7 | DONE (PR #53) |
| 34 | Service selector editor | P7 | DONE (PR #55) |
| 35 | Event correlation view (group by involvedObject) | P6 | DONE (PR #54) |
| 36 | Terminal tab renaming (double-click) | P6 | DONE (PR #51) |
| 37 | Port forward conflict detection in UI | P6 | DONE (PR #50) |
| 38 | Metrics history (60 data points over 15 min) | P6 | DONE (PR #52) |
| 39 | Generic CreateResourceWizard (4 types, not just Deployment) | P5 | DONE (PR #55) |
| 40 | Drain dialog: deleteEmptyDirData option | P7 | DONE (PR #53) |
| 41 | Contrast ratio audit (WCAG validation) | P8 | DONE (PR #54) |
| 42 | Form label htmlFor associations | P8 | DONE (PR #53) |

---

## Phase 4 — Frontend Shell & Navigation

### Routing
- [x] All routes defined with lazy loading — bundle split verified in DevTools
- [x] `RequireCluster` guard redirects to `/welcome` when no cluster connected
- [x] 404 route renders `NotFound` for unmatched paths
- [x] URL params (`namespace`, `name`, `group`, `resource`) extracted correctly in detail views

### Sidebar
- [x] Sidebar renders all sections from `NAV_SECTIONS` data structure
- [x] Cluster selector dropdown lists all clusters with status dots
- [x] Cluster selector search/filter works correctly
- [x] Section collapse state persists across page refreshes (localStorage)
- [x] Sidebar collapses to 48px icon-only mode with `[` key
- [x] In collapsed mode, Radix UI tooltips appear on hover with label + shortcut
- [x] Sidebar resize handle drags between 180px and 350px, persisted in store
- [x] Favorites section renders pinned items (hidden when empty)
- [x] Custom Resources section populates after cluster connect

### Topbar
- [x] Topbar drag region set on macOS (traffic light space)
- [x] Breadcrumb auto-generates from route, each segment navigable
- [x] Long breadcrumb names truncate with tooltip
- [x] Namespace filter dropdown lists namespaces, shows recent section
- [x] Changing namespace updates Zustand `selectedNamespace`
- [x] Cluster health indicator shows correct color dot + version on hover
- [x] Theme toggle switches dark/light, transitions smoothly

### Command Palette
- [x] Command palette opens with `Cmd+K` and `/`
- [x] Typing in palette fuzzy-filters navigation and action commands
- [x] Resource search fires after 200ms debounce, shows kind badge
- [x] "Switch Cluster" sub-menu opens nested cluster list
- [x] "Change Namespace" sub-menu opens nested namespace list
- [x] Context-aware commands appear when a resource is selected
- [x] Recent items section shows last 5 navigated items
- [x] Shortcut keys display correctly next to items (right-aligned)
- [x] `Escape` closes command palette from any state

### Keyboard Shortcuts
- [x] All keyboard shortcuts registered without conflict
- [x] Chord sequences (`G P`, `G D`, etc.) navigate correctly
- [x] Visual chord indicator appears while waiting for second key
- [x] Shortcut help overlay `?` lists all shortcuts in groups
- [x] Shortcuts suppressed when typing in input/textarea

### Bottom Tray
- [x] Bottom tray toggles with `` Ctrl+` ``
- [x] Drag handle resizes tray between 150px and 60% viewport
- [x] Double-click drag handle toggles between 250px and 50% viewport
- [x] Tray height persists in Zustand store (saved to localStorage)
- [x] All three tabs (Logs, Terminal, Events) render with Suspense boundaries

### State Management
- [x] All Zustand stores typed with TypeScript interfaces
- [x] `clusterStore` persists cluster list but resets live status to disconnected
- [x] `uiStore` persists all UI preferences
- [x] `selectionStore` bridges table row selection to bottom tray context

### Theming
- [x] Dark and light themes render correctly on all elements
- [x] System preference detected and applied on first load
- [x] High-contrast media query adjusts token values
- [x] Theme switches smoothly (150ms background-color/color transition)

### Banners
- [x] Connection lost banner shows with countdown and reconnect button
- [x] RBAC warning banner is dismissable
- [x] Update banner is dismissable
- [x] Error banners are dismissable individually
- [x] All animations complete in under 200ms

---

## Phase 5 — Resource Views & Detail Panels

### Resource Tables
- [x] Resource table renders pods, deployments, services, nodes, events, configmaps, secrets
- [x] Correct columns display for each resource type
- [x] Status icons show correct color/shape for resource state
- [x] Table sorts by clicking column headers
- [x] Search/filter reduces visible rows in real-time
- [x] Virtual scrolling handles 5,000+ rows without performance degradation
- [x] Clicking a row opens the detail panel with correct data

### Detail Panels
- [x] Detail panel shows Overview, Logs (placeholder), YAML (placeholder) tabs
- [x] Detail panel keyboard navigation: `Escape` to close, up/down to change selected row

### Dashboard
- [x] Cluster overview dashboard shows summary cards with accurate counts
- [x] Recent events list updates in real-time

### Live Updates
- [x] Watch events update the table without full re-fetch (rows add/update/remove in place)
- [x] Namespace filter scopes all resource lists

### States
- [x] Loading skeletons show while data is fetching
- [x] Empty states show when no resources match
- [x] Error states show with clear messages and retry option

### Column Definitions & Renderers
- [x] Column definitions exist for all 27 resource types listed in spec
- [x] StatusDot renders correctly for Running/Pending/Failed/Unknown/Bound/etc.
- [x] RelativeTime renders human-readable age with full timestamp tooltip
- [x] LabelChips truncates to 3 with overflow badge and renders all on expand
- [x] ResourceLink navigates to the correct resource list on click
- [x] MetricsBar shows colored bar with usage % and formatted label text

### Column Customization
- [x] ColumnCustomizer toggle persists per-resource preferences to localStorage
- [x] Drag-to-reorder columns works and persists
- [x] CSV export downloads a valid file with headers and all visible rows

### Metrics Integration
- [x] Metrics columns appear in pod/node tables when metrics-server is installed
- [x] Metrics columns show "---" gracefully when metrics-server is absent

### Inline Editing
- [x] LabelEditor add/edit/delete labels via inline UI
- [x] PatchLabels backend updates resource labels via merge patch

### Batch Operations
- [x] Multi-select checkbox selects rows; BatchActionBar appears with count
- [x] BatchDelete calls backend for each selected resource and removes rows

### Diff & Creation
- [x] ResourceDiff renders a side-by-side Monaco diff for two YAML strings
- [x] CreateResourceWizard template picker shows all 4 resource types
- [x] Creation wizard preview step renders valid YAML in Monaco
- [x] ApplyResource is called on wizard Create click; success closes dialog

### Summary Bars
- [x] SummaryBar shows pod counts (running/pending/failed) above Pods table
- [x] SummaryBar shows deployment counts (ready/degraded) above Deployments table

### Detail Overviews
- [x] PodDetailOverview renders all container cards with image, state, restarts, resources
- [x] PodDetailOverview shows conditions, labels, volumes sections
- [x] DeploymentDetailOverview shows 4-column replica grid and strategy details
- [x] NodeDetailOverview shows capacity vs allocatable, system info, taints

### Relationships
- [x] Relationships tab for pods shows owning Deployment/ReplicaSet chain
- [x] Relationships tab for services shows backing pods with status and IP
- [x] Relationships tab for nodes shows pods scheduled on the node

---

## Phase 6 — Real-Time Features: Logs, Events, Shell

### Log Streaming
- [x] Log streaming starts when selecting a pod and choosing "View Logs"
- [x] Logs auto-scroll in follow mode; disengages when user scrolls up
- [x] Log search highlights matching terms (plain text mode)
- [x] Log search highlights matching terms (plain text and regex modes)
- [x] Log search regex mode toggle
- [x] Container selector appears for multi-container pods
- [x] "Previous" toggle shows logs from crashed container instances
- [x] Line wrapping toggle works correctly
- [x] Timestamp mode cycles: hidden / relative / absolute
- [x] Log severity coloring: ERROR=red, WARN=yellow, INFO=blue, DEBUG=dim
- [x] Multi-container view shows split panes and merged interleaved view
- [x] Download logs saves a file via the native OS save dialog

### Terminal
- [x] Terminal opens with a working shell in the selected container
- [x] Keystrokes in the terminal reach the container; output renders correctly
- [x] Terminal supports ANSI colors and cursor movement
- [x] Terminal resizes correctly when the bottom tray is resized
- [x] Multiple terminal tabs can be open simultaneously
- [x] Terminal tabs can be renamed by double-clicking
- [x] Terminal themes (dark, light, monokai, solarized) apply immediately
- [x] Terminal font size is adjustable via settings
- [x] Terminal search (Ctrl+F) highlights and navigates matches using xterm SearchAddon

### Events
- [x] Events feed shows real-time cluster events with type indicators (Warning=yellow, Normal=blue)
- [x] Events filter bar: warning-only, by reason, by involved kind
- [x] Event correlation view groups events by involvedObject, sorted by warning count
- [x] Events auto-update without manual refresh

### Port Forwarding
- [x] Port forwarding creates a working local -> pod tunnel
- [x] Port forwarding resolves services to backing pods (service-level port forward)
- [x] Port conflict detection: error shown if local port is already bound
- [x] Auto-reconnect retries with exponential backoff after port forward disconnect
- [x] Port forward dashboard shows status (active) with "Stop" action
- [x] Active port forwards are listed and can be stopped from the dashboard

### Metrics
- [x] Metrics sparklines appear in the pod detail panel (requires metrics-server)
- [x] ResourceUsageBar shows usage with color threshold coding
- [x] Metrics history maintains up to 60 data points (15 min at 15s interval)

### Cleanup
- [x] Log and terminal streams are properly cleaned up when switching pods or closing the tray
- [x] Memory usage stays stable during extended log streaming (line buffer cap enforced)
- [x] Bottom tray tabs switch between logs, terminal, and events

---

## Phase 7 — Advanced Features: Helm, YAML Editor, Resource Actions

### Helm
- [x] Helm releases list with correct columns and status indicators
- [x] Helm release detail shows values, manifest, history, and notes
- [x] Helm uninstall works with confirmation dialog
- [x] Helm rollback to a previous revision works
- [x] Add/remove/list chart repositories
- [x] Chart search returns results from local repo indexes
- [x] Install chart dialog: search -> configure name/namespace/values -> install
- [x] Upgrade release with values diff view (current vs new)
- [x] OCI chart references (oci://) are resolved correctly
- [x] `GetReleaseValues` returns current user-supplied values (via GetRelease config)

### YAML Editor
- [x] YAML editor renders with KubeViewer dark theme
- [x] YAML editor shows "Unsaved changes" indicator when modified
- [x] Cmd+S in editor triggers apply
- [x] Apply success shows toast notification
- [x] Apply failure shows inline error with details
- [x] Diff view shows changes before apply (server dry-run)
- [x] Schema validation and autocomplete active for known K8s GVKs
- [x] Multi-document YAML (---) shows per-document tabs

### Resource Actions
- [x] Scale dialog works for Deployments, StatefulSets
- [x] Restart (rolling) works for Deployments
- [x] Pause/resume rollout works for Deployments
- [x] Rollout history shows revision list with images and change-cause
- [x] Rollback to a specific revision works
- [x] Cordon/uncordon works for nodes
- [x] Drain dialog with options (force, ignoreDaemonSets, gracePeriod) — missing deleteEmptyDirData
- [x] Add/remove node taints works
- [x] Delete requires typing resource name to confirm
- [x] Create Job from CronJob with custom or auto-generated name
- [x] Secret viewer shows decoded values with show/hide toggle
- [x] Create docker-registry and TLS secrets
- [x] Namespace creation with optional labels
- [x] Resource quota viewer shows used vs hard with color-coded usage bars

### CRD Management
- [x] CRD list page shows all CRDs with group, kind, scope, established status
- [x] CRD detail shows instances in a generic table
- [x] CRD schema tab shows the OpenAPI v3 schema
- [x] ListCustomResources works for cluster-scoped and namespaced CRDs

### Network Policy, PDB, Services
- [x] PDB list shows disruptions-allowed, desired/current healthy counts
- [x] NetworkPolicy visualization shows ingress/egress rules per policy
- [x] Service selector editor allows updating pod selector labels
- [x] Service endpoints viewer shows ready and not-ready addresses with pod names

### Context Menus & Command Palette
- [x] Context menu appears on right-click with correct actions per resource type
- [x] Command palette searches across resources when typing a name
- [x] Command palette shows context-specific actions for selected resources
- [x] Keyboard shortcuts shown in context menus match actual shortcuts
- [x] Toast notifications appear for all action outcomes

---

## Phase 8 — Polish, Packaging & Distribution

### Accessibility (WCAG 2.1 AA)

**Perceivable:**
- [x] All images have meaningful `alt` attributes or `aria-hidden="true"` if decorative (no images used)
- [x] Color is not the only way to convey information (status icons accompany color badges)
- [x] Text contrast >= 4.5:1 for normal text, >= 3:1 for large text (WCAG audit done)
- [x] Table headers use `<th scope="col">`, row headers use `<th scope="row">`
- [x] Form inputs have associated `<label>` elements

**Operable:**
- [x] All interactive elements reachable via Tab key
- [x] Visible focus ring on all interactive elements
- [x] No keyboard traps (except modals, which correctly trap focus and release on close)
- [x] Skip-to-main link at top of page for screen reader users
- [x] No flashing content faster than 3Hz

**Understandable:**
- [x] Page language set: `<html lang="en">`
- [x] Error messages identify the field and describe the error
- [x] Labels and instructions visible before input, not just placeholder text

**Robust:**
- [x] All interactive elements have accessible names (aria-label, aria-labelledby, or visible text)
- [x] Status updates announced via live regions
- [x] Dialog: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to title

### Release Checklist

**Pre-Build:**
- [x] All tests pass: `make test`
- [x] Linters pass: `make lint`
- [x] No `go vet` warnings: `make vet`
- [x] Frontend type check: `pnpm tsc --noEmit`
- [x] Dependency audit: `make audit`
- [x] `go.sum` is up to date: `go mod tidy && git diff --exit-code go.sum`
- [x] `pnpm-lock.yaml` committed and up to date
- [x] No uncommitted changes: `git status --short`
- [x] CHANGELOG.md updated with release notes
- [ ] Version bumped in `wails.json` and relevant constants
- [x] `build/darwin/Info.plist` version strings updated (uses template placeholders)
- [x] `build/darwin/entitlements.plist` reviewed — no unnecessary entitlements

**Build Verification:**
- [ ] macOS universal binary builds without errors
- [ ] Windows amd64 binary builds without errors
- [ ] Linux amd64 binary builds without errors
- [ ] Binary sizes within budget: < 25 MB per platform
- [ ] No CGO dependencies on Linux (check with `ldd`)
- [ ] Wails version pinned (not `@latest`) in install step
- [x] Frontend bundle: initial load < 3 MB gzipped (run `make analyze-bundle`)

**macOS Distribution:**
- [ ] App signed: `codesign --verify --verbose build/bin/KubeViewer.app`
- [ ] Notarized: `spctl --assess --verbose build/bin/KubeViewer.app`
- [ ] Stapled: `xcrun stapler validate build/bin/KubeViewer.app`
- [ ] DMG mounts and shows correct window layout
- [ ] Drag to Applications works
- [ ] App launches without Gatekeeper warning on clean macOS VM
- [ ] Spotlight indexing works (app appears in Spotlight search)
- [ ] macOS 11.0 minimum: test on macOS Ventura and Sonoma

**Windows Distribution:**
- [ ] Installer is digitally signed (right-click -> Properties -> Digital Signatures)
- [ ] SmartScreen does not block installer (use EV cert or build reputation)
- [ ] Start menu shortcut created
- [ ] Uninstaller works and removes all files
- [ ] App launches from PROGRAMFILES64 without UAC prompts
- [ ] WebView2 runtime bundled or bootstrapper included
- [ ] Test on Windows 10 and Windows 11

**Linux Distribution:**
- [ ] Binary runs on Ubuntu 22.04 (LTS) without extra deps beyond GTK/WebKit
- [ ] AppImage executes on Ubuntu 22.04 and Fedora 38
- [ ] Desktop file appears in application launcher
- [ ] Icon displays at all sizes
- [ ] `.deb` package installs and uninstalls cleanly
- [ ] `RPM` package installs on RHEL/Fedora

**Smoke Tests:**
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

**Performance:**
- [ ] Startup time < 2 seconds on modern hardware (time from launch to interactive)
- [ ] Pod list with 500+ pods renders without jank
- [ ] Log stream at 100 lines/sec does not cause memory growth
- [ ] Memory < 200 MB during typical use session (1 hour)
- [ ] No goroutine leaks after disconnect/reconnect 10 times

**Documentation:**
- [ ] README updated with new version installation instructions
- [ ] Homebrew Cask formula updated in tap repo
- [ ] GitHub release description is clear and complete
- [ ] Breaking changes (if any) prominently documented
- [ ] Screenshot/GIF in README is current (update if UI changed significantly)

**Post-Release:**
- [ ] GitHub Release created with all platform artifacts
- [ ] Checksums file (`checksums.txt`) attached to release
- [ ] Homebrew tap updated: `brew upgrade kubeviewer` works
- [ ] Winget manifest submitted (if applicable)
- [ ] Release tagged as pre-release if semver has `-` suffix (e.g. `v0.2.0-rc1`)
- [ ] Verify download links in release description are valid
- [ ] Install from GitHub release on clean macOS, Windows, Linux VMs
- [ ] Announce release (blog, Twitter/X, Kubernetes Slack if ready)
- [ ] Monitor GitHub issues for regression reports (watch for 24h)
- [ ] Tag release in project tracker

### Final Acceptance Criteria
- [ ] `wails build` produces working binaries on macOS (universal), Windows (amd64), Linux (amd64)
- [ ] macOS `.dmg` installer works (signed, notarized, drag to Applications, no Gatekeeper warning)
- [ ] Windows NSIS installer works (signed, installs to Program Files, start menu entry)
- [ ] Linux AppImage runs on Ubuntu 22.04 and Fedora 38
- [ ] Auto-update check detects new releases within 5 seconds of startup
- [x] Settings page persists all preferences across restarts
- [x] App remembers window size, position, and active view across restarts
- [x] Welcome screen appears on first launch
- [x] Error boundary catches React errors and shows recovery UI
- [x] Connection recovery reconnects automatically with exponential backoff
- [x] All keyboard shortcuts work
- [ ] Keyboard shortcuts are rebindable (config store has keyBindings map but frontend reads hardcoded bindings)
- [x] `make test` passes on macOS (unit + integration)
- [ ] GitHub Actions CI passes on all three platform runners
- [ ] GitHub Release contains all platform artifacts + checksums
- [ ] Total binary size < 25 MB per platform
- [ ] App startup < 2 seconds on modern hardware
- [ ] Memory usage < 200 MB during typical 1-hour session
- [ ] No WCAG 2.1 AA violations for core flows (resource list, detail, logs)
- [x] No eval() or Function() constructor usage in frontend code (ESLint enforced)
- [x] Secret values masked by default, only revealed on explicit user action
