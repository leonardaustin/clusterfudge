# Phase 4 — Frontend Shell & Navigation (Linear-Inspired)

## Goal

A fully interactive app shell with Linear-quality navigation: collapsible sidebar, command palette (Cmd+K), keyboard shortcuts, namespace filtering, cluster switching, and smooth transitions. Every view routes correctly, even if view content is still placeholder.

Target audience: mid-level React/TypeScript engineer. All code is complete and copy-pasteable.

---

## 4.1 — Routing Architecture

### Route Structure

```
/                                    → Redirect to /overview (or /welcome if no cluster)
/welcome                             → Welcome / connect cluster screen
/overview                            → Cluster overview dashboard
/workloads/pods                      → Pod list
/workloads/pods/:namespace/:name     → Pod detail
/workloads/deployments               → Deployment list
/workloads/deployments/:namespace/:name → Deployment detail
/workloads/statefulsets              → StatefulSet list
/workloads/statefulsets/:namespace/:name → StatefulSet detail
/workloads/daemonsets                → DaemonSet list
/workloads/daemonsets/:namespace/:name → DaemonSet detail
/workloads/replicasets               → ReplicaSet list
/workloads/replicasets/:namespace/:name → ReplicaSet detail
/workloads/jobs                      → Job list
/workloads/jobs/:namespace/:name     → Job detail
/workloads/cronjobs                  → CronJob list
/workloads/cronjobs/:namespace/:name → CronJob detail
/networking/services                 → Service list
/networking/services/:namespace/:name → Service detail
/networking/ingresses                → Ingress list
/networking/ingresses/:namespace/:name → Ingress detail
/networking/endpoints                → Endpoint list
/networking/networkpolicies          → NetworkPolicy list
/config/configmaps                   → ConfigMap list
/config/configmaps/:namespace/:name  → ConfigMap detail
/config/secrets                      → Secret list
/config/secrets/:namespace/:name     → Secret detail (redacted values)
/config/resourcequotas               → ResourceQuota list
/config/limitranges                  → LimitRange list
/config/hpas                         → HPA list
/config/pdbs                         → PodDisruptionBudget list
/storage/pvcs                        → PersistentVolumeClaim list
/storage/pvcs/:namespace/:name       → PVC detail
/storage/pvs                         → PersistentVolume list
/storage/pvs/:name                   → PV detail
/storage/storageclasses              → StorageClass list
/rbac/serviceaccounts                → ServiceAccount list
/rbac/roles                          → Role list
/rbac/clusterroles                   → ClusterRole list
/rbac/rolebindings                   → RoleBinding list
/rbac/clusterrolebindings            → ClusterRoleBinding list
/cluster/nodes                       → Node list
/cluster/nodes/:name                 → Node detail
/cluster/namespaces                  → Namespace list
/cluster/events                      → Cluster events
/cluster/priorityclasses             → PriorityClass list
/helm/releases                       → Helm releases
/helm/releases/:namespace/:name      → Helm release detail
/custom/:group/:resource             → Custom resource list (dynamic)
/custom/:group/:resource/:namespace/:name → Custom resource detail
/settings                            → App settings
/settings/clusters                   → Cluster management
/settings/appearance                 → Theme & appearance
/settings/shortcuts                  → Keyboard shortcut reference
/*                                   → 404 Not Found
```

### Implementation: Hash Routing with Lazy Loading

Wails serves the frontend from `embed.FS`, which doesn't support server-side routing. Use `HashRouter`. Heavy views are lazy-loaded to keep initial bundle small.

```tsx
// src/App.tsx
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import { AppShell } from "./layouts/AppShell";
import { ViewSkeleton } from "./components/skeletons/ViewSkeleton";
import { NotFound } from "./views/NotFound";
import { Welcome } from "./views/Welcome";
import { useClusterStore } from "./stores/clusterStore";

// Eagerly loaded (critical path)
import { ClusterOverview } from "./views/ClusterOverview";

// Lazy loaded heavy views
const PodList        = lazy(() => import("./views/workloads/PodList"));
const PodDetail      = lazy(() => import("./views/workloads/PodDetail"));
const DeploymentList = lazy(() => import("./views/workloads/DeploymentList"));
const DeploymentDetail = lazy(() => import("./views/workloads/DeploymentDetail"));
const StatefulSetList = lazy(() => import("./views/workloads/StatefulSetList"));
const DaemonSetList  = lazy(() => import("./views/workloads/DaemonSetList"));
const ReplicaSetList = lazy(() => import("./views/workloads/ReplicaSetList"));
const JobList        = lazy(() => import("./views/workloads/JobList"));
const CronJobList    = lazy(() => import("./views/workloads/CronJobList"));

const ServiceList    = lazy(() => import("./views/networking/ServiceList"));
const IngressList    = lazy(() => import("./views/networking/IngressList"));
const EndpointList   = lazy(() => import("./views/networking/EndpointList"));
const NetworkPolicyList = lazy(() => import("./views/networking/NetworkPolicyList"));

const ConfigMapList  = lazy(() => import("./views/config/ConfigMapList"));
const SecretList     = lazy(() => import("./views/config/SecretList"));
const ResourceQuotaList = lazy(() => import("./views/config/ResourceQuotaList"));
const LimitRangeList = lazy(() => import("./views/config/LimitRangeList"));
const HPAList        = lazy(() => import("./views/config/HPAList"));
const PDBList        = lazy(() => import("./views/config/PDBList"));

const PVCList        = lazy(() => import("./views/storage/PVCList"));
const PVList         = lazy(() => import("./views/storage/PVList"));
const StorageClassList = lazy(() => import("./views/storage/StorageClassList"));

const ServiceAccountList = lazy(() => import("./views/rbac/ServiceAccountList"));
const RoleList       = lazy(() => import("./views/rbac/RoleList"));
const ClusterRoleList = lazy(() => import("./views/rbac/ClusterRoleList"));
const RoleBindingList = lazy(() => import("./views/rbac/RoleBindingList"));
const ClusterRoleBindingList = lazy(() => import("./views/rbac/ClusterRoleBindingList"));

const NodeList       = lazy(() => import("./views/cluster/NodeList"));
const NodeDetail     = lazy(() => import("./views/cluster/NodeDetail"));
const NamespaceList  = lazy(() => import("./views/cluster/NamespaceList"));
const EventList      = lazy(() => import("./views/cluster/EventList"));
const PriorityClassList = lazy(() => import("./views/cluster/PriorityClassList"));

const HelmReleaseList   = lazy(() => import("./views/helm/HelmReleaseList"));
const HelmReleaseDetail = lazy(() => import("./views/helm/HelmReleaseDetail"));

const CustomResourceList   = lazy(() => import("./views/custom/CustomResourceList"));
const CustomResourceDetail = lazy(() => import("./views/custom/CustomResourceDetail"));

const Settings       = lazy(() => import("./views/settings/Settings"));

// Route guard: redirect to /welcome if no cluster is connected
function RequireCluster({ children }: { children: React.ReactNode }) {
  const activeCluster = useClusterStore((s) => s.activeCluster);
  if (!activeCluster) {
    return <Navigate to="/welcome" replace />;
  }
  return <>{children}</>;
}

function LazyView({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ViewSkeleton />}>
      {children}
    </Suspense>
  );
}

export function App() {
  return (
    <HashRouter>
      <Routes>
        {/* Welcome screen — no shell */}
        <Route path="/welcome" element={<Welcome />} />

        {/* App shell wraps all authenticated routes */}
        <Route
          path="/*"
          element={
            <RequireCluster>
              <AppShell />
            </RequireCluster>
          }
        >
          <Route index element={<Navigate to="/overview" replace />} />
          <Route path="overview" element={<ClusterOverview />} />

          {/* Workloads */}
          <Route path="workloads/pods" element={<LazyView><PodList /></LazyView>} />
          <Route path="workloads/pods/:namespace/:name" element={<LazyView><PodDetail /></LazyView>} />
          <Route path="workloads/deployments" element={<LazyView><DeploymentList /></LazyView>} />
          <Route path="workloads/deployments/:namespace/:name" element={<LazyView><DeploymentDetail /></LazyView>} />
          <Route path="workloads/statefulsets" element={<LazyView><StatefulSetList /></LazyView>} />
          <Route path="workloads/daemonsets" element={<LazyView><DaemonSetList /></LazyView>} />
          <Route path="workloads/replicasets" element={<LazyView><ReplicaSetList /></LazyView>} />
          <Route path="workloads/jobs" element={<LazyView><JobList /></LazyView>} />
          <Route path="workloads/cronjobs" element={<LazyView><CronJobList /></LazyView>} />

          {/* Networking */}
          <Route path="networking/services" element={<LazyView><ServiceList /></LazyView>} />
          <Route path="networking/services/:namespace/:name" element={<LazyView><ServiceList /></LazyView>} />
          <Route path="networking/ingresses" element={<LazyView><IngressList /></LazyView>} />
          <Route path="networking/endpoints" element={<LazyView><EndpointList /></LazyView>} />
          <Route path="networking/networkpolicies" element={<LazyView><NetworkPolicyList /></LazyView>} />

          {/* Config */}
          <Route path="config/configmaps" element={<LazyView><ConfigMapList /></LazyView>} />
          <Route path="config/configmaps/:namespace/:name" element={<LazyView><ConfigMapList /></LazyView>} />
          <Route path="config/secrets" element={<LazyView><SecretList /></LazyView>} />
          <Route path="config/resourcequotas" element={<LazyView><ResourceQuotaList /></LazyView>} />
          <Route path="config/limitranges" element={<LazyView><LimitRangeList /></LazyView>} />
          <Route path="config/hpas" element={<LazyView><HPAList /></LazyView>} />
          <Route path="config/pdbs" element={<LazyView><PDBList /></LazyView>} />

          {/* Storage */}
          <Route path="storage/pvcs" element={<LazyView><PVCList /></LazyView>} />
          <Route path="storage/pvs" element={<LazyView><PVList /></LazyView>} />
          <Route path="storage/storageclasses" element={<LazyView><StorageClassList /></LazyView>} />

          {/* RBAC */}
          <Route path="rbac/serviceaccounts" element={<LazyView><ServiceAccountList /></LazyView>} />
          <Route path="rbac/roles" element={<LazyView><RoleList /></LazyView>} />
          <Route path="rbac/clusterroles" element={<LazyView><ClusterRoleList /></LazyView>} />
          <Route path="rbac/rolebindings" element={<LazyView><RoleBindingList /></LazyView>} />
          <Route path="rbac/clusterrolebindings" element={<LazyView><ClusterRoleBindingList /></LazyView>} />

          {/* Cluster */}
          <Route path="cluster/nodes" element={<LazyView><NodeList /></LazyView>} />
          <Route path="cluster/nodes/:name" element={<LazyView><NodeDetail /></LazyView>} />
          <Route path="cluster/namespaces" element={<LazyView><NamespaceList /></LazyView>} />
          <Route path="cluster/events" element={<LazyView><EventList /></LazyView>} />
          <Route path="cluster/priorityclasses" element={<LazyView><PriorityClassList /></LazyView>} />

          {/* Helm */}
          <Route path="helm/releases" element={<LazyView><HelmReleaseList /></LazyView>} />
          <Route path="helm/releases/:namespace/:name" element={<LazyView><HelmReleaseDetail /></LazyView>} />

          {/* Custom Resources (dynamic) */}
          <Route path="custom/:group/:resource" element={<LazyView><CustomResourceList /></LazyView>} />
          <Route path="custom/:group/:resource/:namespace/:name" element={<LazyView><CustomResourceDetail /></LazyView>} />

          {/* Settings */}
          <Route path="settings/*" element={<LazyView><Settings /></LazyView>} />

          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
```

### URL Parameter Extraction Patterns

```tsx
// hooks/useResourceParams.ts
import { useParams } from "react-router-dom";

export function useResourceParams() {
  const { namespace, name, group, resource } = useParams<{
    namespace?: string;
    name?: string;
    group?: string;
    resource?: string;
  }>();
  return { namespace, name, group, resource };
}

// Usage in a detail view:
// const { namespace, name } = useResourceParams();
// const pod = usePod(namespace!, name!);

// AppShell.tsx — Outlet renders child routes
import { Outlet } from "react-router-dom";

export function AppShell() {
  return (
    <div className="flex h-screen bg-bg-primary overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <Topbar />
        <ConnectionBanners />
        <main className="flex-1 overflow-hidden flex flex-col">
          <Outlet />  {/* child routes render here */}
        </main>
        <BottomTray />
      </div>
    </div>
  );
}
```

---

## 4.2 — Sidebar — Complete Implementation

### Visual Design

