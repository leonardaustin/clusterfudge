# Codebase Audit #1

**Date**: 2026-03-10
**Scope**: Full codebase (Go backend + React frontend + docs/)
**Files reviewed**: 148 Go files, 338 TS/TSX files, 20 markdown files
**Total issues found**: 52

---

## Summary

| Priority | Count |
|----------|-------|
| Critical | 3     |
| High     | 11    |
| Medium   | 19    |
| Low      | 19    |

---

## Critical Issues

### C1 — HelmHandler permanently broken — SetCluster never called
**File**: `handlers/helm_handler.go:38`
**Category**: bug
**Description**: HelmHandler is initialized in main.go with empty strings (`NewHelmHandler("", "")`). The `SetCluster()` method that would set `kubeconfigPath` and `contextName` is defined but never called anywhere. As a result, `client()` always returns an error (`"no cluster configured for Helm operations"`), making every Helm operation (ListReleases, GetRelease, InstallRelease, UpgradeRelease, UninstallRelease, RollbackRelease, GetReleaseHistory, GetReleaseValues) permanently fail.
**Suggested fix**: Wire `SetCluster()` into the cluster connection flow so that when a user connects to a cluster, the HelmHandler receives the kubeconfig path and context name.

### C2 — Alert system non-functional — Fire() never called
**File**: `internal/alerts/store.go`
**Category**: stub
**Description**: The alert Store is created in main.go and passed to TroubleshootHandler, but `Store.Fire()` is never called anywhere in production code. The alert system exists structurally but never triggers — no alerts are ever generated for the frontend.
**Suggested fix**: Integrate `Store.Fire()` calls into relevant event sources (e.g. resource watch events, health checks, troubleshoot analysis results).

### C3 — Troubleshoot timeline non-functional — Record() never called
**File**: `internal/troubleshoot/timeline.go`
**Category**: stub
**Description**: The Timeline is created in main.go and passed to TroubleshootHandler, but `Timeline.Record()` is never called anywhere in production code. The troubleshoot engine's "related changes" feature queries an always-empty timeline, so it can never correlate events with resource changes.
**Suggested fix**: Call `Timeline.Record()` from the resource watch/stream layer whenever a resource is created, updated, or deleted.

---

## High Issues

### H1 — DryRunApply broken for cluster-scoped resources
**File**: `handlers/resource_handler.go:147`
**Category**: bug
**Description**: `DryRunApply()` always uses the namespace-scoped client (`rc.Namespace(namespace)`) for both Get and Apply operations. For cluster-scoped resources (Nodes, PersistentVolumes, ClusterRoles, etc.), this will fail or produce incorrect results because these resources have no namespace.
**Suggested fix**: Check whether the resource is namespaced and use the root client for cluster-scoped resources.

### H2 — RestartDeployment missing RBAC pre-flight check
**File**: `handlers/resource_handler.go:484`
**Category**: bug
**Description**: `RestartDeployment()` directly patches the deployment without calling `checkRBAC()` first. In contrast, `ScaleDeployment()`, `PauseDeployment()`, and `ResumeDeployment()` all perform RBAC pre-flight checks before mutating. This inconsistency means restart operations will produce raw Kubernetes 403 errors instead of the app's user-friendly permission-denied messages.
**Suggested fix**: Add a `checkRBAC()` call at the top of `RestartDeployment()`.

### H3 — ListContexts ignores custom kubeconfig paths from settings
**File**: `handlers/cluster_handler.go:39`
**Category**: bug
**Description**: `ListContexts()` creates its own `clientcmd.NewDefaultClientConfigLoadingRules()` instead of using the Manager's KubeconfigLoader (which respects user-configured `kubeconfigPaths` from settings). Users who add custom kubeconfig paths in settings will see them used for connections but not reflected in the context list.
**Suggested fix**: Use the Manager's KubeconfigLoader to list contexts so that custom paths are respected.

