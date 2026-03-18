# Phase 5 — Resource Views & Detail Panels

## Goal

Rich, interactive resource tables for every Kubernetes resource type, a detail panel for inspecting individual resources, and real-time updates via watches. The primary interaction surface of the entire application.

---

## 5.1 — Resource Table Design

### Visual design (Linear-inspired)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Pods                                                                   │
│  82 pods in namespace "default"                          ⚙ Columns  🔍 │
├─────────────────────────────────────────────────────────────────────────┤
│  STATUS  NAME                      READY  RESTARTS  NODE        AGE    │
│  ─────────────────────────────────────────────────────────────────────  │
│  ● ──── nginx-6799fc88d8-abc12     2/2    0         node-1      3d     │
│  ● ──── nginx-6799fc88d8-def34     2/2    0         node-2      3d     │
│  ◐ ──── api-server-7f4bc-xyz89     1/2    14        node-1      1h     │
│  ✕ ──── batch-job-failed-a1b2c     0/1    5         node-3      22m    │
│  ◌ ──── init-container-pod-d4e5    0/1    0         node-2      45s    │
│                                                                         │
│  ... (virtualized — renders only visible rows)                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Table design principles

| Principle | Implementation |
|-----------|---------------|
| **No visible row borders** | Rows separated by hover state only (Linear pattern). Cleaner than gridlines. |
| **Status icons, not text** | Colored icon for pod phase. Faster visual scanning than "Running" text. |
| **Sticky header** | Column headers stick on scroll. |
| **Hover actions** | Right-aligned action buttons appear on row hover (view logs, exec shell, delete). |
| **Row click** | Clicking a row opens the detail panel. |
| **Keyboard selection** | Arrow keys move selection. Enter opens detail. |
| **Virtual scrolling** | TanStack Table + virtual scroll for 10,000+ resources without lag. |
| **Tabular numbers** | All numeric columns use `tabular-nums` font variant for alignment. |

---

## 5.2 — Generic ResourceTable Component

A single table component that works for any resource type. Column definitions are passed as configuration.

```tsx
// components/table/ResourceTable.tsx
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  ColumnDef,
  SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";

interface ResourceTableProps<T> {
  data: T[];
  columns: ColumnDef<T, any>[];
  isLoading: boolean;
  onRowClick?: (row: T) => void;
  searchValue?: string;
}

export function ResourceTable<T>({
  data,
  columns,
  isLoading,
  onRowClick,
  searchValue,
}: ResourceTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter: searchValue },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const { rows } = table.getRowModel();

  // Virtual scrolling for large datasets
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36, // row height
    overscan: 20,
  });

  return (
    <div ref={parentRef} className="flex-1 overflow-auto">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-bg-primary border-b border-border">
        {table.getHeaderGroups().map((headerGroup) => (
          <div key={headerGroup.id} className="flex items-center px-4 h-8">
            {headerGroup.headers.map((header) => (
              <div
                key={header.id}
                className="text-2xs font-medium text-text-tertiary uppercase tracking-wider cursor-pointer select-none hover:text-text-secondary"
                style={{ width: header.getSize() }}
                onClick={header.column.getToggleSortingHandler()}
              >
                {flexRender(header.column.columnDef.header, header.getContext())}
                {header.column.getIsSorted() === "asc" && " ↑"}
                {header.column.getIsSorted() === "desc" && " ↓"}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Virtual rows */}
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index];
          return (
            <div
              key={row.id}
              className="absolute w-full flex items-center px-4 h-9 cursor-pointer hover:bg-bg-hover transition-colors duration-100"
              style={{ top: virtualRow.start }}
              onClick={() => onRowClick?.(row.original)}
            >
              {row.getVisibleCells().map((cell) => (
                <div key={cell.id} style={{ width: cell.column.getSize() }}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

---

## 5.3 — Column Definitions by Resource Type

### Pods

| Column | Width | Content |
|--------|-------|---------|
| Status | 40px | Colored icon: ● Running (green), ◐ Partial (yellow), ✕ Failed (red), ◌ Pending (gray) |
| Name | flex | Pod name, truncated with tooltip |
| Ready | 60px | `2/3` format |
| Restarts | 80px | Count, red if > 0 |
| Node | 120px | Node name |
| IP | 120px | Pod IP |
| Age | 60px | Relative time (`3d`, `2h`, `45m`, `12s`) |

### Deployments

| Column | Width | Content |
|--------|-------|---------|
| Status | 40px | Green if all replicas ready, yellow if progressing, red if degraded |
| Name | flex | Deployment name |
| Ready | 80px | `3/3` replicas |
| Up-to-date | 80px | Count |
| Available | 80px | Count |
| Strategy | 100px | RollingUpdate / Recreate |
| Age | 60px | Relative time |

### Services

| Column | Width | Content |
|--------|-------|---------|
| Name | flex | Service name |
| Type | 100px | ClusterIP / NodePort / LoadBalancer / ExternalName |
| Cluster IP | 120px | IP address |
| External IP | 120px | IP or `<pending>` |
| Ports | 150px | `80:30080/TCP, 443:30443/TCP` |
| Age | 60px | Relative time |

### Nodes

| Column | Width | Content |
|--------|-------|---------|
| Status | 40px | Green if Ready, red if NotReady |
| Name | flex | Node name |
| Roles | 100px | control-plane, worker |
| Version | 100px | Kubelet version |
| CPU | 80px | Allocatable CPU |
| Memory | 80px | Allocatable memory |
| Pods | 60px | Pod count / capacity |
| Age | 60px | Relative time |

### Events

| Column | Width | Content |
|--------|-------|---------|
| Type | 60px | Normal (blue) / Warning (yellow) |
| Reason | 120px | Event reason |
| Object | 150px | `Pod/nginx-abc12` |
| Message | flex | Event message |
| Count | 50px | Occurrence count |
| Last Seen | 80px | Relative time |

---

## 5.4 — Resource List View (Page-Level Component)

Each route renders a `ResourceListView` that:
1. Determines the resource type from the URL
2. Calls the Go backend to list resources
3. Sets up a watch for real-time updates
4. Renders a `ResourceTable` with type-specific columns

```tsx
// views/ResourceListView.tsx
import { useParams } from "react-router-dom";
import { useKubeResources } from "../hooks/useKubeResource";
import { ResourceTable } from "../components/table/ResourceTable";
import { DetailPanel } from "../components/detail/DetailPanel";
import { getColumnsForResource } from "../lib/columns";
import { RESOURCE_CONFIG } from "../lib/resourceConfig";