```
┌──────────────────────────┐
│  ┌────────────────────┐  │
│  │ ⬡ KubeViewer        │  │  Brand
│  │ minikube (local) ▾  │  │  Cluster selector
│  └────────────────────┘  │
│                           │
│  ★ FAVORITES           ▾  │  Pinned views
│    □ Pods (prod)       42 │
│    □ nginx deploy       . │
│                           │
│  ● Overview               │
│                           │
│  WORKLOADS             ▾  │
│    □ Pods              42 │
│    □ Deployments       12 │
│    □ StatefulSets       3 │
│    □ DaemonSets         5 │
│    □ ReplicaSets       15 │
│    □ Jobs               0 │
│    □ CronJobs           2 │
│                           │
│  NETWORKING            ▾  │
│    □ Services          18 │
│    □ Ingresses          4 │
│    □ Endpoints         18 │
│    □ Net Policies       2 │
│                           │
│  CONFIG                ▾  │
│    □ ConfigMaps        27 │
│    □ Secrets           34 │
│    □ Resource Quotas    2 │
│    □ Limit Ranges       3 │
│    □ HPAs               3 │
│    □ PDBs               1 │
│                           │
│  STORAGE               ▾  │
│    □ PVCs               8 │
│    □ PVs                8 │
│    □ Storage Classes    3 │
│                           │
│  ACCESS CONTROL        ▾  │
│    □ Service Accounts  45 │
│    □ Roles             12 │
│    □ Cluster Roles     68 │
│    □ Role Bindings     12 │
│    □ CR Bindings       14 │
│                           │
│  CLUSTER               ▾  │
│    □ Nodes              3 │
│    □ Namespaces        12 │
│    □ Events           108 │
│    □ Priority Classes   4 │
│                           │
│  HELM                  ▾  │
│    □ Releases           6 │
│                           │
│  CUSTOM RESOURCES      ▾  │
│    □ CertificateIssuers 2 │
│    □ Certificates       8 │
│                           │
│  ──────────────────────   │
│  ⚙ Settings               │
└──────────────────────────┘
```

### Complete Implementation

```tsx
// src/components/sidebar/Sidebar.tsx
import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Box,
  Layers,
  Database,
  Radio,
  Copy,
  Briefcase,
  Clock,
  Network,
  Globe,
  Zap,
  Shield,
  FileText,
  Lock,
  Scale,
  Gauge,
  HardDrive,
  Archive,
  FolderOpen,
  UserCheck,
  Key,
  Users,
  Link2,
  Globe2,
  Server,
  Tag,
  AlertCircle,
  ArrowUpDown,
  Package,
  Puzzle,
  Settings,
  Star,
  ChevronRight,
  ChevronDown,
  Check,
  Search,
  Plus,
  GripVertical,
} from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { cn } from "../../lib/utils";
import { useUIStore } from "../../stores/uiStore";
import { useClusterStore } from "../../stores/clusterStore";
import { useFavoritesStore } from "../../stores/favoritesStore";
import { useResourceCounts } from "../../hooks/useResourceCounts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface NavItem {
  label: string;
  icon: React.ElementType;
  path: string;
  shortcut?: string;
  resourceKey?: string; // key into resource counts map
}

interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
}

interface Cluster {
  name: string;
  server: string;
  status: "connected" | "connecting" | "disconnected" | "error";
  color: string; // hex
}

// ─── Navigation Data ──────────────────────────────────────────────────────────

const NAV_SECTIONS: NavSection[] = [
  {
    id: "workloads",
    label: "Workloads",
    items: [
      { label: "Pods",         icon: Box,        path: "/workloads/pods",        shortcut: "G P", resourceKey: "pods" },
      { label: "Deployments",  icon: Layers,      path: "/workloads/deployments", shortcut: "G D", resourceKey: "deployments" },
      { label: "StatefulSets", icon: Database,    path: "/workloads/statefulsets",                 resourceKey: "statefulsets" },
      { label: "DaemonSets",   icon: Radio,       path: "/workloads/daemonsets",                   resourceKey: "daemonsets" },
      { label: "ReplicaSets",  icon: Copy,        path: "/workloads/replicasets",                  resourceKey: "replicasets" },
      { label: "Jobs",         icon: Briefcase,   path: "/workloads/jobs",                         resourceKey: "jobs" },
      { label: "CronJobs",     icon: Clock,       path: "/workloads/cronjobs",                     resourceKey: "cronjobs" },
    ],
  },
  {
    id: "networking",
    label: "Networking",
    items: [
      { label: "Services",        icon: Network, path: "/networking/services",        shortcut: "G S", resourceKey: "services" },
      { label: "Ingresses",       icon: Globe,   path: "/networking/ingresses",       shortcut: "G I", resourceKey: "ingresses" },
      { label: "Endpoints",       icon: Zap,     path: "/networking/endpoints",                        resourceKey: "endpoints" },
      { label: "Network Policies",icon: Shield,  path: "/networking/networkpolicies",                  resourceKey: "networkpolicies" },
    ],
  },
  {
    id: "config",
    label: "Configuration",
    items: [
      { label: "ConfigMaps",      icon: FileText,   path: "/config/configmaps",     shortcut: "G C", resourceKey: "configmaps" },
      { label: "Secrets",         icon: Lock,        path: "/config/secrets",                          resourceKey: "secrets" },
      { label: "Resource Quotas", icon: Scale,       path: "/config/resourcequotas",                   resourceKey: "resourcequotas" },
      { label: "Limit Ranges",    icon: Gauge,       path: "/config/limitranges",                      resourceKey: "limitranges" },
      { label: "HPAs",            icon: ArrowUpDown, path: "/config/hpas",                             resourceKey: "hpas" },
      { label: "PDBs",            icon: Shield,      path: "/config/pdbs",                             resourceKey: "pdbs" },
    ],
  },
  {
    id: "storage",
    label: "Storage",
    items: [
      { label: "PersistentVolumeClaims", icon: HardDrive,  path: "/storage/pvcs",          resourceKey: "pvcs" },
      { label: "PersistentVolumes",      icon: Archive,     path: "/storage/pvs",           resourceKey: "pvs" },
      { label: "Storage Classes",        icon: FolderOpen,  path: "/storage/storageclasses",resourceKey: "storageclasses" },
    ],
  },
  {
    id: "rbac",
    label: "Access Control",
    items: [
      { label: "Service Accounts",       icon: UserCheck, path: "/rbac/serviceaccounts",       resourceKey: "serviceaccounts" },
      { label: "Roles",                  icon: Key,       path: "/rbac/roles",                 resourceKey: "roles" },
      { label: "Cluster Roles",          icon: Users,     path: "/rbac/clusterroles",          resourceKey: "clusterroles" },
      { label: "Role Bindings",          icon: Link2,     path: "/rbac/rolebindings",          resourceKey: "rolebindings" },
      { label: "Cluster Role Bindings",  icon: Globe2,    path: "/rbac/clusterrolebindings",   resourceKey: "clusterrolebindings" },
    ],
  },
  {
    id: "cluster",
    label: "Cluster",
    items: [
      { label: "Nodes",            icon: Server,      path: "/cluster/nodes",           shortcut: "G N", resourceKey: "nodes" },
      { label: "Namespaces",       icon: Tag,         path: "/cluster/namespaces",                        resourceKey: "namespaces" },
      { label: "Events",           icon: AlertCircle, path: "/cluster/events",          shortcut: "G E",  resourceKey: "events" },
      { label: "Priority Classes", icon: ArrowUpDown, path: "/cluster/priorityclasses",                   resourceKey: "priorityclasses" },
    ],
  },
  {
    id: "helm",
    label: "Helm",
    items: [
      { label: "Releases", icon: Package, path: "/helm/releases", shortcut: "G H", resourceKey: "helmreleases" },
    ],
  },
];

// ─── Cluster Selector ─────────────────────────────────────────────────────────

const STATUS_COLORS: Record<Cluster["status"], string> = {
  connected:    "bg-green-400",
  connecting:   "bg-yellow-400 animate-pulse",
  disconnected: "bg-gray-500",
  error:        "bg-red-400",
};

function ClusterSelector({ collapsed }: { collapsed: boolean }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { activeCluster, clusters, connectCluster } = useClusterStore();
  const ref = useRef<HTMLDivElement>(null);

  const current = clusters.find((c) => c.name === activeCluster);
  const filtered = clusters.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 rounded-md",
          "hover:bg-bg-hover transition-colors duration-100",
          "text-left text-sm",
          collapsed && "justify-center px-2"
        )}
      >
        {/* Cluster color dot */}
        <div
          className="w-5 h-5 rounded-md shrink-0 flex items-center justify-center text-white text-xs font-bold"
          style={{ backgroundColor: current?.color ?? "#6B7280" }}
        >
          {current?.name?.[0]?.toUpperCase() ?? "?"}
        </div>
        {!collapsed && (
          <>
            <div className="flex-1 min-w-0">
              <div className="text-text-primary text-xs font-medium truncate">
                {current?.name ?? "No cluster"}
              </div>
              <div className="text-text-tertiary text-2xs truncate">
                {current?.server ?? "Not connected"}
              </div>
            </div>
            {/* Connection status dot */}
            <div className={cn("w-2 h-2 rounded-full shrink-0", STATUS_COLORS[current?.status ?? "disconnected"])} />
            <ChevronDown className={cn("w-3 h-3 text-text-tertiary shrink-0 transition-transform duration-150", open && "rotate-180")} />
          </>
        )}
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-bg-tertiary border border-border rounded-lg shadow-xl overflow-hidden">
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
            <Search className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter clusters..."
              className="flex-1 bg-transparent text-xs text-text-primary outline-none placeholder:text-text-tertiary"
            />
          </div>

          {/* Cluster list */}
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.map((cluster) => (
              <button
                key={cluster.name}
                onClick={() => { connectCluster(cluster.name); setOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-bg-hover transition-colors duration-100 text-left"
              >
                <div
                  className="w-5 h-5 rounded shrink-0 flex items-center justify-center text-white text-xs font-bold"
                  style={{ backgroundColor: cluster.color }}
                >
                  {cluster.name[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-text-primary truncate">{cluster.name}</div>
                  <div className="text-2xs text-text-tertiary truncate">{cluster.server}</div>
                </div>
                <div className={cn("w-2 h-2 rounded-full shrink-0", STATUS_COLORS[cluster.status])} />
                {cluster.name === activeCluster && (
                  <Check className="w-3 h-3 text-accent shrink-0" />
                )}
              </button>
            ))}
          </div>

          {/* Add cluster */}
          <div className="border-t border-border py-1">
            <button
              onClick={() => { /* navigate to settings/clusters */ setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-bg-hover transition-colors duration-100 text-text-secondary text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              Add cluster
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Nav Item ─────────────────────────────────────────────────────────────────

interface NavItemProps {
  item: NavItem;
  isActive: boolean;
  collapsed: boolean;
  count?: number;
}

function NavItemRow({ item, isActive, collapsed, count }: NavItemProps) {
  const content = (
    <Link
      to={item.path}
      className={cn(
        "group flex items-center gap-2 px-3 py-1.5 rounded-md text-sm",
        "transition-colors duration-100 relative",
        "hover:bg-bg-hover",
        isActive && "bg-bg-active text-text-primary",
        !isActive && "text-text-secondary",
        collapsed && "justify-center px-2"
      )}
    >
      {/* Active left border */}
      {isActive && (
        <div className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-accent" />
      )}

      <item.icon className={cn(
        "w-4 h-4 shrink-0 transition-colors duration-100",
        isActive ? "text-accent" : "text-text-tertiary group-hover:text-text-secondary"
      )} />

      {!collapsed && (
        <>
          <span className="flex-1 truncate text-sm leading-none">{item.label}</span>
          {count !== undefined && count > 0 && (
            <span className="text-2xs text-text-tertiary tabular-nums font-medium ml-auto">
              {count > 999 ? "999+" : count}
            </span>
          )}
        </>
      )}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip.Provider delayDuration={200}>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>{content}</Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              side="right"
              sideOffset={8}
              className="bg-bg-tertiary border border-border text-text-primary text-xs px-2 py-1 rounded-md shadow-lg"
            >
              {item.label}
              {item.shortcut && (
                <span className="ml-2 text-text-tertiary">{item.shortcut}</span>
              )}
              <Tooltip.Arrow className="fill-border" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </Tooltip.Provider>
    );
  }

  return content;
}

// ─── Section ──────────────────────────────────────────────────────────────────

interface SectionProps {
  section: NavSection;
  collapsed: boolean;
  counts: Record<string, number>;
}

function SidebarSection({ section, collapsed, counts }: SectionProps) {
  const location = useLocation();
  const storageKey = `kubeviewer-section-${section.id}`;
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(storageKey) !== "false"; }
    catch { return true; }
  });

  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      try { localStorage.setItem(storageKey, String(next)); } catch {}
      return next;
    });
  };

  return (
    <div>
      {/* Section header */}
      {!collapsed && (
        <button
          onClick={toggle}
          className="w-full flex items-center gap-1 px-3 py-1 mt-3 group"
        >
          <span className="text-2xs font-semibold tracking-wider text-text-tertiary uppercase flex-1 text-left">
            {section.label}
          </span>
          <ChevronRight className={cn(
            "w-3 h-3 text-text-tertiary transition-transform duration-150",
            open && "rotate-90"
          )} />
        </button>
      )}

      {/* Items */}
      {(open || collapsed) && (
        <div className={cn("space-y-0.5", !collapsed && "px-2 mt-0.5")}>
          {section.items.map((item) => (
            <NavItemRow
              key={item.path}
              item={item}
              isActive={location.pathname === item.path || location.pathname.startsWith(item.path + "/")}
              collapsed={collapsed}
              count={item.resourceKey ? counts[item.resourceKey] : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Favorites Section ────────────────────────────────────────────────────────

function FavoritesSection({ collapsed }: { collapsed: boolean }) {
  const { favorites } = useFavoritesStore();
  const location = useLocation();
  const [open, setOpen] = useState(true);

  if (favorites.length === 0) return null;

  return (
    <div>
      {!collapsed && (
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center gap-1 px-3 py-1 mt-2 group"
        >
          <Star className="w-3 h-3 text-yellow-400 shrink-0" />
          <span className="text-2xs font-semibold tracking-wider text-text-tertiary uppercase flex-1 text-left ml-1">
            Favorites
          </span>
          <ChevronRight className={cn(
            "w-3 h-3 text-text-tertiary transition-transform duration-150",
            open && "rotate-90"
          )} />
        </button>
      )}
      {(open || collapsed) && (
        <div className={cn("space-y-0.5", !collapsed && "px-2 mt-0.5")}>
          {favorites.map((fav) => (
            <NavItemRow
              key={fav.path}
              item={{ label: fav.label, icon: fav.icon as React.ElementType, path: fav.path }}
              isActive={location.pathname === fav.path}
              collapsed={collapsed}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Custom Resources Section ─────────────────────────────────────────────────

function CustomResourcesSection({ collapsed }: { collapsed: boolean }) {
  const { customResources } = useClusterStore();
  const location = useLocation();
  const [open, setOpen] = useState(true);

  if (customResources.length === 0) return null;

  return (
    <div>
      {!collapsed && (
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center gap-1 px-3 py-1 mt-3 group"
        >
          <span className="text-2xs font-semibold tracking-wider text-text-tertiary uppercase flex-1 text-left">
            Custom Resources
          </span>
          <ChevronRight className={cn(
            "w-3 h-3 text-text-tertiary transition-transform duration-150",
            open && "rotate-90"
          )} />
        </button>
      )}
      {(open || collapsed) && (
        <div className={cn("space-y-0.5", !collapsed && "px-2 mt-0.5")}>
          {customResources.map((crd) => (
            <NavItemRow
              key={crd.path}
              item={{ label: crd.label, icon: Puzzle, path: crd.path }}
              isActive={location.pathname.startsWith(crd.path)}
              collapsed={collapsed}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Resize Handle ────────────────────────────────────────────────────────────

interface ResizeHandleProps {
  onResize: (dx: number) => void;
}

function ResizeHandle({ onResize }: ResizeHandleProps) {
  const dragging = useRef(false);
  const lastX = useRef(0);

  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    lastX.current = e.clientX;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - lastX.current;
      lastX.current = e.clientX;
      onResize(dx);
    };
    const onMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onResize]);

  return (
    <div
      onMouseDown={onMouseDown}
      className={cn(
        "absolute right-0 top-0 bottom-0 w-1 cursor-col-resize z-10",
        "hover:bg-accent/40 transition-colors duration-100",
        "group"
      )}
    >
      <div className="absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
        <GripVertical className="w-3 h-3 text-text-tertiary" />
      </div>
    </div>
  );
}

// ─── Sidebar Root ─────────────────────────────────────────────────────────────

const MIN_WIDTH = 180;
const MAX_WIDTH = 350;
const COLLAPSED_WIDTH = 48;

export function Sidebar() {
  const { sidebarCollapsed, sidebarWidth, setSidebarWidth } = useUIStore();
  const counts = useResourceCounts();
  const location = useLocation();

  const handleResize = useCallback((dx: number) => {
    setSidebarWidth((prev) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, prev + dx)));
  }, [setSidebarWidth]);

  const width = sidebarCollapsed ? COLLAPSED_WIDTH : sidebarWidth;

  return (
    <aside
      style={{ width }}
      className={cn(
        "relative flex flex-col h-full bg-bg-secondary border-r border-border",
        "transition-[width] duration-150 ease-out overflow-hidden shrink-0"
      )}
    >
      {/* Resize handle — only when expanded */}
      {!sidebarCollapsed && (
        <ResizeHandle onResize={handleResize} />
      )}

      {/* Cluster selector */}
      <div className={cn("px-2 pt-3 pb-2", sidebarCollapsed && "px-1")}>
        <ClusterSelector collapsed={sidebarCollapsed} />
      </div>

      {/* Scrollable nav area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-border">
        {/* Overview */}
        <div className={cn("px-2 mt-1", sidebarCollapsed && "px-1")}>
          <NavItemRow
            item={{ label: "Overview", icon: LayoutDashboard, path: "/overview", shortcut: "G O" }}
            isActive={location.pathname === "/overview"}
            collapsed={sidebarCollapsed}
          />
        </div>

        {/* Favorites */}
        <FavoritesSection collapsed={sidebarCollapsed} />

        {/* Main sections */}
        {NAV_SECTIONS.map((section) => (
          <SidebarSection
            key={section.id}
            section={section}
            collapsed={sidebarCollapsed}
            counts={counts}
          />
        ))}

        {/* Custom resources */}
        <CustomResourcesSection collapsed={sidebarCollapsed} />
      </div>

      {/* Settings at bottom */}
      <div className={cn("px-2 pb-3 pt-2 border-t border-border", sidebarCollapsed && "px-1")}>
        <NavItemRow
          item={{ label: "Settings", icon: Settings, path: "/settings" }}
          isActive={location.pathname.startsWith("/settings")}
          collapsed={sidebarCollapsed}
        />
      </div>
    </aside>
  );
}
```

