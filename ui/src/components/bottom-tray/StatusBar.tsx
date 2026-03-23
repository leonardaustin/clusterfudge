import { Bot, Terminal, ScrollText, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore, type TrayTab } from "@/stores/uiStore";
import { useClusterStore } from "@/stores/clusterStore";
import { PortForwardIndicator } from "./PortForwardIndicator";

const TAB_ICONS: Record<TrayTab, React.ComponentType<{ className?: string }>> = {
  logs: ScrollText,
  terminal: Terminal,
  events: AlertCircle,
  ai: Bot,
};

const TAB_LABELS: Record<TrayTab, string> = {
  logs: "Logs",
  terminal: "Terminal",
  events: "Events",
  ai: "AI",
};

export function StatusBar() {
  const bottomTrayOpen = useUIStore((s) => s.bottomTrayOpen);
  const bottomTrayTab = useUIStore((s) => s.bottomTrayTab);
  const openOrToggleTrayTab = useUIStore((s) => s.openOrToggleTrayTab);
  const activeCluster = useClusterStore((s) => s.activeCluster);
  const clusters = useClusterStore((s) => s.clusters);

  const current = clusters.find((c) => c.name === activeCluster);
  const isConnected = current?.status === "connected";

  return (
    <div className="flex items-center h-6 px-2 border-t border-border bg-bg-secondary text-2xs text-text-tertiary select-none flex-shrink-0 gap-3">
      {/* Connection status */}
      {activeCluster && (
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "inline-block w-1.5 h-1.5 rounded-full",
              isConnected ? "bg-green-500" : "bg-red-500"
            )}
          />
          <span className="truncate max-w-[160px]">{activeCluster}</span>
        </div>
      )}

      <div className="flex-1" />

      {/* Tray toggle buttons */}
      {(["logs", "terminal", "events", "ai"] as TrayTab[]).map((tab) => {
        const Icon = TAB_ICONS[tab];
        const active = bottomTrayOpen && bottomTrayTab === tab;
        return (
          <button
            key={tab}
            onClick={() => openOrToggleTrayTab(tab)}
            className={cn(
              "flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors",
              active
                ? "text-text-primary bg-bg-active"
                : "text-text-tertiary hover:text-text-secondary"
            )}
            title={TAB_LABELS[tab]}
          >
            <Icon className="w-3 h-3" />
            <span>{TAB_LABELS[tab]}</span>
          </button>
        );
      })}

      <PortForwardIndicator />
    </div>
  );
}
