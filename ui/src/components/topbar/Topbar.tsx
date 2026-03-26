import { useState, useCallback, useMemo } from "react";
import { useLocation, Link } from "react-router-dom";
import {
  Search,
  Sun,
  Moon,
  ChevronRight,
  Command,
  ChevronsUpDown,
  Globe,
  Tag,
  Check,
} from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";
import { useClusterStore } from "@/stores/clusterStore";
import { useFavoritesStore } from "@/stores/favoritesStore";
import { useUIStore } from "@/stores/uiStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useOS } from "@/hooks/useOS";
import { useCommandPalette } from "@/hooks/useCommandPalette";

// ─── Segment Map ─────────────────────────────────────────────────────────────

const SEGMENT_MAP: Record<string, string> = {
  overview: "Overview",
  workloads: "Workloads",
  networking: "Networking",
  config: "Configuration",
  storage: "Storage",
  rbac: "RBAC",
  cluster: "Cluster",
  helm: "Helm",
  custom: "Custom Resources",
  settings: "Settings",
  pods: "Pods",
  deployments: "Deployments",
  statefulsets: "StatefulSets",
  daemonsets: "DaemonSets",
  replicasets: "ReplicaSets",
  jobs: "Jobs",
  cronjobs: "CronJobs",
  services: "Services",
  ingresses: "Ingresses",
  endpoints: "Endpoints",
  "network-policies": "Network Policies",
  configmaps: "ConfigMaps",
  secrets: "Secrets",
  hpas: "HPAs",
  pvcs: "PersistentVolumeClaims",
  pvs: "PersistentVolumes",
  "storage-classes": "Storage Classes",
  nodes: "Nodes",
  topology: "Topology",
  events: "Events",
  namespaces: "Namespaces",
  "service-accounts": "Service Accounts",
  "resource-quotas": "Resource Quotas",
  "limit-ranges": "Limit Ranges",
  crds: "CRDs",
  pdbs: "PodDisruptionBudgets",
  metrics: "Metrics",
  releases: "Releases",
};

// ─── Breadcrumb Segment ──────────────────────────────────────────────────────

interface BreadcrumbSegmentProps {
  label: string;
  path: string;
  isLast: boolean;
}