### H4 — Backup handler incomplete — only StripManifest exposed
**File**: `handlers/backup_handler.go`
**Category**: stub
**Description**: The backup handler only exposes `StripManifest()`. The internal `backup` package defines full types for export/import operations (ExportOptions, ImportOptions, ExportResult, ImportResult, FormatAsYAML) and the `Exporter` type, but none are wired through the handler. Export and import functionality is structurally defined but inaccessible from the frontend.
**Suggested fix**: Add handler methods for Export and Import operations.

### H5 — DeploymentWizard has no Apply button — preview is a dead end
**File**: `ui/src/pages/DeploymentWizard.tsx:160-163`
**Category**: stub
**Description**: The DeploymentWizard shows a preview step with generated YAML, but unlike ServiceWizard, ConfigMapWizard, and SecretWizard which all have an "Apply" button on the preview step, DeploymentWizard has no way to actually create the deployment. The user walks through 4 wizard steps and can only view the YAML.
**Suggested fix**: Add a `handleApply` function and Apply button matching the pattern in ServiceWizard.

### H6 — TroubleshootingPanel suggestion buttons are non-functional
**File**: `ui/src/pages/TroubleshootingPanel.tsx:96`
**Category**: stub
**Description**: The troubleshooting suggestions render a `<button>` whose label is `{s.actionType}`, but the button has no `onClick` handler. Users see buttons like "fix" or "apply" but clicking them does nothing.
**Suggested fix**: Wire an onClick handler that executes the suggestion's action.

### H7 — DrainNode API signature missing deleteEmptyDirData in docs
**File**: `docs/FEATURES.md:79`
**Category**: contradiction
**Description**: FEATURES.md documents `DrainNode` with 4 parameters but the actual implementation accepts 5 including `deleteEmptyDirData bool`.
**Suggested fix**: Update the API reference in FEATURES.md.

### H8 — No README.md exists
**File**: (missing)
**Category**: missing-doc
**Description**: The repository has no README.md. REMAINING-TASKS.md references README items like "README updated with new version installation instructions" and "Screenshot/GIF in README is current." A README is essential for the repo's public presence and discoverability.
**Suggested fix**: Create a README.md with project description, screenshots, installation instructions, and contributing guidelines.

### H9 — CHANGELOG still shows "Unreleased" with no separate Unreleased section
**File**: `CHANGELOG.md:8`
**Category**: incomplete-task
**Description**: The CHANGELOG header is `## [0.1.0] - Unreleased`. The RELEASING.md procedure instructs replacing `Unreleased` with the release date and adding a new `## [Unreleased]` section above. This has not been done.
**Suggested fix**: Follow the release procedure in RELEASING.md when cutting the release.

### H10 — 10 pages have no sidebar navigation entries
**File**: `ui/src/components/sidebar/Sidebar.tsx:84-157`
**Category**: bug
**Description**: The sidebar only includes standard K8s resources, Helm, Overview, and Settings. Routes for Topology, Metrics, Troubleshoot, Wizards, Security (SecurityOverview, RBACGraph), Operations (Alerts, Audit, Backup, GitOps, NetPol Graph) have no sidebar nav items. These 12+ pages are only accessible via the command palette or direct URL.
**Suggested fix**: Add sidebar sections for Operations, Security, and Tools.

### H11 — FEATURES.md missing rollout/pause/resume and Helm repo management APIs
**File**: `docs/FEATURES.md`
**Category**: missing-doc
**Description**: The Resource Actions table lists only 5 methods (Scale, Restart, Cordon, Uncordon, Drain). It omits Pause/Resume Rollout, Rollout History, Node Taint management, Create Job from CronJob, Namespace Creation, and Helm chart repo management — all implemented in PRs #53-55.
**Suggested fix**: Update FEATURES.md API reference to include all implemented methods.

---

## Medium Issues