export function ResourceListView() {
  const { resource } = useParams();
  const { selectedNamespace } = useClusterStore();
  const [selectedItem, setSelectedItem] = useState(null);
  const [searchValue, setSearchValue] = useState("");

  const config = RESOURCE_CONFIG[resource];
  const columns = getColumnsForResource(resource);

  const { data, isLoading } = useKubeResources({
    group: config.group,
    version: config.version,
    resource: config.plural,
    namespace: selectedNamespace,
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">{config.displayName}</h1>
          <p className="text-sm text-text-secondary">
            {data?.length ?? 0} {config.plural}
            {selectedNamespace && ` in namespace "${selectedNamespace}"`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SearchInput value={searchValue} onChange={setSearchValue} />
          <ColumnToggle columns={columns} />
        </div>
      </div>

      {/* Table + optional detail panel */}
      <div className="flex flex-1 overflow-hidden">
        <ResourceTable
          data={data ?? []}
          columns={columns}
          isLoading={isLoading}
          searchValue={searchValue}
          onRowClick={setSelectedItem}
        />
        {selectedItem && (
          <DetailPanel
            resource={selectedItem}
            resourceType={resource}
            onClose={() => setSelectedItem(null)}
          />
        )}
      </div>
    </div>
  );
}
```

---

## 5.5 — Resource Data Hook

```typescript
// hooks/useKubeResource.ts
import { useState, useEffect } from "react";
import { ListResources, WatchResources } from "../../wailsjs/go/handlers/ResourceHandler";
import { EventsOn } from "../../wailsjs/runtime/runtime";

interface UseKubeResourcesOptions {
  group: string;
  version: string;
  resource: string;
  namespace: string;
}

export function useKubeResources(opts: UseKubeResourcesOptions) {
  const [data, setData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchAndWatch() {
      setIsLoading(true);
      setError(null);

      try {
        // Initial list
        const items = await ListResources({
          group: opts.group,
          version: opts.version,
          resource: opts.resource,
          namespace: opts.namespace,
        });

        if (!cancelled) {
          setData(items);
          setIsLoading(false);
        }

        // Start watch for real-time updates
        await WatchResources({
          group: opts.group,
          version: opts.version,
          resource: opts.resource,
          namespace: opts.namespace,
        });
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || String(err));
          setIsLoading(false);
        }
      }
    }

    fetchAndWatch();

    // Listen for watch events
    const eventName = `resource-watch:${opts.resource}`;
    const cleanup = EventsOn(eventName, (event: any) => {
      if (cancelled) return;
      setData((prev) => {
        switch (event.type) {
          case "ADDED":
            // Add if not already present
            if (prev.find((r) => r.name === event.resource.name && r.namespace === event.resource.namespace)) {
              return prev; // already exists, skip
            }
            return [...prev, event.resource];
          case "MODIFIED":
            return prev.map((r) =>
              r.name === event.resource.name && r.namespace === event.resource.namespace
                ? event.resource
                : r
            );
          case "DELETED":
            return prev.filter(
              (r) => !(r.name === event.resource.name && r.namespace === event.resource.namespace)
            );
          default:
            return prev;
        }
      });
    });

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [opts.group, opts.version, opts.resource, opts.namespace]);

  return { data, isLoading, error };
}
```

---

## 5.6 — Detail Panel

When a resource is selected, a detail panel slides in from the right. Inspired by Linear's issue detail view.

### Layout

```
┌───────────────────────────────────────┬──────────────────────────┐
│                                       │  DETAIL PANEL            │
│         Resource Table                │                          │
│         (shrinks to ~60%)             │  nginx-6799fc88d8-abc12  │
│                                       │  Pod in "default"        │
│                                       │                          │
│                                       │  ┌─────────────────────┐ │
│                                       │  │ Overview │Logs│YAML │ │
│                                       │  ├─────────────────────┤ │
│                                       │  │                     │ │
│                                       │  │  Status: Running    │ │
│                                       │  │  Node: node-1       │ │
│                                       │  │  IP: 10.244.0.15    │ │
│                                       │  │  Ready: 2/2         │ │
│                                       │  │  Restarts: 0        │ │
│                                       │  │  Age: 3 days        │ │
│                                       │  │                     │ │
│                                       │  │  CONTAINERS         │ │
│                                       │  │  ┌───────────────┐  │ │
│                                       │  │  │ nginx         │  │ │
│                                       │  │  │ nginx:1.25    │  │ │
│                                       │  │  │ ● Running     │  │ │
│                                       │  │  └───────────────┘  │ │
│                                       │  │  ┌───────────────┐  │ │
│                                       │  │  │ sidecar       │  │ │
│                                       │  │  │ envoy:1.28    │  │ │
│                                       │  │  │ ● Running     │  │ │
│                                       │  │  └───────────────┘  │ │
│                                       │  │                     │ │
│                                       │  │  LABELS             │ │
│                                       │  │  app=nginx          │ │
│                                       │  │  env=production     │ │
│                                       │  │                     │ │
│                                       │  │  CONDITIONS         │ │
│                                       │  │  ✓ Initialized      │ │
│                                       │  │  ✓ Ready            │ │
│                                       │  │  ✓ ContainersReady  │ │
│                                       │  │  ✓ PodScheduled     │ │
│                                       │  │                     │ │
│                                       │  │  EVENTS             │ │
│                                       │  │  (recent events)    │ │
│                                       │  │                     │ │
│                                       │  └─────────────────────┘ │
│                                       │                          │
│                                       │  [View Logs] [Exec] [⋮] │
│                                       │                          │
└───────────────────────────────────────┴──────────────────────────┘
```

### Detail panel tabs

| Tab | Content |
|-----|---------|
| **Overview** | Metadata, status, containers, labels, annotations, conditions, related events |
| **Logs** | Streaming logs for the selected container (see Phase 6) |
| **YAML** | Full resource YAML in Monaco editor, editable + Apply button (see Phase 7) |

### Panel behaviour

| Behaviour | Detail |
|-----------|--------|
| **Width** | 40% of main content area, min 380px |
| **Open animation** | Slide in from right, 150ms ease-out |
| **Close** | `Escape` key or close button. Slide out 100ms. |
| **Sticky actions** | Bottom action bar with "View Logs", "Exec Shell", and overflow menu (delete, scale, restart). |
| **Keyboard nav** | `↑`/`↓` in table changes selected resource and detail panel updates. |

### Detail sections by resource type

**Pods**: Status, node, IP, containers (image, state, ports, resources), labels, annotations, conditions, tolerations, volumes, events.

**Deployments**: Status, strategy, replicas (desired/current/ready/available), conditions, selector, template spec, rollout history, events.

**Services**: Type, cluster IP, external IP, ports, selector, endpoints (linked pods), events.

**Nodes**: Status, roles, addresses, capacity vs allocatable, conditions, taints, system info (OS, architecture, kubelet version), pods running on this node.

**ConfigMaps/Secrets**: Data keys with values (secrets masked by default, reveal on click). Byte size per key.

---

## 5.7 — Status Indicators

Consistent visual language for resource status across the app.

### Pod status mapping

| Phase | Icon | Color | Conditions |
|-------|------|-------|------------|
| Running (all ready) | ● (filled circle) | `status-running` green | All containers ready |
| Running (partial) | ◐ (half circle) | `status-pending` yellow | Some containers not ready |
| Pending | ◌ (empty circle) | `status-pending` yellow | Waiting for scheduling |
| Succeeded | ✓ (check) | `status-running` green | Completed successfully |
| Failed | ✕ (x mark) | `status-error` red | One or more containers failed |
| CrashLoopBackOff | ✕ (x mark, pulsing) | `status-error` red | Container restarting repeatedly |
| Unknown | ? (question) | `status-terminated` gray | Node unreachable |
| Terminating | ◌ (fading) | `status-terminated` gray | Deletion in progress |

### StatusBadge component

```tsx
// components/ui/StatusBadge.tsx
const STATUS_CONFIG = {
  running: { icon: CircleIcon, color: "text-status-running", fill: true },
  pending: { icon: CircleIcon, color: "text-status-pending", fill: false },
  succeeded: { icon: CheckIcon, color: "text-status-running" },
  failed: { icon: XIcon, color: "text-status-error" },
  unknown: { icon: HelpCircleIcon, color: "text-status-terminated" },
} as const;

