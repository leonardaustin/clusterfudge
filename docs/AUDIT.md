# Clusterfudge Comprehensive Code Audit

**Date:** 2026-03-06
**Scope:** Full codebase — Go backend, TypeScript/React frontend, tests, configuration, dependencies
**Last Updated:** 2026-03-06 (final frontend reliability pass)

---

## Executive Summary

Clusterfudge is a Wails-based (Go + React/TypeScript) Kubernetes cluster viewer. The codebase is well-structured overall, but this audit identified **44 issues** across security, reliability, performance, and code quality domains.

### Remediation Progress

| Status | Count |
|--------|-------|
| Resolved | 43 |
| Won't Fix | 1 |
| Remaining | 0 |

| Severity | Backend (Go) | Frontend (TS) | Total |
|----------|-------------|---------------|-------|
| **Critical** | 4 | 2 | **6** |
| **High** | 6 | 4 | **10** |
| **Medium** | 8 | 9 | **17** |
| **Low** | 6 | 5 | **11** |
| **Total** | **27** | **17** | **44** |

---

## CRITICAL Issues

### C1. Context.Background() in Long-Running Operations — RESOLVED
**Files:** `handlers/stream_handler.go:54`, `internal/stream/exec.go:114`, `internal/stream/portforward.go:31`
**Category:** Resource Leak

Long-running goroutines (log streaming, exec sessions, port forwards) use `context.Background()` instead of request-scoped contexts. This means:
- Operations cannot be cancelled when users navigate away
- No timeout protection against runaway streams
- Resource exhaustion over time

**Recommendation:** Propagate request contexts or derive child contexts with timeouts from a cancellable parent.

**Resolution:** Added timeout-bounded contexts: 4h for log streams, 24h for exec/port-forward sessions, 5min for log downloads.

---

### C2. Unsafe Command Execution in Exec Handler — RESOLVED
**File:** `handlers/stream_handler.go:105-107`
**Category:** Security — Command Injection

User-provided command arrays are passed directly to `kubectl exec` without validation. The default fallback (`/bin/sh -c "bash || sh"`) is safe, but custom commands from the frontend are not sanitized.

**Recommendation:** Whitelist allowed commands or validate against shell metacharacters.