### M1 — Audit logging only covers secret view/reveal operations
**File**: `handlers/secret_handler.go`
**Category**: stub
**Description**: The audit logger is only called for `secret.view` and `secret.reveal` events. No other mutating operations (create, update, delete, scale, restart, helm install/upgrade/uninstall) are audit-logged, severely limiting the audit trail's usefulness.
**Suggested fix**: Add audit log calls to all mutating operation handlers.

### M2 — Audit log Prune() never called — unbounded file growth
**File**: `internal/audit/logger.go`
**Category**: bug
**Description**: The audit logger defines a `Prune(maxAge time.Duration)` method but it is never called. The JSONL audit log file will grow indefinitely.
**Suggested fix**: Call `Prune()` on application startup or on a periodic timer.

### M3 — ~1,200 lines of dead code across 7 packages
**File**: Multiple files
**Category**: dead-code
**Description**: The following packages are fully implemented but never instantiated or used: (a) `internal/k8s/informer_manager.go` — InformerManager (~400 lines), (b) `internal/k8s/dynamic.go` — DynamicResourceService (~227 lines), (c) `internal/k8s/metrics.go` — MetricsClient (~100 lines), (d) `internal/memory/manager.go` — Manager (~123 lines), (e) `internal/cluster/relationships.go` — RelationshipMapper (~198 lines), (f) `internal/cluster/reconnect.go` — standalone ReconnectLoop (~62 lines), (g) `internal/debounce/debouncer.go` — Debouncer (~99 lines).
**Suggested fix**: Either wire these into the application or remove them to reduce maintenance burden.

### M4 — Port-forward uses package-level global state
**File**: `internal/stream/portforward.go:40`
**Category**: bug
**Description**: `activeForwards` is a package-level `map[string]*PortForwardSession` with a package-level mutex. All port-forward state is global rather than scoped to a handler instance, reducing testability.
**Suggested fix**: Move the state into a struct that can be instantiated per handler.

### M5 — NodeMap.tsx is dead code — unreachable from any route
**File**: `ui/src/pages/NodeMap.tsx:1-335`
**Category**: dead-code
**Description**: NodeMap.tsx is a 335-line component not imported in App.tsx or referenced in any route. The router redirects `/node-map` to `/cluster/nodes`. Only imported in its test file.
**Suggested fix**: Remove the component or wire it into a route.

### M6 — NodeMap control dropdowns are non-functional
**File**: `ui/src/pages/NodeMap.tsx:244-276`
**Category**: stub
**Description**: "Group by", "Color by", "Size by" dropdowns use `defaultValue` with no `onChange` and no state binding. View toggle buttons (Hex, Grid, List) have no `onClick`. Even if NodeMap were re-enabled, these controls wouldn't work.
**Suggested fix**: Either complete the implementation or remove the dead code.

### M7 — BackupRestore dryRun checkbox state is unused
**File**: `ui/src/pages/BackupRestore.tsx:19,126`
**Category**: stub
**Description**: The `dryRun` boolean state is set via a checkbox but never consumed — `handleStripAndPreview` doesn't pass `dryRun` to `StripManifest()`, and there's no Apply/Import action that would use it.
**Suggested fix**: Wire dryRun into the strip/apply operations or remove the checkbox.

### M8 — BackupRestore has no actual Import/Apply action
**File**: `ui/src/pages/BackupRestore.tsx:62-75`
**Category**: stub
**Description**: The import side only has a "Strip & Preview" button. There's no "Apply" or "Import" button to create the resources in the cluster. Users can paste YAML and preview cleaned output, but cannot complete the restore workflow.
**Suggested fix**: Add an Apply button that calls a backend import handler.

### M9 — Alerts page has no loading state
**File**: `ui/src/pages/Alerts.tsx:28-42`
**Category**: bug
**Description**: The Alerts component calls `ListAlerts()` in `useEffect` but never sets or uses a loading state. Users see an empty table with no loading indicator while data fetches.
**Suggested fix**: Add a loading state matching the pattern in other pages.