---

## 4.3 — Topbar — Complete Implementation

```tsx
// src/components/topbar/Topbar.tsx
import { Fragment } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Search,
  Sun,
  Moon,
  ChevronRight,
  Command,
  ChevronsUpDown,
  Globe,
} from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { cn } from "../../lib/utils";
import { useUIStore } from "../../stores/uiStore";
import { useClusterStore } from "../../stores/clusterStore";
import { useOS } from "../../hooks/useOS";
import { useCommandPalette } from "../../hooks/useCommandPalette";
import { NAV_SECTIONS } from "./Sidebar"; // reuse icon/label mapping

// ─── Platform detection ───────────────────────────────────────────────────────

// hooks/useOS.ts
export function useOS(): "mac" | "windows" | "linux" {
  if (typeof navigator === "undefined") return "linux";
  const p = navigator.platform.toLowerCase();
  if (p.startsWith("mac")) return "mac";
  if (p.startsWith("win")) return "windows";
  return "linux";
}

// ─── Breadcrumb ───────────────────────────────────────────────────────────────

// Map path segments to human-readable labels + icons
const SEGMENT_MAP: Record<string, { label: string; icon?: React.ElementType }> = {
  overview:            { label: "Overview" },
  workloads:           { label: "Workloads" },
  networking:          { label: "Networking" },
  config:              { label: "Configuration" },
  storage:             { label: "Storage" },
  rbac:                { label: "Access Control" },
  cluster:             { label: "Cluster" },
  helm:                { label: "Helm" },
  custom:              { label: "Custom Resources" },
  settings:            { label: "Settings" },
  pods:                { label: "Pods" },
  deployments:         { label: "Deployments" },
  statefulsets:        { label: "StatefulSets" },
  daemonsets:          { label: "DaemonSets" },
  replicasets:         { label: "ReplicaSets" },
  jobs:                { label: "Jobs" },
  cronjobs:            { label: "CronJobs" },
  services:            { label: "Services" },
  ingresses:           { label: "Ingresses" },
  endpoints:           { label: "Endpoints" },
  networkpolicies:     { label: "Network Policies" },
  configmaps:          { label: "ConfigMaps" },
  secrets:             { label: "Secrets" },
  resourcequotas:      { label: "Resource Quotas" },
  limitranges:         { label: "Limit Ranges" },
  hpas:                { label: "HPAs" },
  pdbs:                { label: "PDBs" },
  pvcs:                { label: "PVCs" },
  pvs:                 { label: "PVs" },
  storageclasses:      { label: "Storage Classes" },
  serviceaccounts:     { label: "Service Accounts" },
  roles:               { label: "Roles" },
  clusterroles:        { label: "Cluster Roles" },
  rolebindings:        { label: "Role Bindings" },
  clusterrolebindings: { label: "CR Bindings" },
  nodes:               { label: "Nodes" },
  namespaces:          { label: "Namespaces" },
  events:              { label: "Events" },
  priorityclasses:     { label: "Priority Classes" },
  releases:            { label: "Releases" },
};

function BreadcrumbSegment({ segment, path, isLast }: {
  segment: string;
  path: string;
  isLast: boolean;
}) {
  const info = SEGMENT_MAP[segment] ?? { label: segment };
  const label = info.label;
  // Long names (likely resource names) get truncated with tooltip
  const isTruncated = label.length > 24 || segment.length > 24;

  const content = (
    <span className={cn(
      "text-sm",
      isLast ? "text-text-primary font-medium" : "text-text-tertiary hover:text-text-secondary transition-colors"
    )}>
      {label.length > 24 ? label.slice(0, 22) + "…" : label}
    </span>
  );

  return (
    <>
      {isLast ? (
        isTruncated ? (
          <Tooltip.Provider delayDuration={300}>
            <Tooltip.Root>
              <Tooltip.Trigger asChild>{content}</Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content className="bg-bg-tertiary border border-border text-text-primary text-xs px-2 py-1 rounded shadow-lg">
                  {label}
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </Tooltip.Provider>
        ) : content
      ) : (
        <Link to={path}>{content}</Link>
      )}
    </>
  );
}

function Breadcrumb() {
  const location = useLocation();
  // Strip leading slash, split into segments, build cumulative paths
  const segments = location.pathname.replace(/^\//, "").split("/").filter(Boolean);
  const crumbs = segments.map((seg, i) => ({
    segment: seg,
    path: "/" + segments.slice(0, i + 1).join("/"),
    isLast: i === segments.length - 1,
  }));

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 min-w-0">
      {crumbs.map((crumb, i) => (
        <Fragment key={crumb.path}>
          {i > 0 && <ChevronRight className="w-3 h-3 text-text-tertiary shrink-0" />}
          <BreadcrumbSegment {...crumb} />
        </Fragment>
      ))}
    </nav>
  );
}

// ─── Namespace Filter ─────────────────────────────────────────────────────────

function NamespaceFilter() {
  const { namespaces, selectedNamespace, setNamespace } = useClusterStore();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [recentNs, setRecentNs] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("kubeviewer-recent-ns") ?? "[]"); }
    catch { return []; }
  });

  const filtered = namespaces.filter((ns) =>
    ns.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (ns: string) => {
    setNamespace(ns);
    setOpen(false);
    setRecentNs((prev) => {
      const next = [ns, ...prev.filter((n) => n !== ns)].slice(0, 5);
      try { localStorage.setItem("kubeviewer-recent-ns", JSON.stringify(next)); } catch {}
      return next;
    });
  };

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm",
          "bg-bg-hover border border-border hover:border-border-strong",
          "transition-colors duration-100 text-text-primary"
        )}>
          <Globe className="w-3.5 h-3.5 text-text-tertiary" />
          <span className="max-w-[140px] truncate">
            {selectedNamespace || "All Namespaces"}
          </span>
          <span className="text-2xs text-text-tertiary tabular-nums">
            {namespaces.length}
          </span>
          <ChevronsUpDown className="w-3 h-3 text-text-tertiary" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          sideOffset={4}
          align="end"
          className="w-64 bg-bg-tertiary border border-border rounded-lg shadow-xl z-50 overflow-hidden animate-slide-in"
        >
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
            <Search className="w-3.5 h-3.5 text-text-tertiary" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter namespaces..."
              className="flex-1 bg-transparent text-xs text-text-primary outline-none placeholder:text-text-tertiary"
            />
          </div>

          {/* All namespaces option */}
          <div className="py-1">
            <DropdownMenu.Item
              onSelect={() => handleSelect("")}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer outline-none",
                "hover:bg-bg-hover transition-colors",
                !selectedNamespace && "text-accent font-medium"
              )}
            >
              <Globe className="w-3.5 h-3.5" />
              All Namespaces
              {!selectedNamespace && <Check className="w-3 h-3 ml-auto" />}
            </DropdownMenu.Item>
          </div>

          {/* Recently used */}
          {recentNs.length > 0 && search === "" && (
            <>
              <div className="px-3 py-1 text-2xs text-text-tertiary uppercase tracking-wider">
                Recent
              </div>
              {recentNs.filter((ns) => namespaces.includes(ns)).map((ns) => (
                <DropdownMenu.Item
                  key={`recent-${ns}`}
                  onSelect={() => handleSelect(ns)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer outline-none",
                    "hover:bg-bg-hover transition-colors",
                    selectedNamespace === ns && "text-accent font-medium"
                  )}
                >
                  <Tag className="w-3.5 h-3.5 text-text-tertiary" />
                  {ns}
                  {selectedNamespace === ns && <Check className="w-3 h-3 ml-auto" />}
                </DropdownMenu.Item>
              ))}
              <DropdownMenu.Separator className="h-px bg-border my-1" />
            </>
          )}

          {/* All filtered namespaces */}
          <div className="max-h-48 overflow-y-auto py-1">
            {filtered.map((ns) => (
              <DropdownMenu.Item
                key={ns}
                onSelect={() => handleSelect(ns)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer outline-none",
                  "hover:bg-bg-hover transition-colors",
                  selectedNamespace === ns && "text-accent font-medium"
                )}
              >
                <Tag className="w-3.5 h-3.5 text-text-tertiary" />
                {ns}
                {selectedNamespace === ns && <Check className="w-3 h-3 ml-auto" />}
              </DropdownMenu.Item>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-text-tertiary">
                No namespaces found
              </div>
            )}
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

// ─── Cluster Health Indicator ─────────────────────────────────────────────────

function ClusterHealthIndicator() {
  const { activeCluster, clusters, k8sVersion } = useClusterStore();
  const current = clusters.find((c) => c.name === activeCluster);

  if (!current) return null;

  const dot = (
    <div className={cn(
      "w-2 h-2 rounded-full shrink-0",
      current.status === "connected"    && "bg-green-400",
      current.status === "connecting"   && "bg-yellow-400 animate-pulse",
      current.status === "disconnected" && "bg-gray-500",
      current.status === "error"        && "bg-red-400",
    )} />
  );

  return (
    <Tooltip.Provider delayDuration={300}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-bg-hover transition-colors cursor-default">
            {dot}
            <span className="text-xs text-text-secondary">
              {current.status === "disconnected" ? "Disconnected" : current.name}
            </span>
          </div>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            sideOffset={6}
            className="bg-bg-tertiary border border-border rounded-lg p-3 shadow-xl text-xs space-y-1"
          >
            <div className="text-text-primary font-medium">{current.name}</div>
            <div className="text-text-tertiary">{current.server}</div>
            {k8sVersion && (
              <div className="text-text-tertiary">Kubernetes {k8sVersion}</div>
            )}
            <div className={cn(
              "capitalize font-medium",
              current.status === "connected" && "text-green-400",
              current.status === "connecting" && "text-yellow-400",
              current.status === "error" && "text-red-400",
            )}>
              {current.status}
            </div>
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

// ─── Theme Toggle ─────────────────────────────────────────────────────────────

function ThemeToggle() {
  const { theme, setTheme } = useUIStore();
  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="p-1.5 rounded-md hover:bg-bg-hover text-text-tertiary hover:text-text-secondary transition-all duration-100"
      aria-label="Toggle theme"
    >
      {theme === "dark"
        ? <Sun className="w-4 h-4" />
        : <Moon className="w-4 h-4" />
      }
    </button>
  );
}

// ─── Topbar Root ──────────────────────────────────────────────────────────────

export function Topbar() {
  const os = useOS();
  const { openPalette } = useCommandPalette();

  return (
    <header className={cn(
      "flex items-center h-11 border-b border-border bg-bg-secondary shrink-0 px-3 gap-3",
      // macOS: leave space for traffic lights (80px)
      os === "mac" && "pl-20"
    )}>
      {/* macOS drag region */}
      {os === "mac" && (
        <div
          className="absolute left-0 top-0 h-11 w-80 pointer-events-none"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        />
      )}

      {/* Breadcrumb */}
      <div className="flex-1 min-w-0">
        <Breadcrumb />
      </div>

      {/* Right-side controls */}
      <div className="flex items-center gap-1.5 shrink-0">
        <ClusterHealthIndicator />
        <NamespaceFilter />

        {/* Search / Command palette trigger */}
        <button
          onClick={openPalette}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs",
            "bg-bg-hover border border-border text-text-tertiary",
            "hover:border-border-strong hover:text-text-secondary transition-colors duration-100"
          )}
        >
          <Search className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Search</span>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 text-2xs bg-bg-tertiary border border-border rounded px-1 py-0.5">
            <Command className="w-2.5 h-2.5" />K
          </kbd>
        </button>

        <ThemeToggle />
      </div>
    </header>
  );
}
```

