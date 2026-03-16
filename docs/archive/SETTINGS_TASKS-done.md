# Settings — Remaining Tasks

Settings that are persisted to `config.json` but not yet consumed by the app.

## General

- [x] **Default namespace** — On cluster connect, read `defaultNamespace` from config and pre-select it in the namespace dropdown (`clusterStore.setNamespace`)
- [x] **Startup behavior** — Read `startupBehavior` from config on app launch: if `last_cluster`, auto-reconnect to the previously connected cluster; if `welcome`, show the welcome screen
- [x] **Auto check updates** — Read `autoCheckUpdates` from config in `main.go` and conditionally start the update scheduler
- [x] **"Check now" button** — Wire the onClick to call `UpdateHandler.CheckForUpdate` and show result in a toast

## Kubeconfig

- [x] **Kubeconfig paths** — Pass `kubeconfigPaths` from config to `cluster.Manager.Loader()` so it scans user-specified paths instead of only `~/.kube/config` / `KUBECONFIG` env
- [x] **Auto-reload kubeconfig** — If enabled, set up a file watcher on kubeconfig paths and re-scan clusters when files change on disk

## Terminal

- [x] **Copy on select** — Pass `terminalCopyOnSelect` to the xterm `Terminal` via `onSelectionChange` listener that writes to clipboard
- [x] **Shell command** — Pass `terminalShell` from settings to `StartExec` command; if non-empty, use it instead of the default auto-detect shell

## Advanced / K8s Tuning

- [x] **K8s request timeout** — Already read at startup in `main.go`; add a note in Settings UI under Advanced section so users can see/change `k8sRequestTimeoutSec`
- [x] **K8s QPS / Burst** — Same as above for `k8sQps` and `k8sBurst`; these require app restart to take effect

## Window State

- [x] **Persist window state** — Save window position/size/maximized state to `windowState` in config on shutdown; restore on startup via Wails runtime calls
- [x] **Persist sidebar width** — Save `sidebarWidth` from `uiStore` to `windowState.sidebarWidth` in config
- [x] **Persist bottom tray** — Save `bottomTrayHeight` and `bottomTrayVisible` from `uiStore` to config
- [x] **Persist active route** — Save current route to `windowState.activeRoute` and navigate there on startup

## Cluster Preferences

- [x] **Cluster favorites** — Read `clusterFavorites` from config and pin those clusters to the top of the cluster list