### M10 — Sidebar resource counts only cover 8 of 26+ resource types
**File**: `ui/src/hooks/useResourceCounts.ts:6`
**Category**: bug
**Description**: `COUNT_RESOURCES` only includes 8 types (pods, deployments, services, etc.). The sidebar defines `resourceKey` for many more types but those counts are never fetched.
**Suggested fix**: Add remaining resource types to `COUNT_RESOURCES`.

### M11 — Phase 9 doc marked `-done` but contains major unimplemented features
**File**: `docs/archive/PHASE9-done.md`
**Category**: contradiction
**Description**: Phase 9 describes 14 features including Mobile/PWA, Plugin System, Application Catalog, Custom Dashboards. No `internal/server/` package, no PWA manifest, no plugin system exists. The `-done` suffix is misleading.
**Suggested fix**: Rename to `PHASE9-partial.md` or add a header noting which sections are unimplemented.

### M12 — FEATURES.md says keyboard customization "not yet wired" but task list marks it done
**File**: `docs/FEATURES.md:283`
**Category**: contradiction
**Description**: FEATURES.md states keyboard binding customization is "not yet wired into the frontend" but REMAINING-TASKS.md marks "All keyboard shortcuts work and are rebindable" as done.
**Suggested fix**: Verify the actual state and update whichever doc is wrong.

### M13 — Playwright frontend E2E tests described but never implemented
**File**: `docs/archive/E2E_TESTS-done.md:188-225`
**Category**: contradiction
**Description**: The E2E test plan describes Playwright tests with `ui/playwright.config.ts` and `ui/e2e/` but neither exists. The file is marked `-done`.
**Suggested fix**: Either implement the Playwright tests or update the doc to reflect they were descoped.

### M14 — 88 unchecked release checklist items
**File**: `docs/REMAINING-TASKS.md:415-522`
**Category**: incomplete-task
**Description**: Phase 8 Release Checklist contains 88 unchecked items covering version bump, build verification, macOS/Windows/Linux distribution, smoke tests, performance, documentation, and post-release steps.
**Suggested fix**: Work through these as part of the release process.

### M15 — ESLint set-state-in-effect rule at warn with 12 violations
**File**: `docs/AUDIT.md:464`
**Category**: incomplete-task
**Description**: `react-hooks/set-state-in-effect` is at `warn` with 12 existing violations that could cause infinite re-render loops.
**Suggested fix**: Fix the 12 violations and promote to `error`.

### M16 — AUDIT.md lists unresolved configuration items
**File**: `docs/AUDIT.md:462-479`
**Category**: incomplete-task
**Description**: Missing `contextcheck` linter, disabled `ST1000`, no CSP configuration, no environment-specific build configs — all flagged but with no resolution tracking.
**Suggested fix**: Create action items or document decisions for each.

### M17 — Copyright year is 2024
**File**: `wails.json:18`
**Category**: outdated-doc
**Description**: Copyright says "2024 Leonard Austin" — should be updated before release.
**Suggested fix**: Update to "2024-2026".

### M18 — 1 unchecked accessibility item in Phase 8
**File**: `docs/REMAINING-TASKS.md:396`
**Category**: incomplete-task
**Description**: `[ ] Labels and instructions visible before input, not just placeholder text (inconsistent)` — the sole remaining unchecked item in Phase 4-7 feature work. Violates WCAG 2.1 AA "Understandable."
**Suggested fix**: Audit form inputs and add visible labels.

### M19 — E2E test doc references outdated Go version
**File**: `docs/archive/E2E_TESTS-done.md:34`
**Category**: outdated-doc
**Description**: States prerequisite is "Go 1.22+" but `go.mod` specifies `go 1.25.0`.
**Suggested fix**: Update to match go.mod.

---

## Low Issues

