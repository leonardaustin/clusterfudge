# Phase 7 — Advanced Features: Helm, YAML Editor, Resource Actions

## Goal

Helm chart and release management, an integrated YAML editor with apply/diff, resource-level actions (scale, restart, cordon/drain), and enhanced command palette with resource search. This phase turns KubeViewer from a viewer into a full management tool.

---

## 7.1 — Helm Integration

### Backend: `internal/helm/client.go`

Use the Helm v3 SDK directly. No shelling out to the `helm` CLI.

```go
package helm

import (
    "context"

    "helm.sh/helm/v3/pkg/action"
    "helm.sh/helm/v3/pkg/chart/loader"
    "helm.sh/helm/v3/pkg/cli"
    "helm.sh/helm/v3/pkg/release"
    "k8s.io/cli-runtime/pkg/genericclioptions"
)

// ReleaseInfo is the frontend-friendly representation of a Helm release.
type ReleaseInfo struct {
    Name       string `json:"name"`
    Namespace  string `json:"namespace"`
    Revision   int    `json:"revision"`
    Status     string `json:"status"`     // deployed, failed, pending-install, etc.
    Chart      string `json:"chart"`      // chart name
    ChartVer   string `json:"chartVersion"`
    AppVersion string `json:"appVersion"`
    Updated    string `json:"updated"`
    Notes      string `json:"notes"`
}

// Client wraps Helm SDK operations.
type Client struct {
    settings   *cli.EnvSettings
    restGetter genericclioptions.RESTClientGetter
}

// NewClient creates a Helm client for the given kubeconfig context.
func NewClient(kubeconfig, context string) *Client {
    settings := cli.New()
    settings.KubeConfig = kubeconfig
    settings.KubeContext = context
    return &Client{settings: settings}
}

// ListReleases returns all Helm releases, optionally filtered by namespace.
func (c *Client) ListReleases(namespace string) ([]ReleaseInfo, error) {
    cfg := new(action.Configuration)
    if err := cfg.Init(c.restGetter, namespace, "secrets", func(format string, v ...interface{}) {}); err != nil {
        return nil, err
    }

    list := action.NewList(cfg)
    list.AllNamespaces = namespace == ""
    list.StateMask = action.ListAll

    releases, err := list.Run()
    if err != nil {
        return nil, err
    }

    result := make([]ReleaseInfo, 0, len(releases))
    for _, r := range releases {
        result = append(result, releaseToInfo(r))
    }
    return result, nil
}

// GetRelease returns detailed information about a specific release.
func (c *Client) GetRelease(name, namespace string) (*ReleaseDetail, error) {
    cfg := new(action.Configuration)
    if err := cfg.Init(c.restGetter, namespace, "secrets", func(format string, v ...interface{}) {}); err != nil {
        return nil, err
    }

    get := action.NewGet(cfg)
    rel, err := get.Run(name)
    if err != nil {
        return nil, err
    }

    return &ReleaseDetail{
        ReleaseInfo: releaseToInfo(rel),
        Values:      rel.Config,
        Manifest:    rel.Manifest,
    }, nil
}

// GetReleaseHistory returns the revision history for a release.
func (c *Client) GetReleaseHistory(name, namespace string) ([]ReleaseInfo, error) {
    cfg := new(action.Configuration)
    if err := cfg.Init(c.restGetter, namespace, "secrets", func(format string, v ...interface{}) {}); err != nil {
        return nil, err
    }

    history := action.NewHistory(cfg)
    releases, err := history.Run(name)
    if err != nil {
        return nil, err
    }

    result := make([]ReleaseInfo, 0, len(releases))
    for _, r := range releases {
        result = append(result, releaseToInfo(r))
    }
    return result, nil
}

// UninstallRelease removes a Helm release.
func (c *Client) UninstallRelease(name, namespace string) error {
    cfg := new(action.Configuration)
    if err := cfg.Init(c.restGetter, namespace, "secrets", func(format string, v ...interface{}) {}); err != nil {
        return err
    }

    uninstall := action.NewUninstall(cfg)
    _, err := uninstall.Run(name)
    return err
}

// RollbackRelease rolls back to a specific revision.
func (c *Client) RollbackRelease(name, namespace string, revision int) error {
    cfg := new(action.Configuration)
    if err := cfg.Init(c.restGetter, namespace, "secrets", func(format string, v ...interface{}) {}); err != nil {
        return err
    }

    rollback := action.NewRollback(cfg)
    rollback.Version = revision
    return rollback.Run(name)
}

func releaseToInfo(r *release.Release) ReleaseInfo {
    return ReleaseInfo{
        Name:       r.Name,
        Namespace:  r.Namespace,
        Revision:   r.Version,
        Status:     r.Info.Status.String(),
        Chart:      r.Chart.Metadata.Name,
        ChartVer:   r.Chart.Metadata.Version,
        AppVersion: r.Chart.Metadata.AppVersion,
        Updated:    r.Info.LastDeployed.Format(time.RFC3339),
        Notes:      r.Info.Notes,
    }
}
```

### Helm release table columns

| Column | Width | Content |
|--------|-------|---------|
| Status | 40px | Green (deployed), red (failed), yellow (pending) |
| Name | flex | Release name |
| Namespace | 120px | Target namespace |
| Chart | 150px | Chart name + version |
| App Version | 100px | Application version |
| Revision | 60px | Current revision number |
| Updated | 100px | Relative time |

### Helm release detail panel

| Section | Content |
|---------|---------|
| **Overview** | Name, namespace, chart, version, status, timestamps |
| **Values** | Monaco editor showing current values (YAML, read-only by default) |
| **Manifest** | Monaco editor showing the rendered manifest |
| **History** | Revision list with rollback buttons |
| **Notes** | Rendered release notes |

### Helm actions

| Action | UI | Backend |
|--------|-----|---------|
| **Uninstall** | Confirmation dialog with release name | `UninstallRelease()` |
| **Rollback** | History tab → click revision → confirm | `RollbackRelease()` |

---

## 7.2 — YAML Editor

### Monaco Editor integration

The YAML editor appears in:
1. Detail panel "YAML" tab — view/edit any resource
2. Helm release "Values" and "Manifest" tabs
3. "Create Resource" dialog

```tsx
// components/editor/YAMLEditor.tsx
import Editor, { OnMount } from "@monaco-editor/react";

interface YAMLEditorProps {
  value: string;
  readOnly?: boolean;
  onChange?: (value: string) => void;
  onApply?: (value: string) => void;
}

export function YAMLEditor({ value, readOnly = false, onChange, onApply }: YAMLEditorProps) {
  const editorRef = useRef<any>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [originalValue] = useState(value);

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    // Configure YAML language
    monaco.languages.register({ id: "yaml" });

    // Dark theme matching KubeViewer's palette
    monaco.editor.defineTheme("kubeviewer-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "key", foreground: "7C5CFC" },       // accent purple for keys
        { token: "string", foreground: "4ADE80" },     // green for strings
        { token: "number", foreground: "FBBF24" },     // yellow for numbers
        { token: "comment", foreground: "5C5C63" },    // muted for comments
        { token: "keyword", foreground: "60A5FA" },    // blue for booleans/null
      ],
      colors: {
        "editor.background": "#0A0A0B",
        "editor.foreground": "#EDEDEF",
        "editor.selectionBackground": "#7C5CFC33",
        "editor.lineHighlightBackground": "#1A1A1E",
        "editorCursor.foreground": "#7C5CFC",
        "editorLineNumber.foreground": "#5C5C63",
        "editorLineNumber.activeForeground": "#8B8B8E",
      },
    });

    monaco.editor.setTheme("kubeviewer-dark");

    // Cmd+S to apply
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
      () => {
        if (onApply && isDirty) {
          onApply(editor.getValue());
        }
      }
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      {!readOnly && (
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <div className="flex items-center gap-2">
            {isDirty && (
              <span className="text-xs text-status-pending">Unsaved changes</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isDirty && (
              <>
                <button
                  onClick={() => {
                    editorRef.current?.setValue(originalValue);
                    setIsDirty(false);
                  }}
                  className="text-xs px-2 py-1 text-text-secondary hover:text-text-primary"
                >
                  Revert
                </button>
                <button
                  onClick={() => onApply?.(editorRef.current?.getValue())}
                  className="text-xs px-3 py-1 bg-accent text-white rounded hover:bg-accent-hover"
                >
                  Apply (⌘S)
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <Editor
        height="100%"
        language="yaml"
        value={value}
        options={{
          readOnly,
          minimap: { enabled: false },
          fontSize: 13,
          fontFamily: "JetBrains Mono, Menlo, Monaco, monospace",
          lineNumbers: "on",
          scrollBeyondLastLine: false,
          wordWrap: "on",
          tabSize: 2,
          renderLineHighlight: "gutter",
          folding: true,
          bracketPairColorization: { enabled: true },
        }}
        onMount={handleMount}
        onChange={(val) => {
          onChange?.(val ?? "");
          setIsDirty(val !== originalValue);
        }}
      />
    </div>
  );
}
```

### Apply workflow

1. User edits YAML in the editor
2. "Unsaved changes" indicator appears
3. User clicks "Apply" or presses `Cmd+S`
4. Frontend sends the YAML to `ApplyResource()` Go handler
5. On success: toast notification, editor value refreshed from server
6. On error: inline error message with details (validation errors, RBAC denials, conflicts)

### Diff view

Before applying, optionally show a diff between the current server state and the edited version:

```tsx
// Diff mode using Monaco's diff editor
import { DiffEditor } from "@monaco-editor/react";

<DiffEditor
  original={serverYAML}
  modified={editedYAML}
  language="yaml"
  options={{ readOnly: true, renderSideBySide: true }}
/>
```

---

## 7.3 — Resource Actions

### Deployment actions

| Action | UI | Backend Implementation |
|--------|-----|----------------------|
| **Scale** | Number input dialog | PATCH deployment `.spec.replicas` |
| **Restart** | Confirmation dialog | PATCH deployment annotation `kubectl.kubernetes.io/restartedAt` to trigger rolling restart |
| **Edit YAML** | Opens YAML tab in detail panel | `ApplyResource()` |
| **Delete** | Confirmation dialog with name verification | `DeleteResource()` |