---

## 4.4 — Command Palette — Complete Implementation

```tsx
// src/components/command-palette/CommandPalette.tsx
import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Command } from "cmdk";
import {
  LayoutDashboard, Box, Layers, Database, Radio, Copy,
  Briefcase, Clock, Network, Globe, Zap, Shield, FileText,
  Lock, HardDrive, Archive, FolderOpen, UserCheck, Key,
  Users, Link2, Globe2, Server, Tag, AlertCircle, Package,
  Settings, ArrowRight, Search, Command as CommandIcon,
  ToggleLeft, PanelBottom, Sun, ChevronRight, History,
  Terminal, LogOut,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useClusterStore } from "../../stores/clusterStore";
import { useUIStore } from "../../stores/uiStore";
import { useSelectionStore } from "../../stores/selectionStore";
import { useFavoritesStore } from "../../stores/favoritesStore";
import { useCommandPalette } from "../../hooks/useCommandPalette";
import { useDebounce } from "../../hooks/useDebounce";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PaletteItem {
  id: string;
  label: string;
  icon?: React.ElementType;
  shortcut?: string;
  group: string;
  onSelect: () => void;
}

interface RecentItem {
  path: string;
  label: string;
  icon: string; // lucide icon name stored as string
  timestamp: number;
}

// ─── Navigation commands ──────────────────────────────────────────────────────

function useNavCommands(navigate: ReturnType<typeof useNavigate>, close: () => void): PaletteItem[] {
  return [
    { id: "nav-overview",      label: "Go to Overview",           icon: LayoutDashboard, shortcut: "G O", group: "Navigation", onSelect: () => { navigate("/overview"); close(); } },
    { id: "nav-pods",          label: "Go to Pods",               icon: Box,             shortcut: "G P", group: "Navigation", onSelect: () => { navigate("/workloads/pods"); close(); } },
    { id: "nav-deployments",   label: "Go to Deployments",        icon: Layers,          shortcut: "G D", group: "Navigation", onSelect: () => { navigate("/workloads/deployments"); close(); } },
    { id: "nav-statefulsets",  label: "Go to StatefulSets",       icon: Database,                         group: "Navigation", onSelect: () => { navigate("/workloads/statefulsets"); close(); } },
    { id: "nav-daemonsets",    label: "Go to DaemonSets",         icon: Radio,                            group: "Navigation", onSelect: () => { navigate("/workloads/daemonsets"); close(); } },
    { id: "nav-jobs",          label: "Go to Jobs",               icon: Briefcase,                        group: "Navigation", onSelect: () => { navigate("/workloads/jobs"); close(); } },
    { id: "nav-cronjobs",      label: "Go to CronJobs",           icon: Clock,                            group: "Navigation", onSelect: () => { navigate("/workloads/cronjobs"); close(); } },
    { id: "nav-services",      label: "Go to Services",           icon: Network,         shortcut: "G S", group: "Navigation", onSelect: () => { navigate("/networking/services"); close(); } },
    { id: "nav-ingresses",     label: "Go to Ingresses",          icon: Globe,           shortcut: "G I", group: "Navigation", onSelect: () => { navigate("/networking/ingresses"); close(); } },
    { id: "nav-configmaps",    label: "Go to ConfigMaps",         icon: FileText,        shortcut: "G C", group: "Navigation", onSelect: () => { navigate("/config/configmaps"); close(); } },
    { id: "nav-secrets",       label: "Go to Secrets",            icon: Lock,                             group: "Navigation", onSelect: () => { navigate("/config/secrets"); close(); } },
    { id: "nav-pvcs",          label: "Go to PVCs",               icon: HardDrive,                        group: "Navigation", onSelect: () => { navigate("/storage/pvcs"); close(); } },
    { id: "nav-nodes",         label: "Go to Nodes",              icon: Server,          shortcut: "G N", group: "Navigation", onSelect: () => { navigate("/cluster/nodes"); close(); } },
    { id: "nav-events",        label: "Go to Events",             icon: AlertCircle,     shortcut: "G E", group: "Navigation", onSelect: () => { navigate("/cluster/events"); close(); } },
    { id: "nav-helm",          label: "Go to Helm Releases",      icon: Package,         shortcut: "G H", group: "Navigation", onSelect: () => { navigate("/helm/releases"); close(); } },
    { id: "nav-settings",      label: "Go to Settings",           icon: Settings,                         group: "Navigation", onSelect: () => { navigate("/settings"); close(); } },
  ];
}

// ─── Action commands ──────────────────────────────────────────────────────────

type SubMenu = "clusters" | "namespaces" | "create" | null;

function useActionCommands(
  close: () => void,
  setSubMenu: (m: SubMenu) => void
): PaletteItem[] {
  const { toggleSidebar, toggleBottomTray, setTheme, theme } = useUIStore();
  return [
    {
      id: "action-switch-cluster",
      label: "Switch Cluster…",
      icon: Globe2,
      shortcut: "⌘⇧C",
      group: "Actions",
      onSelect: () => setSubMenu("clusters"),
    },
    {
      id: "action-change-namespace",
      label: "Change Namespace…",
      icon: Tag,
      shortcut: "⌘⇧N",
      group: "Actions",
      onSelect: () => setSubMenu("namespaces"),
    },
    {
      id: "action-create-resource",
      label: "Create Resource…",
      icon: ArrowRight,
      group: "Actions",
      onSelect: () => setSubMenu("create"),
    },
    {
      id: "action-toggle-sidebar",
      label: "Toggle Sidebar",
      icon: ToggleLeft,
      shortcut: "[",
      group: "Actions",
      onSelect: () => { toggleSidebar(); close(); },
    },
    {
      id: "action-toggle-tray",
      label: "Toggle Bottom Tray",
      icon: PanelBottom,
      shortcut: "⌃`",
      group: "Actions",
      onSelect: () => { toggleBottomTray(); close(); },
    },
    {
      id: "action-toggle-theme",
      label: theme === "dark" ? "Switch to Light Theme" : "Switch to Dark Theme",
      icon: Sun,
      group: "Actions",
      onSelect: () => { setTheme(theme === "dark" ? "light" : "dark"); close(); },
    },
  ];
}

// ─── Context-aware commands ───────────────────────────────────────────────────

function useContextCommands(close: () => void): PaletteItem[] {
  const location = useLocation();
  const { selectedResource } = useSelectionStore();
  const { setBottomTrayTab, toggleBottomTray } = useUIStore();
  const items: PaletteItem[] = [];

  if (location.pathname.includes("/workloads/pods")) {
    items.push(
      { id: "ctx-filter-running", label: "Filter: Running pods", icon: Box, group: "Context", onSelect: () => { /* emit filter event */ close(); } },
      { id: "ctx-filter-failed",  label: "Filter: Failed pods",  icon: Box, group: "Context", onSelect: () => { /* emit filter event */ close(); } }
    );
  }

  if (selectedResource) {
    items.push(
      {
        id: "ctx-view-logs", label: `View Logs: ${selectedResource.name}`,
        icon: FileText, group: "Context",
        onSelect: () => { setBottomTrayTab("logs"); toggleBottomTray(); close(); },
      },
      {
        id: "ctx-exec", label: `Exec Shell: ${selectedResource.name}`,
        icon: Terminal, group: "Context",
        onSelect: () => { setBottomTrayTab("terminal"); toggleBottomTray(); close(); },
      },
      {
        id: "ctx-edit-yaml", label: `Edit YAML: ${selectedResource.name}`,
        icon: FileText, group: "Context",
        onSelect: () => { /* open YAML editor */ close(); },
      },
      {
        id: "ctx-delete", label: `Delete: ${selectedResource.name}`,
        icon: LogOut, group: "Context",
        onSelect: () => { /* open delete confirm dialog */ close(); },
      }
    );
  }

  return items;
}

