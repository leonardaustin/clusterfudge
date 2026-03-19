// src/components/sidebar/Sidebar.tsx
import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Home,
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
  Wand2,
  Activity,
  ShieldCheck,
  Bell,
  FileSearch,
  ArchiveRestore,
  GitBranch,
  Map,
  Stethoscope,
} from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/uiStore";
import { useClusterStore } from "@/stores/clusterStore";
import { useFavoritesStore } from "@/stores/favoritesStore";
import { useResourceCounts } from "@/hooks/useResourceCounts";


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

// Icon name → component lookup for favorites (stored as strings for persistence)
const ICON_MAP: Record<string, React.ElementType> = {
  box: Box, layers: Layers, database: Database, radio: Radio,
  briefcase: Briefcase, clock: Clock, network: Network, globe: Globe,
  "file-text": FileText, lock: Lock, "hard-drive": HardDrive,
  server: Server, "alert-circle": AlertCircle, package: Package,
  settings: Settings, puzzle: Puzzle, star: Star,
  "layout-dashboard": LayoutDashboard,
};

function resolveIcon(iconName: string): React.ElementType {
  return ICON_MAP[iconName] ?? Box;
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
      { label: "HPAs",            icon: ArrowUpDown, path: "/config/hpas",                             resourceKey: "horizontalpodautoscalers" },
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

const BETA_NAV_SECTIONS: NavSection[] = [
  {
    id: "tools",
    label: "Tools",
    items: [
      { label: "Topology",       icon: Map,          path: "/topology" },
      { label: "Metrics",        icon: Activity,     path: "/metrics" },
      { label: "Troubleshoot",   icon: Stethoscope,  path: "/troubleshoot" },
    ],
  },
  {
    id: "wizards",
    label: "Wizards",
    items: [
      { label: "Deployment", icon: Wand2,    path: "/wizards/deployment" },
      { label: "Service",    icon: Wand2,    path: "/wizards/service" },
      { label: "ConfigMap",  icon: Wand2,    path: "/wizards/configmap" },
      { label: "Secret",     icon: Wand2,    path: "/wizards/secret" },
      { label: "Templates",  icon: FileText, path: "/wizards/templates" },
    ],
  },
  {
    id: "security",
    label: "Security",
    items: [
      { label: "Overview",    icon: ShieldCheck, path: "/security/overview" },
      { label: "RBAC Graph",  icon: Users,       path: "/security/rbac-graph" },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    items: [
      { label: "Alerts",           icon: Bell,           path: "/ops/alerts" },
      { label: "Audit Log",        icon: FileSearch,     path: "/ops/audit" },
      { label: "Backup & Restore", icon: ArchiveRestore, path: "/ops/backup" },
      { label: "GitOps",           icon: GitBranch,      path: "/ops/gitops" },
      { label: "NetPol Graph",     icon: Shield,         path: "/ops/netpol-graph" },
    ],
  },
];

// ─── Cluster Selector ─────────────────────────────────────────────────────────

const STATUS_COLORS: Record<import("@/stores/clusterStore").ClusterStatus, string> = {
  connected:    "bg-green-400",
  connecting:   "bg-yellow-400 animate-pulse",
  disconnected: "bg-gray-500",
  error:        "bg-red-400",
};

function ClusterSelector({ collapsed }: { collapsed: boolean }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { activeCluster, clusters, connectCluster } = useClusterStore();
  const navigate = useNavigate();
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
              onClick={() => { navigate("/welcome"); setOpen(false); }}
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
        "group flex items-center gap-2 px-3 py-1.5 rounded-md text-xs",
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
          <span className="flex-1 truncate text-xs leading-none">{item.label}</span>
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
  const open = useUIStore((s) => !s.collapsedSections[section.id]);
  const toggleSection = useUIStore((s) => s.toggleSection);

  const toggle = () => toggleSection(section.id);

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
              item={{ label: fav.label, icon: resolveIcon(fav.icon), path: fav.path }}
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
        "hover:bg-accent transition-colors duration-150 delay-150",
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
    setSidebarWidth((prev: number) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, prev + dx)));
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
        {/* Home & Overview */}
        <div className={cn("px-2 mt-1", sidebarCollapsed && "px-1")}>
          <NavItemRow
            item={{ label: "Home", icon: Home, path: "/welcome" }}
            isActive={location.pathname === "/welcome"}
            collapsed={sidebarCollapsed}
          />
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

        {/* Extended sections */}
        {BETA_NAV_SECTIONS.map((section) => (
          <SidebarSection
            key={section.id}
            section={section}
            collapsed={sidebarCollapsed}
            counts={counts}
          />
        ))}
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