### Pod actions

| Action | UI | Backend |
|--------|-----|---------|
| **View Logs** | Opens bottom tray logs tab | `StreamLogs()` |
| **Exec Shell** | Opens bottom tray terminal tab | `StartExec()` |
| **Port Forward** | Port configuration dialog | `StartPortForward()` |
| **Delete** | Confirmation dialog | `DeleteResource()` |

### Node actions

| Action | UI | Backend |
|--------|-----|---------|
| **Cordon** | Confirmation dialog | PATCH node `.spec.unschedulable = true` |
| **Uncordon** | Confirmation dialog | PATCH node `.spec.unschedulable = false` |
| **Drain** | Confirmation dialog with options (force, grace period, ignore daemonsets) | Evict pods sequentially |

### Scale dialog

```tsx
// components/dialogs/ScaleDialog.tsx
export function ScaleDialog({ deployment, onClose }) {
  const [replicas, setReplicas] = useState(deployment.replicas);

  const handleScale = async () => {
    await ScaleDeployment({
      namespace: deployment.namespace,
      name: deployment.name,
      replicas,
    });
    onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-bg-tertiary border-border w-[380px]">
        <DialogHeader>
          <DialogTitle>Scale {deployment.name}</DialogTitle>
          <DialogDescription>
            Current replicas: {deployment.replicas}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-4 py-4">
          <button
            onClick={() => setReplicas(Math.max(0, replicas - 1))}
            className="w-8 h-8 rounded bg-bg-hover text-text-primary hover:bg-bg-active"
          >
            -
          </button>
          <input
            type="number"
            min={0}
            value={replicas}
            onChange={(e) => setReplicas(parseInt(e.target.value) || 0)}
            className="w-20 text-center text-lg font-mono bg-bg-primary border border-border rounded px-3 py-1 text-text-primary"
          />
          <button
            onClick={() => setReplicas(replicas + 1)}
            className="w-8 h-8 rounded bg-bg-hover text-text-primary hover:bg-bg-active"
          >
            +
          </button>
        </div>
        <DialogFooter>
          <button onClick={onClose} className="text-sm text-text-secondary px-4 py-2">
            Cancel
          </button>
          <button
            onClick={handleScale}
            disabled={replicas === deployment.replicas}
            className="text-sm bg-accent text-white px-4 py-2 rounded hover:bg-accent-hover disabled:opacity-50"
          >
            Scale to {replicas}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### Delete confirmation dialog

Dangerous actions require typing the resource name to confirm (like GitHub repo deletion):

```tsx
export function DeleteConfirmDialog({ resource, onConfirm, onClose }) {
  const [confirmText, setConfirmText] = useState("");
  const canConfirm = confirmText === resource.name;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-bg-tertiary border-border w-[440px]">
        <DialogHeader>
          <DialogTitle className="text-status-error">Delete {resource.kind}</DialogTitle>
          <DialogDescription>
            This will permanently delete <strong>{resource.name}</strong> from
            namespace <strong>{resource.namespace}</strong>. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <label className="text-xs text-text-secondary block mb-2">
            Type <strong>{resource.name}</strong> to confirm:
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-bg-primary border border-border rounded text-text-primary"
            autoFocus
          />
        </div>
        <DialogFooter>
          <button onClick={onClose} className="text-sm text-text-secondary px-4 py-2">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            className="text-sm bg-status-error text-white px-4 py-2 rounded hover:opacity-90 disabled:opacity-30"
          >
            Delete
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

---

## 7.4 — Context Menus

Right-clicking a resource row opens a context menu with available actions.

```tsx
// Using Radix UI Context Menu
import * as ContextMenu from "@radix-ui/react-context-menu";

function ResourceRow({ resource, children }) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        {children}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="bg-bg-tertiary border border-border rounded-lg shadow-xl py-1 min-w-[180px] animate-scale-in">
          <ContextMenu.Item className="context-menu-item" onSelect={() => viewDetail(resource)}>
            View Details
            <span className="ml-auto text-text-tertiary text-xs">Enter</span>
          </ContextMenu.Item>
          <ContextMenu.Item className="context-menu-item" onSelect={() => viewLogs(resource)}>
            View Logs
            <span className="ml-auto text-text-tertiary text-xs">L</span>
          </ContextMenu.Item>
          <ContextMenu.Item className="context-menu-item" onSelect={() => execShell(resource)}>
            Exec Shell
            <span className="ml-auto text-text-tertiary text-xs">X</span>
          </ContextMenu.Item>
          <ContextMenu.Separator className="h-px bg-border my-1" />
          <ContextMenu.Item className="context-menu-item" onSelect={() => editYAML(resource)}>
            Edit YAML
            <span className="ml-auto text-text-tertiary text-xs">E</span>
          </ContextMenu.Item>
          <ContextMenu.Separator className="h-px bg-border my-1" />
          <ContextMenu.Item className="context-menu-item text-status-error" onSelect={() => deleteResource(resource)}>
            Delete
            <span className="ml-auto text-text-tertiary text-xs">⌘⌫</span>
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
```

### Context menu styling

```css
.context-menu-item {
  @apply flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary cursor-pointer outline-none;
  @apply data-[highlighted]:bg-bg-hover;
}
```

---

## 7.5 — Enhanced Command Palette

Extend the command palette from Phase 4 with:

### Resource search

When the user types a name, search across all cached resources:

```tsx
// In CommandPalette.tsx — add a resource search group
<Command.Group heading="Resources">
  {searchResults.map((r) => (
    <Command.Item
      key={`${r.kind}/${r.namespace}/${r.name}`}
      value={`${r.name} ${r.kind} ${r.namespace}`}
      onSelect={() => navigateToResource(r)}
    >
      <ResourceIcon kind={r.kind} className="w-4 h-4 text-text-secondary" />
      <span className="flex-1">{r.name}</span>
      <span className="text-xs text-text-tertiary">{r.kind}</span>
      {r.namespace && (
        <span className="text-xs text-text-tertiary">{r.namespace}</span>
      )}
    </Command.Item>
  ))}
</Command.Group>
```

### Contextual actions

When a resource is selected in the table, the command palette shows resource-specific actions:

```tsx
// When a pod is selected, these appear:
<Command.Group heading={`Actions for ${selectedPod.name}`}>
  <CommandItem label="View Logs" shortcut="L" onSelect={viewLogs} />
  <CommandItem label="Exec Shell" shortcut="X" onSelect={execShell} />
  <CommandItem label="Port Forward..." onSelect={portForward} />
  <CommandItem label="Edit YAML" shortcut="E" onSelect={editYAML} />
  <CommandItem label="Delete" shortcut="⌘⌫" onSelect={deleteResource} />
</Command.Group>
```

---

## 7.6 — Toast Notifications

For action feedback (apply succeeded, delete completed, errors).

```tsx
// components/ui/Toast.tsx
// Using a simple Zustand-based toast system

interface Toast {
  id: string;
  type: "success" | "error" | "info";
  title: string;
  description?: string;
  duration?: number; // ms, default 4000
}

export const useToastStore = create<{
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
}>((set) => ({
  toasts: [],
  addToast: (toast) =>
    set((s) => ({
      toasts: [...s.toasts, { ...toast, id: crypto.randomUUID() }],
    })),
  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

// Render in AppShell.tsx, bottom-right corner
function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <motion.div
          key={toast.id}
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          className={cn(
            "px-4 py-3 rounded-lg border shadow-lg max-w-sm",
            toast.type === "success" && "bg-bg-tertiary border-status-running/30",
            toast.type === "error" && "bg-bg-tertiary border-status-error/30",
            toast.type === "info" && "bg-bg-tertiary border-border"
          )}
        >
          <p className="text-sm font-medium text-text-primary">{toast.title}</p>
          {toast.description && (
            <p className="text-xs text-text-secondary mt-1">{toast.description}</p>
          )}
        </motion.div>
      ))}
    </div>
  );
}
```

---

## 7.7 — Acceptance Criteria

- [ ] Helm releases list with correct columns and status indicators
- [ ] Helm release detail shows values, manifest, history, and notes
- [ ] Helm uninstall works with confirmation dialog
- [ ] Helm rollback to a previous revision works
- [ ] YAML editor renders with KubeViewer dark theme
- [ ] YAML editor shows "Unsaved changes" indicator when modified
- [ ] Cmd+S in editor triggers apply
- [ ] Apply success shows toast notification
- [ ] Apply failure shows inline error with details
- [ ] Diff view shows changes before apply
- [ ] Scale dialog works for deployments
- [ ] Restart (rolling) works for deployments
- [ ] Cordon/uncordon works for nodes
- [ ] Delete requires typing resource name to confirm
- [ ] Context menu appears on right-click with correct actions per resource type
- [ ] Command palette searches across resources when typing a name
- [ ] Command palette shows context-specific actions for selected resources
- [ ] Toast notifications appear for all action outcomes
- [ ] Keyboard shortcuts shown in context menus match actual shortcuts

---

## 7.8 — Helm: Chart Repositories, Install, and Search

### Backend: `internal/helm/repos.go`

```go
package helm

import (
    "fmt"
    "net/http"
    "os"
    "path/filepath"
    "strings"
    "time"

    "helm.sh/helm/v3/pkg/action"
    "helm.sh/helm/v3/pkg/chart/loader"
    "helm.sh/helm/v3/pkg/cli"
    "helm.sh/helm/v3/pkg/getter"
    "helm.sh/helm/v3/pkg/repo"
    "helm.sh/helm/v3/pkg/storage/driver"
    "sigs.k8s.io/yaml"
)

// RepoEntry represents a chart repository.
type RepoEntry struct {
    Name string `json:"name"`
    URL  string `json:"url"`
    Type string `json:"type"` // "oci" | "https"
}

// AddRepo adds a Helm chart repository.
func (c *Client) AddRepo(name, url string) error {
    repoFile := c.settings.RepositoryConfig
    var f repo.File
    if data, err := os.ReadFile(repoFile); err == nil {
        _ = yaml.Unmarshal(data, &f)
    }

    entry := &repo.Entry{Name: name, URL: url}
    r, err := repo.NewChartRepository(entry, getter.All(c.settings))
    if err != nil {
        return fmt.Errorf("create repo: %w", err)
    }
    if _, err := r.DownloadIndexFile(); err != nil {
        return fmt.Errorf("download index for %s: %w", url, err)
    }
    f.Update(entry)
    return f.WriteFile(repoFile, 0o600)
}

// RemoveRepo removes a repository by name.
func (c *Client) RemoveRepo(name string) error {
    repoFile := c.settings.RepositoryConfig
    var f repo.File
    if data, err := os.ReadFile(repoFile); err == nil {
        _ = yaml.Unmarshal(data, &f)
    }
    f.Remove(name)
    // Delete cached index
    cacheDir := c.settings.RepositoryCache
    _ = os.Remove(filepath.Join(cacheDir, name+"-index.yaml"))
    return f.WriteFile(repoFile, 0o600)
}

// ListRepos returns all configured repositories.
func (c *Client) ListRepos() ([]RepoEntry, error) {
    repoFile := c.settings.RepositoryConfig
    var f repo.File
    if data, err := os.ReadFile(repoFile); err == nil {
        _ = yaml.Unmarshal(data, &f)
    }
    result := make([]RepoEntry, 0, len(f.Repositories))
    for _, r := range f.Repositories {
        t := "https"
        if strings.HasPrefix(r.URL, "oci://") {
            t = "oci"
        }
        result = append(result, RepoEntry{Name: r.Name, URL: r.URL, Type: t})
    }
    return result, nil
}

// UpdateRepos refreshes all repository indexes.
func (c *Client) UpdateRepos() error {
    repoFile := c.settings.RepositoryConfig
    var f repo.File
    if data, err := os.ReadFile(repoFile); err == nil {
        _ = yaml.Unmarshal(data, &f)
    }
    for _, entry := range f.Repositories {
        r, err := repo.NewChartRepository(entry, getter.All(c.settings))
        if err != nil {
            continue
        }
        _, _ = r.DownloadIndexFile()
    }
    return nil
}
```

### Backend: `internal/helm/search.go`

```go
package helm

import (
    "strings"

    "helm.sh/helm/v3/pkg/repo"
    "helm.sh/helm/v3/pkg/search"
    "sigs.k8s.io/yaml"
)

// ChartSearchResult is a matching chart from the repo index.
type ChartSearchResult struct {
    Name        string `json:"name"`        // repo/chart-name
    Version     string `json:"version"`
    AppVersion  string `json:"appVersion"`
    Description string `json:"description"`
    Repo        string `json:"repo"`
}

// SearchCharts searches all local repo indexes for the given keyword.
func (c *Client) SearchCharts(keyword string) ([]ChartSearchResult, error) {
    i := search.NewIndex()

    repoFile := c.settings.RepositoryConfig
    var f repo.File
    if data, _ := os.ReadFile(repoFile); data != nil {
        _ = yaml.Unmarshal(data, &f)
    }

    for _, r := range f.Repositories {
        idxFile := filepath.Join(c.settings.RepositoryCache, r.Name+"-index.yaml")
        idx, err := repo.LoadIndex(idxFile)
        if err != nil {
            continue
        }
        i.AddRepo(r.Name, idx, true)
    }

    results := i.Search(keyword, 50, false)
    out := make([]ChartSearchResult, 0, len(results))
    for _, r := range results {
        out = append(out, ChartSearchResult{
            Name:        r.Name,
            Version:     r.Chart.Version,
            AppVersion:  r.Chart.AppVersion,
            Description: r.Chart.Description,
            Repo:        strings.Split(r.Name, "/")[0],
        })
    }
    return out, nil
}
```

### Backend: `internal/helm/install.go`

```go
package helm

import (
    "fmt"
    "time"

    "helm.sh/helm/v3/pkg/action"
    "helm.sh/helm/v3/pkg/chart/loader"
    "helm.sh/helm/v3/pkg/getter"
    "helm.sh/helm/v3/pkg/repo"
    "sigs.k8s.io/yaml"
)

// InstallOptions configures a chart installation.
type InstallOptions struct {
    ReleaseName string                 `json:"releaseName"`
    Namespace   string                 `json:"namespace"`
    Chart       string                 `json:"chart"`       // "repo/name" or OCI ref
    Version     string                 `json:"version"`     // empty = latest
    Values      map[string]interface{} `json:"values"`
    CreateNS    bool                   `json:"createNamespace"`
    DryRun      bool                   `json:"dryRun"`
    Wait        bool                   `json:"wait"`
    Timeout     time.Duration          `json:"timeout"`     // 0 = 5m
}

// InstallChart installs a Helm chart from a repository.
func (c *Client) InstallChart(opts InstallOptions) (*ReleaseInfo, error) {
    cfg := new(action.Configuration)
    ns := opts.Namespace
    if ns == "" {
        ns = "default"
    }
    if err := cfg.Init(c.restGetter, ns, "secrets", func(string, ...interface{}) {}); err != nil {
        return nil, err
    }

    install := action.NewInstall(cfg)
    install.ReleaseName = opts.ReleaseName
    install.Namespace = ns
    install.Version = opts.Version
    install.CreateNamespace = opts.CreateNS
    install.DryRun = opts.DryRun
    install.Wait = opts.Wait
    install.Timeout = opts.Timeout
    if install.Timeout == 0 {
        install.Timeout = 5 * time.Minute
    }

    // Locate and load the chart
    chartPath, err := c.locateChart(opts.Chart, opts.Version)
    if err != nil {
        return nil, fmt.Errorf("locate chart: %w", err)
    }
    ch, err := loader.Load(chartPath)
    if err != nil {
        return nil, fmt.Errorf("load chart: %w", err)
    }

    rel, err := install.Run(ch, opts.Values)
    if err != nil {
        return nil, err
    }
    ri := releaseToInfo(rel)
    return &ri, nil
}

// locateChart resolves a chart reference to a local path using the repo index.
func (c *Client) locateChart(chartRef, version string) (string, error) {
    // OCI charts
    if strings.HasPrefix(chartRef, "oci://") {
        pull := action.NewPullWithOpts(action.WithConfig(new(action.Configuration)))
        pull.Settings = c.settings
        pull.Version = version
        pull.DestDir = os.TempDir()
        return pull.Run(chartRef)
    }

    cp, err := action.NewPull().LocateChart(chartRef, c.settings)
    if err != nil {
        return "", err
    }
    return cp, nil
}
```

### Backend: Helm Upgrade

```go
// UpgradeOptions configures a release upgrade.
type UpgradeOptions struct {
    ReleaseName string                 `json:"releaseName"`
    Namespace   string                 `json:"namespace"`
    Chart       string                 `json:"chart"`
    Version     string                 `json:"version"`
    Values      map[string]interface{} `json:"values"`
    ReuseValues bool                   `json:"reuseValues"` // merge with existing values
    DryRun      bool                   `json:"dryRun"`
    Wait        bool                   `json:"wait"`
    Timeout     time.Duration          `json:"timeout"`
}

// UpgradeRelease upgrades an existing Helm release.
func (c *Client) UpgradeRelease(opts UpgradeOptions) (*ReleaseInfo, error) {
    cfg := new(action.Configuration)
    if err := cfg.Init(c.restGetter, opts.Namespace, "secrets", func(string, ...interface{}) {}); err != nil {
        return nil, err
    }

    upgrade := action.NewUpgrade(cfg)
    upgrade.Namespace = opts.Namespace
    upgrade.Version = opts.Version
    upgrade.ReuseValues = opts.ReuseValues
    upgrade.DryRun = opts.DryRun
    upgrade.Wait = opts.Wait
    upgrade.Timeout = opts.Timeout
    if upgrade.Timeout == 0 {
        upgrade.Timeout = 5 * time.Minute
    }

    chartPath, err := c.locateChart(opts.Chart, opts.Version)
    if err != nil {
        return nil, err
    }
    ch, err := loader.Load(chartPath)
    if err != nil {
        return nil, err
    }
    rel, err := upgrade.Run(opts.ReleaseName, ch, opts.Values)
    if err != nil {
        return nil, err
    }
    ri := releaseToInfo(rel)
    return &ri, nil
}

// GetReleaseValues returns the user-supplied values for a release.
func (c *Client) GetReleaseValues(name, namespace string, allValues bool) (map[string]interface{}, error) {
    cfg := new(action.Configuration)
    if err := cfg.Init(c.restGetter, namespace, "secrets", func(string, ...interface{}) {}); err != nil {
        return nil, err
    }
    get := action.NewGetValues(cfg)
    get.AllValues = allValues
    return get.Run(name)
}
```

### Frontend: `components/helm/HelmInstallDialog.tsx`

```tsx
interface HelmInstallDialogProps {
  onClose: () => void;
}

export function HelmInstallDialog({ onClose }: HelmInstallDialogProps) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ChartSearchResult | null>(null);
  const [releaseName, setReleaseName] = useState("");
  const [namespace, setNamespace] = useState("default");
  const [valuesYAML, setValuesYAML] = useState("");
  const [step, setStep] = useState<"search" | "configure" | "preview">("search");

  const { data: results = [] } = useQuery({
    queryKey: ["helmSearch", search],
    queryFn: () => SearchCharts(search),
    enabled: search.length > 1,
    placeholderData: (prev) => prev,
  });

  async function handleInstall() {
    const values = valuesYAML ? parseYAML(valuesYAML) : {};
    await InstallChart({
      releaseName,
      namespace,
      chart: selected!.name,
      version: selected!.version,
      values,
      createNamespace: true,
      dryRun: false,
      wait: false,
    });
    onClose();
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-bg-secondary border-border w-[640px] h-[520px] flex flex-col">
        <DialogHeader>
          <DialogTitle>Install Helm Chart</DialogTitle>
        </DialogHeader>

        {step === "search" && (
          <div className="flex flex-col gap-3 flex-1 overflow-hidden">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search charts (e.g. nginx, postgresql, cert-manager)..."
              autoFocus
            />
            <div className="flex-1 overflow-auto divide-y divide-border">
              {results.map((r) => (
                <button
                  key={r.name}
                  className="w-full flex items-start gap-3 px-3 py-2 text-left hover:bg-bg-hover"
                  onClick={() => { setSelected(r); setReleaseName(r.name.split("/")[1]); setStep("configure"); }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary">{r.name}</p>
                    <p className="text-xs text-text-tertiary truncate">{r.description}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-text-secondary">{r.version}</p>
                    <p className="text-xs text-text-tertiary">app {r.appVersion}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "configure" && selected && (
          <div className="flex flex-col gap-3 flex-1 overflow-hidden">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-text-tertiary block mb-1">Release name</label>
                <input
                  value={releaseName}
                  onChange={(e) => setReleaseName(e.target.value)}
                  className="w-full text-sm bg-bg-tertiary border border-border rounded px-2 py-1.5 text-text-primary"
                />
              </div>
              <div>
                <label className="text-xs text-text-tertiary block mb-1">Namespace</label>
                <input
                  value={namespace}
                  onChange={(e) => setNamespace(e.target.value)}
                  className="w-full text-sm bg-bg-tertiary border border-border rounded px-2 py-1.5 text-text-primary"
                />
              </div>
            </div>
            <p className="text-xs text-text-tertiary">Values (YAML, optional)</p>
            <div className="flex-1 overflow-hidden">
              <YAMLEditor value={valuesYAML} onChange={setValuesYAML} />
            </div>
          </div>
        )}

        <DialogFooter>
          {step === "configure" && (
            <button onClick={() => setStep("search")} className="text-sm text-text-secondary px-4 py-2">
              Back
            </button>
          )}
          {step === "configure" && (
            <button
              onClick={handleInstall}
              disabled={!releaseName}
              className="text-sm bg-accent text-white px-4 py-2 rounded hover:bg-accent-hover disabled:opacity-50"
            >
              Install {selected?.name}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### Frontend: Helm Values Diff before Upgrade

```tsx
// components/helm/HelmUpgradeDialog.tsx
export function HelmUpgradeDialog({ release, onClose }: HelmUpgradeDialogProps) {
  const [newValues, setNewValues] = useState("");
  const [currentValues, setCurrentValues] = useState("");
  const [showDiff, setShowDiff] = useState(false);

  useEffect(() => {
    GetReleaseValues(release.name, release.namespace, false).then((v) => {
      const yaml = stringifyYAML(v ?? {});
      setCurrentValues(yaml);
      setNewValues(yaml);
    });
  }, [release]);

  async function handleUpgrade() {
    const values = parseYAML(newValues);
    await UpgradeRelease({
      releaseName: release.name,
      namespace: release.namespace,
      chart: `${release.chart}`,
      version: release.chartVersion,
      values,
      reuseValues: false,
      wait: false,
    });
    onClose();
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="w-[760px] h-[560px] flex flex-col bg-bg-secondary border-border">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Upgrade {release.name}</DialogTitle>
            <button
              onClick={() => setShowDiff((d) => !d)}
              className={`text-xs px-2 py-0.5 rounded border ${showDiff ? "border-accent text-accent" : "border-border text-text-secondary"}`}
            >
              Diff
            </button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {showDiff ? (
            <DiffEditor
              original={currentValues}
              modified={newValues}
              language="yaml"
              options={{ minimap: { enabled: false }, fontSize: 12 }}
            />
          ) : (
            <YAMLEditor value={newValues} onChange={setNewValues} />
          )}
        </div>

        <DialogFooter>
          <button onClick={onClose} className="text-sm text-text-secondary px-4 py-2">Cancel</button>
          <button
            onClick={handleUpgrade}
            className="text-sm bg-accent text-white px-4 py-2 rounded"
          >
            Upgrade
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

---

## 7.9 — YAML Editor: Schema Validation and Autocomplete

### Backend: `handlers/resource_handler.go` — GetResourceSchema

```go
// GetResourceSchema returns the OpenAPI schema for a given K8s resource kind.
// Used to power Monaco editor validation and autocomplete.
func (h *ResourceHandler) GetResourceSchema(group, version, kind string) (string, error) {
    client, err := h.clusterMgr.ActiveClient()
    if err != nil {
        return "", err
    }

    // Fetch the OpenAPI v3 spec for this GVK from the API server
    var schemaJSON []byte
    if group == "" {
        // Core API
        schemaJSON, err = client.Discovery.RESTClient().Get().
            AbsPath("/openapi/v3/api/" + version).
            DoRaw(h.ctx)
    } else {
        schemaJSON, err = client.Discovery.RESTClient().Get().
            AbsPath(fmt.Sprintf("/openapi/v3/apis/%s/%s", group, version)).
            DoRaw(h.ctx)
    }
    if err != nil {
        return "", err
    }
    return string(schemaJSON), nil
}
```

### Frontend: `lib/yamlSchema.ts`

```ts
// Configure Monaco yaml-language-server schemas for K8s resources
import * as monaco from "monaco-editor";
import { configureMonacoYaml } from "monaco-yaml";
import { GetResourceSchema } from "@/wailsjs/go/handlers/ResourceHandler";

const schemaCache = new Map<string, string>();

export async function applyK8sSchema(
  gvk: { group: string; version: string; kind: string }
) {
  const cacheKey = `${gvk.group}/${gvk.version}/${gvk.kind}`;

  let schema: string;
  if (schemaCache.has(cacheKey)) {
    schema = schemaCache.get(cacheKey)!;
  } else {
    schema = await GetResourceSchema(gvk.group, gvk.version, gvk.kind);
    schemaCache.set(cacheKey, schema);
  }

  configureMonacoYaml(monaco, {
    enableSchemaRequest: false,
    schemas: [
      {
        uri: `k8s://${cacheKey}`,
        fileMatch: ["**/*.yaml", "**/*.yml"],
        schema: JSON.parse(schema),
      },
    ],
    validate: true,
    hover: true,
    completion: true,
    format: true,
  });
}
```

### Frontend: Multi-Document YAML

```tsx
// components/editor/MultiDocYAMLEditor.tsx
// Handles YAML files with multiple --- separated documents