// ─── Resource search ──────────────────────────────────────────────────────────

interface ResourceResult {
  kind: string;
  name: string;
  namespace?: string;
  path: string;
}

async function searchResources(query: string): Promise<ResourceResult[]> {
  if (!query || query.length < 2) return [];
  // Calls Wails Go backend — returns cached results
  try {
    const { SearchResources } = await import("../../wailsjs/go/main/App");
    return await SearchResources(query);
  } catch {
    return [];
  }
}

// ─── Shortcut display ─────────────────────────────────────────────────────────

function ShortcutKeys({ shortcut }: { shortcut: string }) {
  const parts = shortcut.split(" ");
  return (
    <div className="flex items-center gap-0.5 ml-auto shrink-0">
      {parts.map((part, i) => (
        <kbd
          key={i}
          className="inline-flex items-center justify-center text-2xs text-text-tertiary bg-bg-primary border border-border rounded px-1 py-0.5 min-w-[1.25rem]"
        >
          {part}
        </kbd>
      ))}
    </div>
  );
}

// ─── Palette Item Row ─────────────────────────────────────────────────────────

function PaletteItemRow({ item }: { item: PaletteItem }) {
  const Icon = item.icon;
  return (
    <Command.Item
      value={`${item.group}-${item.id}-${item.label}`}
      onSelect={item.onSelect}
      className={cn(
        "flex items-center gap-2.5 px-3 py-2 rounded-md cursor-pointer",
        "data-[selected=true]:bg-bg-active data-[selected=true]:text-text-primary",
        "text-text-secondary text-sm outline-none transition-colors duration-75"
      )}
    >
      {Icon && <Icon className="w-4 h-4 shrink-0 text-text-tertiary" />}
      <span className="flex-1 truncate">{item.label}</span>
      {item.shortcut && <ShortcutKeys shortcut={item.shortcut} />}
    </Command.Item>
  );
}

// ─── Sub-menus ────────────────────────────────────────────────────────────────

function ClusterSubMenu({ onBack, onClose }: { onBack: () => void; onClose: () => void }) {
  const { clusters, connectCluster } = useClusterStore();
  return (
    <>
      <button onClick={onBack} className="flex items-center gap-1.5 px-3 py-2 text-xs text-text-tertiary hover:text-text-secondary">
        <ChevronRight className="w-3 h-3 rotate-180" /> Back
      </button>
      {clusters.map((c) => (
        <Command.Item
          key={c.name}
          value={c.name}
          onSelect={() => { connectCluster(c.name); onClose(); }}
          className="flex items-center gap-2.5 px-3 py-2 rounded-md cursor-pointer data-[selected=true]:bg-bg-active text-text-secondary text-sm outline-none"
        >
          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
          <span className="flex-1">{c.name}</span>
          <span className="text-2xs text-text-tertiary">{c.server}</span>
        </Command.Item>
      ))}
    </>
  );
}

function NamespaceSubMenu({ onBack, onClose }: { onBack: () => void; onClose: () => void }) {
  const { namespaces, setNamespace } = useClusterStore();
  return (
    <>
      <button onClick={onBack} className="flex items-center gap-1.5 px-3 py-2 text-xs text-text-tertiary hover:text-text-secondary">
        <ChevronRight className="w-3 h-3 rotate-180" /> Back
      </button>
      <Command.Item
        value="all-namespaces"
        onSelect={() => { setNamespace(""); onClose(); }}
        className="flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer data-[selected=true]:bg-bg-active text-text-secondary text-sm outline-none"
      >
        <Globe className="w-4 h-4 text-text-tertiary" />
        All Namespaces
      </Command.Item>
      {namespaces.map((ns) => (
        <Command.Item
          key={ns}
          value={ns}
          onSelect={() => { setNamespace(ns); onClose(); }}
          className="flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer data-[selected=true]:bg-bg-active text-text-secondary text-sm outline-none"
        >
          <Tag className="w-4 h-4 text-text-tertiary" />
          {ns}
        </Command.Item>
      ))}
    </>
  );
}

// ─── CommandPalette Root ──────────────────────────────────────────────────────