export function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.unknown;
  const Icon = config.icon;
  return <Icon className={cn("w-3 h-3", config.color)} />;
}
```

---

## 5.8 — Search & Filter

### Table search

A search input above the table that filters rows client-side. Uses TanStack Table's `globalFilter`.

```tsx
// components/table/SearchInput.tsx
export function SearchInput({ value, onChange }) {
  return (
    <div className="relative">
      <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Filter resources..."
        className="pl-9 pr-3 py-1.5 text-sm bg-bg-tertiary border border-border rounded-md text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent w-64 transition-colors"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
        >
          <XIcon className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
```

### Label filtering

A more advanced filter for selecting resources by label selector (e.g., `app=nginx, env=production`). Renders as a filter bar below the search with removable chips.

---

## 5.9 — Cluster Overview Dashboard

The landing page when a cluster is connected. A summary of cluster health.

```
┌────────────────────────────────────────────────────────────────────┐
│  Cluster Overview                                                  │
│  minikube • v1.28.3 • Connected                                   │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │ Nodes    │  │ Pods     │  │ Deploy   │  │ Services │          │
│  │    3     │  │   82     │  │   12     │  │   18     │          │
│  │  3 Ready │  │ 78 Run   │  │ 12 Ready │  │ 4 LB     │          │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘          │
│                                                                    │
│  RECENT EVENTS                                                     │
│  ⚠ Warning  Pod/api-xyz    BackOff   Back-off restarting...  2m  │
│  ℹ Normal   Deploy/nginx   Scaling   Scaled up to 3         5m  │
│  ℹ Normal   Node/node-2    Ready     Node became ready      1h  │
│  ⚠ Warning  Pod/batch-abc  Failed    Container exited: 1    1h  │
│  ... (last 20 events)                                             │
│                                                                    │
│  NAMESPACES                                                        │
│  default (42 pods) │ kube-system (15 pods) │ monitoring (8 pods)  │
│  production (12 pods) │ staging (5 pods)                          │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Summary cards

Each card calls a lightweight Go function that returns aggregate counts:

```go
// ClusterSummary is returned by the overview endpoint.
type ClusterSummary struct {
    NodeCount         int `json:"nodeCount"`
    NodeReady         int `json:"nodeReady"`
    PodCount          int `json:"podCount"`
    PodRunning        int `json:"podRunning"`
    DeploymentCount   int `json:"deploymentCount"`
    DeploymentReady   int `json:"deploymentReady"`
    ServiceCount      int `json:"serviceCount"`
    ServiceLB         int `json:"serviceLB"`
    NamespaceSummary  []NamespaceSummary `json:"namespaceSummary"`
}
```

---

## 5.10 — Empty States & Loading

### Loading state

Skeleton shimmer placeholders matching the table row layout. No spinner. Feels instant.

```tsx
function TableSkeleton({ rowCount = 12 }) {
  return (
    <div className="flex flex-col gap-1 p-4">
      {Array.from({ length: rowCount }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 h-9 animate-pulse">
          <div className="w-3 h-3 rounded-full bg-bg-hover" />
          <div className="h-3 rounded bg-bg-hover" style={{ width: `${60 + Math.random() * 30}%` }} />
          <div className="h-3 w-12 rounded bg-bg-hover ml-auto" />
        </div>
      ))}
    </div>
  );
}
```

### Empty state

When a resource list is empty:

```tsx
function EmptyState({ resourceName }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-text-tertiary">
      <InboxIcon className="w-10 h-10 mb-3" />
      <p className="text-sm font-medium">No {resourceName} found</p>
      <p className="text-xs mt-1">
        {selectedNamespace
          ? `No ${resourceName} in namespace "${selectedNamespace}"`
          : `No ${resourceName} in this cluster`}
      </p>
    </div>
  );
}
```

### Error state

Connection failures, RBAC denials, and API errors render inline above the table with a retry button.

---

## 5.11 — Acceptance Criteria

- [ ] Resource table renders pods, deployments, services, nodes, events, configmaps, secrets
- [ ] Correct columns display for each resource type
- [ ] Status icons show correct color/shape for resource state
- [ ] Table sorts by clicking column headers
- [ ] Search/filter reduces visible rows in real-time
- [ ] Virtual scrolling handles 5,000+ rows without performance degradation
- [ ] Clicking a row opens the detail panel with correct data
- [ ] Detail panel shows Overview, Logs (placeholder), YAML (placeholder) tabs
- [ ] Detail panel keyboard navigation: `Escape` to close, `↑`/`↓` to change selected row
- [ ] Cluster overview dashboard shows summary cards with accurate counts
- [ ] Recent events list updates in real-time
- [ ] Watch events update the table without full re-fetch (rows add/update/remove in place)
- [ ] Namespace filter scopes all resource lists
- [ ] Loading skeletons show while data is fetching
- [ ] Empty states show when no resources match
- [ ] Error states show with clear messages and retry option

---

## 5.12 — Complete Column Definitions for All Resource Types

Column definitions are exported from `ui/src/lib/columns/` — one file per resource type. Each definition uses TanStack Table's `ColumnDef<T>` format.

### `ui/src/lib/columns/index.ts`

```ts
import { podColumns }             from "./pods";
import { deploymentColumns }      from "./deployments";
import { statefulSetColumns }     from "./statefulsets";
import { daemonSetColumns }       from "./daemonsets";
import { replicaSetColumns }      from "./replicasets";
import { jobColumns }             from "./jobs";
import { cronJobColumns }         from "./cronjobs";
import { serviceColumns }         from "./services";
import { ingressColumns }         from "./ingresses";
import { endpointColumns }        from "./endpoints";
import { networkPolicyColumns }   from "./networkpolicies";
import { configMapColumns }       from "./configmaps";
import { secretColumns }          from "./secrets";
import { hpaColumns }             from "./hpas";
import { pvColumns }              from "./pvs";
import { pvcColumns }             from "./pvcs";
import { storageClassColumns }    from "./storageclasses";
import { serviceAccountColumns }  from "./serviceaccounts";
import { roleColumns }            from "./roles";
import { clusterRoleColumns }     from "./clusterroles";
import { roleBindingColumns }     from "./rolebindings";
import { clusterRoleBindingColumns } from "./clusterrolebindings";
import { namespaceColumns }       from "./namespaces";
import { nodeColumns }            from "./nodes";
import { eventColumns }           from "./events";
import { pdbColumns }             from "./pdbs";
import { priorityClassColumns }   from "./priorityclasses";
import { crdColumns }             from "./crds";

export const COLUMN_MAP: Record<string, any[]> = {
  pods:                    podColumns,
  deployments:             deploymentColumns,
  statefulsets:            statefulSetColumns,
  daemonsets:              daemonSetColumns,
  replicasets:             replicaSetColumns,
  jobs:                    jobColumns,
  cronjobs:                cronJobColumns,
  services:                serviceColumns,
  ingresses:               ingressColumns,
  endpoints:               endpointColumns,
  networkpolicies:         networkPolicyColumns,
  configmaps:              configMapColumns,
  secrets:                 secretColumns,
  horizontalpodautoscalers: hpaColumns,
  persistentvolumes:       pvColumns,
  persistentvolumeclaims:  pvcColumns,
  storageclasses:          storageClassColumns,
  serviceaccounts:         serviceAccountColumns,
  roles:                   roleColumns,
  clusterroles:            clusterRoleColumns,
  rolebindings:            roleBindingColumns,
  clusterrolebindings:     clusterRoleBindingColumns,
  namespaces:              namespaceColumns,
  nodes:                   nodeColumns,
  events:                  eventColumns,
  poddisruptionbudgets:    pdbColumns,
  priorityclasses:         priorityClassColumns,
};

export function getColumnsForResource(resource: string) {
  return COLUMN_MAP[resource] ?? [];
}
```

### `ui/src/lib/columns/statefulsets.ts`

```ts
import { createColumnHelper } from "@tanstack/react-table";
import { StatusDot }          from "../../components/cells/StatusDot";
import { RelativeTime }       from "../../components/cells/RelativeTime";

const h = createColumnHelper<any>();
export const statefulSetColumns = [
  h.accessor("status", { header: "", size: 40, cell: (i) => <StatusDot status={i.getValue()} /> }),
  h.accessor("name",   { header: "NAME",     size: undefined, enableResizing: true }),
  h.accessor("ready",  { header: "READY",    size: 80,
    cell: (i) => `${i.row.original.readyReplicas ?? 0}/${i.row.original.replicas ?? 0}` }),
  h.accessor("replicas",       { header: "REPLICAS",        size: 80 }),
  h.accessor("serviceName",    { header: "SERVICE",         size: 140 }),
  h.accessor("updateStrategy", { header: "UPDATE STRATEGY", size: 140 }),
  h.accessor("age",            { header: "AGE", size: 60, cell: (i) => <RelativeTime ts={i.getValue()} /> }),
];
```

### `ui/src/lib/columns/daemonsets.ts`

```ts
const h = createColumnHelper<any>();
export const daemonSetColumns = [
  h.accessor("status",      { header: "", size: 40, cell: (i) => <StatusDot status={i.getValue()} /> }),
  h.accessor("name",        { header: "NAME",    size: undefined }),
  h.accessor("desired",     { header: "DESIRED", size: 80 }),
  h.accessor("current",     { header: "CURRENT", size: 80 }),
  h.accessor("ready",       { header: "READY",   size: 80 }),
  h.accessor("upToDate",    { header: "UP-TO-DATE", size: 100 }),
  h.accessor("available",   { header: "AVAILABLE",  size: 100 }),
  h.accessor("nodeSelector",{ header: "NODE SELECTOR", size: 180 }),
  h.accessor("age",         { header: "AGE", size: 60, cell: (i) => <RelativeTime ts={i.getValue()} /> }),
];
```

### `ui/src/lib/columns/replicasets.ts`

```ts
const h = createColumnHelper<any>();
export const replicaSetColumns = [
  h.accessor("status",      { header: "", size: 40, cell: (i) => <StatusDot status={i.getValue()} /> }),
  h.accessor("name",        { header: "NAME",    size: undefined }),
  h.accessor("desired",     { header: "DESIRED", size: 80 }),
  h.accessor("current",     { header: "CURRENT", size: 80 }),
  h.accessor("ready",       { header: "READY",   size: 80 }),
  h.accessor("owner",       { header: "OWNER",   size: 180,
    cell: (i) => {
      const o = i.getValue() as { kind: string; name: string } | undefined;
      return o ? `${o.kind}/${o.name}` : "—";
    },
  }),
  h.accessor("age", { header: "AGE", size: 60, cell: (i) => <RelativeTime ts={i.getValue()} /> }),
];
```

### `ui/src/lib/columns/jobs.ts`

```ts
const h = createColumnHelper<any>();
export const jobColumns = [
  h.accessor("status",     { header: "", size: 40, cell: (i) => <StatusDot status={i.getValue()} /> }),
  h.accessor("name",       { header: "NAME",       size: undefined }),
  h.accessor("completions",{ header: "COMPLETIONS",size: 100,
    cell: (i) => `${i.row.original.succeeded ?? 0}/${i.row.original.completions ?? 1}` }),
  h.accessor("duration",   { header: "DURATION",   size: 100 }),
  h.accessor("images",     { header: "IMAGES",     size: 200,
    cell: (i) => (i.getValue() as string[])?.join(", ") ?? "—" }),
  h.accessor("age",        { header: "AGE", size: 60, cell: (i) => <RelativeTime ts={i.getValue()} /> }),
];
```

### `ui/src/lib/columns/cronjobs.ts`

```ts
const h = createColumnHelper<any>();
export const cronJobColumns = [
  h.accessor("name",         { header: "NAME",          size: undefined }),
  h.accessor("schedule",     { header: "SCHEDULE",      size: 140 }),
  h.accessor("suspend",      { header: "SUSPEND",       size: 80,
    cell: (i) => i.getValue() ? "True" : "False" }),
  h.accessor("active",       { header: "ACTIVE",        size: 70 }),
  h.accessor("lastSchedule", { header: "LAST SCHEDULE", size: 120,
    cell: (i) => <RelativeTime ts={i.getValue()} emptyText="<never>" /> }),
  h.accessor("age",          { header: "AGE", size: 60, cell: (i) => <RelativeTime ts={i.getValue()} /> }),
];
```

### `ui/src/lib/columns/ingresses.ts`

```ts
const h = createColumnHelper<any>();
export const ingressColumns = [
  h.accessor("name",      { header: "NAME",       size: undefined }),
  h.accessor("className", { header: "CLASS",      size: 120 }),
  h.accessor("hosts",     { header: "HOSTS",      size: 200,
    cell: (i) => (i.getValue() as string[])?.join(", ") ?? "—" }),
  h.accessor("addresses", { header: "ADDRESS",    size: 140,
    cell: (i) => (i.getValue() as string[])?.join(", ") ?? "<pending>" }),
  h.accessor("ports",     { header: "PORTS",      size: 100 }),
  h.accessor("age",       { header: "AGE", size: 60, cell: (i) => <RelativeTime ts={i.getValue()} /> }),
];
```

### `ui/src/lib/columns/endpoints.ts`

```ts
const h = createColumnHelper<any>();
export const endpointColumns = [
  h.accessor("name",     { header: "NAME",      size: undefined }),
  h.accessor("endpoints",{ header: "ENDPOINTS", size: undefined,
    cell: (i) => {
      const eps = i.getValue() as string[];
      if (!eps?.length) return "<none>";
      if (eps.length <= 3) return eps.join(", ");
      return `${eps.slice(0, 3).join(", ")} +${eps.length - 3} more`;
    },
  }),
  h.accessor("age", { header: "AGE", size: 60, cell: (i) => <RelativeTime ts={i.getValue()} /> }),
];
```

### `ui/src/lib/columns/networkpolicies.ts`

```ts
const h = createColumnHelper<any>();
export const networkPolicyColumns = [
  h.accessor("name",       { header: "NAME",        size: undefined }),
  h.accessor("podSelector",{ header: "POD SELECTOR",size: 200,
    cell: (i) => {
      const sel = i.getValue() as Record<string, string> | undefined;
      if (!sel || Object.keys(sel).length === 0) return "<all pods>";
      return Object.entries(sel).map(([k, v]) => `${k}=${v}`).join(", ");
    },
  }),
  h.accessor("policyTypes",{ header: "POLICY TYPES",size: 150,
    cell: (i) => (i.getValue() as string[])?.join(", ") ?? "—" }),
  h.accessor("age",        { header: "AGE", size: 60, cell: (i) => <RelativeTime ts={i.getValue()} /> }),
];
```

### `ui/src/lib/columns/configmaps.ts`

```ts
const h = createColumnHelper<any>();
export const configMapColumns = [
  h.accessor("name",     { header: "NAME",  size: undefined }),
  h.accessor("dataKeys", { header: "KEYS",  size: 80 }),
  h.accessor("age",      { header: "AGE", size: 60, cell: (i) => <RelativeTime ts={i.getValue()} /> }),
];
```

### `ui/src/lib/columns/secrets.ts`

```ts
const h = createColumnHelper<any>();
export const secretColumns = [
  h.accessor("name",     { header: "NAME", size: undefined }),
  h.accessor("type",     { header: "TYPE", size: 200 }),
  h.accessor("dataKeys", { header: "KEYS", size: 80 }),
  h.accessor("age",      { header: "AGE",  size: 60, cell: (i) => <RelativeTime ts={i.getValue()} /> }),
];
```

### `ui/src/lib/columns/hpas.ts`

```ts
const h = createColumnHelper<any>();
export const hpaColumns = [
  h.accessor("name",        { header: "NAME",        size: undefined }),
  h.accessor("reference",   { header: "REFERENCE",   size: 200 }),
  h.accessor("minReplicas", { header: "MIN PODS",    size: 80 }),
  h.accessor("maxReplicas", { header: "MAX PODS",    size: 80 }),
  h.accessor("replicas",    { header: "REPLICAS",    size: 80 }),
  h.accessor("metrics",     { header: "METRICS",     size: 200,
    cell: (i) => (i.getValue() as string[])?.join(" / ") ?? "—" }),
  h.accessor("age",         { header: "AGE", size: 60, cell: (i) => <RelativeTime ts={i.getValue()} /> }),
];
```

### `ui/src/lib/columns/pvs.ts`

```ts
const h = createColumnHelper<any>();
export const pvColumns = [
  h.accessor("status",          { header: "", size: 40, cell: (i) => <StatusDot status={i.getValue()} /> }),
  h.accessor("name",            { header: "NAME",             size: undefined }),
  h.accessor("capacity",        { header: "CAPACITY",         size: 100 }),
  h.accessor("accessModes",     { header: "ACCESS MODES",     size: 120,
    cell: (i) => (i.getValue() as string[])?.join(", ") ?? "—" }),
  h.accessor("reclaimPolicy",   { header: "RECLAIM POLICY",   size: 120 }),
  h.accessor("storageClass",    { header: "STORAGE CLASS",    size: 140 }),
  h.accessor("claimRef",        { header: "CLAIM",            size: 180,
    cell: (i) => {
      const c = i.getValue() as { namespace: string; name: string } | undefined;
      return c ? `${c.namespace}/${c.name}` : "—";
    },
  }),
  h.accessor("age", { header: "AGE", size: 60, cell: (i) => <RelativeTime ts={i.getValue()} /> }),
];
```

### `ui/src/lib/columns/pvcs.ts`

```ts
const h = createColumnHelper<any>();
export const pvcColumns = [
  h.accessor("status",       { header: "", size: 40, cell: (i) => <StatusDot status={i.getValue()} /> }),
  h.accessor("name",         { header: "NAME",          size: undefined }),
  h.accessor("capacity",     { header: "CAPACITY",      size: 100 }),
  h.accessor("accessModes",  { header: "ACCESS MODES",  size: 120,
    cell: (i) => (i.getValue() as string[])?.join(", ") ?? "—" }),
  h.accessor("storageClass", { header: "STORAGE CLASS", size: 140 }),
  h.accessor("volumeName",   { header: "VOLUME",        size: 180 }),
  h.accessor("age",          { header: "AGE", size: 60, cell: (i) => <RelativeTime ts={i.getValue()} /> }),
];
```

### `ui/src/lib/columns/storageclasses.ts`

```ts
const h = createColumnHelper<any>();
export const storageClassColumns = [
  h.accessor("name",             { header: "NAME",             size: undefined }),
  h.accessor("provisioner",      { header: "PROVISIONER",      size: 200 }),
  h.accessor("reclaimPolicy",    { header: "RECLAIM POLICY",   size: 120 }),
  h.accessor("volumeBindingMode",{ header: "BINDING MODE",     size: 140 }),
  h.accessor("allowExpansion",   { header: "ALLOW EXPANSION",  size: 120,
    cell: (i) => i.getValue() ? "true" : "false" }),
  h.accessor("isDefault",        { header: "DEFAULT", size: 80,
    cell: (i) => i.getValue() ? "★" : "" }),
  h.accessor("age",              { header: "AGE", size: 60, cell: (i) => <RelativeTime ts={i.getValue()} /> }),
];
```

### `ui/src/lib/columns/serviceaccounts.ts`

```ts
const h = createColumnHelper<any>();
export const serviceAccountColumns = [
  h.accessor("name",    { header: "NAME",    size: undefined }),
  h.accessor("secrets", { header: "SECRETS", size: 80 }),
  h.accessor("age",     { header: "AGE", size: 60, cell: (i) => <RelativeTime ts={i.getValue()} /> }),
];
```

### `ui/src/lib/columns/roles.ts`

```ts
const h = createColumnHelper<any>();
export const roleColumns = [
  h.accessor("name",      { header: "NAME",     size: undefined }),
  h.accessor("ruleCount", { header: "RULES",    size: 80 }),
  h.accessor("age",       { header: "AGE", size: 60, cell: (i) => <RelativeTime ts={i.getValue()} /> }),
];
export const clusterRoleColumns = roleColumns; // same shape
```

### `ui/src/lib/columns/rolebindings.ts`

```ts
const h = createColumnHelper<any>();
export const roleBindingColumns = [
  h.accessor("name",       { header: "NAME",     size: undefined }),
  h.accessor("roleRef",    { header: "ROLE REF", size: 180,
    cell: (i) => {
      const r = i.getValue() as { kind: string; name: string };
      return `${r.kind}/${r.name}`;
    },
  }),
  h.accessor("subjects",   { header: "SUBJECTS", size: undefined,
    cell: (i) => {
      const s = i.getValue() as Array<{ kind: string; name: string }>;
      return s?.slice(0, 3).map((x) => `${x.kind}/${x.name}`).join(", ") ?? "—";
    },
  }),
  h.accessor("age", { header: "AGE", size: 60, cell: (i) => <RelativeTime ts={i.getValue()} /> }),
];
export const clusterRoleBindingColumns = roleBindingColumns; // same shape
```

### `ui/src/lib/columns/namespaces.ts`

```ts
const h = createColumnHelper<any>();
export const namespaceColumns = [
  h.accessor("status", { header: "", size: 40, cell: (i) => <StatusDot status={i.getValue()} /> }),
  h.accessor("name",   { header: "NAME", size: undefined }),
  h.accessor("labels", { header: "LABELS", size: undefined,
    cell: (i) => {
      const l = i.getValue() as Record<string, string> | undefined;
      if (!l) return "—";
      const entries = Object.entries(l).filter(([k]) => !k.startsWith("kubernetes.io/"));
      return entries.map(([k, v]) => `${k}=${v}`).slice(0, 3).join(", ");
    },
  }),
  h.accessor("age", { header: "AGE", size: 60, cell: (i) => <RelativeTime ts={i.getValue()} /> }),
];
```

### `ui/src/lib/columns/pdbs.ts`

```ts
const h = createColumnHelper<any>();
export const pdbColumns = [
  h.accessor("name",             { header: "NAME",            size: undefined }),
  h.accessor("minAvailable",     { header: "MIN AVAILABLE",   size: 120 }),
  h.accessor("maxUnavailable",   { header: "MAX UNAVAILABLE", size: 130 }),
  h.accessor("allowedDisruptions",{ header: "ALLOWED",        size: 80 }),
  h.accessor("currentHealthy",   { header: "HEALTHY",         size: 80 }),
  h.accessor("desiredHealthy",   { header: "DESIRED",         size: 80 }),
  h.accessor("age",              { header: "AGE", size: 60, cell: (i) => <RelativeTime ts={i.getValue()} /> }),
];
```

### `ui/src/lib/columns/priorityclasses.ts`

```ts
const h = createColumnHelper<any>();
export const priorityClassColumns = [
  h.accessor("name",            { header: "NAME",        size: undefined }),
  h.accessor("value",           { header: "VALUE",       size: 100 }),
  h.accessor("globalDefault",   { header: "GLOBAL DEFAULT", size: 120,
    cell: (i) => i.getValue() ? "true" : "false" }),
  h.accessor("description",     { header: "DESCRIPTION", size: undefined }),
  h.accessor("age",             { header: "AGE", size: 60, cell: (i) => <RelativeTime ts={i.getValue()} /> }),
];
```

### `ui/src/lib/columns/crds.ts`

```ts
const h = createColumnHelper<any>();
export const crdColumns = [
  h.accessor("name",     { header: "NAME",     size: undefined }),
  h.accessor("group",    { header: "GROUP",    size: 200 }),
  h.accessor("version",  { header: "VERSION",  size: 80 }),
  h.accessor("scope",    { header: "SCOPE",    size: 100 }),
  h.accessor("age",      { header: "AGE", size: 60, cell: (i) => <RelativeTime ts={i.getValue()} /> }),
];
```

---

## 5.13 — Table Cell Renderers

All reusable cell renderers live in `ui/src/components/cells/`. They accept a single value and render inline.

### `ui/src/components/cells/RelativeTime.tsx`

```tsx
import { formatDistanceToNowStrict } from "date-fns";

interface Props { ts?: string; emptyText?: string; }

export function RelativeTime({ ts, emptyText = "—" }: Props) {
  if (!ts) return <span className="text-text-tertiary">{emptyText}</span>;
  try {
    const d = new Date(ts);
    const rel = formatDistanceToNowStrict(d, { addSuffix: false });
    return (
      <span title={d.toLocaleString()} className="tabular-nums text-text-secondary">
        {rel}
      </span>
    );
  } catch {
    return <span className="text-text-tertiary">{emptyText}</span>;
  }
}
```

### `ui/src/components/cells/StatusDot.tsx`

```tsx
const STATUS_MAP: Record<string, { color: string; label: string }> = {
  // Pod phases
  Running:            { color: "bg-status-running",    label: "Running" },
  Succeeded:          { color: "bg-status-running",    label: "Succeeded" },
  Failed:             { color: "bg-status-error",      label: "Failed" },
  Pending:            { color: "bg-status-pending",    label: "Pending" },
  Unknown:            { color: "bg-status-terminated", label: "Unknown" },
  Terminating:        { color: "bg-status-terminated", label: "Terminating" },
  CrashLoopBackOff:   { color: "bg-status-error",      label: "CrashLoopBackOff" },
  // Generic ready/not-ready
  Ready:              { color: "bg-status-running",    label: "Ready" },
  NotReady:           { color: "bg-status-error",      label: "Not Ready" },
  // Deployment/StatefulSet
  Available:          { color: "bg-status-running",    label: "Available" },
  Progressing:        { color: "bg-status-pending",    label: "Progressing" },
  Degraded:           { color: "bg-status-error",      label: "Degraded" },
  // PV/PVC
  Bound:              { color: "bg-status-running",    label: "Bound" },
  Released:           { color: "bg-status-pending",    label: "Released" },
  // Namespace
  Active:             { color: "bg-status-running",    label: "Active" },
  Terminating_ns:     { color: "bg-status-terminated", label: "Terminating" },
};

export function StatusDot({ status }: { status?: string }) {
  const cfg = STATUS_MAP[status ?? ""] ?? { color: "bg-status-terminated", label: status ?? "Unknown" };
  return (
    <span title={cfg.label} className={`inline-block w-2 h-2 rounded-full ${cfg.color}`} />
  );
}
```

### `ui/src/components/cells/LabelChips.tsx`

```tsx
interface Props {
  labels: Record<string, string> | undefined;
  max?: number;
}

export function LabelChips({ labels, max = 3 }: Props) {
  if (!labels || Object.keys(labels).length === 0) {
    return <span className="text-text-tertiary text-xs">—</span>;
  }
  const entries = Object.entries(labels);
  const visible = entries.slice(0, max);
  const overflow = entries.length - max;

  return (
    <div className="flex flex-wrap gap-1">
      {visible.map(([k, v]) => (
        <span
          key={k}
          className="px-1.5 py-0.5 text-2xs rounded bg-accent/10 text-accent font-mono"
        >
          {k}={v}
        </span>
      ))}
      {overflow > 0 && (
        <span className="px-1 py-0.5 text-2xs rounded bg-bg-tertiary text-text-tertiary">
          +{overflow}
        </span>
      )}
    </div>
  );
}
```

### `ui/src/components/cells/ResourceLink.tsx`

```tsx
import { useNavigate } from "react-router-dom";

interface Props {
  kind: string;   // "Deployment", "Pod", etc.
  name: string;
  namespace?: string;
}

// Renders a clickable link that navigates to the resource list and selects the item.
export function ResourceLink({ kind, name, namespace }: Props) {
  const navigate = useNavigate();
  const path = `/resources/${kind.toLowerCase()}s`;

  return (
    <button
      className="text-accent hover:underline text-sm font-mono"
      onClick={(e) => {
        e.stopPropagation(); // don't open the row's detail panel
        navigate(path, { state: { select: name, namespace } });
      }}
    >
      {name}
    </button>
  );
}
```

### `ui/src/components/cells/MetricsBar.tsx`

```tsx
interface Props {
  used: number;    // 0-100 (percentage)
  label: string;  // "1.2 cores" or "512 MiB"
  warn?: number;  // warn threshold (default 75)
  danger?: number;// danger threshold (default 90)
}

export function MetricsBar({ used, label, warn = 75, danger = 90 }: Props) {
  const color =
    used >= danger ? "bg-status-error" :
    used >= warn   ? "bg-status-pending" :
                     "bg-status-running";

  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(used, 100)}%` }} />
      </div>
      <span className="text-xs tabular-nums text-text-secondary shrink-0">{label}</span>
    </div>
  );
}
```

---

## 5.14 — Column Customization (Show/Hide/Reorder)

Users can hide, show, and reorder columns per resource type. Preferences are persisted in localStorage.

### `ui/src/components/table/ColumnCustomizer.tsx`

```tsx
import { useState, useRef } from "react";
import { Column } from "@tanstack/react-table";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";