interface DocMeta {
  startLine: number;
  kind: string;
  apiVersion: string;
}

export function MultiDocYAMLEditor({ value, onApply }: { value: string; onApply?: (docs: string[]) => void }) {
  const docs = useMemo(() => splitYAMLDocs(value), [value]);
  const [activeDoc, setActiveDoc] = useState(0);
  const [editedDocs, setEditedDocs] = useState<string[]>(docs);

  function splitYAMLDocs(yaml: string): string[] {
    return yaml.split(/^---\s*$/m).filter((d) => d.trim());
  }

  function getDocMeta(doc: string): DocMeta {
    const kindMatch = doc.match(/^kind:\s*(\S+)/m);
    const apiMatch = doc.match(/^apiVersion:\s*(\S+)/m);
    return {
      startLine: 0,
      kind: kindMatch?.[1] ?? "Unknown",
      apiVersion: apiMatch?.[1] ?? "",
    };
  }

  return (
    <div className="flex flex-col h-full">
      {/* Document tabs */}
      {docs.length > 1 && (
        <div className="flex items-center gap-0.5 px-2 py-1 border-b border-border overflow-x-auto">
          {editedDocs.map((doc, i) => {
            const meta = getDocMeta(doc);
            return (
              <button
                key={i}
                onClick={() => setActiveDoc(i)}
                className={`text-xs px-2 py-0.5 rounded shrink-0 ${
                  i === activeDoc ? "bg-bg-tertiary text-text-primary" : "text-text-tertiary hover:text-text-secondary"
                }`}
              >
                {meta.kind} {i + 1}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        <YAMLEditor
          value={editedDocs[activeDoc] ?? ""}
          onChange={(v) => {
            const next = [...editedDocs];
            next[activeDoc] = v;
            setEditedDocs(next);
          }}
          onApply={() => onApply?.(editedDocs)}
        />
      </div>
    </div>
  );
}
```

### Backend: kubectl diff before apply

```go
// DiffResource returns a unified diff between the live resource and the provided YAML.
// Uses server-side dry-run to get the server-merged form, then diffs.
func (h *ResourceHandler) DiffResource(yaml string) (string, error) {
    client, err := h.clusterMgr.ActiveClient()
    if err != nil {
        return "", err
    }

    obj := &unstructured.Unstructured{}
    if err := k8syaml.Unmarshal([]byte(yaml), obj); err != nil {
        return "", fmt.Errorf("parse YAML: %w", err)
    }

    gvr, ns, err := h.gvrForObject(obj)
    if err != nil {
        return "", err
    }

    // Get current live state
    liveObj, err := client.Dynamic.Resource(gvr).Namespace(ns).Get(
        h.ctx, obj.GetName(), metav1.GetOptions{})
    if err != nil {
        // New resource — diff against empty
        return fmt.Sprintf("+ (new resource) %s/%s\n", obj.GetKind(), obj.GetName()), nil
    }

    liveYAML, err := k8syaml.Marshal(liveObj.Object)
    if err != nil {
        return "", err
    }

    // Server-side dry run to get merged form
    dryRunObj, err := client.Dynamic.Resource(gvr).Namespace(ns).Apply(
        h.ctx, obj.GetName(), obj,
        metav1.ApplyOptions{DryRun: []string{"All"}, FieldManager: "kubeviewer"},
    )
    if err != nil {
        return "", fmt.Errorf("dry-run apply: %w", err)
    }
    dryRunYAML, err := k8syaml.Marshal(dryRunObj.Object)
    if err != nil {
        return "", err
    }

    return computeUnifiedDiff(string(liveYAML), string(dryRunYAML), "live", "pending"), nil
}
```

---

## 7.10 — Complete Deployment Management

### Backend: `handlers/workload_handler.go`

```go
// PauseRollout pauses a deployment's rollout.
func (h *WorkloadHandler) PauseRollout(namespace, name string) error {
    client, err := h.clusterMgr.ActiveClient()
    if err != nil {
        return err
    }
    patch := []byte(`{"spec":{"paused":true}}`)
    _, err = client.Typed.AppsV1().Deployments(namespace).Patch(
        h.ctx, name, types.MergePatchType, patch, metav1.PatchOptions{})
    return err
}

// ResumeRollout resumes a paused deployment.
func (h *WorkloadHandler) ResumeRollout(namespace, name string) error {
    client, err := h.clusterMgr.ActiveClient()
    if err != nil {
        return err
    }
    patch := []byte(`{"spec":{"paused":false}}`)
    _, err = client.Typed.AppsV1().Deployments(namespace).Patch(
        h.ctx, name, types.MergePatchType, patch, metav1.PatchOptions{})
    return err
}

// RolloutStatus returns the current rollout status (similar to kubectl rollout status).
func (h *WorkloadHandler) RolloutStatus(namespace, name string) (*RolloutStatusResult, error) {
    client, err := h.clusterMgr.ActiveClient()
    if err != nil {
        return nil, err
    }
    d, err := client.Typed.AppsV1().Deployments(namespace).Get(h.ctx, name, metav1.GetOptions{})
    if err != nil {
        return nil, err
    }
    status := &RolloutStatusResult{
        Replicas:            d.Status.Replicas,
        UpdatedReplicas:     d.Status.UpdatedReplicas,
        ReadyReplicas:       d.Status.ReadyReplicas,
        AvailableReplicas:   d.Status.AvailableReplicas,
        UnavailableReplicas: d.Status.UnavailableReplicas,
        Paused:              d.Spec.Paused,
    }
    for _, c := range d.Status.Conditions {
        if c.Type == appsv1.DeploymentProgressing {
            status.Message = c.Message
        }
        if c.Type == appsv1.DeploymentAvailable && c.Status == corev1.ConditionTrue {
            status.Available = true
        }
    }
    return status, nil
}

// RolloutHistory returns the revision history for a deployment using ReplicaSets.
func (h *WorkloadHandler) RolloutHistory(namespace, name string) ([]RolloutRevision, error) {
    client, err := h.clusterMgr.ActiveClient()
    if err != nil {
        return nil, err
    }

    d, err := client.Typed.AppsV1().Deployments(namespace).Get(h.ctx, name, metav1.GetOptions{})
    if err != nil {
        return nil, err
    }

    selector, err := metav1.LabelSelectorAsSelector(d.Spec.Selector)
    if err != nil {
        return nil, err
    }

    rsList, err := client.Typed.AppsV1().ReplicaSets(namespace).List(h.ctx,
        metav1.ListOptions{LabelSelector: selector.String()})
    if err != nil {
        return nil, err
    }

    var revisions []RolloutRevision
    for _, rs := range rsList.Items {
        revStr, ok := rs.Annotations["deployment.kubernetes.io/revision"]
        if !ok {
            continue
        }
        rev, _ := strconv.Atoi(revStr)
        changeStr := rs.Annotations["kubernetes.io/change-cause"]
        revisions = append(revisions, RolloutRevision{
            Revision:    rev,
            ChangeCause: changeStr,
            CreatedAt:   rs.CreationTimestamp.Format(time.RFC3339),
            Image:       rs.Spec.Template.Spec.Containers[0].Image,
        })
    }

    sort.Slice(revisions, func(i, j int) bool {
        return revisions[i].Revision > revisions[j].Revision
    })
    return revisions, nil
}

// RolloutUndo rolls back a deployment to the previous or a specific revision.
func (h *WorkloadHandler) RolloutUndo(namespace, name string, toRevision int64) error {
    client, err := h.clusterMgr.ActiveClient()
    if err != nil {
        return err
    }
    // Kubernetes deprecated rollback endpoint; use annotation-based undo via ReplicaSet
    revAnnotation := fmt.Sprintf(`{"spec":{"template":{"metadata":{"annotations":{"deployment.kubernetes.io/desired-replicas":"%d"}}}}}`, toRevision)
    _, err = client.Typed.AppsV1().Deployments(namespace).Patch(
        h.ctx, name, types.StrategicMergePatchType, []byte(revAnnotation), metav1.PatchOptions{})
    return err
}
```

### Frontend: `components/workloads/RolloutHistoryPanel.tsx`

```tsx
export function RolloutHistoryPanel({ namespace, name }: { namespace: string; name: string }) {
  const { data: history = [] } = useQuery({
    queryKey: ["rolloutHistory", namespace, name],
    queryFn: () => RolloutHistory(namespace, name),
    refetchInterval: 30_000,
  });

  const [diffRevisions, setDiffRevisions] = useState<[number, number] | null>(null);

  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-text-tertiary border-b border-border">
            <th className="px-3 py-2 text-left">Revision</th>
            <th className="px-3 py-2 text-left">Image</th>
            <th className="px-3 py-2 text-left">Change cause</th>
            <th className="px-3 py-2 text-left">Created</th>
            <th className="px-3 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {history.map((rev, i) => (
            <tr key={rev.revision} className="hover:bg-bg-hover">
              <td className="px-3 py-2 font-mono font-bold text-accent">{rev.revision}</td>
              <td className="px-3 py-2 text-text-primary truncate max-w-[240px]">{rev.image}</td>
              <td className="px-3 py-2 text-text-secondary truncate max-w-[200px]">
                {rev.changeCause || "—"}
              </td>
              <td className="px-3 py-2 text-text-tertiary tabular-nums">
                {formatRelativeTime(rev.createdAt)}
              </td>
              <td className="px-3 py-2 text-right">
                <div className="flex justify-end gap-2">
                  {i > 0 && (
                    <button
                      onClick={() => setDiffRevisions([history[i].revision, history[i - 1].revision])}
                      className="text-text-tertiary hover:text-text-primary"
                    >
                      Diff
                    </button>
                  )}
                  {i > 0 && (
                    <button
                      onClick={() => RolloutUndo(namespace, name, rev.revision)}
                      className="text-accent hover:text-accent-hover"
                    >
                      Rollback
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

---

## 7.11 — Complete Node Management

### Backend: Cordon / Uncordon / Drain

```go
// CordonNode marks a node as unschedulable.
func (h *WorkloadHandler) CordonNode(name string) error {
    return h.patchNodeUnschedulable(name, true)
}

// UncordonNode marks a node as schedulable.
func (h *WorkloadHandler) UncordonNode(name string) error {
    return h.patchNodeUnschedulable(name, false)
}

func (h *WorkloadHandler) patchNodeUnschedulable(name string, unschedulable bool) error {
    client, err := h.clusterMgr.ActiveClient()
    if err != nil {
        return err
    }
    patch := fmt.Sprintf(`{"spec":{"unschedulable":%v}}`, unschedulable)
    _, err = client.Typed.CoreV1().Nodes().Patch(
        h.ctx, name, types.MergePatchType, []byte(patch), metav1.PatchOptions{})
    return err
}

// DrainOptions configures node drain behaviour.
type DrainOptions struct {
    NodeName           string        `json:"nodeName"`
    Force              bool          `json:"force"`              // delete non-controller pods
    IgnoreDaemonSets   bool          `json:"ignoreDaemonSets"`
    DeleteEmptyDirData bool          `json:"deleteEmptyDirData"`
    GracePeriod        int           `json:"gracePeriod"`        // seconds, -1 = pod default
    Timeout            time.Duration `json:"timeout"`
}

// DrainNode cordons the node and evicts all evictable pods.
func (h *WorkloadHandler) DrainNode(opts DrainOptions) error {
    client, err := h.clusterMgr.ActiveClient()
    if err != nil {
        return err
    }

    // Step 1: Cordon
    if err := h.CordonNode(opts.NodeName); err != nil {
        return fmt.Errorf("cordon: %w", err)
    }

    // Step 2: List pods on the node
    pods, err := client.Typed.CoreV1().Pods("").List(h.ctx, metav1.ListOptions{
        FieldSelector: fmt.Sprintf("spec.nodeName=%s", opts.NodeName),
    })
    if err != nil {
        return err
    }

    gracePeriod := int64(opts.GracePeriod)

    for _, pod := range pods.Items {
        // Skip DaemonSet pods unless forced
        if isDaemonSetPod(&pod) && opts.IgnoreDaemonSets {
            continue
        }
        // Skip mirror pods
        if _, ok := pod.Annotations["kubernetes.io/config.mirror"]; ok {
            continue
        }
        // Check emptyDir
        if hasEmptyDirVolume(&pod) && !opts.DeleteEmptyDirData && !opts.Force {
            return fmt.Errorf("pod %s/%s has emptyDir data; pass deleteEmptyDirData=true to proceed",
                pod.Namespace, pod.Name)
        }

        eviction := &policyv1.Eviction{
            ObjectMeta: metav1.ObjectMeta{
                Name:      pod.Name,
                Namespace: pod.Namespace,
            },
            DeleteOptions: &metav1.DeleteOptions{
                GracePeriodSeconds: &gracePeriod,
            },
        }

        if err := client.Typed.PolicyV1().Evictions(pod.Namespace).Evict(h.ctx, eviction); err != nil {
            if apierrors.IsNotFound(err) {
                continue // already gone
            }
            if !opts.Force {
                return fmt.Errorf("evict pod %s/%s: %w", pod.Namespace, pod.Name, err)
            }
            // Force delete
            _ = client.Typed.CoreV1().Pods(pod.Namespace).Delete(
                h.ctx, pod.Name, metav1.DeleteOptions{GracePeriodSeconds: &gracePeriod})
        }
    }
    return nil
}

// AddNodeTaint adds a taint to a node.
func (h *WorkloadHandler) AddNodeTaint(nodeName, key, value, effect string) error {
    client, err := h.clusterMgr.ActiveClient()
    if err != nil {
        return err
    }
    node, err := client.Typed.CoreV1().Nodes().Get(h.ctx, nodeName, metav1.GetOptions{})
    if err != nil {
        return err
    }
    node.Spec.Taints = append(node.Spec.Taints, corev1.Taint{
        Key:    key,
        Value:  value,
        Effect: corev1.TaintEffect(effect),
    })
    _, err = client.Typed.CoreV1().Nodes().Update(h.ctx, node, metav1.UpdateOptions{})
    return err
}

// RemoveNodeTaint removes a taint from a node by key.
func (h *WorkloadHandler) RemoveNodeTaint(nodeName, key string) error {
    client, err := h.clusterMgr.ActiveClient()
    if err != nil {
        return err
    }
    node, err := client.Typed.CoreV1().Nodes().Get(h.ctx, nodeName, metav1.GetOptions{})
    if err != nil {
        return err
    }
    taints := node.Spec.Taints[:0]
    for _, t := range node.Spec.Taints {
        if t.Key != key {
            taints = append(taints, t)
        }
    }
    node.Spec.Taints = taints
    _, err = client.Typed.CoreV1().Nodes().Update(h.ctx, node, metav1.UpdateOptions{})
    return err
}
```

### Frontend: `components/nodes/DrainDialog.tsx`

```tsx
interface DrainDialogProps {
  node: NodeInfo;
  onClose: () => void;
}

export function DrainDialog({ node, onClose }: DrainDialogProps) {
  const [opts, setOpts] = useState({
    force: false,
    ignoreDaemonSets: true,
    deleteEmptyDirData: false,
    gracePeriod: -1,
  });
  const [draining, setDraining] = useState(false);
  const [error, setError] = useState("");

  async function handleDrain() {
    setDraining(true);
    setError("");
    try {
      await DrainNode({ nodeName: node.name, ...opts });
      onClose();
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setDraining(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-bg-secondary border-border w-[480px]">
        <DialogHeader>
          <DialogTitle>Drain Node</DialogTitle>
          <DialogDescription>
            Drain <strong>{node.name}</strong>. This will cordon the node and evict all running pods.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={opts.ignoreDaemonSets}
              onChange={(e) => setOpts((o) => ({ ...o, ignoreDaemonSets: e.target.checked }))}
            />
            <span className="text-text-primary">Ignore DaemonSet pods</span>
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={opts.deleteEmptyDirData}
              onChange={(e) => setOpts((o) => ({ ...o, deleteEmptyDirData: e.target.checked }))}
            />
            <span className="text-text-primary">Delete emptyDir data</span>
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={opts.force}
              onChange={(e) => setOpts((o) => ({ ...o, force: e.target.checked }))}
            />
            <span className="text-text-primary">Force delete (bypass eviction)</span>
          </label>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-text-secondary">Grace period (s):</span>
            <input
              type="number"
              value={opts.gracePeriod}
              onChange={(e) => setOpts((o) => ({ ...o, gracePeriod: parseInt(e.target.value) || -1 }))}
              className="w-20 bg-bg-tertiary border border-border rounded px-2 py-1 text-text-primary text-sm"
            />
            <span className="text-text-tertiary text-xs">(-1 = pod default)</span>
          </div>
        </div>

        {error && (
          <p className="text-sm text-status-error bg-status-error/10 rounded px-3 py-2">{error}</p>
        )}

        <DialogFooter>
          <button onClick={onClose} disabled={draining} className="text-sm text-text-secondary px-4 py-2">
            Cancel
          </button>
          <button
            onClick={handleDrain}
            disabled={draining}
            className="text-sm bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600 disabled:opacity-50"
          >
            {draining ? "Draining..." : "Drain Node"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

---

## 7.12 — Job, Secret, ConfigMap, and Namespace Management

### Backend: Create Job from CronJob

```go
// CreateJobFromCronJob creates a manual Job from a CronJob spec.
func (h *WorkloadHandler) CreateJobFromCronJob(namespace, cronJobName, jobName string) error {
    client, err := h.clusterMgr.ActiveClient()
    if err != nil {
        return err
    }
    cj, err := client.Typed.BatchV1().CronJobs(namespace).Get(h.ctx, cronJobName, metav1.GetOptions{})
    if err != nil {
        return err
    }

    if jobName == "" {
        jobName = fmt.Sprintf("%s-manual-%d", cronJobName, time.Now().Unix())
    }

    job := &batchv1.Job{
        ObjectMeta: metav1.ObjectMeta{
            Name:      jobName,
            Namespace: namespace,
            Annotations: map[string]string{
                "cronjob.kubernetes.io/instantiate": "manual",
            },
        },
        Spec: *cj.Spec.JobTemplate.Spec.DeepCopy(),
    }
    job.Spec.Selector = nil
    job.Spec.Template.Labels = nil

    _, err = client.Typed.BatchV1().Jobs(namespace).Create(h.ctx, job, metav1.CreateOptions{})
    return err
}
```

### Backend: Secret Management

```go
// GetSecretDecoded returns a secret with its data base64-decoded.
func (h *ResourceHandler) GetSecretDecoded(namespace, name string) (map[string]string, error) {
    client, err := h.clusterMgr.ActiveClient()
    if err != nil {
        return nil, err
    }
    secret, err := client.Typed.CoreV1().Secrets(namespace).Get(h.ctx, name, metav1.GetOptions{})
    if err != nil {
        return nil, err
    }
    result := make(map[string]string, len(secret.Data))
    for k, v := range secret.Data {
        result[k] = string(v) // already decoded by the typed client
    }
    return result, nil
}

// CreateDockerRegistrySecret creates a kubernetes.io/dockerconfigjson secret.
func (h *ResourceHandler) CreateDockerRegistrySecret(
    namespace, name, server, username, password, email string,
) error {
    client, err := h.clusterMgr.ActiveClient()
    if err != nil {
        return err
    }
    dockercfg := fmt.Sprintf(
        `{"auths":{%q:{"username":%q,"password":%q,"email":%q,"auth":%q}}}`,
        server, username, password, email,
        base64.StdEncoding.EncodeToString([]byte(username+":"+password)),
    )
    secret := &corev1.Secret{
        ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: namespace},
        Type:       corev1.SecretTypeDockerConfigJson,
        Data: map[string][]byte{
            ".dockerconfigjson": []byte(dockercfg),
        },
    }
    _, err = client.Typed.CoreV1().Secrets(namespace).Create(h.ctx, secret, metav1.CreateOptions{})
    return err
}

// CreateTLSSecret creates a kubernetes.io/tls secret from PEM cert and key.
func (h *ResourceHandler) CreateTLSSecret(
    namespace, name, certPEM, keyPEM string,
) error {
    client, err := h.clusterMgr.ActiveClient()
    if err != nil {
        return err
    }
    secret := &corev1.Secret{
        ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: namespace},
        Type:       corev1.SecretTypeTLS,
        Data: map[string][]byte{
            "tls.crt": []byte(certPEM),
            "tls.key": []byte(keyPEM),
        },
    }
    _, err = client.Typed.CoreV1().Secrets(namespace).Create(h.ctx, secret, metav1.CreateOptions{})
    return err
}
```

### Frontend: `components/secrets/SecretViewer.tsx`

```tsx
interface SecretViewerProps {
  namespace: string;
  name: string;
  secretType: string;
}

export function SecretViewer({ namespace, name, secretType }: SecretViewerProps) {
  const [visible, setVisible] = useState<Set<string>>(new Set());
  const { data: decoded = {} } = useQuery({
    queryKey: ["secret", namespace, name],
    queryFn: () => GetSecretDecoded(namespace, name),
  });

  function toggleVisibility(key: string) {
    setVisible((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs bg-bg-tertiary border border-border rounded px-2 py-0.5 text-text-secondary">
          {secretType}
        </span>
      </div>
      {Object.entries(decoded).map(([key, value]) => (
        <div key={key} className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-accent">{key}</span>
            <button
              onClick={() => toggleVisibility(key)}
              className="text-xs text-text-tertiary hover:text-text-secondary"
            >
              {visible.has(key) ? "Hide" : "Show"}
            </button>
          </div>
          <div className="font-mono text-xs bg-bg-tertiary rounded px-2 py-1.5 text-text-primary overflow-x-auto">
            {visible.has(key) ? value : "•".repeat(Math.min(value.length, 24))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

### Backend: Namespace Management

```go
// CreateNamespace creates a new namespace.
func (h *ResourceHandler) CreateNamespace(name string, labels map[string]string) error {
    client, err := h.clusterMgr.ActiveClient()
    if err != nil {
        return err
    }
    ns := &corev1.Namespace{
        ObjectMeta: metav1.ObjectMeta{Name: name, Labels: labels},
    }
    _, err = client.Typed.CoreV1().Namespaces().Create(h.ctx, ns, metav1.CreateOptions{})
    return err
}

// GetNamespaceResourceQuota returns all resource quotas in a namespace.
func (h *ResourceHandler) GetNamespaceResourceQuota(namespace string) ([]ResourceQuotaInfo, error) {
    client, err := h.clusterMgr.ActiveClient()
    if err != nil {
        return nil, err
    }
    list, err := client.Typed.CoreV1().ResourceQuotas(namespace).List(h.ctx, metav1.ListOptions{})
    if err != nil {
        return nil, err
    }
    result := make([]ResourceQuotaInfo, 0, len(list.Items))
    for _, q := range list.Items {
        info := ResourceQuotaInfo{Name: q.Name, Namespace: q.Namespace, Hard: {}, Used: {}}
        for resource, quantity := range q.Status.Hard {
            info.Hard[string(resource)] = quantity.String()
        }
        for resource, quantity := range q.Status.Used {
            info.Used[string(resource)] = quantity.String()
        }
        result = append(result, info)
    }
    return result, nil
}
```

### Frontend: `components/namespace/ResourceQuotaViewer.tsx`

```tsx
export function ResourceQuotaViewer({ namespace }: { namespace: string }) {
  const { data: quotas = [] } = useQuery({
    queryKey: ["resourceQuota", namespace],
    queryFn: () => GetNamespaceResourceQuota(namespace),
    refetchInterval: 30_000,
  });

  if (quotas.length === 0) {
    return <p className="text-xs text-text-tertiary p-3">No resource quotas defined.</p>;
  }

  return (
    <div className="p-3 space-y-4">
      {quotas.map((quota) => (
        <div key={quota.name}>
          <h4 className="text-xs font-semibold text-text-primary mb-2">{quota.name}</h4>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-text-tertiary border-b border-border">
                <th className="text-left py-1 pr-4">Resource</th>
                <th className="text-right py-1 pr-4">Used</th>
                <th className="text-right py-1">Hard</th>
                <th className="w-32 text-right py-1 pl-4">Usage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {Object.entries(quota.hard).map(([resource, hard]) => {
                const used = quota.used[resource] ?? "0";
                const usedNum = parseQuantity(used);
                const hardNum = parseQuantity(hard);
                const pct = hardNum > 0 ? Math.min((usedNum / hardNum) * 100, 100) : 0;
                return (
                  <tr key={resource} className="hover:bg-bg-hover">
                    <td className="py-1 pr-4 font-mono text-text-secondary">{resource}</td>
                    <td className="py-1 pr-4 text-right text-text-primary tabular-nums">{used}</td>
                    <td className="py-1 text-right text-text-tertiary tabular-nums">{hard}</td>
                    <td className="py-1 pl-4">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded bg-bg-tertiary overflow-hidden">
                          <div
                            className={`h-full rounded ${pct > 90 ? "bg-red-500" : pct > 70 ? "bg-yellow-400" : "bg-green-400"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-text-tertiary tabular-nums w-8 text-right">{Math.round(pct)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
```

---

## 7.13 — CRD Management

### Backend: `handlers/crd_handler.go`

```go
package handlers

import (
    "context"
    "fmt"
    "sort"

    apiextensionsv1 "k8s.io/apiextensions-apiserver/pkg/apis/apiextensions/v1"
    apiextclient "k8s.io/apiextensions-apiserver/pkg/client/clientset/clientset"
    metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
    "k8s.io/apimachinery/pkg/runtime/schema"
)

// CRDInfo is a lightweight CRD summary for listing.
type CRDInfo struct {
    Name       string `json:"name"`        // e.g. widgets.example.com
    Group      string `json:"group"`       // e.g. example.com
    Kind       string `json:"kind"`        // e.g. Widget
    Plural     string `json:"plural"`      // e.g. widgets
    Scope      string `json:"scope"`       // Namespaced | Cluster
    Versions   []string `json:"versions"`
    Established bool   `json:"established"` // status condition
    Age        string `json:"age"`
}

// CRDDetail extends CRDInfo with the full schema.
type CRDDetail struct {
    CRDInfo
    SchemaJSON string `json:"schemaJson"` // OpenAPI schema as JSON string
}

// CRDHandler handles CRD-related operations.
type CRDHandler struct {
    ctx        context.Context
    clusterMgr *cluster.Manager
    apiextCl   func() (apiextclient.Interface, error)
}

// ListCRDs returns all custom resource definitions.
func (h *CRDHandler) ListCRDs() ([]CRDInfo, error) {
    cl, err := h.apiextCl()
    if err != nil {
        return nil, err
    }
    list, err := cl.ApiextensionsV1().CustomResourceDefinitions().List(h.ctx, metav1.ListOptions{})
    if err != nil {
        return nil, err
    }

    result := make([]CRDInfo, 0, len(list.Items))
    for _, crd := range list.Items {
        versions := make([]string, 0, len(crd.Spec.Versions))
        for _, v := range crd.Spec.Versions {
            versions = append(versions, v.Name)
        }
        established := false
        for _, c := range crd.Status.Conditions {
            if c.Type == apiextensionsv1.Established && c.Status == apiextensionsv1.ConditionTrue {
                established = true
            }
        }
        result = append(result, CRDInfo{
            Name:        crd.Name,
            Group:       crd.Spec.Group,
            Kind:        crd.Spec.Names.Kind,
            Plural:      crd.Spec.Names.Plural,
            Scope:       string(crd.Spec.Scope),
            Versions:    versions,
            Established: established,
            Age:         crd.CreationTimestamp.Format(time.RFC3339),
        })
    }
    sort.Slice(result, func(i, j int) bool {
        return result[i].Name < result[j].Name
    })
    return result, nil
}

// GetCRDDetail returns a CRD with its full OpenAPI schema.
func (h *CRDHandler) GetCRDDetail(name string) (*CRDDetail, error) {
    cl, err := h.apiextCl()
    if err != nil {
        return nil, err
    }
    crd, err := cl.ApiextensionsV1().CustomResourceDefinitions().Get(h.ctx, name, metav1.GetOptions{})
    if err != nil {
        return nil, err
    }

    // Marshal the schema of the storage version
    var schemaJSON string
    for _, v := range crd.Spec.Versions {
        if v.Storage && v.Schema != nil && v.Schema.OpenAPIV3Schema != nil {
            data, _ := json.Marshal(v.Schema.OpenAPIV3Schema)
            schemaJSON = string(data)
            break
        }
    }

    versions := make([]string, 0, len(crd.Spec.Versions))
    for _, v := range crd.Spec.Versions {
        versions = append(versions, v.Name)
    }

    return &CRDDetail{
        CRDInfo: CRDInfo{
            Name:    crd.Name,
            Group:   crd.Spec.Group,
            Kind:    crd.Spec.Names.Kind,
            Plural:  crd.Spec.Names.Plural,
            Scope:   string(crd.Spec.Scope),
            Versions: versions,
        },
        SchemaJSON: schemaJSON,
    }, nil
}

// ListCustomResources lists instances of a CRD.
func (h *CRDHandler) ListCustomResources(
    group, version, plural, namespace string,
) ([]map[string]interface{}, error) {
    client, err := h.clusterMgr.ActiveClient()
    if err != nil {
        return nil, err
    }
    gvr := schema.GroupVersionResource{Group: group, Version: version, Resource: plural}
    var list *unstructured.UnstructuredList
    if namespace == "" {
        list, err = client.Dynamic.Resource(gvr).List(h.ctx, metav1.ListOptions{})
    } else {
        list, err = client.Dynamic.Resource(gvr).Namespace(namespace).List(
            h.ctx, metav1.ListOptions{})
    }
    if err != nil {
        return nil, err
    }
    result := make([]map[string]interface{}, len(list.Items))
    for i, item := range list.Items {
        result[i] = item.Object
    }
    return result, nil
}
```

### Frontend: `pages/CRDsPage.tsx`

```tsx
export function CRDsPage() {
  const [selected, setSelected] = useState<CRDInfo | null>(null);
  const [search, setSearch] = useState("");

  const { data: crds = [] } = useQuery({
    queryKey: ["crds"],
    queryFn: () => ListCRDs(),
    refetchInterval: 60_000,
  });

  const filtered = crds.filter(
    (c) =>
      search === "" ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.kind.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-full">
      {/* CRD list */}
      <div className="w-80 flex flex-col border-r border-border">
        <div className="px-3 py-2 border-b border-border">
          <SearchInput value={search} onChange={setSearch} placeholder="Search CRDs..." />
        </div>
        <div className="flex-1 overflow-auto">
          {filtered.map((crd) => (
            <button
              key={crd.name}
              onClick={() => setSelected(crd)}
              className={`w-full flex flex-col gap-0.5 px-3 py-2 text-left hover:bg-bg-hover border-b border-border/50 ${
                selected?.name === crd.name ? "bg-bg-tertiary" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${crd.established ? "bg-green-400" : "bg-yellow-400"}`}
                />
                <span className="text-sm font-medium text-text-primary">{crd.kind}</span>
                <span className="text-xs text-text-tertiary ml-auto">{crd.scope.slice(0, 1)}</span>
              </div>
              <span className="text-xs text-text-tertiary truncate pl-3.5">{crd.group}</span>
            </button>
          ))}
        </div>
      </div>

      {/* CRD detail */}
      {selected ? (
        <CRDDetailPanel crd={selected} />
      ) : (
        <div className="flex-1 flex items-center justify-center text-text-tertiary text-sm">
          Select a CRD to view details and instances.
        </div>
      )}
    </div>
  );
}
```

### Frontend: `components/crds/CRDDetailPanel.tsx`

```tsx
export function CRDDetailPanel({ crd }: { crd: CRDInfo }) {
  const [activeTab, setActiveTab] = useState<"instances" | "schema">("instances");
  const [version, setVersion] = useState(crd.versions[0]);

  const { data: instances = [] } = useQuery({
    queryKey: ["crInstances", crd.group, version, crd.plural],
    queryFn: () => ListCustomResources(crd.group, version, crd.plural, ""),
    enabled: activeTab === "instances",
    refetchInterval: 30_000,
  });

  const { data: detail } = useQuery({
    queryKey: ["crdDetail", crd.name],
    queryFn: () => GetCRDDetail(crd.name),
    enabled: activeTab === "schema",
  });

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <div>
          <h2 className="text-base font-semibold text-text-primary">{crd.kind}</h2>
          <p className="text-xs text-text-tertiary">{crd.name}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {crd.versions.length > 1 && (
            <select
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              className="text-xs bg-bg-tertiary border border-border rounded px-2 py-1"
            >
              {crd.versions.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-border">
        {(["instances", "schema"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-xs capitalize border-b-2 transition-colors ${
              activeTab === tab
                ? "border-accent text-text-primary"
                : "border-transparent text-text-tertiary hover:text-text-secondary"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === "instances" && (
          <GenericResourceTable items={instances} />
        )}
        {activeTab === "schema" && detail && (
          <YAMLEditor
            value={JSON.stringify(JSON.parse(detail.schemaJson), null, 2)}
            readOnly
          />
        )}
      </div>
    </div>
  );
}
```

---

## 7.14 — PDB Management and Network Policy Visualization

### Backend: PDB Management

```go
// ListPDBs returns all PodDisruptionBudgets in a namespace.
func (h *ResourceHandler) ListPDBs(namespace string) ([]PDBInfo, error) {
    client, err := h.clusterMgr.ActiveClient()
    if err != nil {
        return nil, err
    }
    list, err := client.Typed.PolicyV1().PodDisruptionBudgets(namespace).List(
        h.ctx, metav1.ListOptions{})
    if err != nil {
        return nil, err
    }
    result := make([]PDBInfo, 0, len(list.Items))
    for _, pdb := range list.Items {
        info := PDBInfo{
            Name:             pdb.Name,
            Namespace:        pdb.Namespace,
            CurrentHealthy:   pdb.Status.CurrentHealthy,
            DesiredHealthy:   pdb.Status.DesiredHealthy,
            ExpectedPods:     pdb.Status.ExpectedPods,
            DisruptionsAllowed: pdb.Status.DisruptionsAllowed,
            Age:              pdb.CreationTimestamp.Format(time.RFC3339),
        }
        if pdb.Spec.MinAvailable != nil {
            info.MinAvailable = pdb.Spec.MinAvailable.String()
        }
        if pdb.Spec.MaxUnavailable != nil {
            info.MaxUnavailable = pdb.Spec.MaxUnavailable.String()
        }
        result = append(result, info)
    }
    return result, nil
}
```

### Backend: Network Policy Visualization Data

```go
// NetworkPolicyEdge represents an ingress or egress rule for visualization.
type NetworkPolicyEdge struct {
    FromPodSelector string   `json:"fromPodSelector"` // label selector string
    ToPodSelector   string   `json:"toPodSelector"`
    Ports           []string `json:"ports"`
    Direction       string   `json:"direction"` // "ingress" | "egress"
}

// GetNetworkPolicySummary returns visualization data for all network policies in a namespace.
func (h *ResourceHandler) GetNetworkPolicySummary(namespace string) ([]NetworkPolicyViz, error) {
    client, err := h.clusterMgr.ActiveClient()
    if err != nil {
        return nil, err
    }
    list, err := client.Typed.NetworkingV1().NetworkPolicies(namespace).List(
        h.ctx, metav1.ListOptions{})
    if err != nil {
        return nil, err
    }

    result := make([]NetworkPolicyViz, 0, len(list.Items))
    for _, np := range list.Items {
        viz := NetworkPolicyViz{
            Name:     np.Name,
            Selector: np.Spec.PodSelector.String(),
            Edges:    []NetworkPolicyEdge{},
        }

        for _, ingress := range np.Spec.Ingress {
            ports := make([]string, 0)
            for _, p := range ingress.Ports {
                if p.Port != nil {
                    ports = append(ports, p.Port.String())
                }
            }
            for _, from := range ingress.From {
                edge := NetworkPolicyEdge{Direction: "ingress", Ports: ports}
                if from.PodSelector != nil {
                    edge.FromPodSelector = from.PodSelector.String()
                }
                viz.Edges = append(viz.Edges, edge)
            }
            if len(ingress.From) == 0 {
                viz.Edges = append(viz.Edges, NetworkPolicyEdge{
                    Direction:       "ingress",
                    FromPodSelector: "*",
                    Ports:           ports,
                })
            }
        }

        for _, egress := range np.Spec.Egress {
            ports := make([]string, 0)
            for _, p := range egress.Ports {
                if p.Port != nil {
                    ports = append(ports, p.Port.String())
                }
            }
            for _, to := range egress.To {
                edge := NetworkPolicyEdge{Direction: "egress", Ports: ports}
                if to.PodSelector != nil {
                    edge.ToPodSelector = to.PodSelector.String()
                }
                viz.Edges = append(viz.Edges, edge)
            }
        }

        result = append(result, viz)
    }
    return result, nil
}
```

### Frontend: `components/network/NetworkPolicyVisualization.tsx`

```tsx
// Simple text-based visualization for network policies
// Full graph visualization can be added in Phase 9 using a library like react-flow

export function NetworkPolicyVisualization({ namespace }: { namespace: string }) {
  const { data: policies = [] } = useQuery({
    queryKey: ["netpol", namespace],
    queryFn: () => GetNetworkPolicySummary(namespace),
    refetchInterval: 60_000,
  });

  if (policies.length === 0) {
    return (
      <div className="p-4 text-center text-text-tertiary text-sm">
        No NetworkPolicies found in <strong>{namespace}</strong>.
      </div>
    );
  }

  return (
    <div className="p-3 space-y-4">
      {policies.map((policy) => (
        <div key={policy.name} className="rounded-lg border border-border bg-bg-tertiary p-3">
          <div className="flex items-center gap-2 mb-2">
            <ShieldIcon className="w-4 h-4 text-accent" />
            <h4 className="text-sm font-semibold text-text-primary">{policy.name}</h4>
            <span className="text-xs text-text-tertiary">→ {policy.selector || "all pods"}</span>
          </div>

          <div className="space-y-1.5 pl-6">
            {policy.edges.map((edge, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span
                  className={`px-1.5 py-0.5 rounded text-2xs font-medium ${
                    edge.direction === "ingress"
                      ? "bg-blue-400/20 text-blue-400"
                      : "bg-green-400/20 text-green-400"
                  }`}
                >
                  {edge.direction}
                </span>
                <span className="text-text-secondary">
                  {edge.direction === "ingress"
                    ? `from ${edge.fromPodSelector || "any"}`
                    : `to ${edge.toPodSelector || "any"}`}
                </span>
                {edge.ports.length > 0 && (
                  <span className="text-text-tertiary">:{edge.ports.join(", ")}</span>
                )}
              </div>
            ))}
            {policy.edges.length === 0 && (
              <p className="text-xs text-text-tertiary">Deny all (no rules)</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

---

## 7.15 — Service Management

### Backend: Service Selector and Endpoint Management

```go
// UpdateServiceSelector replaces a Service's pod selector labels.
func (h *ResourceHandler) UpdateServiceSelector(
    namespace, name string,
    selector map[string]string,
) error {
    client, err := h.clusterMgr.ActiveClient()
    if err != nil {
        return err
    }
    svc, err := client.Typed.CoreV1().Services(namespace).Get(h.ctx, name, metav1.GetOptions{})
    if err != nil {
        return err
    }
    svc.Spec.Selector = selector
    _, err = client.Typed.CoreV1().Services(namespace).Update(h.ctx, svc, metav1.UpdateOptions{})
    return err
}

// GetServiceEndpoints returns the resolved endpoints for a Service.
func (h *ResourceHandler) GetServiceEndpoints(namespace, name string) ([]EndpointInfo, error) {
    client, err := h.clusterMgr.ActiveClient()
    if err != nil {
        return nil, err
    }
    eps, err := client.Typed.CoreV1().Endpoints(namespace).Get(h.ctx, name, metav1.GetOptions{})
    if err != nil {
        return nil, err
    }

    result := []EndpointInfo{}
    for _, subset := range eps.Subsets {
        for _, addr := range subset.Addresses {
            for _, port := range subset.Ports {
                ep := EndpointInfo{
                    IP:       addr.IP,
                    Port:     port.Port,
                    Protocol: string(port.Protocol),
                    Ready:    true,
                }
                if addr.TargetRef != nil {
                    ep.PodName = addr.TargetRef.Name
                    ep.PodNamespace = addr.TargetRef.Namespace
                }
                result = append(result, ep)
            }
        }
        for _, addr := range subset.NotReadyAddresses {
            for _, port := range subset.Ports {
                ep := EndpointInfo{
                    IP:       addr.IP,
                    Port:     port.Port,
                    Protocol: string(port.Protocol),
                    Ready:    false,
                }
                if addr.TargetRef != nil {
                    ep.PodName = addr.TargetRef.Name
                }
                result = append(result, ep)
            }
        }
    }
    return result, nil
}
```

---

## 7.16 — Updated Acceptance Criteria

### Phase 7 complete acceptance checklist

**Helm**
- [ ] Helm releases list with correct columns and status indicators
- [ ] Helm release detail shows values, manifest, history, and notes
- [ ] Helm uninstall works with confirmation dialog
- [ ] Helm rollback to a previous revision works
- [ ] Add/remove/list chart repositories
- [ ] Chart search returns results from local repo indexes
- [ ] Install chart dialog: search → configure name/namespace/values → install
- [ ] Upgrade release with values diff view (current vs new)
- [ ] OCI chart references (oci://) are resolved correctly
- [ ] `GetReleaseValues` returns current user-supplied values

**YAML Editor**
- [ ] YAML editor renders with KubeViewer dark theme
- [ ] YAML editor shows "Unsaved changes" indicator when modified
- [ ] Cmd+S in editor triggers apply
- [ ] Apply success shows toast notification
- [ ] Apply failure shows inline error with details
- [ ] Diff view shows changes before apply (server dry-run)
- [ ] Schema validation and autocomplete active for known K8s GVKs
- [ ] Multi-document YAML (---) shows per-document tabs

**Resource Actions**
- [ ] Scale dialog works for Deployments, StatefulSets
- [ ] Restart (rolling) works for Deployments
- [ ] Pause/resume rollout works for Deployments
- [ ] Rollout history shows revision list with images and change-cause
- [ ] Rollback to a specific revision works
- [ ] Cordon/uncordon works for nodes
- [ ] Drain dialog with options (force, ignoreDaemonSets, deleteEmptyDirData, gracePeriod)
- [ ] Add/remove node taints works
- [ ] Delete requires typing resource name to confirm
- [ ] Create Job from CronJob with custom or auto-generated name
- [ ] Secret viewer shows decoded values with show/hide toggle
- [ ] Create docker-registry and TLS secrets
- [ ] Namespace creation with optional labels
- [ ] Resource quota viewer shows used vs hard with color-coded usage bars

**CRD Management**
- [ ] CRD list page shows all CRDs with group, kind, scope, established status
- [ ] CRD detail shows instances in a generic table
- [ ] CRD schema tab shows the OpenAPI v3 schema
- [ ] ListCustomResources works for cluster-scoped and namespaced CRDs

**Network Policy, PDB, Services**
- [ ] PDB list shows disruptions-allowed, desired/current healthy counts
- [ ] NetworkPolicy visualization shows ingress/egress rules per policy
- [ ] Service selector editor allows updating pod selector labels
- [ ] Service endpoints viewer shows ready and not-ready addresses with pod names

**Context Menus and Command Palette**
- [ ] Context menu appears on right-click with correct actions per resource type
- [ ] Command palette searches across resources when typing a name
- [ ] Command palette shows context-specific actions for selected resources
- [ ] Keyboard shortcuts shown in context menus match actual shortcuts
- [ ] Toast notifications appear for all action outcomes