export function CommandPalette() {
  const { isOpen, closePalette } = useCommandPalette();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [subMenu, setSubMenu] = useState<SubMenu>(null);
  const [resourceResults, setResourceResults] = useState<ResourceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debouncedQuery = useDebounce(query, 200);
  const { recentItems, addRecentItem } = useFavoritesStore();

  const navCommands   = useNavCommands(navigate, closePalette);
  const actionCommands = useActionCommands(closePalette, setSubMenu);
  const contextCommands = useContextCommands(closePalette);

  // Reset on open
  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setSubMenu(null);
      setResourceResults([]);
    }
  }, [isOpen]);

  // Resource search
  useEffect(() => {
    if (!debouncedQuery) { setResourceResults([]); return; }
    setSearching(true);
    searchResources(debouncedQuery).then((r) => {
      setResourceResults(r);
      setSearching(false);
    });
  }, [debouncedQuery]);

  const handleResourceSelect = useCallback((result: ResourceResult) => {
    navigate(result.path);
    addRecentItem({ path: result.path, label: result.name, icon: "box", timestamp: Date.now() });
    closePalette();
  }, [navigate, addRecentItem, closePalette]);

  if (!isOpen) return null;

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center pt-[18vh]"
      onClick={(e) => { if (e.target === e.currentTarget) closePalette(); }}
    >
      <div className={cn(
        "w-[580px] max-h-[480px] bg-bg-secondary border border-border rounded-xl shadow-2xl",
        "flex flex-col overflow-hidden animate-scale-in"
      )}>
        <Command label="Command Palette" shouldFilter={subMenu === null}>
          {/* Input */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Search className="w-4 h-4 text-text-tertiary shrink-0" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder={subMenu ? "Search…" : "Type a command or search…"}
              className="flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-tertiary"
            />
            {searching && (
              <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin shrink-0" />
            )}
            <kbd className="text-2xs text-text-tertiary bg-bg-tertiary border border-border rounded px-1 py-0.5">
              ESC
            </kbd>
          </div>

          {/* Content */}
          <Command.List className="flex-1 overflow-y-auto p-2 space-y-0.5">
            <Command.Empty className="py-10 text-center text-sm text-text-tertiary">
              No results found.
            </Command.Empty>

            {/* Sub-menus */}
            {subMenu === "clusters" && (
              <ClusterSubMenu onBack={() => setSubMenu(null)} onClose={closePalette} />
            )}
            {subMenu === "namespaces" && (
              <NamespaceSubMenu onBack={() => setSubMenu(null)} onClose={closePalette} />
            )}

            {/* Main menu */}
            {subMenu === null && (
              <>
                {/* Recent items */}
                {recentItems.length > 0 && !query && (
                  <Command.Group heading="Recent">
                    {recentItems.slice(0, 5).map((item) => (
                      <Command.Item
                        key={item.path}
                        value={`recent-${item.label}`}
                        onSelect={() => { navigate(item.path); closePalette(); }}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-md cursor-pointer data-[selected=true]:bg-bg-active text-text-secondary text-sm outline-none"
                      >
                        <History className="w-4 h-4 text-text-tertiary shrink-0" />
                        <span className="flex-1 truncate">{item.label}</span>
                        <span className="text-2xs text-text-tertiary">{item.path}</span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                {/* Context actions */}
                {contextCommands.length > 0 && (
                  <Command.Group heading="Context Actions">
                    {contextCommands.map((item) => (
                      <PaletteItemRow key={item.id} item={item} />
                    ))}
                  </Command.Group>
                )}

                {/* Resource results */}
                {resourceResults.length > 0 && (
                  <Command.Group heading="Resources">
                    {resourceResults.map((r) => (
                      <Command.Item
                        key={`${r.kind}-${r.namespace}-${r.name}`}
                        value={`resource-${r.name}-${r.kind}`}
                        onSelect={() => handleResourceSelect(r)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-md cursor-pointer data-[selected=true]:bg-bg-active text-text-secondary text-sm outline-none"
                      >
                        <Box className="w-4 h-4 text-text-tertiary shrink-0" />
                        <span className="flex-1 truncate">{r.name}</span>
                        {r.namespace && (
                          <span className="text-2xs text-text-tertiary">{r.namespace}</span>
                        )}
                        <span className="text-2xs text-accent bg-accent/10 rounded px-1.5 py-0.5">
                          {r.kind}
                        </span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                {/* Navigation */}
                <Command.Group heading="Navigation">
                  {navCommands.map((item) => (
                    <PaletteItemRow key={item.id} item={item} />
                  ))}
                </Command.Group>

                {/* Actions */}
                <Command.Group heading="Actions">
                  {actionCommands.map((item) => (
                    <PaletteItemRow key={item.id} item={item} />
                  ))}
                </Command.Group>
              </>
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}

// ─── Hook for opening the palette ─────────────────────────────────────────────

// hooks/useCommandPalette.ts
import { create } from "zustand";

interface CommandPaletteState {
  isOpen: boolean;
  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;
}

export const useCommandPalette = create<CommandPaletteState>((set) => ({
  isOpen: false,
  openPalette:  () => set({ isOpen: true }),
  closePalette: () => set({ isOpen: false }),
  togglePalette: () => set((s) => ({ isOpen: !s.isOpen })),
}));
```

---

## 4.5 — Keyboard Shortcut System — Complete Implementation

```typescript
// src/hooks/useShortcuts.ts
import { useEffect, useRef, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ShortcutHandler = () => void;

interface ShortcutDef {
  /** e.g. "Cmd+K", "G P", "[", "?" */
  key: string;
  handler: ShortcutHandler;
  /** Higher priority runs first. Command palette = 100, view = 10, global = 50 */
  priority?: number;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    (el as HTMLElement).isContentEditable
  );
}

/** Normalize event → shortcut string, e.g. "Cmd+K", "[", "G" */
function eventToKey(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey)  parts.push("Cmd");
  if (e.ctrlKey)  parts.push("Ctrl");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey)   parts.push("Alt");

  const key = e.key;
  // Don't add modifier-only keys
  if (!["Meta","Control","Shift","Alt"].includes(key)) {
    parts.push(key === " " ? "Space" : key);
  }
  return parts.join("+");
}

/** Chord indicator shown in bottom-right when waiting for 2nd key */
let chordIndicatorEl: HTMLElement | null = null;

function showChordIndicator(prefix: string) {
  if (!chordIndicatorEl) {
    chordIndicatorEl = document.createElement("div");
    chordIndicatorEl.style.cssText = `
      position: fixed; bottom: 16px; right: 16px; z-index: 9999;
      background: var(--color-bg-tertiary);
      border: 1px solid var(--color-border);
      color: var(--color-text-primary);
      font-size: 12px; font-family: monospace;
      padding: 4px 10px; border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      pointer-events: none;
    `;
    document.body.appendChild(chordIndicatorEl);
  }
  chordIndicatorEl.textContent = `${prefix}…`;
  chordIndicatorEl.style.display = "block";
}

function hideChordIndicator() {
  if (chordIndicatorEl) chordIndicatorEl.style.display = "none";
}

// ─── Global shortcut registry ─────────────────────────────────────────────────

// A simple module-level registry so multiple hook instances can coexist
const registry = new Map<string, ShortcutDef[]>();

function registerShortcut(def: ShortcutDef) {
  const existing = registry.get(def.key) ?? [];
  registry.set(def.key, [...existing, def].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)));
}

function unregisterShortcut(def: ShortcutDef) {
  const existing = registry.get(def.key) ?? [];
  registry.set(def.key, existing.filter((d) => d !== def));
}

// ─── Global keyboard listener (singleton) ────────────────────────────────────

const CHORD_TIMEOUT = 500; // ms
let chordBuffer = "";
let chordTimer: ReturnType<typeof setTimeout> | null = null;

function clearChord() {
  chordBuffer = "";
  if (chordTimer) clearTimeout(chordTimer);
  chordTimer = null;
  hideChordIndicator();
}

function globalKeyHandler(e: KeyboardEvent) {
  if (isInputFocused()) return;

  const key = eventToKey(e);

  // Check for direct match in registry
  const directHandlers = registry.get(key);
  if (directHandlers?.length) {
    e.preventDefault();
    directHandlers[0].handler(); // highest priority
    clearChord();
    return;
  }

  // Check for chord completion
  if (chordBuffer) {
    const chord = `${chordBuffer} ${key}`;
    const chordHandlers = registry.get(chord);
    if (chordHandlers?.length) {
      e.preventDefault();
      chordHandlers[0].handler();
    }
    clearChord();
    return;
  }

  // Start new chord — only single alpha keys without modifiers
  if (key.length === 1 && /^[A-Za-z]$/.test(key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
    // Check if any chord starts with this key
    const upper = key.toUpperCase();
    const anyChord = [...registry.keys()].some((k) => k.startsWith(upper + " "));
    if (anyChord) {
      chordBuffer = upper;
      showChordIndicator(upper);
      chordTimer = setTimeout(clearChord, CHORD_TIMEOUT);
    }
  }
}

// Mount the global listener once
if (typeof window !== "undefined") {
  window.addEventListener("keydown", globalKeyHandler);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Register keyboard shortcuts. Automatically cleans up on unmount.
 *
 * @example
 * useShortcuts([
 *   { key: "Cmd+K", handler: openPalette, priority: 100 },
 *   { key: "G P",   handler: () => navigate("/workloads/pods") },
 *   { key: "[",      handler: toggleSidebar },
 * ]);
 */
export function useShortcuts(shortcuts: ShortcutDef[]) {
  const defsRef = useRef(shortcuts);
  defsRef.current = shortcuts;

  useEffect(() => {
    const registered = defsRef.current;
    registered.forEach(registerShortcut);
    return () => registered.forEach(unregisterShortcut);
  }, []); // intentionally empty — stable via ref
}

// ─── AppShell registration ────────────────────────────────────────────────────

// src/layouts/AppShell.tsx (partial — add to existing component)
//
// import { useShortcuts } from "../hooks/useShortcuts";
//
// function AppShellShortcuts() {
//   const navigate = useNavigate();
//   const { toggleSidebar, toggleBottomTray } = useUIStore();
//   const { togglePalette } = useCommandPalette();
//   const [helpOpen, setHelpOpen] = useState(false);
//
//   useShortcuts([
//     // Navigation chords
//     { key: "G O",  handler: () => navigate("/overview"),               priority: 50 },
//     { key: "G P",  handler: () => navigate("/workloads/pods"),         priority: 50 },
//     { key: "G D",  handler: () => navigate("/workloads/deployments"),  priority: 50 },
//     { key: "G S",  handler: () => navigate("/networking/services"),    priority: 50 },
//     { key: "G N",  handler: () => navigate("/cluster/nodes"),          priority: 50 },
//     { key: "G E",  handler: () => navigate("/cluster/events"),         priority: 50 },
//     { key: "G H",  handler: () => navigate("/helm/releases"),          priority: 50 },
//     { key: "G C",  handler: () => navigate("/config/configmaps"),      priority: 50 },
//     { key: "G I",  handler: () => navigate("/networking/ingresses"),   priority: 50 },
//     // Global actions
//     { key: "Cmd+K",       handler: togglePalette,      priority: 100 },
//     { key: "[",            handler: toggleSidebar,      priority: 50  },
//     { key: "Ctrl+`",      handler: toggleBottomTray,   priority: 50  },
//     { key: "?",            handler: () => setHelpOpen(true), priority: 50 },
//     { key: "/",            handler: togglePalette,      priority: 50  },
//     { key: "Cmd+Shift+N", handler: () => { /* open namespace dropdown */ }, priority: 50 },
//     { key: "Cmd+Shift+C", handler: () => { /* open cluster dropdown */   }, priority: 50 },
//   ]);
//
//   return <ShortcutHelpOverlay open={helpOpen} onClose={() => setHelpOpen(false)} />;
// }
```

### Complete Shortcut Reference Table

| Shortcut | Action | Scope |
|----------|--------|-------|
| `G` → `O` | Go to Overview | Global |
| `G` → `P` | Go to Pods | Global |
| `G` → `D` | Go to Deployments | Global |
| `G` → `S` | Go to Services | Global |
| `G` → `N` | Go to Nodes | Global |
| `G` → `E` | Go to Events | Global |
| `G` → `H` | Go to Helm Releases | Global |
| `G` → `C` | Go to ConfigMaps | Global |
| `G` → `I` | Go to Ingresses | Global |
| `Cmd+K` / `/` | Open command palette | Global |
| `[` | Toggle sidebar collapse | Global |
| `` Ctrl+` `` | Toggle bottom tray | Global |
| `?` | Open shortcut help overlay | Global |
| `Cmd+Shift+N` | Open namespace filter | Global |
| `Cmd+Shift+C` | Open cluster switcher | Global |
| `↑` / `↓` | Select table row | Table view |
| `Enter` | Open selected resource detail | Table view |
| `Escape` | Close detail / close palette | Contextual |
| `L` | View logs for selected resource | Table view |
| `X` | Exec shell into selected pod | Table view |
| `E` | Edit selected resource YAML | Table view |
| `Cmd+Backspace` | Delete selected resource (with confirm) | Table view |

### Shortcut Help Overlay

```tsx
// src/components/shortcuts/ShortcutHelpOverlay.tsx
import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";

const SHORTCUT_GROUPS = [
  {
    title: "Navigation",
    items: [
      { keys: ["G", "O"], label: "Overview" },
      { keys: ["G", "P"], label: "Pods" },
      { keys: ["G", "D"], label: "Deployments" },
      { keys: ["G", "S"], label: "Services" },
      { keys: ["G", "N"], label: "Nodes" },
      { keys: ["G", "E"], label: "Events" },
      { keys: ["G", "H"], label: "Helm Releases" },
      { keys: ["G", "C"], label: "ConfigMaps" },
      { keys: ["G", "I"], label: "Ingresses" },
    ],
  },
  {
    title: "Interface",
    items: [
      { keys: ["⌘", "K"],      label: "Command Palette" },
      { keys: ["["],            label: "Toggle Sidebar" },
      { keys: ["⌃", "`"],      label: "Toggle Bottom Tray" },
      { keys: ["?"],            label: "Shortcut Help" },
      { keys: ["⌘", "⇧", "N"], label: "Namespace Filter" },
      { keys: ["⌘", "⇧", "C"], label: "Cluster Switcher" },
    ],
  },
  {
    title: "Table Actions",
    items: [
      { keys: ["↑", "↓"],       label: "Select row" },
      { keys: ["↵"],            label: "Open detail" },
      { keys: ["L"],            label: "View Logs" },
      { keys: ["X"],            label: "Exec Shell" },
      { keys: ["E"],            label: "Edit YAML" },
      { keys: ["⌘", "⌫"],      label: "Delete resource" },
      { keys: ["Esc"],          label: "Close / dismiss" },
    ],
  },
];

interface ShortcutHelpOverlayProps {
  open: boolean;
  onClose: () => void;
}

export function ShortcutHelpOverlay({ open, onClose }: ShortcutHelpOverlayProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "?") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-8"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-bg-secondary border border-border rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-text-primary font-semibold">Keyboard Shortcuts</h2>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Grid of groups */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 p-6">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="text-2xs font-semibold uppercase tracking-wider text-text-tertiary mb-3">
                {group.title}
              </h3>
              <div className="space-y-2">
                {group.items.map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-4">
                    <span className="text-sm text-text-secondary">{item.label}</span>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {item.keys.map((k, i) => (
                        <kbd
                          key={i}
                          className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 text-xs text-text-tertiary bg-bg-tertiary border border-border rounded font-mono"
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

---

## 4.6 — Bottom Tray — Complete Implementation

```tsx
// src/components/bottom-tray/BottomTray.tsx
import { useRef, useEffect, useCallback, lazy, Suspense } from "react";
import { X, FileText, Terminal, AlertCircle } from "lucide-react";
import { cn } from "../../lib/utils";
import { useUIStore } from "../../stores/uiStore";
import { useSelectionStore } from "../../stores/selectionStore";

// Lazy-load heavy tab content
const LogsTab     = lazy(() => import("./tabs/LogsTab"));
const TerminalTab = lazy(() => import("./tabs/TerminalTab"));
const EventsTab   = lazy(() => import("./tabs/EventsTab"));

// ─── Types ────────────────────────────────────────────────────────────────────

type TrayTab = "logs" | "terminal" | "events";

// ─── Drag Handle ──────────────────────────────────────────────────────────────

interface DragHandleProps {
  onDrag: (dy: number) => void;
  onDoubleClick: () => void;
}

function DragHandle({ onDrag, onDoubleClick }: DragHandleProps) {
  const dragging = useRef(false);
  const lastY = useRef(0);

  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    lastY.current = e.clientY;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const dy = lastY.current - e.clientY; // negative dy = dragging down = shrink
      lastY.current = e.clientY;
      onDrag(dy);
    };
    const onMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onDrag]);

  return (
    <div
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      className={cn(
        "h-1.5 w-full flex items-center justify-center cursor-row-resize",
        "hover:bg-accent/20 transition-colors duration-100 group shrink-0"
      )}
    >
      <div className="w-8 h-0.5 rounded-full bg-border group-hover:bg-accent/60 transition-colors" />
    </div>
  );
}

// ─── Tab Bar ──────────────────────────────────────────────────────────────────

interface TabConfig {
  id: TrayTab;
  label: string;
  icon: React.ElementType;
  badge?: number | string;
}

interface TabBarProps {
  tabs: TabConfig[];
  activeTab: TrayTab;
  onTabChange: (tab: TrayTab) => void;
  onTabClose?: (tab: TrayTab) => void;
}

function TabBar({ tabs, activeTab, onTabChange, onTabClose }: TabBarProps) {
  return (
    <div className="flex items-center border-b border-border bg-bg-secondary px-2 shrink-0">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        const Icon = tab.icon;
        return (
          <div key={tab.id} className="relative group">
            <button
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 transition-all duration-100",
                "hover:text-text-primary",
                isActive
                  ? "border-accent text-text-primary"
                  : "border-transparent text-text-tertiary hover:text-text-secondary"
              )}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{tab.label}</span>
              {tab.badge !== undefined && tab.badge !== 0 && (
                <span className={cn(
                  "text-2xs rounded-full px-1.5 py-0.5 tabular-nums font-medium",
                  isActive ? "bg-accent/20 text-accent" : "bg-bg-tertiary text-text-tertiary"
                )}>
                  {tab.badge}
                </span>
              )}
            </button>
            {/* Close button on hover */}
            {onTabClose && (
              <button
                onClick={(e) => { e.stopPropagation(); onTabClose(tab.id); }}
                className={cn(
                  "absolute right-0.5 top-1/2 -translate-y-1/2",
                  "opacity-0 group-hover:opacity-100 transition-opacity",
                  "p-0.5 rounded hover:bg-bg-hover text-text-tertiary hover:text-text-primary"
                )}
              >
                <X className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── BottomTray Root ──────────────────────────────────────────────────────────

const MIN_HEIGHT  = 150;
const MAX_HEIGHT_RATIO = 0.6; // 60% of viewport
const DEFAULT_HEIGHT = 250;
const EXPANDED_HEIGHT_RATIO = 0.5;

export function BottomTray() {
  const {
    bottomTrayOpen,
    bottomTrayHeight,
    bottomTrayTab,
    setBottomTrayHeight,
    setBottomTrayTab,
    toggleBottomTray,
  } = useUIStore();

  const { selectedResource } = useSelectionStore();

  // Clamp height within viewport limits
  const clampHeight = useCallback((h: number): number => {
    const max = window.innerHeight * MAX_HEIGHT_RATIO;
    return Math.max(MIN_HEIGHT, Math.min(max, h));
  }, []);

  const handleDrag = useCallback((dy: number) => {
    setBottomTrayHeight((prev) => clampHeight(prev + dy));
  }, [setBottomTrayHeight, clampHeight]);

  const handleDoubleClick = useCallback(() => {
    const current = bottomTrayHeight;
    const expanded = Math.floor(window.innerHeight * EXPANDED_HEIGHT_RATIO);
    // Toggle between default and 50% viewport
    setBottomTrayHeight(current === expanded ? DEFAULT_HEIGHT : expanded);
  }, [bottomTrayHeight, setBottomTrayHeight]);

  const tabs: TabConfig[] = [
    {
      id: "logs",
      label: selectedResource ? `Logs: ${selectedResource.name}` : "Logs",
      icon: FileText,
    },
    {
      id: "terminal",
      label: "Terminal",
      icon: Terminal,
      badge: undefined, // session count injected by TerminalTab
    },
    {
      id: "events",
      label: "Events",
      icon: AlertCircle,
    },
  ];

  if (!bottomTrayOpen) return null;

  return (
    <div
      style={{ height: bottomTrayHeight }}
      className={cn(
        "flex flex-col border-t border-border bg-bg-primary shrink-0",
        "transition-[height] duration-150 ease-out"
      )}
    >
      {/* Resize handle */}
      <DragHandle onDrag={handleDrag} onDoubleClick={handleDoubleClick} />

      {/* Tab bar */}
      <TabBar
        tabs={tabs}
        activeTab={bottomTrayTab}
        onTabChange={setBottomTrayTab}
      />

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        <Suspense fallback={
          <div className="flex items-center justify-center h-full text-text-tertiary text-sm">
            Loading…
          </div>
        }>
          {bottomTrayTab === "logs"     && <LogsTab resource={selectedResource} />}
          {bottomTrayTab === "terminal" && <TerminalTab resource={selectedResource} />}
          {bottomTrayTab === "events"   && <EventsTab />}
        </Suspense>
      </div>
    </div>
  );
}
```

---

## 4.7 — Zustand Stores — Complete Implementation

### clusterStore.ts

```typescript
// src/stores/clusterStore.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ClusterStatus = "connected" | "connecting" | "disconnected" | "error";

export interface ClusterInfo {
  name: string;
  server: string;
  status: ClusterStatus;
  color: string;       // hex color for identification
  contextName: string; // kubeconfig context name
}

export interface CustomResourceDef {
  label: string;
  group: string;
  resource: string;
  path: string;         // e.g. /custom/cert-manager.io/certificates
}

interface ClusterState {
  // Data
  activeCluster: string | null;
  clusters: ClusterInfo[];
  namespaces: string[];
  selectedNamespace: string;
  k8sVersion: string | null;
  customResources: CustomResourceDef[];
  connectionError: string | null;

  // Actions
  setActiveCluster: (name: string | null) => void;
  setClusters: (clusters: ClusterInfo[]) => void;
  updateClusterStatus: (name: string, status: ClusterStatus) => void;
  connectCluster: (name: string) => void;
  disconnectCluster: () => void;
  setNamespaces: (ns: string[]) => void;
  setNamespace: (ns: string) => void;
  setK8sVersion: (v: string) => void;
  setCustomResources: (crds: CustomResourceDef[]) => void;
  setConnectionError: (err: string | null) => void;
}

// Assign a deterministic color from a palette based on cluster name
const CLUSTER_COLORS = [
  "#7C5CFC", "#4ADE80", "#F59E0B", "#F87171",
  "#60A5FA", "#A78BFA", "#34D399", "#FB923C",
];

function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return CLUSTER_COLORS[Math.abs(hash) % CLUSTER_COLORS.length];
}

export const useClusterStore = create<ClusterState>()(
  persist(
    (set, get) => ({
      activeCluster: null,
      clusters: [],
      namespaces: [],
      selectedNamespace: "",
      k8sVersion: null,
      customResources: [],
      connectionError: null,

      setActiveCluster: (name) => set({ activeCluster: name }),

      setClusters: (clusters) => set({ clusters }),

      updateClusterStatus: (name, status) =>
        set((s) => ({
          clusters: s.clusters.map((c) =>
            c.name === name ? { ...c, status } : c
          ),
        })),

      connectCluster: async (name) => {
        // Optimistic update: mark as connecting
        set((s) => ({
          activeCluster: name,
          clusters: s.clusters.map((c) =>
            c.name === name ? { ...c, status: "connecting" } : c
          ),
          connectionError: null,
        }));

        try {
          // Call Wails Go backend
          const { ConnectCluster } = await import("../wailsjs/go/main/App");
          await ConnectCluster(name);

          set((s) => ({
            clusters: s.clusters.map((c) =>
              c.name === name ? { ...c, status: "connected" } : c
            ),
          }));
        } catch (err) {
          set((s) => ({
            activeCluster: null,
            clusters: s.clusters.map((c) =>
              c.name === name ? { ...c, status: "error" } : c
            ),
            connectionError: String(err),
          }));
        }
      },

      disconnectCluster: () =>
        set((s) => ({
          activeCluster: null,
          clusters: s.clusters.map((c) =>
            c.name === s.activeCluster ? { ...c, status: "disconnected" } : c
          ),
          namespaces: [],
          selectedNamespace: "",
          k8sVersion: null,
          customResources: [],
        })),

      setNamespaces: (ns) => set({ namespaces: ns }),
      setNamespace:  (ns) => set({ selectedNamespace: ns }),
      setK8sVersion: (v)  => set({ k8sVersion: v }),
      setCustomResources: (crds) => set({ customResources: crds }),
      setConnectionError: (err)  => set({ connectionError: err }),
    }),
    {
      name: "kubeviewer-cluster",
      // Only persist cluster list and selection, not live status
      partialize: (s) => ({
        clusters: s.clusters.map((c) => ({ ...c, status: "disconnected" as ClusterStatus })),
        selectedNamespace: s.selectedNamespace,
      }),
    }
  )
);
```

### uiStore.ts

```typescript
// src/stores/uiStore.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "dark" | "light";
export type TrayTab = "logs" | "terminal" | "events";

interface UIState {
  // Sidebar
  sidebarCollapsed: boolean;
  sidebarWidth: number;

  // Bottom tray
  bottomTrayOpen: boolean;
  bottomTrayHeight: number;
  bottomTrayTab: TrayTab;

  // Theme
  theme: Theme;

  // Shortcuts
  shortcutsEnabled: boolean;

  // Actions
  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;
  setSidebarWidth: (updater: number | ((prev: number) => number)) => void;

  toggleBottomTray: () => void;
  setBottomTrayOpen: (v: boolean) => void;
  setBottomTrayHeight: (updater: number | ((prev: number) => number)) => void;
  setBottomTrayTab: (tab: TrayTab) => void;

  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setShortcutsEnabled: (v: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      sidebarWidth: 220,
      bottomTrayOpen: false,
      bottomTrayHeight: 250,
      bottomTrayTab: "logs",
      theme: "dark",
      shortcutsEnabled: true,

      toggleSidebar:    () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      setSidebarWidth: (updater) =>
        set((s) => ({
          sidebarWidth: typeof updater === "function" ? updater(s.sidebarWidth) : updater,
        })),

      toggleBottomTray:    () => set((s) => ({ bottomTrayOpen: !s.bottomTrayOpen })),
      setBottomTrayOpen:   (v) => set({ bottomTrayOpen: v }),
      setBottomTrayHeight: (updater) =>
        set((s) => ({
          bottomTrayHeight: typeof updater === "function" ? updater(s.bottomTrayHeight) : updater,
        })),
      setBottomTrayTab: (tab) => set({ bottomTrayTab: tab, bottomTrayOpen: true }),

      setTheme:   (theme) => set({ theme }),
      toggleTheme: () => set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
      setShortcutsEnabled: (v) => set({ shortcutsEnabled: v }),
    }),
    { name: "kubeviewer-ui" }
  )
);
```

### selectionStore.ts

```typescript
// src/stores/selectionStore.ts
import { create } from "zustand";

export interface SelectedResource {
  kind: string;
  name: string;
  namespace?: string;
  path: string;
  /** Raw resource object for context-aware actions */
  raw?: Record<string, unknown>;
}

interface SelectionState {
  selectedResource: SelectedResource | null;
  setSelectedResource: (r: SelectedResource | null) => void;
  clearSelection: () => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedResource: null,
  setSelectedResource: (r) => set({ selectedResource: r }),
  clearSelection: () => set({ selectedResource: null }),
}));
```

### favoritesStore.ts

```typescript
// src/stores/favoritesStore.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface FavoriteItem {
  label: string;
  path: string;
  icon: string;  // lucide icon name
  addedAt: number;
}

export interface RecentItem {
  label: string;
  path: string;
  icon: string;
  timestamp: number;
}

interface FavoritesState {
  favorites: FavoriteItem[];
  recentItems: RecentItem[];

  addFavorite: (item: FavoriteItem) => void;
  removeFavorite: (path: string) => void;
  reorderFavorites: (fromIndex: number, toIndex: number) => void;
  isFavorite: (path: string) => boolean;

  addRecentItem: (item: RecentItem) => void;
  clearRecent: () => void;

  // Cluster color overrides
  clusterColors: Record<string, string>;
  setClusterColor: (clusterName: string, color: string) => void;
}

const MAX_RECENT = 10;

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      favorites: [],
      recentItems: [],
      clusterColors: {},

      addFavorite: (item) =>
        set((s) => ({
          favorites: s.favorites.some((f) => f.path === item.path)
            ? s.favorites
            : [...s.favorites, item],
        })),

      removeFavorite: (path) =>
        set((s) => ({ favorites: s.favorites.filter((f) => f.path !== path) })),

      reorderFavorites: (from, to) =>
        set((s) => {
          const arr = [...s.favorites];
          const [item] = arr.splice(from, 1);
          arr.splice(to, 0, item);
          return { favorites: arr };
        }),

      isFavorite: (path) => get().favorites.some((f) => f.path === path),

      addRecentItem: (item) =>
        set((s) => {
          const filtered = s.recentItems.filter((r) => r.path !== item.path);
          return { recentItems: [item, ...filtered].slice(0, MAX_RECENT) };
        }),

      clearRecent: () => set({ recentItems: [] }),

      setClusterColor: (name, color) =>
        set((s) => ({ clusterColors: { ...s.clusterColors, [name]: color } })),
    }),
    { name: "kubeviewer-favorites" }
  )
);
```

---

## 4.8 — Theme System — Complete Implementation

### globals.css

```css
/* src/styles/globals.css */

/* ─── Font setup ────────────────────────────────────────────────────────────── */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

/* ─── Custom font sizes ────────────────────────────────────────────────────── */
@layer base {
  .text-2xs { font-size: 0.625rem; line-height: 0.875rem; }
}

/* ─── Smooth theme transitions ─────────────────────────────────────────────── */
*, *::before, *::after {
  transition-property: background-color, border-color, color;
  transition-duration: 150ms;
  transition-timing-function: ease-out;
}

/* Disable transition on elements that shouldn't animate */
[data-no-theme-transition], svg, img {
  transition: none !important;
}

/* ─── Dark theme (default) ──────────────────────────────────────────────────── */
:root {
  color-scheme: dark;

  /* Backgrounds — layered from deepest to shallowest */
  --color-bg-primary:   #0A0A0B;   /* main content background */
  --color-bg-secondary: #111113;   /* sidebar, topbar */
  --color-bg-tertiary:  #1A1A1E;   /* cards, dropdowns, command palette */
  --color-bg-hover:     #1F1F24;   /* hover state on interactive items */
  --color-bg-active:    #26262C;   /* selected/active state */

  /* Text */
  --color-text-primary:   #EDEDEF;  /* headings, active labels */
  --color-text-secondary: #8B8B8E;  /* body text, nav labels */
  --color-text-tertiary:  #5C5C63;  /* muted text, badges, placeholders */

  /* Borders */
  --color-border:        #26262C;   /* default dividers */
  --color-border-strong: #3A3A42;   /* emphasized borders, focused inputs */

  /* Accent (Linear purple) */
  --color-accent:        #7C5CFC;
  --color-accent-hover:  #8E72FF;
  --color-accent-muted:  rgba(124, 92, 252, 0.12);

  /* Semantic status colors */
  --color-success:  #4ADE80;
  --color-warning:  #FBBF24;
  --color-error:    #F87171;
  --color-info:     #60A5FA;

  /* Scrollbar */
  --color-scrollbar-thumb: #3A3A42;
  --color-scrollbar-track: transparent;

  /* Shadows */
  --shadow-sm:  0 1px 3px rgba(0,0,0,0.4);
  --shadow-md:  0 4px 12px rgba(0,0,0,0.5);
  --shadow-xl:  0 8px 32px rgba(0,0,0,0.6);
}

/* ─── Light theme ────────────────────────────────────────────────────────────── */
.theme-light {
  color-scheme: light;

  --color-bg-primary:   #F4F4F5;
  --color-bg-secondary: #FAFAFA;
  --color-bg-tertiary:  #FFFFFF;
  --color-bg-hover:     #E8E8EC;
  --color-bg-active:    #DDDDE3;

  --color-text-primary:   #18181B;
  --color-text-secondary: #52525B;
  --color-text-tertiary:  #A1A1AA;

  --color-border:        #E4E4E7;
  --color-border-strong: #C4C4CC;

  --color-accent:        #6B47E5;
  --color-accent-hover:  #5A38D4;
  --color-accent-muted:  rgba(107, 71, 229, 0.10);

  --color-success:  #16A34A;
  --color-warning:  #D97706;
  --color-error:    #DC2626;
  --color-info:     #2563EB;

  --color-scrollbar-thumb: #C4C4CC;
  --color-scrollbar-track: transparent;

  --shadow-sm:  0 1px 3px rgba(0,0,0,0.08);
  --shadow-md:  0 4px 12px rgba(0,0,0,0.12);
  --shadow-xl:  0 8px 32px rgba(0,0,0,0.16);
}

/* ─── High contrast mode ─────────────────────────────────────────────────────── */
@media (prefers-contrast: more) {
  :root {
    --color-text-primary:   #FFFFFF;
    --color-text-secondary: #CCCCCC;
    --color-border:         #666666;
    --color-border-strong:  #AAAAAA;
  }
  .theme-light {
    --color-text-primary:   #000000;
    --color-text-secondary: #333333;
    --color-border:         #888888;
  }
}

/* ─── Thin scrollbar ──────────────────────────────────────────────────────── */
.scrollbar-thin::-webkit-scrollbar       { width: 4px; height: 4px; }
.scrollbar-thin::-webkit-scrollbar-track { background: var(--color-scrollbar-track); }
.scrollbar-thin::-webkit-scrollbar-thumb { background: var(--color-scrollbar-thumb); border-radius: 2px; }
.scrollbar-thin::-webkit-scrollbar-thumb:hover { background: var(--color-border-strong); }

/* ─── Wails macOS drag region helper ─────────────────────────────────────── */
[data-wails-drag] { -webkit-app-region: drag; }
[data-wails-no-drag] { -webkit-app-region: no-drag; }

/* ─── Animations ─────────────────────────────────────────────────────────── */
@keyframes scale-in {
  from { opacity: 0; transform: scale(0.97); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes slide-in {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.animate-scale-in { animation: scale-in 100ms ease-out; }
.animate-slide-in { animation: slide-in 100ms ease-out; }
.animate-fade-in  { animation: fade-in  150ms ease-out; }
```

### ThemeProvider

```tsx
// src/providers/ThemeProvider.tsx
import { useEffect } from "react";
import { useUIStore } from "../stores/uiStore";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme, setTheme } = useUIStore();

  // Sync system preference on first load if no saved preference
  useEffect(() => {
    const saved = localStorage.getItem("kubeviewer-ui");
    if (!saved) {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      setTheme(prefersDark ? "dark" : "light");
    }
  }, []);

  // Apply theme class to root element
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light") {
      root.classList.add("theme-light");
    } else {
      root.classList.remove("theme-light");
    }
  }, [theme]);

  // Listen for OS-level preference changes
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      setTheme(e.matches ? "dark" : "light");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [setTheme]);

  return <>{children}</>;
}
```

### tailwind.config.ts — semantic token integration

```typescript
// tailwind.config.ts
import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: ["class", ".theme-light"],
  theme: {
    extend: {
      colors: {
        "bg-primary":   "var(--color-bg-primary)",
        "bg-secondary": "var(--color-bg-secondary)",
        "bg-tertiary":  "var(--color-bg-tertiary)",
        "bg-hover":     "var(--color-bg-hover)",
        "bg-active":    "var(--color-bg-active)",

        "text-primary":   "var(--color-text-primary)",
        "text-secondary": "var(--color-text-secondary)",
        "text-tertiary":  "var(--color-text-tertiary)",

        border:        "var(--color-border)",
        "border-strong": "var(--color-border-strong)",

        accent:        "var(--color-accent)",
        "accent-hover":  "var(--color-accent-hover)",
        "accent-muted":  "var(--color-accent-muted)",

        success: "var(--color-success)",
        warning: "var(--color-warning)",
        error:   "var(--color-error)",
        info:    "var(--color-info)",
      },
      fontSize: {
        "2xs": ["0.625rem", "0.875rem"],
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        xl: "var(--shadow-xl)",
      },
    },
  },
  plugins: [],
} satisfies Config;
```

---

## 4.9 — Connection & Notification Banners

```tsx
// src/components/banners/ConnectionBanners.tsx
import { useState, useEffect } from "react";
import { AlertTriangle, X, RefreshCw, Info, ArrowUp } from "lucide-react";
import { cn } from "../../lib/utils";
import { useClusterStore } from "../../stores/clusterStore";

// ─── Base Banner ──────────────────────────────────────────────────────────────

interface BannerProps {
  variant: "warning" | "error" | "info" | "success";
  icon?: React.ReactNode;
  message: React.ReactNode;
  action?: React.ReactNode;
  dismissable?: boolean;
  onDismiss?: () => void;
}

function Banner({ variant, icon, message, action, dismissable, onDismiss }: BannerProps) {
  const styles = {
    warning: "bg-warning/10 border-warning/30 text-warning",
    error:   "bg-error/10   border-error/30   text-error",
    info:    "bg-info/10    border-info/30    text-info",
    success: "bg-success/10 border-success/30 text-success",
  };

  return (
    <div className={cn(
      "flex items-center gap-3 px-4 py-2 text-xs border-b",
      styles[variant]
    )}>
      {icon && <div className="shrink-0">{icon}</div>}
      <div className="flex-1">{message}</div>
      {action && <div className="shrink-0">{action}</div>}
      {dismissable && onDismiss && (
        <button onClick={onDismiss} className="shrink-0 p-0.5 rounded hover:bg-black/10 transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

// ─── Connection Lost Banner ───────────────────────────────────────────────────

function ConnectionLostBanner() {
  const { clusters, activeCluster, connectCluster } = useClusterStore();
  const current = clusters.find((c) => c.name === activeCluster);
  const [countdown, setCountdown] = useState(30);
  const isDisconnected = current?.status === "disconnected" || current?.status === "error";
  const isReconnecting = current?.status === "connecting";

  useEffect(() => {
    if (!isDisconnected) return;
    setCountdown(30);
    const interval = setInterval(() => {
      setCountdown((n) => {
        if (n <= 1) {
          // Auto-reconnect
          if (activeCluster) connectCluster(activeCluster);
          return 30;
        }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isDisconnected, activeCluster, connectCluster]);

  if (!isDisconnected && !isReconnecting) return null;

  return (
    <Banner
      variant="warning"
      icon={
        isReconnecting
          ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          : <AlertTriangle className="w-3.5 h-3.5" />
      }
      message={
        isReconnecting
          ? `Reconnecting to ${activeCluster}…`
          : `Connection lost to ${activeCluster}. Retrying in ${countdown}s.`
      }
      action={
        activeCluster && !isReconnecting ? (
          <button
            onClick={() => connectCluster(activeCluster)}
            className="underline underline-offset-2 hover:no-underline transition-all"
          >
            Reconnect now
          </button>
        ) : null
      }
    />
  );
}

// ─── RBAC Warning Banner ──────────────────────────────────────────────────────

interface RBACBannerProps {
  missingPermissions: string[];
}

function RBACWarningBanner({ missingPermissions }: RBACBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || missingPermissions.length === 0) return null;

  return (
    <Banner
      variant="warning"
      icon={<AlertTriangle className="w-3.5 h-3.5" />}
      message={
        <>
          Missing permissions:{" "}
          <span className="font-mono">{missingPermissions.slice(0, 3).join(", ")}</span>
          {missingPermissions.length > 3 && ` +${missingPermissions.length - 3} more`}.
          Some features may be unavailable.
        </>
      }
      dismissable
      onDismiss={() => setDismissed(true)}
    />
  );
}

// ─── Update Available Banner ──────────────────────────────────────────────────

interface UpdateBannerProps {
  version: string;
  onInstall: () => void;
}

function UpdateBanner({ version, onInstall }: UpdateBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <Banner
      variant="info"
      icon={<ArrowUp className="w-3.5 h-3.5" />}
      message={`KubeViewer ${version} is available.`}
      action={
        <button
          onClick={onInstall}
          className="underline underline-offset-2 hover:no-underline transition-all"
        >
          Install update
        </button>
      }
      dismissable
      onDismiss={() => setDismissed(true)}
    />
  );
}

// ─── Error Banner ─────────────────────────────────────────────────────────────

interface ErrorBannerProps {
  message: string;
  onDismiss: () => void;
}

function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  return (
    <Banner
      variant="error"
      icon={<AlertTriangle className="w-3.5 h-3.5" />}
      message={message}
      dismissable
      onDismiss={onDismiss}
    />
  );
}

// ─── Combined export ──────────────────────────────────────────────────────────

interface ConnectionBannersProps {
  rbacMissingPermissions?: string[];
  updateVersion?: string;
  onInstallUpdate?: () => void;
  errors?: Array<{ id: string; message: string }>;
  onDismissError?: (id: string) => void;
}

export function ConnectionBanners({
  rbacMissingPermissions = [],
  updateVersion,
  onInstallUpdate,
  errors = [],
  onDismissError,
}: ConnectionBannersProps) {
  return (
    <div className="flex flex-col">
      <ConnectionLostBanner />
      <RBACWarningBanner missingPermissions={rbacMissingPermissions} />
      {updateVersion && onInstallUpdate && (
        <UpdateBanner version={updateVersion} onInstall={onInstallUpdate} />
      )}
      {errors.map((err) => (
        <ErrorBanner
          key={err.id}
          message={err.message}
          onDismiss={() => onDismissError?.(err.id)}
        />
      ))}
    </div>
  );
}
```

---

## 4.10 — Acceptance Criteria

- [ ] All routes defined with lazy loading — bundle split verified in DevTools
- [ ] `RequireCluster` guard redirects to `/welcome` when no cluster connected
- [ ] 404 route renders `NotFound` for unmatched paths
- [ ] URL params (`namespace`, `name`, `group`, `resource`) extracted correctly in detail views
- [ ] Sidebar renders all sections from `NAV_SECTIONS` data structure
- [ ] Cluster selector dropdown lists all clusters with status dots
- [ ] Cluster selector search/filter works correctly
- [ ] Section collapse state persists across page refreshes (localStorage)
- [ ] Sidebar collapses to 48px icon-only mode with `[` key
- [ ] In collapsed mode, Radix UI tooltips appear on hover with label + shortcut
- [ ] Sidebar resize handle drags between 180px and 350px, persisted in store
- [ ] Favorites section renders pinned items (hidden when empty)
- [ ] Custom Resources section populates after cluster connect
- [ ] Topbar drag region set on macOS (traffic light space)
- [ ] Breadcrumb auto-generates from route, each segment navigable
- [ ] Long breadcrumb names truncate with tooltip
- [ ] Namespace filter dropdown lists namespaces, shows recent section
- [ ] Changing namespace updates Zustand `selectedNamespace`
- [ ] Cluster health indicator shows correct color dot + version on hover
- [ ] Theme toggle switches dark/light, transitions smoothly
- [ ] Command palette opens with `Cmd+K` and `/`
- [ ] Typing in palette fuzzy-filters navigation and action commands
- [ ] Resource search fires after 200ms debounce, shows kind badge
- [ ] "Switch Cluster" sub-menu opens nested cluster list
- [ ] "Change Namespace" sub-menu opens nested namespace list
- [ ] Context-aware commands appear when a resource is selected
- [ ] Recent items section shows last 5 navigated items
- [ ] Shortcut keys display correctly next to items (right-aligned)
- [ ] `Escape` closes command palette from any state
- [ ] All keyboard shortcuts registered without conflict
- [ ] Chord sequences (`G P`, `G D`, etc.) navigate correctly
- [ ] Visual chord indicator appears while waiting for second key
- [ ] Shortcut help overlay `?` lists all shortcuts in groups
- [ ] Shortcuts suppressed when typing in input/textarea
- [ ] Bottom tray toggles with `` Ctrl+` ``
- [ ] Drag handle resizes tray between 150px and 60% viewport
- [ ] Double-click drag handle toggles between 250px and 50% viewport
- [ ] Tray height persists in Zustand store (saved to localStorage)
- [ ] All three tabs (Logs, Terminal, Events) render with Suspense boundaries
- [ ] All Zustand stores typed with TypeScript interfaces
- [ ] `clusterStore` persists cluster list but resets live status to disconnected
- [ ] `uiStore` persists all UI preferences
- [ ] `selectionStore` bridges table row selection to bottom tray context
- [ ] Dark and light themes render correctly on all elements
- [ ] System preference detected and applied on first load
- [ ] High-contrast media query adjusts token values
- [ ] Theme switches smoothly (150ms background-color/color transition)
- [ ] Connection lost banner shows with countdown and reconnect button
- [ ] RBAC warning banner is dismissable
- [ ] Update banner is dismissable
- [ ] Error banners are dismissable individually
- [ ] All animations complete in under 200ms