interface Props<T> {
  columns: Column<T, unknown>[];
  onReorder: (newOrder: string[]) => void;
}

export function ColumnCustomizer<T>({ columns, onReorder }: Props<T>) {
  const [open, setOpen] = useState(false);

  function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    const ids = columns.map((c) => c.id);
    const [moved] = ids.splice(result.source.index, 1);
    ids.splice(result.destination.index, 0, moved);
    onReorder(ids);
  }

  return (
    <div className="relative">
      <button
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-md hover:bg-bg-hover transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <SlidersIcon className="w-3.5 h-3.5" />
        Columns
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-bg-secondary border border-border rounded-lg shadow-lg z-50 py-1">
          <p className="px-3 py-2 text-xs font-semibold text-text-tertiary uppercase tracking-wider">
            Toggle Columns
          </p>
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="columns">
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps}>
                  {columns.filter((c) => c.id !== "status").map((col, idx) => (
                    <Draggable key={col.id} draggableId={col.id} index={idx}>
                      {(drag) => (
                        <div
                          ref={drag.innerRef}
                          {...drag.draggableProps}
                          className="flex items-center gap-2 px-3 py-1.5 hover:bg-bg-hover cursor-default"
                        >
                          <div {...drag.dragHandleProps} className="cursor-grab text-text-tertiary">
                            <GripVerticalIcon className="w-3.5 h-3.5" />
                          </div>
                          <label className="flex items-center gap-2 flex-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={col.getIsVisible()}
                              onChange={() => col.toggleVisibility()}
                              className="accent-accent"
                            />
                            <span className="text-sm text-text-primary">{String(col.columnDef.header)}</span>
                          </label>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
          <div className="border-t border-border mt-1 pt-1 px-3">
            <button
              className="text-xs text-text-tertiary hover:text-text-secondary py-1"
              onClick={() => columns.forEach((c) => c.toggleVisibility(true))}
            >
              Reset to defaults
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

### Column preference persistence

```ts
// ui/src/lib/columnPrefs.ts
const KEY_PREFIX = "clusterfudge:columns:";

export function loadColumnPrefs(resource: string): { visible: string[]; order: string[] } | null {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + resource);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveColumnPrefs(resource: string, visible: string[], order: string[]) {
  try {
    localStorage.setItem(KEY_PREFIX + resource, JSON.stringify({ visible, order }));
  } catch {
    // Ignore quota errors
  }
}
```

---

## 5.15 — CSV Export

Users can export the currently visible table rows (with active filters applied) to CSV.

### `ui/src/lib/csvExport.ts`

```ts
export function exportTableToCSV<T>(
  rows: T[],
  columns: Array<{ id: string; header: string; accessor: (row: T) => string }>,
  filename: string,
) {
  const header = columns.map((c) => JSON.stringify(c.header)).join(",");
  const body = rows.map((row) =>
    columns.map((c) => JSON.stringify(c.accessor(row) ?? "")).join(",")
  );
  const csv = [header, ...body].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

### CSV export button in ResourceTable header

```tsx
// In ResourceListView.tsx header, alongside ColumnCustomizer:
<button
  className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-md hover:bg-bg-hover"
  onClick={() => {
    const rows = table.getFilteredRowModel().rows.map((r) => r.original);
    exportTableToCSV(rows, csvColumns, `${resource}-${Date.now()}.csv`);
  }}
>
  <DownloadIcon className="w-3.5 h-3.5" />
  Export CSV
</button>
```

---

## 5.16 — Resource Metrics Columns

When the cluster has metrics-server installed, two additional columns appear in the Pods and Nodes tables: **CPU** and **Memory**. The columns show the `MetricsBar` cell renderer with a usage percentage.

### Backend: `GetPodMetrics(namespace) []PodUsage`

```go
// handlers/ResourceHandler.go — add method:
func (h *ResourceHandler) GetPodMetrics(namespace string) ([]k8s.PodUsage, error) {
    clients, err := h.manager.ActiveClients()
    if err != nil {
        return nil, apierrors.Wrap(err)
    }
    mc := k8s.NewMetricsClient(clients.Metrics)
    if !mc.Available() {
        return nil, nil // graceful degradation — caller checks for nil
    }
    ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
    defer cancel()
    return mc.ListPodMetrics(ctx, namespace)
}
```

### Frontend hook: `usePodMetrics`

```ts
// ui/src/hooks/usePodMetrics.ts
export function usePodMetrics(namespace: string) {
  const [metrics, setMetrics] = useState<Map<string, PodUsage>>(new Map());

  useEffect(() => {
    async function poll() {
      const result = await GetPodMetrics(namespace).catch(() => null);
      if (!result) return;
      const m = new Map(result.map((p: PodUsage) => [p.podName, p]));
      setMetrics(m);
    }

    poll();
    const id = setInterval(poll, 15_000); // poll every 15 seconds
    return () => clearInterval(id);
  }, [namespace]);

  return metrics;
}
```

### Extra columns when metrics available

```ts
// In pods columns, conditionally added when metricsAvailable:
export function podColumnsWithMetrics(metricsMap: Map<string, PodUsage>) {
  return [
    ...podColumns,
    {
      id:     "cpu",
      header: "CPU",
      size:   120,
      cell: ({ row }: any) => {
        const m = metricsMap.get(row.original.name);
        if (!m) return <span className="text-text-tertiary text-xs">—</span>;
        const pct = Math.round((m.cpuCores / row.original.allocatableCPU) * 100);
        return <MetricsBar used={pct} label={`${m.cpuCores.toFixed(2)}c`} />;
      },
    },
    {
      id:     "memory",
      header: "MEMORY",
      size:   130,
      cell: ({ row }: any) => {
        const m = metricsMap.get(row.original.name);
        if (!m) return <span className="text-text-tertiary text-xs">—</span>;
        const pct = Math.round((m.memoryMib / row.original.allocatableMemMib) * 100);
        return <MetricsBar used={pct} label={`${m.memoryMib}Mi`} />;
      },
    },
  ];
}
```

---

## 5.17 — Label / Annotation Management UI

A dedicated label editor for adding, editing, and removing labels or annotations on any resource.

### `ui/src/components/LabelEditor.tsx`

```tsx
interface LabelEditorProps {
  labels: Record<string, string>;
  onChange: (updated: Record<string, string>) => void;
  readOnly?: boolean;
}

export function LabelEditor({ labels, onChange, readOnly }: LabelEditorProps) {
  const [editing, setEditing] = useState<{ key: string; value: string } | null>(null);
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");

  function handleAdd() {
    if (!newKey.trim()) return;
    onChange({ ...labels, [newKey.trim()]: newVal.trim() });
    setNewKey("");
    setNewVal("");
  }

  function handleDelete(key: string) {
    const next = { ...labels };
    delete next[key];
    onChange(next);
  }

  function handleEdit(key: string, value: string) {
    const next = { ...labels };
    delete next[editing!.key]; // remove old key in case it was renamed
    next[key] = value;
    onChange(next);
    setEditing(null);
  }

  return (
    <div className="space-y-1">
      {Object.entries(labels).map(([k, v]) => (
        <div key={k} className="flex items-center gap-2 group">
          {editing?.key === k ? (
            <>
              <input
                autoFocus
                defaultValue={k}
                onBlur={(e) => handleEdit(e.target.value, editing.value)}
                className="px-2 py-0.5 text-xs font-mono border border-accent rounded bg-bg-tertiary"
              />
              <span>=</span>
              <input
                defaultValue={v}
                onChange={(e) => setEditing({ key: k, value: e.target.value })}
                onBlur={(e) => handleEdit(k, e.target.value)}
                className="px-2 py-0.5 text-xs font-mono border border-border rounded bg-bg-tertiary flex-1"
              />
            </>
          ) : (
            <>
              <span className="px-1.5 py-0.5 text-2xs rounded bg-accent/10 text-accent font-mono">
                {k}={v}
              </span>
              {!readOnly && (
                <div className="hidden group-hover:flex items-center gap-1">
                  <button
                    className="text-text-tertiary hover:text-text-primary"
                    onClick={() => setEditing({ key: k, value: v })}
                  >
                    <PencilIcon className="w-3 h-3" />
                  </button>
                  <button
                    className="text-text-tertiary hover:text-status-error"
                    onClick={() => handleDelete(k)}
                  >
                    <XIcon className="w-3 h-3" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      ))}

      {!readOnly && (
        <div className="flex items-center gap-1 mt-2">
          <input
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="key"
            className="px-2 py-0.5 text-xs font-mono border border-border rounded bg-bg-tertiary w-28"
          />
          <span className="text-text-tertiary text-xs">=</span>
          <input
            value={newVal}
            onChange={(e) => setNewVal(e.target.value)}
            placeholder="value"
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="px-2 py-0.5 text-xs font-mono border border-border rounded bg-bg-tertiary w-28"
          />
          <button
            onClick={handleAdd}
            className="px-2 py-0.5 text-xs bg-accent/10 text-accent rounded hover:bg-accent/20"
          >
            + Add
          </button>
        </div>
      )}
    </div>
  );
}
```

### Backend: `PatchLabels`

```go
// handlers/ResourceHandler.go
func (h *ResourceHandler) PatchLabels(
    query resource.ResourceQuery,
    labels map[string]interface{},
) error {
    clients, err := h.manager.ActiveClients()
    if err != nil {
        return apierrors.Wrap(err)
    }
    patch := map[string]interface{}{
        "metadata": map[string]interface{}{"labels": labels},
    }
    data, err := json.Marshal(patch)
    if err != nil {
        return apierrors.Wrap(err)
    }
    svc := resource.NewService()
    return apierrors.Wrap(svc.Patch(
        context.Background(), clients.Dynamic, query,
        types.MergePatchType, data,
    ))
}
```

---

## 5.18 — Batch Operations

Multi-select rows and apply an operation (delete, label, annotate) to all selected resources at once.

### Multi-select state

```ts
// ui/src/hooks/useSelection.ts
export function useSelection<T extends { name: string; namespace?: string }>() {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleOne = useCallback((item: T) => {
    const key = `${item.namespace}/${item.name}`;
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  const toggleAll = useCallback((items: T[]) => {
    setSelected((prev) => {
      if (prev.size === items.length) return new Set();
      return new Set(items.map((i) => `${i.namespace}/${i.name}`));
    });
  }, []);

  const isSelected = useCallback(
    (item: T) => selected.has(`${item.namespace}/${item.name}`),
    [selected],
  );

  const clear = useCallback(() => setSelected(new Set()), []);

  return { selected, toggleOne, toggleAll, isSelected, clear, count: selected.size };
}
```

### Batch action bar

```tsx
// Appears above the table when 1+ rows are selected:
function BatchActionBar({ count, onDelete, onLabel, onClear }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-accent/10 border-b border-accent/30">
      <span className="text-sm font-medium text-accent">{count} selected</span>
      <div className="flex items-center gap-2 ml-auto">
        <button
          onClick={onLabel}
          className="flex items-center gap-1 px-3 py-1.5 text-sm border border-border rounded hover:bg-bg-hover"
        >
          <TagIcon className="w-3.5 h-3.5" /> Label
        </button>
        <button
          onClick={onDelete}
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-status-error/10 text-status-error border border-status-error/30 rounded hover:bg-status-error/20"
        >
          <TrashIcon className="w-3.5 h-3.5" /> Delete {count}
        </button>
        <button onClick={onClear} className="text-sm text-text-tertiary hover:text-text-secondary">
          Cancel
        </button>
      </div>
    </div>
  );
}
```

### Backend: `BatchDelete`

```go
// handlers/ResourceHandler.go
func (h *ResourceHandler) BatchDelete(queries []resource.ResourceQuery) []error {
    clients, err := h.manager.ActiveClients()
    if err != nil {
        return []error{apierrors.Wrap(err)}
    }
    svc := resource.NewService()
    errs := make([]error, 0)
    for _, q := range queries {
        if err := svc.Delete(context.Background(), clients.Dynamic, q); err != nil {
            errs = append(errs, apierrors.Wrap(err))
        }
    }
    return errs
}
```

---

## 5.19 — Resource Comparison View

Side-by-side YAML diff of two resources (e.g., two deployments in different namespaces, or a deployment before/after an edit).

### `ui/src/components/ResourceDiff.tsx`

```tsx
import { DiffEditor } from "@monaco-editor/react";

interface ResourceDiffProps {
  original: string; // YAML of first resource
  modified: string; // YAML of second resource
  leftLabel?: string;
  rightLabel?: string;
}

export function ResourceDiff({ original, modified, leftLabel = "Before", rightLabel = "After" }: ResourceDiffProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Labels */}
      <div className="flex border-b border-border">
        <div className="flex-1 px-4 py-2 text-xs font-semibold text-text-secondary border-r border-border">
          {leftLabel}
        </div>
        <div className="flex-1 px-4 py-2 text-xs font-semibold text-text-secondary">
          {rightLabel}
        </div>
      </div>
      <DiffEditor
        original={original}
        modified={modified}
        language="yaml"
        theme="clusterfudge-dark"
        options={{
          readOnly: true,
          renderSideBySide: true,
          minimap: { enabled: false },
          lineNumbers: "on",
          scrollBeyondLastLine: false,
          fontSize: 12,
        }}
      />
    </div>
  );
}
```

### Triggering the diff view

The diff view is opened from the detail panel overflow menu:
1. Right-click a row → "Compare with…"
2. A resource picker dialog opens to select the second resource
3. The comparison view replaces the detail panel content

---

## 5.20 — Resource Creation Wizard

A guided form for creating common Kubernetes resources without writing YAML by hand.

### `ui/src/components/CreateResourceWizard.tsx`

```tsx
// Resource templates for the wizard. Each entry provides
// a display name, category, and a function that returns
// the initial YAML template string.

export const RESOURCE_TEMPLATES = [
  {
    kind: "Deployment",
    category: "Workloads",
    description: "Manages a set of identical pods",
    template: (name: string, namespace: string) => `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${name}
  namespace: ${namespace}
  labels:
    app: ${name}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ${name}
  template:
    metadata:
      labels:
        app: ${name}
    spec:
      containers:
        - name: ${name}
          image: nginx:latest
          ports:
            - containerPort: 80
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 500m
              memory: 512Mi
`.trim(),
  },
  {
    kind: "ConfigMap",
    category: "Config",
    description: "Key-value configuration data",
    template: (name: string, namespace: string) => `
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${name}
  namespace: ${namespace}
data:
  key: value
`.trim(),
  },
  {
    kind: "Service",
    category: "Networking",
    description: "Expose pods via a stable network endpoint",
    template: (name: string, namespace: string) => `
apiVersion: v1
kind: Service
metadata:
  name: ${name}
  namespace: ${namespace}
spec:
  selector:
    app: ${name}
  ports:
    - port: 80
      targetPort: 80
  type: ClusterIP
`.trim(),
  },
  {
    kind: "CronJob",
    category: "Workloads",
    description: "Schedule recurring batch jobs",
    template: (name: string, namespace: string) => `
apiVersion: batch/v1
kind: CronJob
metadata:
  name: ${name}
  namespace: ${namespace}
spec:
  schedule: "0 * * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: ${name}
              image: busybox:latest
              command: ["/bin/sh", "-c", "echo hello"]
          restartPolicy: OnFailure
`.trim(),
  },
];

// The wizard flow:
// 1. User picks a resource template from a grid (similar to GitHub new-repo)
// 2. User fills in name + namespace + optional quick-fill form fields
// 3. Preview panel shows the rendered YAML, editable in Monaco
// 4. "Create" button calls ApplyResource with the final YAML

export function CreateResourceWizard({ namespace, onClose, onCreate }) {
  const [step, setStep] = useState<"pick" | "fill" | "preview">("pick");
  const [template, setTemplate] = useState<(typeof RESOURCE_TEMPLATES)[0] | null>(null);
  const [name, setName] = useState("");
  const [yaml, setYaml] = useState("");

  function handlePickTemplate(t: typeof RESOURCE_TEMPLATES[0]) {
    setTemplate(t);
    setStep("fill");
  }

  function handleFill() {
    if (!template || !name) return;
    setYaml(template.template(name, namespace));
    setStep("preview");
  }

  async function handleCreate() {
    try {
      await ApplyResource({ yaml });
      onCreate?.();
      onClose();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to create resource");
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl h-[600px] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {step === "pick" && "Create Resource"}
            {step === "fill" && `Create ${template?.kind}`}
            {step === "preview" && "Review YAML"}
          </DialogTitle>
        </DialogHeader>

        {step === "pick" && (
          <div className="grid grid-cols-2 gap-3 flex-1 overflow-auto p-1">
            {RESOURCE_TEMPLATES.map((t) => (
              <button
                key={t.kind}
                onClick={() => handlePickTemplate(t)}
                className="flex flex-col items-start p-4 border border-border rounded-lg hover:border-accent hover:bg-accent/5 transition-colors text-left"
              >
                <span className="text-xs text-text-tertiary mb-1">{t.category}</span>
                <span className="font-semibold text-text-primary">{t.kind}</span>
                <span className="text-xs text-text-secondary mt-1">{t.description}</span>
              </button>
            ))}
          </div>
        )}

        {step === "fill" && template && (
          <div className="flex flex-col gap-4 flex-1 p-1">
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-primary">Name</label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`my-${template.kind.toLowerCase()}`}
                className="w-full px-3 py-2 text-sm border border-border rounded-md bg-bg-tertiary text-text-primary"
              />
            </div>
            <div className="flex justify-between pt-4">
              <button onClick={() => setStep("pick")} className="text-sm text-text-tertiary hover:text-text-secondary">
                ← Back
              </button>
              <button
                onClick={handleFill}
                disabled={!name}
                className="px-4 py-2 text-sm bg-accent text-white rounded-md hover:bg-accent/90 disabled:opacity-50"
              >
                Preview YAML →
              </button>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="flex flex-col flex-1 gap-3 min-h-0">
            <div className="flex-1 border border-border rounded-md overflow-hidden">
              <MonacoEditor
                value={yaml}
                language="yaml"
                theme="clusterfudge-dark"
                onChange={(v) => setYaml(v ?? "")}
                options={{ minimap: { enabled: false }, fontSize: 12, lineNumbers: "on" }}
              />
            </div>
            <div className="flex justify-between">
              <button onClick={() => setStep("fill")} className="text-sm text-text-tertiary hover:text-text-secondary">
                ← Back
              </button>
              <button
                onClick={handleCreate}
                className="px-4 py-2 text-sm bg-accent text-white rounded-md hover:bg-accent/90"
              >
                Create {template?.kind}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

---

## 5.21 — Resource Summary Bar (Lens-Style)

A Lens-inspired summary line at the top of each resource list view. Shows quick aggregate counts/states without opening any detail panel.

### Summary bar by resource type

```tsx
// ui/src/components/ResourceSummaryBar.tsx

function PodSummaryBar({ pods }: { pods: any[] }) {
  const running  = pods.filter((p) => p.phase === "Running").length;
  const failed   = pods.filter((p) => p.phase === "Failed" || p.status === "CrashLoopBackOff").length;
  const pending  = pods.filter((p) => p.phase === "Pending").length;
  const total    = pods.length;

  return (
    <SummaryBar items={[
      { label: "Running",   value: running,       color: "text-status-running",    show: running > 0 },
      { label: "Pending",   value: pending,       color: "text-status-pending",    show: pending > 0 },
      { label: "Failed",    value: failed,        color: "text-status-error",      show: failed > 0 },
      { label: "Total",     value: total,         color: "text-text-secondary",    show: true },
    ]} />
  );
}

function DeploymentSummaryBar({ deployments }: { deployments: any[] }) {
  const ready    = deployments.filter((d) => d.readyReplicas === d.replicas).length;
  const degraded = deployments.filter((d) => (d.readyReplicas ?? 0) < (d.replicas ?? 0)).length;
  return (
    <SummaryBar items={[
      { label: "Ready",    value: ready,    color: "text-status-running", show: true },
      { label: "Degraded", value: degraded, color: "text-status-error",   show: degraded > 0 },
      { label: "Total",    value: deployments.length, color: "text-text-secondary", show: true },
    ]} />
  );
}

function NodeSummaryBar({ nodes }: { nodes: any[] }) {
  const ready  = nodes.filter((n) => n.status === "Ready").length;
  const cordoned = nodes.filter((n) => n.unschedulable).length;
  return (
    <SummaryBar items={[
      { label: "Ready",    value: ready,    color: "text-status-running", show: true },
      { label: "Cordoned", value: cordoned, color: "text-status-pending", show: cordoned > 0 },
      { label: "Total",    value: nodes.length, color: "text-text-secondary", show: true },
    ]} />
  );
}

// Generic SummaryBar renders a horizontal list of colored chips.
interface SummaryItem {
  label: string;
  value: number;
  color: string;
  show: boolean;
}
function SummaryBar({ items }: { items: SummaryItem[] }) {
  return (
    <div className="flex items-center gap-3 px-4 py-1.5 border-b border-border bg-bg-secondary">
      {items.filter((i) => i.show).map((item) => (
        <span key={item.label} className={`text-xs tabular-nums ${item.color}`}>
          <span className="font-semibold">{item.value}</span>
          <span className="ml-1 text-text-tertiary">{item.label}</span>
        </span>
      ))}
    </div>
  );
}

// Map resource type to its summary bar component:
export const SUMMARY_BAR_MAP: Record<string, React.FC<{ data: any[] }>> = {
  pods:        ({ data }) => <PodSummaryBar pods={data} />,
  deployments: ({ data }) => <DeploymentSummaryBar deployments={data} />,
  nodes:       ({ data }) => <NodeSummaryBar nodes={data} />,
  // For types without a custom bar, the default is just a count:
};
```

---

## 5.22 — Complete Detail Panel Layouts

Each resource type renders a tailored overview in the detail panel. Detail panel tabs: **Overview** | **Events** | **YAML** | (type-specific: Logs, Exec, etc.)

### `ui/src/components/detail/PodDetailOverview.tsx`

```tsx
export function PodDetailOverview({ pod }: { pod: PodInfo }) {
  return (
    <div className="space-y-6 p-4 text-sm overflow-auto">
      {/* Status summary */}
      <Section title="Status">
        <Field label="Phase"    value={<StatusBadge status={pod.phase} />} />
        <Field label="Node"     value={<ResourceLink kind="Node" name={pod.nodeName} />} />
        <Field label="Pod IP"   value={pod.podIP} />
        <Field label="Host IP"  value={pod.hostIP} />
        <Field label="QoS"      value={pod.qosClass} />
        <Field label="Started"  value={<RelativeTime ts={pod.startTime} />} />
      </Section>

      {/* Containers */}
      <Section title={`Containers (${pod.containers.length})`}>
        {pod.containers.map((c) => (
          <div key={c.name} className="rounded-md border border-border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono font-medium">{c.name}</span>
              <StatusBadge status={c.state} />
            </div>
            <Field label="Image"    value={c.image} mono />
            <Field label="Restarts" value={String(c.restartCount)}
              valueClass={c.restartCount > 0 ? "text-status-error" : undefined} />
            {c.ports?.length > 0 && (
              <Field label="Ports" value={c.ports.map((p) => `${p.containerPort}/${p.protocol}`).join(", ")} />
            )}
            {c.resources && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-text-tertiary">CPU req/lim</span>
                  <span className="ml-2 font-mono">{c.resources.requestsCPU}/{c.resources.limitsCPU}</span>
                </div>
                <div>
                  <span className="text-text-tertiary">MEM req/lim</span>
                  <span className="ml-2 font-mono">{c.resources.requestsMemory}/{c.resources.limitsMemory}</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </Section>

      {/* Conditions */}
      {pod.conditions?.length > 0 && (
        <Section title="Conditions">
          {pod.conditions.map((c) => (
            <div key={c.type} className="flex items-center gap-2">
              <span className={c.status === "True" ? "text-status-running" : "text-status-error"}>
                {c.status === "True" ? "✓" : "✗"}
              </span>
              <span className="font-mono">{c.type}</span>
              {c.message && <span className="text-text-tertiary text-xs">{c.message}</span>}
            </div>
          ))}
        </Section>
      )}

      {/* Labels & Annotations */}
      <Section title="Labels">
        <LabelChips labels={pod.labels} max={20} />
      </Section>
      {Object.keys(pod.annotations ?? {}).length > 0 && (
        <Section title="Annotations">
          <LabelChips labels={pod.annotations} max={20} />
        </Section>
      )}

      {/* Volumes */}
      {pod.volumes?.length > 0 && (
        <Section title={`Volumes (${pod.volumes.length})`}>
          {pod.volumes.map((v) => (
            <Field key={v.name} label={v.name} value={v.type} />
          ))}
        </Section>
      )}
    </div>
  );
}
```

### `ui/src/components/detail/DeploymentDetailOverview.tsx`

```tsx
export function DeploymentDetailOverview({ dep }: { dep: DeploymentInfo }) {
  return (
    <div className="space-y-6 p-4 text-sm overflow-auto">
      <Section title="Replicas">
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Desired",   value: dep.replicas },
            { label: "Ready",     value: dep.readyReplicas },
            { label: "Up-to-date",value: dep.updatedReplicas },
            { label: "Available", value: dep.availableReplicas },
          ].map((item) => (
            <div key={item.label} className="text-center p-2 rounded-lg bg-bg-tertiary">
              <div className="text-lg font-semibold tabular-nums">{item.value ?? 0}</div>
              <div className="text-2xs text-text-tertiary">{item.label}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Strategy">
        <Field label="Type" value={dep.strategy} />
        {dep.maxSurge       && <Field label="Max Surge"       value={dep.maxSurge} />}
        {dep.maxUnavailable && <Field label="Max Unavailable" value={dep.maxUnavailable} />}
      </Section>

      <Section title="Selector">
        <LabelChips labels={dep.selector} max={10} />
      </Section>

      {dep.conditions?.length > 0 && (
        <Section title="Conditions">
          {dep.conditions.map((c) => (
            <div key={c.type} className="text-xs space-y-0.5">
              <div className="flex items-center gap-2">
                <span className={c.status === "True" ? "text-status-running" : "text-status-error"}>
                  {c.status === "True" ? "✓" : "✗"}
                </span>
                <span className="font-mono font-medium">{c.type}</span>
              </div>
              {c.message && <p className="pl-4 text-text-tertiary">{c.message}</p>}
            </div>
          ))}
        </Section>
      )}

      <Section title="Labels">
        <LabelChips labels={dep.labels} max={20} />
      </Section>
    </div>
  );
}
```

### `ui/src/components/detail/NodeDetailOverview.tsx`

```tsx
export function NodeDetailOverview({ node }: { node: NodeInfo }) {
  return (
    <div className="space-y-6 p-4 text-sm overflow-auto">
      <Section title="Status">
        <Field label="Status"    value={<StatusBadge status={node.status} />} />
        <Field label="Roles"     value={node.roles.join(", ") || "worker"} />
        <Field label="Addresses" value={node.addresses.map((a) => `${a.type}: ${a.address}`).join("\n")} />
        {node.unschedulable && (
          <div className="px-2 py-1 bg-status-pending/10 text-status-pending text-xs rounded">
            ⚠ Node is cordoned (unschedulable)
          </div>
        )}
      </Section>

      <Section title="Capacity vs Allocatable">
        <div className="grid grid-cols-2 gap-2 text-xs">
          {[
            { res: "CPU",    cap: node.capacity.cpu,    alloc: node.allocatable.cpu },
            { res: "Memory", cap: node.capacity.memory, alloc: node.allocatable.memory },
            { res: "Pods",   cap: node.capacity.pods,   alloc: node.allocatable.pods },
          ].map(({ res, cap, alloc }) => (
            <div key={res} className="col-span-2 flex items-center gap-4">
              <span className="text-text-tertiary w-16">{res}</span>
              <span className="font-mono">{alloc}</span>
              <span className="text-text-tertiary">/ {cap}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="System Info">
        <Field label="OS"               value={`${node.systemInfo.osImage} (${node.systemInfo.operatingSystem})`} />
        <Field label="Architecture"     value={node.systemInfo.architecture} />
        <Field label="Kernel"           value={node.systemInfo.kernelVersion} />
        <Field label="Container Runtime"value={node.systemInfo.containerRuntimeVersion} />
        <Field label="Kubelet"          value={node.systemInfo.kubeletVersion} />
      </Section>

      {node.taints?.length > 0 && (
        <Section title={`Taints (${node.taints.length})`}>
          {node.taints.map((t, i) => (
            <div key={i} className="font-mono text-xs">
              {t.key}{t.value ? `=${t.value}` : ""}:{t.effect}
            </div>
          ))}
        </Section>
      )}

      <Section title="Labels">
        <LabelChips labels={node.labels} max={20} />
      </Section>
    </div>
  );
}
```

### Shared detail panel helpers

```tsx
// ui/src/components/detail/helpers.tsx

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">{title}</h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

export function Field({
  label,
  value,
  mono,
  valueClass,
}: {
  label: string;
  value?: React.ReactNode;
  mono?: boolean;
  valueClass?: string;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3">
      <span className="text-text-tertiary shrink-0 w-28 pt-0.5">{label}</span>
      <span className={cn("text-text-primary break-all", mono && "font-mono text-xs", valueClass)}>
        {value}
      </span>
    </div>
  );
}
```

---

## 5.23 — Resource Relationships in Detail Panel

The **Relationships** tab in the detail panel shows connected resources with clickable links.

### Pod relationships

```tsx
function PodRelationships({ pod }: { pod: PodInfo }) {
  const { data: ownership } = useQuery(["pod-owner", pod.namespace, pod.name], () =>
    GetPodOwnership({ namespace: pod.namespace, name: pod.name })
  );

  return (
    <div className="p-4 space-y-4 text-sm">
      {ownership?.rootOwner && (
        <Section title="Owned By">
          <ResourceLink kind={ownership.rootOwner.kind} name={ownership.rootOwner.name} />
          {ownership.owner && ownership.owner.kind !== ownership.rootOwner.kind && (
            <div className="ml-4 text-text-tertiary text-xs">
              via <ResourceLink kind={ownership.owner.kind} name={ownership.owner.name} />
            </div>
          )}
        </Section>
      )}
    </div>
  );
}
```

### Service relationships

```tsx
function ServiceRelationships({ service }: { service: ServiceInfo }) {
  const { data: pods } = useQuery(["service-pods", service.namespace, service.name], () =>
    GetServiceEndpointPods({ namespace: service.namespace, name: service.name })
  );

  return (
    <div className="p-4 space-y-4 text-sm">
      <Section title={`Backing Pods (${pods?.length ?? 0})`}>
        {pods?.map((p: any) => (
          <div key={p.name} className="flex items-center gap-2">
            <StatusDot status={p.phase} />
            <ResourceLink kind="Pod" name={p.name} namespace={service.namespace} />
            <span className="text-text-tertiary text-xs">{p.podIP}</span>
          </div>
        ))}
        {pods?.length === 0 && <span className="text-text-tertiary">No matching pods</span>}
      </Section>
    </div>
  );
}
```

### Node relationships

```tsx
function NodeRelationships({ node }: { node: NodeInfo }) {
  const { data: pods } = useQuery(["node-pods", node.name], () =>
    ListResources({
      group: "", version: "v1", resource: "pods", namespace: "",
      // field selector is applied server-side
    }).then((all) => all.filter((p: any) => p.nodeName === node.name))
  );

  return (
    <div className="p-4 space-y-4 text-sm">
      <Section title={`Pods (${pods?.length ?? 0})`}>
        {pods?.slice(0, 20).map((p: any) => (
          <div key={`${p.namespace}/${p.name}`} className="flex items-center gap-2">
            <StatusDot status={p.phase} />
            <span className="text-text-tertiary text-xs">{p.namespace}/</span>
            <ResourceLink kind="Pod" name={p.name} namespace={p.namespace} />
          </div>
        ))}
        {(pods?.length ?? 0) > 20 && (
          <p className="text-text-tertiary text-xs">… and {pods!.length - 20} more</p>
        )}
      </Section>
    </div>
  );
}
```

---

## 5.24 — Updated Acceptance Criteria

- [ ] Column definitions exist for all 27 resource types listed in §5.12
- [ ] StatusDot renders correctly for Running/Pending/Failed/Unknown/Bound/etc.
- [ ] RelativeTime renders human-readable age with full timestamp tooltip
- [ ] LabelChips truncates to 3 with overflow badge and renders all on expand
- [ ] ResourceLink navigates to the correct resource list on click
- [ ] MetricsBar shows colored bar with usage % and formatted label text
- [ ] ColumnCustomizer toggle persists per-resource preferences to localStorage
- [ ] Drag-to-reorder columns works and persists
- [ ] CSV export downloads a valid file with headers and all visible rows
- [ ] Metrics columns appear in pod/node tables when metrics-server is installed
- [ ] Metrics columns show "—" gracefully when metrics-server is absent
- [ ] LabelEditor add/edit/delete labels via inline UI
- [ ] PatchLabels backend updates resource labels via merge patch
- [ ] Multi-select checkbox selects rows; BatchActionBar appears with count
- [ ] BatchDelete calls backend for each selected resource and removes rows
- [ ] ResourceDiff renders a side-by-side Monaco diff for two YAML strings
- [ ] CreateResourceWizard template picker shows all 4 resource types
- [ ] Creation wizard preview step renders valid YAML in Monaco
- [ ] ApplyResource is called on wizard Create click; success closes dialog
- [ ] SummaryBar shows pod counts (running/pending/failed) above Pods table
- [ ] SummaryBar shows deployment counts (ready/degraded) above Deployments table
- [ ] PodDetailOverview renders all container cards with image, state, restarts, resources
- [ ] PodDetailOverview shows conditions, labels, volumes sections
- [ ] DeploymentDetailOverview shows 4-column replica grid and strategy details
- [ ] NodeDetailOverview shows capacity vs allocatable, system info, taints
- [ ] Relationships tab for pods shows owning Deployment/ReplicaSet chain
- [ ] Relationships tab for services shows backing pods with status and IP
- [ ] Relationships tab for nodes shows pods scheduled on the node