function BreadcrumbSegment({ label, path, isLast }: BreadcrumbSegmentProps) {
  const truncated = label.length > 24;
  const displayLabel = truncated ? label.slice(0, 24) + "…" : label;

  const content = isLast ? (
    <span className="text-text-primary font-medium truncate max-w-[200px]">
      {displayLabel}
    </span>
  ) : (
    <Link
      to={path}
      className="text-text-tertiary hover:text-text-secondary transition-colors truncate max-w-[200px]"
    >
      {displayLabel}
    </Link>
  );

  if (!truncated) return content;

  return (
    <Tooltip.Provider delayDuration={300}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{content}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="bottom"
            sideOffset={4}
            className="bg-bg-tertiary border border-border rounded px-2 py-1 text-xs text-text-primary shadow-popover z-50"
          >
            {label}
            <Tooltip.Arrow className="fill-bg-tertiary" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

// ─── Breadcrumb ──────────────────────────────────────────────────────────────

function Breadcrumb() {
  const location = useLocation();

  const segments = useMemo(() => {
    if (location.pathname === "/") {
      return [{ label: "Overview", path: "/", isLast: true }];
    }

    const parts = location.pathname.split("/").filter(Boolean);
    return parts.map((part, i) => {
      const path = "/" + parts.slice(0, i + 1).join("/");
      const label = SEGMENT_MAP[part] ?? part;
      return { label, path, isLast: i === parts.length - 1 };
    });
  }, [location.pathname]);

  return (
    <nav className="flex items-center gap-1.5 text-sm min-w-0">
      {segments.map((seg, i) => (
        <span key={seg.path} className="flex items-center gap-1.5 min-w-0">
          {i > 0 && (
            <ChevronRight className="w-3.5 h-3.5 text-text-tertiary flex-shrink-0" />
          )}
          <BreadcrumbSegment
            label={seg.label}
            path={seg.path}
            isLast={seg.isLast}
          />
        </span>
      ))}
    </nav>
  );
}

// ─── NamespaceFilter ─────────────────────────────────────────────────────────

function NamespaceFilter() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const namespaces = useClusterStore((s) => s.namespaces);
  const selectedNamespace = useClusterStore((s) => s.selectedNamespace);
  const setNamespace = useClusterStore((s) => s.setNamespace);
  const storedRecentNs = useFavoritesStore((s) => s.recentNamespaces);

  const recentNamespaces = useMemo(() => {
    if (!open) return [];
    return storedRecentNs.filter((ns) => namespaces.includes(ns));
  }, [open, namespaces, storedRecentNs]);

  const filtered = useMemo(
    () =>
      namespaces.filter((ns) =>
        ns.toLowerCase().includes(search.toLowerCase())
      ),
    [namespaces, search]
  );

  const handleSelect = useCallback(
    (ns: string) => {
      setNamespace(ns);
      if (ns) useFavoritesStore.getState().addRecentNamespace(ns);
    },
    [setNamespace]
  );

  const displayLabel = selectedNamespace || "All Namespaces";

  return (
    <DropdownMenu.Root
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setSearch("");
      }}
    >
      <DropdownMenu.Trigger asChild>
        <button
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded
                     border border-border hover:border-border-strong text-text-secondary
                     hover:text-text-primary bg-bg-tertiary transition-colors"
        >
          {selectedNamespace ? (
            <Tag className="w-3 h-3 opacity-60" />
          ) : (
            <Globe className="w-3 h-3 opacity-60" />
          )}
          <span className="max-w-[120px] truncate">{displayLabel}</span>
          <ChevronsUpDown className="w-3 h-3 opacity-50" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="w-56 bg-bg-tertiary border border-border rounded-md shadow-popover
                     z-50 overflow-hidden animate-scale-in"
        >
          {/* Search input */}
          <div className="p-1.5 border-b border-border">
            <div className="flex items-center gap-2 px-2 py-1 bg-bg-secondary rounded">
              <Search className="w-3.5 h-3.5 text-text-tertiary flex-shrink-0" />
              <input
                type="text"
                placeholder="Filter namespaces…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-tertiary
                           outline-none"
                autoFocus
              />
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto p-1">
            {/* All Namespaces option */}
            <DropdownMenu.Item
              onSelect={() => handleSelect("")}
              className={cn(
                "flex items-center gap-2 px-2 py-1.5 text-xs rounded cursor-default",
                "hover:bg-bg-hover outline-none transition-colors",
                !selectedNamespace
                  ? "text-accent"
                  : "text-text-secondary hover:text-text-primary"
              )}
            >
              <Globe className="w-3 h-3 flex-shrink-0" />
              <span className="flex-1">All Namespaces</span>
              {!selectedNamespace && <Check className="w-3 h-3" />}
            </DropdownMenu.Item>

            {/* Recent namespaces */}
            {recentNamespaces.length > 0 && !search && (
              <>
                <DropdownMenu.Separator className="h-px bg-border my-1" />
                <DropdownMenu.Label className="px-2 py-1 text-2xs text-text-tertiary uppercase tracking-wider">
                  Recent
                </DropdownMenu.Label>
                {recentNamespaces.map((ns) => (
                  <DropdownMenu.Item
                    key={`recent-${ns}`}
                    onSelect={() => handleSelect(ns)}
                    className={cn(
                      "flex items-center gap-2 px-2 py-1.5 text-xs rounded cursor-default",
                      "hover:bg-bg-hover outline-none transition-colors",
                      selectedNamespace === ns
                        ? "text-accent"
                        : "text-text-secondary hover:text-text-primary"
                    )}
                  >
                    <Tag className="w-3 h-3 flex-shrink-0 opacity-60" />
                    <span className="flex-1 truncate">{ns}</span>
                    {selectedNamespace === ns && <Check className="w-3 h-3" />}
                  </DropdownMenu.Item>
                ))}
              </>
            )}

            {/* All namespaces */}
            <DropdownMenu.Separator className="h-px bg-border my-1" />
            {filtered.length === 0 ? (
              <p className="text-xs text-text-tertiary text-center py-3">
                No namespaces found
              </p>
            ) : (
              filtered.map((ns) => (
                <DropdownMenu.Item
                  key={ns}
                  onSelect={() => handleSelect(ns)}
                  className={cn(
                    "flex items-center gap-2 px-2 py-1.5 text-xs rounded cursor-default",
                    "hover:bg-bg-hover outline-none transition-colors",
                    selectedNamespace === ns
                      ? "text-accent"
                      : "text-text-secondary hover:text-text-primary"
                  )}
                >
                  <Tag className="w-3 h-3 flex-shrink-0 opacity-60" />
                  <span className="flex-1 truncate">{ns}</span>
                  {selectedNamespace === ns && <Check className="w-3 h-3" />}
                </DropdownMenu.Item>
              ))
            )}
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

// ─── ClusterHealthIndicator ──────────────────────────────────────────────────

const STATUS_DOT: Record<string, string> = {
  connected: "bg-green-500",
  connecting: "bg-yellow-400 animate-pulse",
  disconnected: "bg-neutral-400",
  error: "bg-red-500",
};

function ClusterHealthIndicator() {
  const clusters = useClusterStore((s) => s.clusters);
  const activeCluster = useClusterStore((s) => s.activeCluster);
  const k8sVersion = useClusterStore((s) => s.k8sVersion);

  const cluster = clusters.find((c) => c.name === activeCluster);
  if (!cluster) return null;

  return (
    <Tooltip.Provider delayDuration={300}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-text-secondary">
            <span
              className={cn(
                "w-2 h-2 rounded-full flex-shrink-0",
                STATUS_DOT[cluster.status] ?? STATUS_DOT.disconnected
              )}
            />
            <span className="truncate max-w-[100px]">{cluster.name}</span>
          </div>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="bottom"
            sideOffset={4}
            className="bg-bg-tertiary border border-border rounded px-3 py-2 text-xs text-text-primary shadow-popover z-50 space-y-1"
          >
            <div className="font-medium">{cluster.name}</div>
            <div className="text-text-tertiary">Server: {cluster.server}</div>
            {k8sVersion && (
              <div className="text-text-tertiary">Kubernetes: {k8sVersion}</div>
            )}
            <div className="text-text-tertiary capitalize">
              Status: {cluster.status}
            </div>
            <Tooltip.Arrow className="fill-bg-tertiary" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

// ─── ThemeToggle ─────────────────────────────────────────────────────────────

function ThemeToggle() {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const updateSetting = useSettingsStore((s) => s.update);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    updateSetting("theme", next);
  };

  return (
    <button
      onClick={toggle}
      className="flex items-center justify-center w-7 h-7 rounded
                 text-text-tertiary hover:text-text-secondary hover:bg-bg-hover transition-colors"
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {theme === "dark" ? (
        <Sun className="w-3.5 h-3.5" />
      ) : (
        <Moon className="w-3.5 h-3.5" />
      )}
    </button>
  );
}

// ─── Topbar ──────────────────────────────────────────────────────────────────

export function Topbar() {
  const os = useOS();
  const openPalette = useCommandPalette((s) => s.openPalette);
  const isMac = os === "mac";

  return (
    <header className="flex items-center h-11 border-b border-border bg-bg-secondary flex-shrink-0">
      {/* Left: Breadcrumb */}
      <div className="flex-1 min-w-0 px-4">
        <Breadcrumb />
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2 px-3 flex-shrink-0">
        <ClusterHealthIndicator />

        <NamespaceFilter />

        {/* Search / Cmd+K button */}
        <button
          onClick={openPalette}
          className="flex items-center gap-2 px-2.5 py-1 text-xs rounded border border-border
                     text-text-tertiary hover:text-text-secondary hover:border-border-strong
                     bg-bg-tertiary transition-colors"
          title={isMac ? "Search (⌘K)" : "Search (Ctrl+K)"}
        >
          <Search className="w-3.5 h-3.5" />
          <span>Search…</span>
          <kbd className="font-mono text-2xs bg-bg-hover px-1 rounded flex items-center gap-0.5">
            {isMac ? (
              <>
                <Command className="w-2.5 h-2.5" />K
              </>
            ) : (
              "Ctrl+K"
            )}
          </kbd>
        </button>

        <ThemeToggle />
      </div>
    </header>
  );
}