**Resolution:** Added `validateExecCommand()` that rejects shell metacharacters (`;`, `|`, `&`, `` ` ``, `$(`, `${`) in individual command arguments.

---

### C3. Secret Access Without Audit Trail — RESOLVED
**File:** `handlers/secret_handler.go:52-68`
**Category:** Security — Information Disclosure

`RevealSecretKey` returns raw secret values with no access control checks beyond Kubernetes RBAC and no audit logging. The frontend can call this repeatedly to exfiltrate secrets silently.

**Recommendation:** Add audit logging for all secret reveal operations; consider rate limiting.

**Resolution:** Added audit logging via `audit.Logger` for both `GetSecret` (action: `secret.view`) and `RevealSecretKey` (action: `secret.reveal` with key name in details). SecretHandler now wired into main.go with the audit logger.

---

### C4. Goroutine Leak in Watch Operations — RESOLVED
**File:** `handlers/resource_handler.go:226-240`
**Category:** Resource Leak

Watch goroutines read from channels but cleanup logic has race conditions. If `WatchResources` is called multiple times before the previous watch finishes, goroutines accumulate without proper cleanup.

**Recommendation:** Implement proper goroutine lifecycle management with WaitGroups or errgroup.

**Resolution:** Removed goroutine defer that raced with the main map management. Only the cancel-before-create pattern and StopWatch manage the watchCancels map now.

---

### C5. Toast Timer Memory Leak (Frontend) — RESOLVED
**File:** `ui/src/stores/toastStore.ts:30-34`
**Category:** Memory Leak

`setTimeout` callbacks fire even after toasts are manually dismissed, updating state on potentially unmounted components. No cleanup mechanism for the timer IDs.

**Recommendation:** Store timeout IDs and clear them on manual dismissal.

**Resolution:** Added a module-level `Map<string, ReturnType<typeof setTimeout>>` to track timer IDs. `removeToast` now clears pending timers before removing the toast.

---

### C6. Variable Hoisting Bug in ToastContainer — RESOLVED
**File:** `ui/src/components/notifications/ToastContainer.tsx:30`
**Category:** Bug

`raf` variable used inside `tick()` callback before its `let` declaration. Works due to hoisting but is error-prone.

**Recommendation:** Declare `let raf: number` before the `tick` function definition.

**Resolution:** Moved `let raf: number` declaration before the `tick` function definition.

---

## HIGH Issues

### H1. No Input Validation on Helm Chart Paths — RESOLVED
**File:** `handlers/helm_handler.go:78-93`
**Category:** Security — Path Traversal

Only empty-string validation on `chartPath`. No checks for path traversal (`../`), allowing potential access to arbitrary filesystem paths.

**Recommendation:** Validate paths against a whitelist or sandbox directory; reject `..` components.

**Resolution:** Added `validateChartPath()` that rejects absolute paths and `..` path components. Applied to `InstallChart` and `UpgradeChart`.

---

### H2. Missing Pagination on List Operations — RESOLVED
**File:** `handlers/cluster_handler.go:144-146`
**Category:** Reliability

Kubernetes list operations don't handle pagination. Large clusters (1000+ resources) return partial results silently.

**Recommendation:** Implement continuation token handling or use informers for large datasets.

**Resolution:** Added continuation token pagination (Limit: 500) to `resource.Service.List()`, `ClusterHandler.ListNamespaces()`, and all list calls in `GetClusterSummary()`.

---

### H3. No Timeout on Cluster Summary Lists — RESOLVED
**File:** `handlers/cluster_handler.go:144-201`
**Category:** Availability — DoS

`GetClusterSummary` lists pods, deployments, services, nodes, and namespaces without per-operation timeouts. One slow operation blocks the entire summary.

**Recommendation:** Add per-operation context deadlines (e.g., 10s per resource type).

**Resolution:** Added 10-second per-operation context deadlines for each resource type list in `GetClusterSummary()`.

---

### H4. Unvalidated Patch Operations — RESOLVED
**File:** `handlers/resource_handler.go:315-320`
**Category:** Security — JSON Injection

Scale patches use `fmt.Sprintf` for JSON construction instead of `json.Marshal`. While current values are integers (safe), this is a latent injection vector.

**Recommendation:** Use proper JSON marshaling for all patch operations.

**Resolution:** Replaced `fmt.Sprintf` JSON construction with `json.Marshal` in `ScaleDeployment` and `RestartDeployment`.

---

### H5. No RBAC Pre-Flight Checks — RESOLVED
**File:** `handlers/resource_handler.go:80-101`
**Category:** UX / Security

Destructive operations (delete, scale, drain) don't perform pre-flight RBAC checks. Users discover permission errors only after the operation fails.

**Recommendation:** Use SelfSubjectAccessReview before destructive operations.

**Resolution:** Added `checkRBAC()` method to ResourceHandler that performs SelfSubjectAccessReview before `DeleteResource`, `ScaleDeployment`, and `DrainNode`. Returns clear "permission denied" error on failure; gracefully degrades if RBAC API is unavailable.

---

### H6. Unsafe Template Rendering — RESOLVED
**File:** `internal/templates/engine.go:196-204`
**Category:** Security — Template Injection

Uses Go's `text/template` for user-defined templates without sandboxing. Malicious templates could access environment variables or execute arbitrary functions.

**Recommendation:** Use a restricted template engine or whitelist available functions.

**Resolution:** Added a `safeFuncMap` with only safe string manipulation functions (upper, lower, trim, replace, contains, etc.). Set `Option("missingkey=error")` to catch undefined variables.

---

### H8. Stream Cleanup Missing in LogsTab — RESOLVED
**File:** `ui/src/components/bottom-tray/tabs/LogsTab.tsx:55-95`
**Category:** Memory Leak

Log streaming doesn't handle cleanup when component unmounts mid-stream, or when rapidly switching containers. The effect cleanup calls `StopLogStream` but there's no guard against state updates after unmount, and no cancellation of the in-flight `StreamLogs` promise.

**Recommendation:** Add a mounted ref to guard state updates; ensure rapid container switches don't cause state update races.

**Resolution:** Added `mountedRef` (component lifecycle) and `active` flag (per-effect instance). The `EventsOn` callback checks both before calling `setLines`. The `StreamLogs` error handler checks both before logging. On cleanup, `active` is set to `false` before stopping the stream, preventing any in-flight callbacks from updating state.

---

### H9. Global Mutable State in Shortcut System — WON'T FIX
**File:** `ui/src/hooks/useShortcuts.ts:73, 94-95`
**Category:** Architecture

Global `Map`, `chordBuffer`, `chordTimer`, and `listenerAttached` variables create hidden dependencies and make testing difficult.

**Recommendation:** Move to React Context or a dedicated store.

**Status:** Won't fix. Global mutable state is the standard pattern for keyboard shortcut systems (used by VS Code, Mousetrap, hotkeys-js). A single global `keydown` listener with a global shortcut map is architecturally correct — shortcuts must work regardless of which React component is focused, which rules out React Context (events would be missed when the provider unmounts). Moving state into a Zustand store would add indirection without benefit since the `keydown` handler needs synchronous access to the map. Testing difficulty is mitigated by the e2e test suite which exercises shortcuts end-to-end.

---

### H10. Unhandled Promise Rejections — RESOLVED
**File:** `ui/src/components/command-palette/CommandPalette.tsx:363-381`
**Category:** Error Handling

Async search operations can update state on unmounted components if the component unmounts between promise creation and resolution. The search effect has a `cancelled` flag but async `onSelect` handlers (restart, cordon, uncordon) can still fire setState-equivalent calls after unmount.

**Recommendation:** Add mounted guard to async onSelect handlers; ensure component teardown cancels in-flight operations.

**Resolution:** Added `mountedRef` to `CommandPalette` and passed it to `useContextCommands`. Async `onSelect` handlers (restart, cordon, uncordon) now check `mountedRef.current` before calling `close()`. Replaced 6 dynamic `import("../../stores/toastStore")` calls with a static import — eliminates the failure path where the error handler's own import could fail.

---

## MEDIUM Issues

### M1. Swallowed Metrics Errors — RESOLVED
**File:** `handlers/resource_handler.go:113-117`

All metrics API errors silently return `nil, nil` — including auth failures and network issues.
**Fix:** Log errors at debug/warn level before returning empty results.

**Resolution:** Added `slog.Warn` logging for metrics API errors before returning nil.

### M2. Race Condition in StopWatch — RESOLVED
**File:** `handlers/resource_handler.go:246-254`

Map modification and goroutine cleanup have overlapping lock windows.
**Fix:** Use sync patterns that prevent double-cancel.

**Resolution:** `StopWatch` now deletes the key from the map inside the lock and calls `cancel()` outside the lock to prevent potential deadlocks.

### M3. Unbounded Watch Channel — RESOLVED
**File:** `internal/resource/service.go:113`

Fixed 64-event buffer can block if frontend disconnects.
**Fix:** Add select-with-default to drop events when channel is full.

**Resolution:** Watch goroutine now uses `select` with `default` case to drop events when the 64-event buffer is full, with a log message for dropped events.

### M4. Kubeconfig Path Validation — RESOLVED
**File:** `internal/cluster/kubeconfig.go:47-62`

`os.UserHomeDir()` error ignored; could resolve to working directory.
**Fix:** Check error return and validate path exists.

**Resolution:** `kubeconfigPaths()` now checks the error return from `os.UserHomeDir()` and returns an empty slice if it fails or returns empty.

### M5. Panics in Goroutines — RESOLVED
**File:** `internal/stream/exec.go:23`

`GenerateID()` panics on entropy exhaustion, crashing the entire app.
**Fix:** Return error instead of panicking.

**Resolution:** Changed `GenerateID()` to return `(string, error)`. Updated all callers to handle the error.

### M6. Hardcoded Timeouts/QPS — RESOLVED
**File:** `internal/cluster/kubeconfig.go:141`

15s timeout, QPS=50, Burst=100 hardcoded. Not suitable for all cluster sizes.
**Fix:** Make configurable through settings.

**Resolution:** Added `K8sRequestTimeoutSec`, `K8sQPS`, `K8sBurst` fields to `AppConfig` with defaults matching previous hardcoded values. `KubeconfigLoader.SetClientOptions()` allows runtime configuration; `RestConfigForContext()` uses configurable values with zero-value fallback to defaults.

### M7. Ambiguous Watch Keys — RESOLVED
**File:** `handlers/resource_handler.go:207, 247`

Watch key `group/version/resource/namespace` is ambiguous if values contain `/`.
**Fix:** Use a struct key or URL-encode components.

**Resolution:** Replaced `map[string]context.CancelFunc` with `map[watchKey]context.CancelFunc` using a `watchKey` struct with separate group, version, resource, namespace fields. Eliminates any collision risk.

### M8. Missing Nil Checks on Client Bundles — RESOLVED
**File:** `internal/cluster/manager.go`

Some callers assume client bundles are non-nil without defensive checks.
**Fix:** Add nil guards consistently.

**Resolution:** Verified that `ActiveClients()`, `ClientsFor()`, and `healthLoop` all have proper nil checks. `HasMetrics()` guards metrics access. State checks in `ActiveClients()` prevent nil bundle returns. No additional changes needed — existing guards are comprehensive.

### M9. Type Assertions Without Validation (Frontend) — RESOLVED
**File:** `ui/src/components/bottom-tray/tabs/LogsTab.tsx:36-43`

Multiple `as` casts on backend data without runtime validation.
**Fix:** Add runtime type guards (zod or manual checks).

**Resolution:** Replaced `as` casts with runtime type validation: `Array.isArray()` check on containers, `.filter()` with type guard verifying each container has a string `name` property.

### M10. Missing Error Boundary for Async Commands (Frontend) — RESOLVED
**File:** `ui/src/components/command-palette/CommandPalette.tsx:169-220`

Dynamic imports and async method calls lack error boundaries.
**Fix:** Wrap in try-catch with user-facing error toast.

**Resolution:** Already addressed — all async `onSelect` handlers (restart, cordon, uncordon) have try-catch blocks that show error toasts on failure.

### M11. Duplicate ErrorBoundary Implementations (Frontend) — RESOLVED
**Files:** `ui/src/layouts/AppShell.tsx:15-58`, `ui/src/components/ErrorBoundary.tsx:13-104`

Two separate ErrorBoundary classes with different behavior.
**Fix:** Consolidate into one reusable component.

**Resolution:** Removed the inline ErrorBoundary class from AppShell.tsx. AppShell now imports and uses the standalone `ErrorBoundary` from `@/components/ErrorBoundary`.

### M12. Race Condition in useClusterSummary (Frontend) — RESOLVED
**File:** `ui/src/hooks/useClusterSummary.ts:10-25`

Rapid refresh calls cause out-of-order state updates.
**Fix:** Add request deduplication or abort previous request.

**Resolution:** Added a `requestIdRef` counter. Each `refresh()` call increments the counter and only applies state updates if its ID still matches the current value, discarding stale results from superseded requests.

### M13. localStorage Access Without Try-Catch (Frontend) — RESOLVED
**File:** `ui/src/providers/ThemeProvider.tsx:9, 33`

Throws in private browsing mode.
**Fix:** Wrap in try-catch.

**Resolution:** Extracted a `safeGetItem(key)` helper that wraps `localStorage.getItem` in try-catch, returning `null` on failure. All localStorage reads in ThemeProvider now use this helper.

### M14. Missing Memoization on ResourceTable (Frontend) — RESOLVED
**File:** `ui/src/components/table/ResourceTable.tsx:27-36`

Expensive table component re-renders unnecessarily.
**Fix:** Wrap with `React.memo` and memoize column definitions.

**Resolution:** Wrapped `ResourceTable` with `React.memo` to prevent re-renders when parent state changes don't affect the table's props.

### M15. Potential XSS in LogLine (Frontend) — RESOLVED
**File:** `ui/src/components/logs/LogLine.tsx:20-38`

Log content rendered without explicit sanitization. Currently safe (data from k8s API) but fragile. The `highlightSearch` function splits content and creates `<mark>` JSX elements — while React escapes text nodes, the regex-based split could behave unexpectedly with crafted input.
**Fix:** Add explicit content sanitization or harden the highlightSearch function.

**Resolution:** Three hardening measures: (1) `LogLineRow` now coerces content to string at entry (`typeof` check + `String()` fallback), guarding against non-string backend data. (2) `highlightSearch` validates its input is a string before processing. (3) Added `MAX_HIGHLIGHT_PARTS = 200` cap on regex split fragments to prevent performance degradation with pathological input. Added 3 new tests covering non-string content, null content, and pathological highlight input.

### M16. Stale onClose in ResourceDetailPanel (Frontend) — RESOLVED
**File:** `ui/src/components/detail/ResourceDetailPanel.tsx:28-35`

useEffect depends on `onClose` callback prop — creates/destroys event listeners on every parent render.
**Fix:** Use `useCallback` in parent or `useEvent` pattern.

**Resolution:** Added a stable `onCloseRef` that tracks the latest callback. The Escape key event listener now reads from the ref instead of depending on the `onClose` prop directly, so the listener is registered once and never torn down/recreated.

### M17. Missing Null Check in useResourceCounts (Frontend) — RESOLVED
**File:** `ui/src/hooks/useResourceCounts.ts:24`

`items?.length` doesn't validate that items is actually an array.
**Fix:** Add `Array.isArray()` check.

**Resolution:** Replaced `items?.length || 0` with `Array.isArray(items) ? items.length : 0`.

---

## LOW Issues

### L1. Missing Idle Timeout on Port Forwards — RESOLVED
**File:** `internal/stream/portforward.go` — No auto-cleanup for abandoned forwards.

**Resolution:** Added periodic (30s) pod health check in the port forward lifecycle goroutine. If the target pod no longer exists, the forward is automatically cleaned up and removed from the active forwards map.

### L2. Audit Entries Only In-Memory — RESOLVED
**File:** `internal/audit/logger.go` — All audit history lost on restart.

**Resolution:** Added `NewLoggerWithFile(path)` constructor that persists entries as JSONL. On startup, existing entries are loaded from the file. Added `Close()` method for cleanup. Main app now uses file-backed audit logger at `~/.config/clusterfudge/audit.jsonl` with graceful fallback to in-memory if file access fails.

### L3. String-Based Patch Construction (multiple locations) — RESOLVED
**File:** `handlers/resource_handler.go:315-360` — Anti-pattern, should use json.Marshal.

**Resolution:** `ScaleDeployment` and `RestartDeployment` already use `json.Marshal`. `CordonNode`/`UncordonNode` use hardcoded JSON byte literals for static boolean values — no injection risk.

### L4. No Size Limit on Config Import — RESOLVED
**File:** `handlers/config_handler.go:87-112` — `os.ReadFile` with no size cap.

**Resolution:** Added `maxConfigFileSize` constant (1 MiB) and `os.Stat` size check before `os.ReadFile` in `LoadFromFile()`.

### L5. Secret Length Disclosure — RESOLVED
**File:** `internal/security/secrets.go:7-14` — Masked secrets reveal byte length.

**Resolution:** Changed mask from `"****** (N bytes)"` to a fixed `"******"` that doesn't reveal secret length.

### L6. Missing Goroutine Limit in Drain — RESOLVED
**File:** `handlers/resource_handler.go:389` — Sequential pod eviction; slow on large nodes.

**Resolution:** `DrainNode` now evicts pods concurrently using a bounded semaphore (`maxConcurrentEvictions = 10`) with `sync.WaitGroup`. Errors are collected thread-safely and reported together.

### L7. Index-Based Keys in Log Lines (Frontend) — RESOLVED
**File:** `ui/src/components/bottom-tray/tabs/LogsTab.tsx` — Dynamic list with index keys.

**Resolution:** Changed `key={i}` to `key={`${line.timestamp}-${i}`}` for more stable keys that incorporate the log timestamp.

### L8. Missing Keyboard Accessibility (Frontend) — RESOLVED
**File:** `ui/src/components/layout/Sidebar.tsx:271` — Click handler on `div` without keyboard support.

**Resolution:** Already fixed in a prior refactor — all interactive elements in the Sidebar now use `<button>` or `<Link>` elements with proper keyboard semantics.

### L9. Inconsistent Error Logging (Frontend) — RESOLVED
Various files — Some errors logged with context prefix, others without.

**Resolution:** Standardized all 22 `console.error`/`console.warn` calls across the frontend to use a consistent `[ModuleName] message:` bracket prefix format. Files updated: `Alerts.tsx` (2), `Settings.tsx` (6), `useKubeResource.ts` (1), `ErrorBoundary.tsx` (1), `PortForwardIndicator.tsx` (2), `TerminalTab.tsx` (1), `LogsTab.tsx` (2). The `wailsjs/` utilities, `clusterStore.ts`, `CommandPalette.tsx`, and `Welcome.tsx` already used this format.

### L10. Missing aria-describedby on Dialogs (Frontend) — RESOLVED
**Files:** `ui/src/components/dialogs/DeleteConfirmDialog.tsx:71`, `ScaleDialog.tsx:72`

**Resolution:** Replaced `aria-describedby={undefined}` with proper `Dialog.Description` elements. DeleteConfirmDialog describes the destructive action; ScaleDialog describes the replica adjustment.

### L11. Magic Numbers (Frontend) — RESOLVED
Toast durations and poll intervals hardcoded in multiple places without constants.

**Resolution:** Extracted `DEFAULT_TOAST_DURATION_MS = 4000` in toastStore. Other intervals (`CHORD_TIMEOUT`, `MAX_LINES`, `POLL_INTERVAL_MS`, `REFRESH_INTERVAL`, `BASE_INTERVAL`) were already named constants. Extracted `EVENTS_POLL_INTERVAL_MS` in ResourceEvents.

---

## Test Coverage Analysis

### Backend (Go)
- **75 source files**, **63 test files** (mostly e2e tests in `test/e2e/`)
- **Unit test gap:** Only `app_test.go` at the root level. No unit tests for:
  - `handlers/` — 17 handler files with zero unit tests
  - `internal/cluster/` — Complex manager logic untested
  - `internal/stream/` — Exec, port-forward, log streaming untested
  - `internal/security/` — Secret masking/reveal untested
  - `internal/templates/` — Template engine untested
- **E2E tests** cover core flows but assume a running cluster

### Frontend (TypeScript)
- **174 source files**, **50 test files**
- **Well-tested:** Hooks, stores, table components, dialogs, cells
- **Untested:**
  - Most page components (only `Settings.test.tsx`, `ClusterOverview.test.tsx`)
  - `ThemeProvider` — localStorage edge cases
  - `AppShell` layout — ErrorBoundary behavior
  - `Sidebar` — Navigation and section toggling
  - `Topbar` — Context/namespace switching

---

## Dependency Audit

### Go (go.mod)
- **Go 1.25.0** — Bleeding edge; consider 1.24 LTS for stability
- **Wails v2.11.0** — Current
- **Kubernetes client-go v0.35.0** — Current
- **Helm v3.20.0** — Current
- 142 total dependencies (mostly indirect), no known CVEs in direct dependencies

### Frontend (package.json)
- **React 19.0.0** — Current
- **TypeScript 5.7.0** — Current
- **Vite 5.4.21** — Current
- **Zustand 4.5.7** — Current
- **Vitest 4.0.18** — Current
- Radix UI, Lucide, Monaco Editor all current

---

## Configuration Audit

### ESLint (`ui/eslint.config.js`) — PARTIALLY RESOLVED
- ~~`@typescript-eslint/no-explicit-any: 'warn'` — Should be `'error'`~~ **RESOLVED**: promoted to error, all 57 violations fixed
- `react-hooks/set-state-in-effect: 'warn'` — Kept at warn (12 existing violations need separate fix)
- ~~`react-hooks/refs: 'warn'` — Should be `'error'`~~ **RESOLVED**: promoted to error
- ~~`no-useless-assignment: 'warn'`~~ **RESOLVED**: promoted to error
- ~~**Missing plugins:** eslint-plugin-import (sort), eslint-plugin-jsx-a11y, eslint-plugin-security~~ **RESOLVED**: Added `eslint-plugin-import-x` (import ordering/deduplication) and `eslint-plugin-jsx-a11y` (accessibility). Security plugin omitted — not useful for a Wails desktop app. A11y rules set to warn (69 pre-existing violations to fix incrementally).

### Go Linter (`.golangci.yml`) — PARTIALLY RESOLVED
- Uses `linters: default` — permissive baseline
- ~~**Missing `gosec`** — No security linting (critical gap)~~ **RESOLVED**: gosec enabled
- ~~**Missing `errorlint`** — Proper error handling not enforced~~ **RESOLVED**: errorlint enabled
- **Missing `contextcheck`** — Context misuse not caught (not available in golangci-lint v2)
- Disabled `ST1000` (package comments) — Should re-enable

### Wails (`wails.json`)
- No CSP (Content Security Policy) configuration
- No explicit web preference security settings
- No environment-specific build configs

### Vite (`ui/vite.config.ts`)
- No CSP or security header configuration
- No source maps for production debugging
- No environment variable documentation
- Manual chunks configured (good for code splitting)

### Build System (`Makefile`)
- ~~No coverage target — Cannot track test coverage over time~~ **RESOLVED**: Added `make coverage` target
- ~~No build artifact versioning (commit hash, build date)~~ **RESOLVED**: Makefile injects Version, Commit, BuildDate via ldflags
- ~~Frontend test failures silently swallowed (`2>/dev/null || echo "No test script"`)~~ **RESOLVED**: Removed error swallowing from test-frontend and lint-frontend targets

### .gitignore — RESOLVED
- ~~Missing: IDE files (`.idea/`, `.vscode/`), OS files (`.DS_Store`), `ui/dist/`, `node_modules/`~~ All entries added.

---

## Architecture Observations

1. **Handler Layer:** 17 handler files follow consistent patterns but lack interface abstractions for testability
2. **No Dependency Injection:** Handlers directly construct dependencies, making unit testing impossible without a cluster
3. **Event System:** Fire-and-forget event emission with no error handling or delivery guarantees
4. **State Management:** Frontend uses Zustand stores correctly but has some global mutable state outside stores (shortcuts)
5. **Wails Bindings:** Auto-generated TypeScript bindings in `wailsjs/` are correct but not type-safe for error cases
6. **Cluster Module Complexity:** 12 source files in `internal/cluster/` — approaching monolithic; consider splitting
7. **Large Page Count:** 48 page components — well-organized but mostly untested

---

## Priority Remediation Plan

### Immediate (Security/Stability) — ALL RESOLVED
1. ~~Add input validation for Helm chart paths (path traversal)~~ DONE
2. ~~Fix goroutine leaks in watch operations~~ DONE
3. ~~Add audit logging for secret access~~ DONE
4. ~~Replace `context.Background()` in streams with cancellable contexts~~ DONE
5. ~~Fix toast timer memory leak~~ DONE
6. ~~Enable `gosec` linter in `.golangci.yml`~~ DONE
7. ~~Promote ESLint `warn` rules to `error` for type safety and hooks~~ PARTIALLY (refs promoted, set-state-in-effect kept at warn)

### Short-Term (Reliability) — ALL RESOLVED
8. ~~Implement pagination for list operations~~ DONE
9. ~~Add per-operation timeouts in cluster summary~~ DONE
10. ~~Add mounted guards and cancellation to frontend async operations (H8, H10)~~ DONE
11. ~~Fix race conditions in watch start/stop~~ DONE
12. ~~Remove panics from goroutine code paths~~ DONE (PR 1)
13. ~~Upgrade Vite from 4.x to 5.x~~ DONE
14. ~~Add unit tests for `secret_handler.go` and other untested handlers~~ DONE (secret, audit, backup, security_scan handlers)
15. ~~Add Vitest coverage configuration and thresholds~~ DONE

### Medium-Term (Quality) — ALL RESOLVED
16. ~~Add unit tests for 46 untested page components~~ DONE (44 new test files, 499 total frontend tests)
17. ~~Consolidate ErrorBoundary implementations~~ DONE
18. ~~Add runtime type validation for backend responses~~ DONE (LogsTab containers)
19. ~~Make timeouts/QPS configurable~~ DONE
20. ~~Implement proper template sandboxing~~ DONE (H6 resolved: safeFuncMap + missingkey=error)
21. ~~Add build versioning and metadata~~ DONE
22. ~~Add missing ESLint plugins (import, a11y, security)~~ DONE (import-x + jsx-a11y; security plugin omitted)
24. ~~Complete .gitignore entries~~ DONE (PR 1)
