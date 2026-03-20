# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-03-10

### Added
- Kubernetes cluster connection with multi-context support
- Resource browsing for 27 resource types with virtual-scrolled tables
- Real-time watch updates via Kubernetes watch API
- Pod log streaming with search, severity coloring, and multi-container support
- Interactive terminal (exec) with ANSI color and resize support
- Port forwarding with status dashboard
- YAML editor with syntax highlighting and in-place apply
- Helm release management (list, install, upgrade, rollback, uninstall)
- Command palette (Cmd+K) with fuzzy search and context-aware actions
- Keyboard shortcuts with chord sequences and help overlay
- Dark/light theme with system preference detection
- Resource creation wizard for Deployments
- Batch operations (multi-select delete)
- Column customization with drag-to-reorder and CSV export
- Audit logging for secret access operations (file-backed, persistent)
- RBAC pre-flight checks before destructive operations
- Build versioning with Git commit, tag, and build date via ldflags

### Changed
- Promoted `no-explicit-any` ESLint rule to error; fixed all 57 violations
- Added `eslint-plugin-import-x` and `eslint-plugin-jsx-a11y` for stricter linting
- Enabled `gosec` and `errorlint` Go linters
- Made Kubernetes client timeouts and QPS/burst configurable via settings
- Replaced index-based React keys in log lines with timestamp-based keys

### Fixed
- Goroutine leaks in watch operations (race in cancel/start lifecycle)
- Context.Background() in long-running streams replaced with timeout-bounded contexts
- Toast timer memory leak (timers now cleared on manual dismissal)
- Command injection via exec handler (shell metacharacter validation added)
- Helm chart path traversal (absolute paths and `..` components rejected)
- Unbounded watch channel (select-with-default to drop events when buffer full)
- Race condition in useClusterSummary (stale request deduplication)
- Unhandled promise rejections in CommandPalette async handlers
- localStorage access crash in private browsing mode (try-catch wrapper)
- 8 silent error-swallowing catch blocks replaced with user-facing toasts
- Mock/stub UI elements removed or wired to real functionality
- Pagination added for Kubernetes list operations (500-item pages with continuation)

### Security
- Input validation for Helm chart paths prevents path traversal
- Exec command validation rejects shell metacharacters
- Secret values masked with fixed-length string (no length disclosure)
- Audit trail for all secret view/reveal operations
- Template engine restricted to safe function whitelist
- JSON patch construction uses json.Marshal instead of fmt.Sprintf
- Config file import capped at 1 MiB