### L1 — Version variable shadows main.go Version
**File**: `internal/updater/updater.go:21`
**Category**: bug
**Description**: `internal/updater` declares `var Version = "dev"` intended to be set via ldflags. `main.go` also declares its own `version` variable. If ldflags aren't applied consistently, versions can diverge.
**Suggested fix**: Use a single version source shared between packages.

### L2 — Template directory inconsistent with config directory
**File**: `internal/templates/engine.go:51`
**Category**: bug
**Description**: User templates stored in `~/.kubeviewer/templates/` (hardcoded) while config uses `os.UserConfigDir()` (macOS: `~/Library/Application Support/`, Linux: `~/.config/`). Different conventions for related data.
**Suggested fix**: Use `os.UserConfigDir()` consistently.

### L3 — UpdateBanner uses @ts-expect-error to access Wails runtime
**File**: `ui/src/components/banners/UpdateBanner.tsx:24-25`
**Category**: bug
**Description**: Accesses `window.runtime?.EventsOn?.()` directly with `@ts-expect-error`, bypassing the typed Wails runtime wrapper. The subscription may silently fail.
**Suggested fix**: Use the project's `EventsOn` wrapper from `wailsjs/runtime/runtime.ts`.

### L4 — 26 column definition files use `createColumnHelper<any>()`
**File**: `ui/src/lib/columns/*.ts`
**Category**: todo
**Description**: Every column definition file uses `createColumnHelper<any>()` with eslint-disable, disabling type checking for all cell accessor functions.
**Suggested fix**: Define proper row types for each resource kind.

### L5 — TerminalTab has missing dependency in useEffect
**File**: `ui/src/components/bottom-tray/tabs/TerminalTab.tsx:159-164`
**Category**: bug
**Description**: The auto-session creation `useEffect` omits `createNewSession` from deps with an eslint-disable. Changing settings while terminal is open may cause stale closures.
**Suggested fix**: Include `createNewSession` in the dependency array or use a ref.

### L6 — console.log left in Welcome.tsx
**File**: `ui/src/views/Welcome.tsx:370`
**Category**: todo
**Description**: `console.log('[Welcome] Kubeconfig changed, reloading clusters...')` is a debug log left in production code.
**Suggested fix**: Remove or convert to a proper logger.

### L7 — useSettingsStore.reset duplicates config mapping from load
**File**: `ui/src/stores/settingsStore.ts:166-203`
**Category**: todo
**Description**: The `reset()` function contains an identical copy of the config-to-state mapping found in `load()`. Adding a setting to one but not the other would be a silent bug.
**Suggested fix**: Extract the mapping into a shared helper.

### L8 — SecretWizard holds values in plaintext React state
**File**: `ui/src/pages/SecretWizard.tsx:24,75-76`
**Category**: security
**Description**: Secret values are in plaintext in React state (visible via React DevTools). Low risk in a desktop app context.
**Suggested fix**: Acceptable for desktop; document the tradeoff.

### L9 — Kubeconfig triple-load tech debt
**File**: `docs/REMAINING-TASKS.md:39-46`
**Category**: incomplete-task
**Description**: PreflightCheck loads the kubeconfig 3 times. Not a correctness issue but unnecessary I/O.
**Suggested fix**: Refactor to load once and pass through.

### L10 — Archived phase docs contain hundreds of unchecked acceptance criteria
**File**: `docs/archive/PHASE5-done.md` through `PHASE8-done.md`
**Category**: incomplete-task
**Description**: Archived phase docs marked `-done` contain large blocks of unchecked items (28+33+57+71 = 189 items). These are manual QA checklists that were never checked off.
**Suggested fix**: Either check items off or add a note that feature-level tracking moved to REMAINING-TASKS.md.

### L11 — Phase 9 "Retrofit Requirements" describe unimplemented changes
**File**: `docs/archive/PHASE9-done.md:36-43`
**Category**: outdated-doc
**Description**: Describes sweeping retrofits (PWA manifest, responsive sidebar, CodeMirror fallback, Dockerized web server) that were never implemented.
**Suggested fix**: Mark these as descoped.

