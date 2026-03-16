import { lazy, Suspense, useCallback, useRef } from "react";
import { Bot, Terminal, ScrollText, AlertCircle, X, GripHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore, type TrayTab } from "@/stores/uiStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { PortForwardIndicator } from "./PortForwardIndicator";

// Lazy-loaded tab content
const LogsTab = lazy(() => import("./tabs/LogsTab"));
const TerminalTab = lazy(() => import("./tabs/TerminalTab"));
const EventsTab = lazy(() => import("./tabs/EventsTab"));
const AITab = lazy(() => import("./tabs/AITab"));

const MIN_HEIGHT = 150;
const MAX_HEIGHT_RATIO = 0.6;
const DEFAULT_HEIGHT = 250;

interface TabDef {
  id: TrayTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  shortcut: string;
}

const TABS: TabDef[] = [
  { id: "logs", label: "Logs", icon: ScrollText, shortcut: "\u23031" },
  { id: "terminal", label: "Terminal", icon: Terminal, shortcut: "\u23032" },
  { id: "events", label: "Events", icon: AlertCircle, shortcut: "\u23033" },
  { id: "ai", label: "AI", icon: Bot, shortcut: "\u23034" },
];

// --- DragHandle ---

interface DragHandleProps {
  onDrag: (deltaY: number) => void;
  onDoubleClick: () => void;
}

function DragHandle({ onDrag, onDoubleClick }: DragHandleProps) {
  const startY = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      startY.current = e.clientY;

      const handleMouseMove = (ev: MouseEvent) => {
        const delta = startY.current - ev.clientY;
        startY.current = ev.clientY;
        onDrag(delta);
      };

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "ns-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [onDrag],
  );

  return (
    <div
      onMouseDown={handleMouseDown}
      onDoubleClick={onDoubleClick}
      className="flex items-center justify-center h-1 cursor-ns-resize hover:bg-accent
                 transition-colors group flex-shrink-0"
      title="Drag to resize"
    >
      <GripHorizontal
        className="w-3 h-3 text-border group-hover:text-accent-hover opacity-0
                   group-hover:opacity-100 transition-opacity"
      />
    </div>
  );
}

// --- TabBar ---

interface TabBarProps {
  activeTab: TrayTab;
  onTabChange: (tab: TrayTab) => void;
  onClose: () => void;
}

function TabBar({ activeTab, onTabChange, onClose }: TabBarProps) {
  return (
    <div className="flex items-center border-b border-border px-2 gap-1 flex-shrink-0 h-8">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 h-full text-xs transition-colors relative group/tab",
              active
                ? "text-text-primary"
                : "text-text-tertiary hover:text-text-secondary",
            )}
          >
            {active && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
            )}
            <Icon className="w-3.5 h-3.5" />
            <span>{tab.label}</span>
            <kbd className="font-mono text-2xs opacity-40">{tab.shortcut}</kbd>
          </button>
        );
      })}

      <div className="flex-1" />

      <PortForwardIndicator />

      <button
        onClick={onClose}
        className="p-1 text-text-tertiary hover:text-text-secondary transition-colors rounded"
        title="Close tray (Ctrl+`)"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// --- TabContent loading fallback ---

function TabFallback() {
  return (
    <div className="flex items-center justify-center h-full text-text-tertiary text-xs">
      Loading...
    </div>
  );
}

// --- BottomTray ---

export function BottomTray() {
  const bottomTrayOpen = useUIStore((s) => s.bottomTrayOpen);
  const bottomTrayHeight = useUIStore((s) => s.bottomTrayHeight);
  const bottomTrayTab = useUIStore((s) => s.bottomTrayTab);
  const setBottomTrayHeight = useUIStore((s) => s.setBottomTrayHeight);
  const setBottomTrayTab = useUIStore((s) => s.setBottomTrayTab);
  const setBottomTrayOpen = useUIStore((s) => s.setBottomTrayOpen);
  const selectedResource = useSelectionStore((s) => s.selectedResource);

  const clampHeight = useCallback(
    (h: number) => {
      const maxHeight = window.innerHeight * MAX_HEIGHT_RATIO;
      return Math.max(MIN_HEIGHT, Math.min(h, maxHeight));
    },
    [],
  );

  const handleDrag = useCallback(
    (deltaY: number) => {
      setBottomTrayHeight((prev: number) => clampHeight(prev + deltaY));
    },
    [setBottomTrayHeight, clampHeight],
  );

  const handleDoubleClick = useCallback(() => {
    const halfViewport = window.innerHeight * 0.5;
    setBottomTrayHeight((prev: number) =>
      prev >= halfViewport - 10 ? DEFAULT_HEIGHT : halfViewport,
    );
  }, [setBottomTrayHeight]);

  const handleClose = useCallback(() => {
    setBottomTrayOpen(false);
  }, [setBottomTrayOpen]);

  if (!bottomTrayOpen) return null;

  const height = clampHeight(bottomTrayHeight);

  return (
    <div
      className="flex flex-col border-t border-border bg-bg-secondary flex-shrink-0"
      style={{ height }}
    >
      <DragHandle onDrag={handleDrag} onDoubleClick={handleDoubleClick} />
      <TabBar
        activeTab={bottomTrayTab}
        onTabChange={setBottomTrayTab}
        onClose={handleClose}
      />
      <div className="flex-1 overflow-hidden min-h-0 font-mono text-xs text-text-secondary relative">
        <Suspense fallback={<TabFallback />}>
          {bottomTrayTab === "logs" && <LogsTab resource={selectedResource} />}
          {bottomTrayTab === "terminal" && (
            <TerminalTab resource={selectedResource} />
          )}
          {bottomTrayTab === "events" && <EventsTab />}
        </Suspense>
        {/* AI tab stays mounted to preserve session across tab switches */}
        <Suspense fallback={<TabFallback />}>
          <div
            className="absolute inset-0"
            style={{ display: bottomTrayTab === "ai" ? undefined : "none" }}
          >
            <AITab />
          </div>
        </Suspense>
      </div>
    </div>
  );
}
