// src/components/command-palette/CommandPalette.tsx
import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Command } from "cmdk";
import {
  LayoutDashboard, Box, Layers, Database, Radio,
  Briefcase, Clock, Network, Globe,
  FileText, Lock, HardDrive, Server, AlertCircle, Package,
  Settings, ArrowRight, Search,
  ToggleLeft, PanelBottom, Sun, ChevronRight, History,
  Terminal, LogOut, Globe2, Tag, RotateCcw, Maximize2, Shield, ShieldOff,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useClusterStore } from "../../stores/clusterStore";
import { useUIStore } from "../../stores/uiStore";
import { useSelectionStore } from "../../stores/selectionStore";
import { useFavoritesStore } from "../../stores/favoritesStore";
import { useToastStore } from "../../stores/toastStore";
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

// ─── Navigation commands ──────────────────────────────────────────────────────

function useNavCommands(navigate: ReturnType<typeof useNavigate>, close: () => void): PaletteItem[] {
  return [
    { id: "nav-overview",      label: "Go to Overview",      icon: LayoutDashboard, shortcut: "G O", group: "Navigation", onSelect: () => { navigate("/overview"); close(); } },
    { id: "nav-pods",          label: "Go to Pods",          icon: Box,             shortcut: "G P", group: "Navigation", onSelect: () => { navigate("/workloads/pods"); close(); } },
    { id: "nav-deployments",   label: "Go to Deployments",   icon: Layers,          shortcut: "G D", group: "Navigation", onSelect: () => { navigate("/workloads/deployments"); close(); } },
    { id: "nav-statefulsets",  label: "Go to StatefulSets",  icon: Database,                         group: "Navigation", onSelect: () => { navigate("/workloads/statefulsets"); close(); } },
    { id: "nav-daemonsets",    label: "Go to DaemonSets",    icon: Radio,                            group: "Navigation", onSelect: () => { navigate("/workloads/daemonsets"); close(); } },
    { id: "nav-jobs",          label: "Go to Jobs",          icon: Briefcase,                        group: "Navigation", onSelect: () => { navigate("/workloads/jobs"); close(); } },
    { id: "nav-cronjobs",      label: "Go to CronJobs",      icon: Clock,                            group: "Navigation", onSelect: () => { navigate("/workloads/cronjobs"); close(); } },
    { id: "nav-services",      label: "Go to Services",      icon: Network,         shortcut: "G S", group: "Navigation", onSelect: () => { navigate("/networking/services"); close(); } },
    { id: "nav-ingresses",     label: "Go to Ingresses",     icon: Globe,           shortcut: "G I", group: "Navigation", onSelect: () => { navigate("/networking/ingresses"); close(); } },
    { id: "nav-configmaps",    label: "Go to ConfigMaps",    icon: FileText,        shortcut: "G C", group: "Navigation", onSelect: () => { navigate("/config/configmaps"); close(); } },
    { id: "nav-secrets",       label: "Go to Secrets",        icon: Lock,                             group: "Navigation", onSelect: () => { navigate("/config/secrets"); close(); } },
    { id: "nav-pvcs",          label: "Go to PVCs",           icon: HardDrive,                        group: "Navigation", onSelect: () => { navigate("/storage/pvcs"); close(); } },
    { id: "nav-nodes",         label: "Go to Nodes",          icon: Server,          shortcut: "G N", group: "Navigation", onSelect: () => { navigate("/cluster/nodes"); close(); } },
    { id: "nav-events",        label: "Go to Events",         icon: AlertCircle,     shortcut: "G E", group: "Navigation", onSelect: () => { navigate("/cluster/events"); close(); } },
    { id: "nav-helm",          label: "Go to Helm Releases",  icon: Package,         shortcut: "G H", group: "Navigation", onSelect: () => { navigate("/helm/releases"); close(); } },
    { id: "nav-settings",      label: "Go to Settings",       icon: Settings,                         group: "Navigation", onSelect: () => { navigate("/settings"); close(); } },
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
      label: "Switch Cluster\u2026",
      icon: Globe2,
      shortcut: "\u2318\u21e7C",
      group: "Actions",
      onSelect: () => setSubMenu("clusters"),
    },
    {
      id: "action-change-namespace",
      label: "Change Namespace\u2026",
      icon: Tag,
      shortcut: "\u2318\u21e7N",
      group: "Actions",
      onSelect: () => setSubMenu("namespaces"),
    },
    {
      id: "action-create-resource",
      label: "Create Resource\u2026",
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
      shortcut: "\u2303`",
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

function useContextCommands(close: () => void, navigate: ReturnType<typeof useNavigate>, mountedRef: React.RefObject<boolean>): PaletteItem[] {
  const location = useLocation();
  const { selectedResource } = useSelectionStore();
  const { setBottomTrayTab } = useUIStore();
  const addToast = useToastStore((s) => s.addToast);
  const items: PaletteItem[] = [];

  if (location.pathname.includes("/workloads/pods")) {
    items.push(
      { id: "ctx-filter-running", label: "Filter: Running pods", icon: Box, group: "Context", onSelect: () => { close(); } },
      { id: "ctx-filter-failed",  label: "Filter: Failed pods",  icon: Box, group: "Context", onSelect: () => { close(); } }
    );
  }

  if (selectedResource) {
    // Common actions for all resources
    items.push(
      {
        id: "ctx-view-logs", label: `View Logs: ${selectedResource.name}`,
        icon: FileText, shortcut: "L", group: "Context",
        onSelect: () => { setBottomTrayTab("logs"); close(); },
      },
      {
        id: "ctx-exec", label: `Exec Shell: ${selectedResource.name}`,
        icon: Terminal, shortcut: "X", group: "Context",
        onSelect: () => { setBottomTrayTab("terminal"); close(); },
      },
      {
        id: "ctx-edit-yaml", label: `Edit YAML: ${selectedResource.name}`,
        icon: FileText, shortcut: "E", group: "Context",
        onSelect: () => {
          if (selectedResource.path) navigate(selectedResource.path);
          close();
        },
      },
      {
        id: "ctx-delete", label: `Delete: ${selectedResource.name}`,
        icon: LogOut, group: "Context",
        onSelect: () => { close(); },
      }
    );

    // Deployment-specific actions
    const kind = selectedResource.kind?.toLowerCase();
    if (kind === 'deployment') {
      items.push(
        {
          id: "ctx-scale", label: `Scale: ${selectedResource.name}`,
          icon: Maximize2, shortcut: "S", group: "Context",
          onSelect: () => { close(); },
        },
        {
          id: "ctx-restart", label: `Restart: ${selectedResource.name}`,
          icon: RotateCcw, shortcut: "R", group: "Context",
          onSelect: async () => {
            try {
              const { RestartDeployment } = await import("../../wailsjs/go/handlers/ResourceHandler");
              await RestartDeployment(selectedResource.namespace ?? "", selectedResource.name);
              addToast({ type: "success", title: `Restarted ${selectedResource.name}` });
            } catch (err) {
              addToast({ type: "error", title: "Restart failed", description: String(err) });
            }
            if (mountedRef.current) close();
          },
        }
      );
    }

    // Node-specific actions
    if (kind === 'node') {
      items.push(
        {
          id: "ctx-cordon", label: `Cordon: ${selectedResource.name}`,
          icon: Shield, group: "Context",
          onSelect: async () => {
            try {
              const { CordonNode } = await import("../../wailsjs/go/handlers/ResourceHandler");
              await CordonNode(selectedResource.name);
              addToast({ type: "success", title: `Cordoned ${selectedResource.name}` });
            } catch (err) {
              addToast({ type: "error", title: "Cordon failed", description: String(err) });
            }
            if (mountedRef.current) close();
          },
        },
        {
          id: "ctx-uncordon", label: `Uncordon: ${selectedResource.name}`,
          icon: ShieldOff, group: "Context",
          onSelect: async () => {
            try {
              const { UncordonNode } = await import("../../wailsjs/go/handlers/ResourceHandler");
              await UncordonNode(selectedResource.name);
              addToast({ type: "success", title: `Uncordoned ${selectedResource.name}` });
            } catch (err) {
              addToast({ type: "error", title: "Uncordon failed", description: String(err) });
            }
            if (mountedRef.current) close();
          },
        }
      );
    }
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
  const { SearchResources } = await import("../../wailsjs/go/main/App");
  return await SearchResources(query);
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

function CreateResourceSubMenu({ onBack, onClose }: { onBack: () => void; onClose: () => void }) {
  const navigate = useNavigate();
  const wizards = [
    { id: 'deployment', label: 'Deployment', path: '/wizards/deployment' },
    { id: 'service', label: 'Service', path: '/wizards/service' },
    { id: 'configmap', label: 'ConfigMap', path: '/wizards/configmap' },
    { id: 'secret', label: 'Secret', path: '/wizards/secret' },
  ];
  return (
    <>
      <button onClick={onBack} className="flex items-center gap-1.5 px-3 py-2 text-xs text-text-tertiary hover:text-text-secondary">
        <ChevronRight className="w-3 h-3 rotate-180" /> Back
      </button>
      {wizards.map((w) => (
        <Command.Item
          key={w.id}
          value={w.id}
          onSelect={() => { navigate(w.path); onClose(); }}
          className="flex items-center gap-2.5 px-3 py-2 rounded-md cursor-pointer data-[selected=true]:bg-bg-active text-text-secondary text-sm outline-none"
        >
          <ArrowRight className="w-4 h-4 text-text-tertiary" />
          <span className="flex-1">{w.label}</span>
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
  const [searchError, setSearchError] = useState<string | null>(null);
  const debouncedQuery = useDebounce(query, 200);
  const { recentItems, addRecentItem } = useFavoritesStore();
  const mountedRef = useRef(true);
  // Reset state when palette closes.
  const prevIsOpen = useRef(isOpen);
  useEffect(() => {
    if (!isOpen && prevIsOpen.current) {
      Promise.resolve().then(() => {
        setQuery("");
        setSubMenu(null);
        setResourceResults([]);
      });
    }
    prevIsOpen.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const navCommands    = useNavCommands(navigate, closePalette);
  const actionCommands = useActionCommands(closePalette, setSubMenu);
  const contextCommands = useContextCommands(closePalette, navigate, mountedRef);

  // Resource search (with stale-result cancellation)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!debouncedQuery) {
        setResourceResults([]);
        setSearchError(null);
        return;
      }
      setSearching(true);
      setSearchError(null);
      try {
        const r = await searchResources(debouncedQuery);
        if (!cancelled) {
          setResourceResults(r);
          setSearching(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("[CommandPalette] Resource search failed:", err);
          setSearchError("Search unavailable");
          setSearching(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [debouncedQuery]);

  const handleResourceSelect = useCallback((result: ResourceResult) => {
    navigate(result.path);
    addRecentItem({ path: result.path, label: result.name, icon: "box", timestamp: Date.now() });
    closePalette();
  }, [navigate, addRecentItem, closePalette]);

  if (!isOpen) return null;

  return (
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
              placeholder={subMenu ? "Search\u2026" : "Type a command or search\u2026"}
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
              {searchError ? searchError : "No results found."}
            </Command.Empty>

            {/* Sub-menus */}
            {subMenu === "clusters" && (
              <ClusterSubMenu onBack={() => setSubMenu(null)} onClose={closePalette} />
            )}
            {subMenu === "namespaces" && (
              <NamespaceSubMenu onBack={() => setSubMenu(null)} onClose={closePalette} />
            )}
            {subMenu === "create" && (
              <CreateResourceSubMenu onBack={() => setSubMenu(null)} onClose={closePalette} />
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