### L12 — Helm repo management APIs not documented
**File**: `docs/FEATURES.md`
**Category**: missing-doc
**Description**: Helm section omits chart repository management APIs implemented in PR #54.
**Suggested fix**: Add to FEATURES.md.

### L13 — REMAINING-TASKS.md drain dialog text is misleading
**File**: `docs/REMAINING-TASKS.md:345`
**Category**: contradiction
**Description**: Checklist entry marked done still says "missing deleteEmptyDirData" despite the feature being implemented.
**Suggested fix**: Update the text.

### L14 — AUDIT.md recommends Go 1.24 LTS over current 1.25
**File**: `docs/AUDIT.md:444`
**Category**: incomplete-task
**Description**: Recommendation to "consider 1.24 LTS for stability" is unresolved with no follow-up.
**Suggested fix**: Document deliberate decision to use 1.25 or downgrade.

### L15 — RELEASING.md has literal X.Y.Z placeholder
**File**: `docs/RELEASING.md:51`
**Category**: outdated-doc
**Description**: The `gh release create` command uses literal `X.Y.Z` in a sed pattern. Could cause errors during the actual release.
**Suggested fix**: Add a note that X.Y.Z requires manual substitution, or use a variable.

### L16 — Architecture doc says "Go 1.25" without patch version
**File**: `docs/ARCHITECTURE.md:12`
**Category**: outdated-doc
**Description**: Lists `Go 1.25` while go.mod specifies `go 1.25.0`.
**Suggested fix**: Update to match go.mod.

### L17 — ConnectionLostBanner reconnect timer race
**File**: `ui/src/components/banners/ConnectionBanners.tsx:52-73`
**Category**: bug
**Description**: Small race window where the `setAttempt` from the timeout callback and a status change to "connected" could overlap.
**Suggested fix**: Use a ref for attempt tracking or cancel the timeout on status change.

### L18 — TerminalTab container selection has unnecessary dependency
**File**: `ui/src/components/bottom-tray/tabs/TerminalTab.tsx:136-140`
**Category**: bug
**Description**: Container selection effect includes `selectedContainer` in deps unnecessarily.
**Suggested fix**: Remove `selectedContainer` from the dependency array.

### L19 — REMAINING-TASKS partially wrong about which pages lack UI implementation
**File**: `docs/REMAINING-TASKS.md:9-34`
**Category**: contradiction
**Description**: Claims alerts/backup/gitops/topology/troubleshoot/metrics have "routes but no UI implementation" but page components do exist. The issue is missing sidebar links, not missing pages.
**Suggested fix**: Update the description to clarify these have pages but no sidebar navigation.

---

## Non-Functional Features & Mock Data

Features that exist in the codebase but don't actually work — stubs, placeholder data, hardcoded responses, or commented-out logic.

| # | File | Feature | Status | Notes |
|---|------|---------|--------|-------|
| 1 | `handlers/helm_handler.go` | All Helm operations | Broken | `SetCluster()` never called; every operation returns "no cluster configured" |
| 2 | `internal/alerts/store.go` | Alert system | Stub | `Fire()` never called; no alerts ever generated |
| 3 | `internal/troubleshoot/timeline.go` | Troubleshoot timeline | Stub | `Record()` never called; related-changes always empty |
| 4 | `handlers/backup_handler.go` | Backup export/import | Stub | Only `StripManifest` exposed; full Exporter/Importer types unused |
| 5 | `ui/src/pages/DeploymentWizard.tsx` | Deployment creation wizard | Incomplete | Preview step has no Apply button (other wizards do) |
| 6 | `ui/src/pages/TroubleshootingPanel.tsx` | Suggestion action buttons | Stub | Buttons render but have no onClick handler |
| 7 | `ui/src/pages/BackupRestore.tsx` | Backup import/restore | Stub | Only "Strip & Preview" works; no Apply/Import action |
| 8 | `ui/src/pages/BackupRestore.tsx` | Dry run checkbox | Stub | State never consumed by any function |
| 9 | `ui/src/pages/NodeMap.tsx` | Node map visualization | Dead code | 335 lines, not reachable from any route |
| 10 | `handlers/secret_handler.go` | Audit logging | Partial | Only secret view/reveal events logged; no other operations |
| 11 | `internal/audit/logger.go` | Audit log pruning | Stub | `Prune()` defined but never called |
| 12 | `internal/k8s/informer_manager.go` | InformerManager | Dead code | ~400 lines, never instantiated |
| 13 | `internal/k8s/dynamic.go` | DynamicResourceService | Dead code | ~227 lines, never instantiated |
| 14 | `internal/k8s/metrics.go` | MetricsClient | Dead code | ~100 lines, never instantiated |
| 15 | `internal/memory/manager.go` | Memory Manager | Dead code | ~123 lines, never instantiated |
| 16 | `internal/cluster/relationships.go` | RelationshipMapper | Dead code | ~198 lines, never instantiated |
| 17 | `internal/cluster/reconnect.go` | Standalone ReconnectLoop | Dead code | ~62 lines, Manager uses its own method |
| 18 | `internal/debounce/debouncer.go` | Debouncer | Dead code | ~99 lines, never instantiated |

---

## TODOs & FIXMEs (from source)

| File | Line | Type | Comment |
|------|------|------|---------|
| `ui/src/lib/columns/*.ts` | various | TODO | 26 files using `createColumnHelper<any>()` — type safety suppressed |
| `ui/src/views/Welcome.tsx` | 370 | TODO | Debug console.log left in production code |
| `ui/src/stores/settingsStore.ts` | 166 | TODO | reset() duplicates config mapping from load() |

---

## Documentation Issues

| # | File | Issue | Priority |
|---|------|-------|----------|
| 1 | `docs/FEATURES.md:79` | DrainNode signature missing deleteEmptyDirData param | High |
| 2 | (missing) | No README.md exists | High |
| 3 | `docs/FEATURES.md` | Missing rollout/pause/resume and Helm repo APIs | Low |
| 4 | `docs/FEATURES.md:283` | Says keyboard customization "not yet wired" vs task list done | Medium |
| 5 | `docs/archive/PHASE9-done.md` | Marked done but contains major unimplemented features | Medium |
| 6 | `docs/archive/E2E_TESTS-done.md` | Describes Playwright tests that don't exist | Medium |
| 7 | `CHANGELOG.md` | Still shows "Unreleased" | High |
| 8 | `docs/REMAINING-TASKS.md:9-34` | Mischaracterizes which pages lack UI | Low |
| 9 | `docs/REMAINING-TASKS.md:345` | Drain dialog text still says "missing" despite done | Low |
| 10 | `wails.json` | Copyright year 2024 | Medium |

---

## Recommendations

Top 5 highest-impact actions to take, ordered by priority:

1. **Wire HelmHandler.SetCluster() into cluster connection flow** — Helm is a major feature that is 100% broken. Every operation fails silently. This is the single highest-impact fix.

2. **Add sidebar navigation for hidden pages** — 12+ implemented pages (Security, Operations, Troubleshoot, Wizards) are invisible to users who don't know the command palette exists. Adding sidebar sections would immediately make a large portion of the app discoverable.

3. **Wire alert Fire() and timeline Record() into the event stream** — The troubleshooting and alerting systems are architecturally complete but have no data sources. Connecting them to the resource watch layer would activate two major features.

4. **Complete the Backup export/import workflow** — The backend has a full Exporter type and the frontend has the UI shell, but they're not connected. Wire the handler and add an Apply button to complete the feature.

5. **Add Apply button to DeploymentWizard** — The other three wizards (Service, ConfigMap, Secret) all work end-to-end. Deployment is the most common resource type and its wizard is a dead end.
